const express = require('express');
const router = express.Router();

const { loadConfig } = require('../config/config');
const { odooCall, odooAuth } = require('../services/odooService');
const { checkRole } = require('../middlewares/authMiddleware');

let supportedPartnerFields = null;

async function getSupportedPartnerFields(config, cookie) {
  if (supportedPartnerFields !== null) return supportedPartnerFields;
  try {
    const fields = await odooCall(config, 'res.partner', 'fields_get', [[]], { attributes: ['type'] }, cookie);
    supportedPartnerFields = Object.keys(fields || {});
  } catch (e) {
    supportedPartnerFields = ['id', 'name', 'street', 'phone', 'active'];
  }
  return supportedPartnerFields;
}

async function checkRankSupport(config, cookie) {
  const fields = await getSupportedPartnerFields(config, cookie);
  return fields.includes('customer_rank');
}

router.get('/odoo/partners/:id/purchased-products', checkRole(['ke_toan_kho', 'kinh_doanh']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const partnerId = Number(req.params.id);
    
    const variantIds = new Set();
    
    // Determine if partner is a Customer or Vendor
    const supportsRank = await checkRankSupport(config, cookie);
    const readFields = supportsRank ? ['id', 'customer_rank', 'comment'] : ['id', 'comment'];
    const partner = (await odooCall(config, 'res.partner', 'read', [[partnerId], readFields], {}, cookie))[0];
    const isCustomer = (partner && (
      (supportsRank && partner.customer_rank > 0) || 
      (!supportsRank && partner.comment && partner.comment.includes('Khách hàng'))
    ));
    
    if (isCustomer) {
      console.log(`Fetching purchased products suggestion for customer: ${partnerId}`);
      // Source 1: sale.order.line (Sales App orders)
      try {
        const lines = await odooCall(config, 'sale.order.line', 'search_read', [], {
          domain: [['order_partner_id', '=', partnerId]],
          fields: ['product_id'],
          limit: 150
        }, cookie);
        for (const l of lines) {
          if (l.product_id && l.product_id[0]) {
            variantIds.add(l.product_id[0]);
          }
        }
      } catch (saleErr) {
        console.warn('Sales app not installed, skipping sale.order.line query:', saleErr.message);
      }
      
      // Source 2: stock.move (Inventory App actual customer deliveries)
      try {
        const moves = await odooCall(config, 'stock.move', 'search_read', [], {
          domain: [
            ['partner_id', '=', partnerId],
            ['picking_id.picking_type_code', '=', 'outgoing']
          ],
          fields: ['product_id'],
          limit: 150
        }, cookie);
        for (const m of moves) {
          if (m.product_id && m.product_id[0]) {
            variantIds.add(m.product_id[0]);
          }
        }
      } catch (stockErr) {
        console.warn('Failed to query stock.move for customer delivery suggestion:', stockErr.message);
      }
    } else {
      console.log(`Fetching purchased products suggestion for vendor/supplier: ${partnerId}`);
      // Source 1: product.supplierinfo (Explicit Odoo Vendor links)
      try {
        const suppliersInfo = await odooCall(config, 'product.supplierinfo', 'search_read', [], {
          domain: [['partner_id', '=', partnerId]],
          fields: ['product_tmpl_id', 'product_id'],
          limit: 150
        }, cookie);
        
        for (const info of suppliersInfo) {
          if (info.product_id && info.product_id[0]) {
            variantIds.add(info.product_id[0]);
          }
        }
        
        const templateIds = [...new Set(suppliersInfo.map(info => info.product_tmpl_id?.[0]).filter(Boolean))];
        if (templateIds.length) {
          const variants = await odooCall(config, 'product.product', 'search_read', [], {
            domain: [['product_tmpl_id', 'in', templateIds]],
            fields: ['id'],
            limit: 300
          }, cookie);
          for (const v of variants) {
            variantIds.add(v.id);
          }
        }
      } catch (supplierErr) {
        console.warn('Failed to query product.supplierinfo:', supplierErr.message);
      }
      
      // Source 2: purchase.order.line (Purchase App orders)
      try {
        const lines = await odooCall(config, 'purchase.order.line', 'search_read', [], {
          domain: [['partner_id', '=', partnerId]],
          fields: ['product_id'],
          limit: 150
        }, cookie);
        for (const l of lines) {
          if (l.product_id && l.product_id[0]) {
            variantIds.add(l.product_id[0]);
          }
        }
      } catch (purchaseErr) {
        console.warn('Purchase app not installed, skipping purchase.order.line query:', purchaseErr.message);
      }
      
      // Source 3: stock.move (Inventory App actual receipts)
      try {
        const moves = await odooCall(config, 'stock.move', 'search_read', [], {
          domain: [
            ['partner_id', '=', partnerId],
            ['picking_id.picking_type_code', '=', 'incoming']
          ],
          fields: ['product_id'],
          limit: 150
        }, cookie);
        for (const m of moves) {
          if (m.product_id && m.product_id[0]) {
            variantIds.add(m.product_id[0]);
          }
        }
      } catch (stockErr) {
        console.warn('Failed to query stock.move for partner suggestion:', stockErr.message);
      }
    }
    
    if (variantIds.size === 0) {
      return res.json([]);
    }
    
    const variantsList = await odooCall(config, 'product.product', 'search_read', [], {
      domain: [['id', 'in', [...variantIds]]],
      fields: ['product_tmpl_id'],
      limit: 300
    }, cookie);
    
    const templateIdsResult = [...new Set(variantsList.map(v => v.product_tmpl_id?.[0]).filter(Boolean))];
    res.json(templateIdsResult);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/odoo/partners', checkRole(['ke_toan_kho', 'kinh_doanh', 'ke_toan_ban_hang']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const type = req.query.type;
    let domain = [['active', 'in', [true, false]]];
    
    const availableFields = await getSupportedPartnerFields(config, cookie);
    const supportsRank = availableFields.includes('customer_rank');
    
    if (type === 'customer') {
      if (supportsRank) {
        domain.push(['customer_rank', '>', 0]);
      } else {
        domain.push('|', ['comment', 'ilike', 'CUSTOMER'], ['comment', 'ilike', 'Khách hàng']);
      }
    } else if (type === 'vendor') {
      if (supportsRank) {
        domain.push(['supplier_rank', '>', 0]);
      } else {
        domain.push('|', ['comment', 'ilike', 'VENDOR'], ['comment', 'ilike', 'Nhà cung cấp']);
      }
    }
    
    const wantedFields = ['id', 'name', 'street', 'phone', 'active', 'debit', 'credit', 'purchase_order_count', 'sale_order_count'];
    const fields = wantedFields.filter(f => availableFields.includes(f));
    
    const partners = await odooCall(config, 'res.partner', 'search_read', [], {
      domain,
      limit: 100,
      order: 'name asc',
      fields
    }, cookie);

    const result = partners.map(p => ({
      id: p.id,
      name: p.name || '',
      street: p.street || '',
      phone: p.phone || '',
      active: p.active !== false,
      debit: p.debit || 0,
      credit: p.credit || 0,
      has_transactions: (p.purchase_order_count > 0 || p.sale_order_count > 0)
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/odoo/partners', checkRole(['ke_toan_kho', 'kinh_doanh', 'ke_toan_ban_hang']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const body = req.body;
    
    const payload = {
      name: body.name,
      street: body.street || '',
      phone: body.phone || '',
      is_company: body.is_company !== false
    };
    
    const supportsRank = await checkRankSupport(config, cookie);
    if (body.type === 'vendor') {
      if (supportsRank) {
        payload.supplier_rank = 1;
      } else {
        payload.comment = '[VENDOR]';
      }
    } else if (body.type === 'customer') {
      if (supportsRank) {
        payload.customer_rank = 1;
      } else {
        payload.comment = '[CUSTOMER]';
      }
    }
    
    let partnerId;
    try {
      partnerId = await odooCall(config, 'res.partner', 'create', [payload], {}, cookie);
    } catch (createErr) {
      if (createErr.message.includes('customer_rank') || createErr.message.includes('supplier_rank')) {
        console.warn('Partner create failed due to rank fields. Retrying with comment fallback...');
        delete payload.customer_rank;
        delete payload.supplier_rank;
        payload.comment = body.type === 'vendor' ? '[VENDOR]' : '[CUSTOMER]';
        partnerId = await odooCall(config, 'res.partner', 'create', [payload], {}, cookie);
      } else {
        throw createErr;
      }
    }
    
    res.json({ success: true, id: partnerId });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/odoo/partners/:id', checkRole(['ke_toan_kho', 'kinh_doanh', 'ke_toan_ban_hang']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const id = Number(req.params.id);
    const body = req.body;
    
    const payload = {
      name: body.name,
      street: body.street || '',
      phone: body.phone || '',
      is_company: body.is_company !== false
    };
    
    if (body.active !== undefined) {
      payload.active = body.active;
    }
    
    const supportsRank = await checkRankSupport(config, cookie);
    if (body.type === 'vendor') {
      if (supportsRank) {
        payload.supplier_rank = 1;
      } else {
        payload.comment = 'Nhà cung cấp';
      }
    } else if (body.type === 'customer') {
      if (supportsRank) {
        payload.customer_rank = 1;
      } else {
        payload.comment = 'Khách hàng';
      }
    }
    
    try {
      await odooCall(config, 'res.partner', 'write', [[id], payload], {}, cookie);
    } catch (writeErr) {
      if (writeErr.message.includes('customer_rank') || writeErr.message.includes('supplier_rank')) {
        console.warn('Partner write failed due to rank fields. Retrying with comment fallback...');
        hasRankFields = false;
        delete payload.customer_rank;
        delete payload.supplier_rank;
        payload.comment = body.type === 'vendor' ? 'Nhà cung cấp' : 'Khách hàng';
        await odooCall(config, 'res.partner', 'write', [[id], payload], {}, cookie);
      } else {
        throw writeErr;
      }
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/odoo/partners/:id', checkRole(['ke_toan_kho', 'kinh_doanh', 'ke_toan_ban_hang']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const id = Number(req.params.id);

    let hasTransactions = false;
    try {
      const availableFields = await getSupportedPartnerFields(config, cookie);
      const readFields = ['purchase_order_count', 'sale_order_count'].filter(f => availableFields.includes(f));
      if (readFields.length > 0) {
        const p = await odooCall(config, 'res.partner', 'read', [[id], readFields], {}, cookie);
        if (p && p.length) {
          hasTransactions = readFields.some(f => p[0][f] > 0);
        }
      }
    } catch (e) {
    }

    if (hasTransactions) {
      await odooCall(config, 'res.partner', 'write', [[id], { active: false }], {}, cookie);
      return res.json({ success: true, action: 'archive', message: 'Đối tác đã có giao dịch. Đã tự động lưu trữ/ngừng hợp tác để bảo toàn dữ liệu.' });
    }

    try {
      await odooCall(config, 'res.partner', 'unlink', [[id]], {}, cookie);
      res.json({ success: true, action: 'delete', message: 'Đã xóa đối tác thành công.' });
    } catch (err) {
      console.warn(`Unlink failed for partner ${id}, archiving instead:`, err.message);
      await odooCall(config, 'res.partner', 'write', [[id], { active: false }], {}, cookie);
      res.json({ success: true, action: 'archive', message: 'Đối tác đã phát sinh giao dịch trong Odoo. Đã tự động chuyển trạng thái ngừng hợp tác.' });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
