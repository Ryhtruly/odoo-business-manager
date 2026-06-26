const express = require('express');
const router = express.Router();
const axios = require('axios');

const { loadConfig } = require('../config/config');
const { odooCall, odooAuth } = require('../services/odooService');
const { checkRole } = require('../middlewares/authMiddleware');

async function checkAccountingSupport(config, cookie) {
  try {
    const count = await odooCall(config, 'ir.model', 'search_count', [[['model', '=', 'account.move']]], {}, cookie);
    return count > 0;
  } catch (e) {
    return false;
  }
}

router.post('/odoo/invoices/:id/post', checkRole(['ke_toan_ban_hang']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const hasAccounting = await checkAccountingSupport(config, cookie);
    if (!hasAccounting) {
      return res.status(503).json({
        success: false,
        error: 'DB chưa cài module Accounting/Invoicing. Hệ thống chỉ hỗ trợ xuất phiếu kho, không quản lý hóa đơn trên DB. Dùng chức năng "In phiếu xuất" thay thế.'
      });
    }
    const id = Number(req.params.id);
    
    await odooCall(config, 'account.move', 'action_post', [[id]], {}, cookie);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/odoo/invoices/:id/register-payment', checkRole(['ke_toan_ban_hang']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const hasAccounting = await checkAccountingSupport(config, cookie);
    if (!hasAccounting) {
      return res.status(503).json({
        success: false,
        error: 'DB chưa cài module Accounting/Invoicing. Hệ thống chỉ hỗ trợ xuất phiếu kho, không quản lý hóa đơn trên DB. Dùng chức năng "In phiếu xuất" thay thế.'
      });
    }
    const id = Number(req.params.id);
    const { payment_amount, payment_ref, ref, invoice_state, payment_method, payment_date } = req.body;

    const invs = await odooCall(config, 'account.move', 'read', [[id], ['state', 'amount_total', 'amount_residual', 'payment_state']], {}, cookie);
    if (!invs || !invs.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy hóa đơn' });
    }
    const invoice = invs[0];

    const amountVal = Number(payment_amount || 0);
    const alreadyPaid = Number(invoice.amount_total || 0) - Number(invoice.amount_residual || 0);
    if (amountVal + alreadyPaid > Number(invoice.amount_total || 0)) {
      return res.status(400).json({ success: false, error: 'Lỗi: Tổng tiền thực thu và tiền đã thanh toán vượt quá tổng giá trị đơn gốc!' });
    }

    const writeData = {};
    if (ref !== undefined) {
      writeData.ref = ref;
    }

    if (Object.keys(writeData).length) {
      await odooCall(config, 'account.move', 'write', [[id], writeData], {}, cookie);
    }

    if (invoice_state === 'posted' && invoice.state === 'draft') {
      await odooCall(config, 'account.move', 'action_post', [[id]], {}, cookie);
      const updated = await odooCall(config, 'account.move', 'read', [[id], ['state', 'amount_total', 'amount_residual', 'payment_state']], {}, cookie);
      if (updated && updated.length) {
        Object.assign(invoice, updated[0]);
      }
    }

    if (amountVal > 0 && invoice.state === 'posted') {
      let journalId = null;
      const journalType = payment_method === 'cash' ? 'cash' : 'bank';
      try {
        const journals = await odooCall(config, 'account.journal', 'search_read', [], {
          domain: [['type', '=', journalType]],
          fields: ['id'],
          limit: 1
        }, cookie);
        if (journals && journals.length) {
          journalId = journals[0].id;
        }
      } catch (jErr) {
        console.warn('Failed to query payment journal from Odoo:', jErr.message);
      }

      const context = { active_model: 'account.move', active_ids: [id], active_id: id };
      const registerPayload = {
        amount: amountVal,
        communication: payment_ref || ref || ''
      };
      if (journalId) {
        registerPayload.journal_id = journalId;
      }
      if (payment_date) {
        registerPayload.payment_date = payment_date;
      }

      const wizardId = await odooCall(config, 'account.payment.register', 'create', [registerPayload], { context }, cookie);
      await odooCall(config, 'account.payment.register', 'action_create_payments', [[wizardId]], { context }, cookie);
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/odoo/invoices/:id/credit-note', checkRole(['ke_toan_ban_hang']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const hasAccounting = await checkAccountingSupport(config, cookie);
    if (!hasAccounting) {
      return res.status(503).json({
        success: false,
        error: 'DB chưa cài module Accounting/Invoicing. Hệ thống chỉ hỗ trợ xuất phiếu kho, không quản lý hóa đơn trên DB. Dùng chức năng "In phiếu xuất" thay thế.'
      });
    }
    const id = Number(req.params.id);

    const inv = await odooCall(config, 'account.move', 'read', [[id], ['id', 'name', 'partner_id', 'ref', 'invoice_line_ids']], {}, cookie);
    if (!inv || !inv.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy hóa đơn gốc' });
    }
    const invoice = inv[0];

    let lines = [];
    if (invoice.invoice_line_ids && invoice.invoice_line_ids.length) {
      lines = await odooCall(config, 'account.move.line', 'read', [invoice.invoice_line_ids, ['product_id', 'quantity', 'price_unit', 'name']], {}, cookie);
    }

    const creditNoteLines = lines
      .filter(l => l.product_id)
      .map(line => [0, 0, {
        product_id: line.product_id[0],
        quantity: Number(line.quantity),
        price_unit: Number(line.price_unit),
        name: `Hoàn trả cho hóa đơn ${invoice.name}`
      }]);

    const creditNoteId = await odooCall(config, 'account.move', 'create', [{
      move_type: 'out_refund',
      partner_id: invoice.partner_id[0],
      invoice_origin: invoice.name,
      ref: `Hoàn trả hóa đơn ${invoice.name}`,
      invoice_line_ids: creditNoteLines
    }], {}, cookie);

    res.json({ success: true, creditNoteId });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/odoo/invoices/:id', checkRole(['ke_toan_ban_hang']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const hasAccounting = await checkAccountingSupport(config, cookie);
    if (!hasAccounting) {
      return res.status(503).json({
        success: false,
        error: 'DB chưa cài module Accounting/Invoicing. Hệ thống chỉ hỗ trợ xuất phiếu kho, không quản lý hóa đơn trên DB. Dùng chức năng "In phiếu xuất" thay thế.'
      });
    }
    const id = Number(req.params.id);

    const invs = await odooCall(config, 'account.move', 'read', [[id], ['state']], {}, cookie);
    if (invs && invs.length && invs[0].state === 'posted') {
      return res.status(400).json({ success: false, error: 'Nghiêm cấm xóa hóa đơn đã ở trạng thái Đã vào sổ (Posted). Vui lòng sử dụng Credit Note để hoàn trả.' });
    }
    
    try {
      await odooCall(config, 'account.move', 'unlink', [[id]], {}, cookie);
    } catch (err) {
      console.warn('Direct invoice unlink failed, attempting draft reset first:', err.message);
      try {
        await odooCall(config, 'account.move', 'button_draft', [[id]], {}, cookie);
        await odooCall(config, 'account.move', 'unlink', [[id]], {}, cookie);
      } catch (err2) {
        console.warn('Draft reset and unlink failed, attempting cancel and unlink:', err2.message);
        await odooCall(config, 'account.move', 'button_cancel', [[id]], {}, cookie);
        await odooCall(config, 'account.move', 'unlink', [[id]], {}, cookie);
      }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/odoo/invoices/:id/pdf', checkRole(['ke_toan_ban_hang']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const hasAccounting = await checkAccountingSupport(config, cookie);
    if (!hasAccounting) {
      return res.status(503).json({
        success: false,
        error: 'DB chưa cài module Accounting/Invoicing. Hệ thống chỉ hỗ trợ xuất phiếu kho, không quản lý hóa đơn trên DB. Dùng chức năng "In phiếu xuất" thay thế.'
      });
    }
    const id = Number(req.params.id);
    
    let response;
    try {
      const reportUrl = `${config.odooUrl}/report/pdf/account.report_invoice_with_payments/${id}`;
      response = await axios.get(reportUrl, {
        headers: { Cookie: cookie },
        responseType: 'arraybuffer',
        timeout: 15000,
        validateStatus: () => true
      });
      
      if (response.status !== 200 || !response.headers['content-type']?.includes('application/pdf')) {
        throw new Error(`Report with payments returned status ${response.status}`);
      }
    } catch (err) {
      console.warn('Fallback to account.report_invoice due to:', err.message);
      const reportUrl = `${config.odooUrl}/report/pdf/account.report_invoice/${id}`;
      response = await axios.get(reportUrl, {
        headers: { Cookie: cookie },
        responseType: 'arraybuffer',
        timeout: 15000,
        validateStatus: () => true
      });
      
      if (response.status !== 200 || !response.headers['content-type']?.includes('application/pdf')) {
        throw new Error(`Fallback report returned status ${response.status}`);
      }
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice_${id}.pdf`);
    res.send(response.data);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/odoo/invoices', checkRole(['ke_toan_ban_hang']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const hasAccounting = await checkAccountingSupport(config, cookie);
    if (!hasAccounting) {
      return res.status(503).json({
        success: false,
        error: 'DB chưa cài module Accounting/Invoicing. Hệ thống chỉ hỗ trợ xuất phiếu kho, không quản lý hóa đơn trên DB. Dùng chức năng "In phiếu xuất" thay thế.'
      });
    }
    
    const invoices = await odooCall(config, 'account.move', 'search_read', [], {
      domain: [['move_type', '=', 'out_invoice']],
      limit: 100,
      order: 'id desc',
      fields: ['id', 'name', 'partner_id', 'amount_total', 'amount_residual', 'payment_state', 'state', 'invoice_date', 'write_date', 'ref', 'payment_reference', 'invoice_origin']
    }, cookie);
    
    const partners = await odooCall(config, 'res.partner', 'search_read', [], {
      fields: ['id', 'name'],
      limit: 500
    }, cookie);
    
    const partnerMap = new Map(partners.map(p => [p.id, p]));
    
    const data = invoices.map(i => ({
      id: i.id,
      invoice_number: i.name || '',
      partner: partnerMap.get(i.partner_id?.[0])?.name || '',
      partner_id: i.partner_id?.[0] || null,
      amount_total: i.amount_total ?? 0,
      amount_residual: i.amount_residual ?? 0,
      payment_state: i.payment_state || '',
      state: i.state || '',
      invoice_date: i.invoice_date || '',
      write_date: i.write_date || '',
      ref: i.ref || '',
      payment_ref: i.payment_reference || '',
      invoice_origin: i.invoice_origin || ''
    }));
    
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
