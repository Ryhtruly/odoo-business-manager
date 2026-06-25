const express = require('express');
const router = express.Router();
const axios = require('axios');

const { loadConfig } = require('../config/config');
const { odooCall, odooAuth, resolveProductVariant } = require('../services/odooService');
const { checkRole } = require('../middlewares/authMiddleware');
const { getPickingType, getInternalLocation, getMoveField } = require('../helpers/stockHelpers');

let supportedModels = {};

async function checkModelSupport(config, model, cookie) {
  if (supportedModels[model] !== undefined) return supportedModels[model];
  try {
    const fields = await odooCall(config, model, 'fields_get', [[]], { attributes: ['type'] }, cookie);
    supportedModels[model] = (fields && Object.keys(fields).length > 0);
  } catch (e) {
    supportedModels[model] = false;
  }
  return supportedModels[model];
}

async function validatePickingInternal(config, pickingId, cookie) {
  const lineFieldInfo = await odooCall(config, 'stock.move.line', 'fields_get', [], {
    attributes: ['type']
  }, cookie);
  const hasLineField = (fieldName) => Object.prototype.hasOwnProperty.call(lineFieldInfo || {}, fieldName);
  const doneField = hasLineField('qty_done') ? 'qty_done' : (hasLineField('quantity') ? 'quantity' : null);
  const plannedFields = ['product_uom_qty', 'reserved_uom_qty', 'quantity'].filter(hasLineField);
  const lineFields = ['id', ...new Set([...plannedFields, doneField].filter(Boolean))];

  const moveLines = await odooCall(config, 'stock.move.line', 'search_read', [], {
    domain: [['picking_id', '=', pickingId]],
    fields: lineFields
  }, cookie);

  if (doneField) {
    for (const line of moveLines) {
      const plannedQty = plannedFields
        .map(field => Number(line[field] || 0))
        .find(qty => qty > 0) || 0;
      const currentDoneQty = Number(line[doneField] || 0);
      if (plannedQty > 0 && currentDoneQty <= 0) {
        await odooCall(config, 'stock.move.line', 'write', [[line.id], { [doneField]: plannedQty }], {}, cookie);
      }
    }
  }

  await odooCall(config, 'stock.picking', 'button_validate', [[pickingId]], {
    context: { skip_immediate: true, skip_backorder: true }
  }, cookie);
}


router.post('/odoo/purchase-orders', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const body = req.body;

    console.log('Creating stock.picking (Receipt)...');
    
    const pType = await getPickingType(config, cookie, 'incoming');
    const sourceLocId = pType.default_location_src_id ? pType.default_location_src_id[0] : 1;
    const destLocId = pType.default_location_dest_id ? pType.default_location_dest_id[0] : 5;

    const moveLines = [];
    for (const line of body.order_line) {
      const variantId = await resolveProductVariant(config, line.product_id, cookie);
      const prods = await odooCall(config, 'product.product', 'read', [[variantId], ['uom_id']], {}, cookie);
      const uomId = prods && prods.length && prods[0].uom_id ? prods[0].uom_id[0] : 1;

      moveLines.push([0, 0, {
        product_id: variantId,
        product_uom_qty: Number(line.product_qty),
        uom_id: uomId,
        price_unit: Number(line.price_unit),
        location_id: sourceLocId,
        location_dest_id: destLocId,
        description_picking: 'Nhập kho sản phẩm'
      }]);
    }

    const pickingData = {
      partner_id: Number(body.partner_id),
      picking_type_id: pType.id,
      location_id: sourceLocId,
      location_dest_id: destLocId,
      origin: body.date_order ? `Đơn mua ngày ${body.date_order.substring(0, 10)}` : 'Đơn mua hàng',
      move_ids: moveLines
    };

    const pickingId = await odooCall(config, 'stock.picking', 'create', [pickingData], {}, cookie);

    if (body.draft === true) {
      return res.json({ success: true, id: null, pickingId, state: 'draft', isFallback: true });
    }

    let warning = '';
    try {
      await validatePickingInternal(config, pickingId, cookie);
    } catch (pickingErr) {
      console.warn('Validate picking failed:', pickingErr.message);
      warning = `Đơn hàng đã tạo nhưng lỗi tự động duyệt nhập kho: ${pickingErr.message}.`;
    }

    return res.json({ success: true, id: null, pickingId, isFallback: true, warning: warning || undefined });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});


router.post('/odoo/receipts/:id/validate', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const id = Number(req.params.id);

    await validatePickingInternal(config, id, cookie);
    res.json({ success: true, message: 'Đã duyệt phiếu nhập. Tồn kho đã cập nhật.' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/odoo/receipts/:id/return', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const pickingId = Number(req.params.id);
    const { items } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ success: false, error: 'Danh sách sản phẩm trả hàng không được để trống' });
    }

    const moveField = await getMoveField(config, cookie);

    const pickings = await odooCall(config, 'stock.picking', 'read', [[pickingId], ['id', 'name', 'partner_id', 'location_id', 'location_dest_id', 'picking_type_id', moveField]], {}, cookie);
    if (!pickings || !pickings.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy phiếu nhận kho gốc' });
    }
    const picking = pickings[0];
    const pickingMoves = picking[moveField] || [];

    let originalMoves = [];
    if (pickingMoves.length) {
      const moveFields = await odooCall(config, 'stock.move', 'fields_get', [[]], { attributes: ['type'] }, cookie);
      const qtyField = moveFields.quantity !== undefined ? 'quantity' : 'quantity_done';
      originalMoves = await odooCall(config, 'stock.move', 'read', [pickingMoves, ['product_id', qtyField, 'state', 'uom_id']], {}, cookie);
      
      originalMoves = originalMoves.map(m => ({
        ...m,
        quantity_done: m[qtyField]
      }));
    }
    
    const doneQtyMap = new Map();
    const uomMap = new Map();
    for (const move of originalMoves) {
      if (move.product_id) {
        const varId = move.product_id[0];
        doneQtyMap.set(varId, (doneQtyMap.get(varId) || 0) + Number(move.quantity_done || 0));
        if (move.uom_id) {
          uomMap.set(varId, move.uom_id[0]);
        }
      }
    }

    const returnMoves = [];

    for (const item of items) {
      const variantId = item.variant_id ? Number(item.variant_id) : await resolveProductVariant(config, Number(item.product_tmpl_id), cookie);
      const originalDone = doneQtyMap.get(variantId) || 0;
      if (Number(item.qty) > originalDone) {
        return res.status(400).json({
          success: false,
          error: `Số lượng trả (${item.qty}) vượt quá số lượng đã nhận thực tế (${originalDone}) của sản phẩm ID ${item.product_tmpl_id || variantId}`
        });
      }

      const uomId = uomMap.get(variantId) || 1;

      returnMoves.push([0, 0, {
        product_id: variantId,
        product_uom_qty: Number(item.qty),
        uom_id: uomId,
        location_id: picking.location_dest_id[0],
        location_dest_id: picking.location_id[0],
        description_picking: `Trả hàng cho phiếu ${picking.name}`
      }]);
    }

    const pType = await getPickingType(config, cookie, 'outgoing');

    const returnPickingId = await odooCall(config, 'stock.picking', 'create', [{
      partner_id: picking.partner_id[0],
      picking_type_id: pType.id,
      location_id: picking.location_dest_id[0],
      location_dest_id: picking.location_id[0],
      origin: `Return of ${picking.name}`,
      [moveField]: returnMoves
    }], {}, cookie);

    let pickingValidated = false;
    let pickingWarning = '';
    try {
      await validatePickingInternal(config, returnPickingId, cookie);
      pickingValidated = true;
    } catch (valErr) {
      console.warn('Could not auto-validate return picking:', valErr.message);
      pickingWarning = `Đã tạo phiếu xuất trả nhưng lỗi tự động duyệt: ${valErr.message}.`;
    }

    res.json({
      success: true,
      returnPickingId,
      pickingValidated,
      warning: pickingWarning || undefined
    });

  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/odoo/po', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    
    const supportsPO = await checkModelSupport(config, 'purchase.order', cookie);
    const partners = await odooCall(config, 'res.partner', 'search_read', [], {
      fields: ['id', 'name'],
      limit: 500
    }, cookie);
    const partnerMap = new Map(partners.map(p => [p.id, p]));

    if (!supportsPO) {
      const moveField = await getMoveField(config, cookie);

      const receipts = await odooCall(config, 'stock.picking', 'search_read', [], {
        domain: [['picking_type_code', '=', 'incoming']],
        limit: 100,
        order: 'id desc',
        fields: ['id', 'name', 'origin', 'partner_id', 'state', 'scheduled_date', 'write_date', moveField]
      }, cookie);

      const allMoveIds = [];
      for (const r of receipts) {
        const moves = r[moveField] || [];
        allMoveIds.push(...moves);
      }

      let moveMap = new Map();
      if (allMoveIds.length > 0) {
        const moveFields = await odooCall(config, 'stock.move', 'fields_get', [[]], { attributes: ['type'] }, cookie);
        const qtyField = moveFields.quantity !== undefined ? 'quantity' : 'quantity_done';
        const readFields = ['id', 'product_uom_qty', qtyField];
        if (moveFields.price_unit !== undefined) readFields.push('price_unit');

        const moves = await odooCall(config, 'stock.move', 'read', [allMoveIds, readFields], {}, cookie);
        for (const m of moves) {
          moveMap.set(m.id, m);
        }
      }

      const data = receipts.map(r => {
        const moves = r[moveField] || [];
        let totalAmount = 0;
        for (const moveId of moves) {
          const m = moveMap.get(moveId);
          if (m) {
            const qty = Number(m.product_uom_qty || 0);
            const price = Number(m.price_unit || 0);
            totalAmount += qty * price;
          }
        }

        let mappedState = r.state || '';
        if (r.state === 'draft') mappedState = 'draft';
        else if (r.state === 'done') mappedState = 'done';
        else if (r.state === 'cancel') mappedState = 'cancel';
        else mappedState = 'purchase';

        return {
          id: r.id,
          po_number: r.name || '',
          vendor: partnerMap.get(r.partner_id?.[0])?.name || '',
          amount_total: totalAmount,
          state: mappedState,
          date_order: r.scheduled_date || '',
          write_date: r.write_date || '',
          isFallback: true
        };
      });

      return res.json(data);
    }

    const pos = await odooCall(config, 'purchase.order', 'search_read', [], {
      domain: [],
      limit: 100,
      order: 'id desc',
      fields: ['id', 'name', 'partner_id', 'amount_total', 'state', 'date_order', 'write_date']
    }, cookie);
    
    const data = pos.map(o => ({
      id: o.id,
      po_number: o.name || '',
      vendor: partnerMap.get(o.partner_id?.[0])?.name || '',
      amount_total: o.amount_total ?? 0,
      state: o.state || '',
      date_order: o.date_order || '',
      write_date: o.write_date || ''
    }));
    
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/odoo/receipts', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    
    const receipts = await odooCall(config, 'stock.picking', 'search_read', [], {
      domain: [['picking_type_code', '=', 'incoming']],
      limit: 100,
      order: 'id desc',
      fields: ['id', 'name', 'origin', 'partner_id', 'state', 'scheduled_date', 'write_date']
    }, cookie);
    
    const partners = await odooCall(config, 'res.partner', 'search_read', [], {
      fields: ['id', 'name'],
      limit: 500
    }, cookie);
    
    const partnerMap = new Map(partners.map(p => [p.id, p]));
    
    const data = receipts.map(r => ({
      id: r.id,
      receipt_number: r.name || '',
      origin: r.origin || '',
      vendor: partnerMap.get(r.partner_id?.[0])?.name || '',
      state: r.state || '',
      scheduled_date: r.scheduled_date || '',
      write_date: r.write_date || ''
    }));
    
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/odoo/po/:id', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const poId = Number(req.params.id);
    
    const supportsPO = await checkModelSupport(config, 'purchase.order', cookie);
    if (!supportsPO) {
      const moveField = await getMoveField(config, cookie);

      const receipts = await odooCall(config, 'stock.picking', 'read', [[poId], ['id', 'name', 'origin', 'partner_id', 'state', 'scheduled_date', moveField]], {}, cookie);
      if (!receipts || !receipts.length) return res.status(404).json({ error: 'Order not found' });
      const receipt = receipts[0];

      const pickingMoves = receipt[moveField] || [];
      let lines = [];
      if (pickingMoves.length > 0) {
        const moveFields = await odooCall(config, 'stock.move', 'fields_get', [[]], { attributes: ['type'] }, cookie);
        const qtyField = moveFields.quantity !== undefined ? 'quantity' : 'quantity_done';
        const hasName = moveFields.name !== undefined;
        const nameField = hasName ? 'name' : 'description_picking';

        const readFields = [nameField, 'product_id', 'product_uom_qty', qtyField, 'state'];
        if (moveFields.price_unit !== undefined) readFields.push('price_unit');

        const moves = await odooCall(config, 'stock.move', 'read', [pickingMoves, readFields], {}, cookie);
        lines = moves.map(m => {
          const qty = Number(m.product_uom_qty || 0);
          const price = Number(m.price_unit || 0);
          return {
            name: m[nameField] || m.name || '',
            product_id: m.product_id,
            product_qty: qty,
            price_unit: price,
            price_subtotal: qty * price
          };
        });
      }

      const totalAmount = lines.reduce((sum, l) => sum + l.price_subtotal, 0);

      const mockPo = {
        id: receipt.id,
        name: receipt.name,
        partner_id: receipt.partner_id,
        amount_total: totalAmount,
        state: receipt.state === 'draft' ? 'draft' : (receipt.state === 'done' ? 'done' : (receipt.state === 'cancel' ? 'cancel' : 'purchase')),
        date_order: receipt.scheduled_date
      };

      return res.json({ po: mockPo, lines });
    }

    const pos = await odooCall(config, 'purchase.order', 'read', [[poId], ['id', 'name', 'partner_id', 'amount_total', 'state', 'date_order', 'order_line']], {}, cookie);
    if (!pos || !pos.length) return res.status(404).json({ error: 'PO not found' });
    const po = pos[0];
    
    let lines = [];
    if (po.order_line && po.order_line.length > 0) {
      lines = await odooCall(config, 'purchase.order.line', 'read', [po.order_line, ['name', 'product_id', 'product_qty', 'price_unit', 'price_subtotal']], {}, cookie);
    }
    
    res.json({ po, lines });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/odoo/receipts/:id', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const receiptId = Number(req.params.id);
    
    const moveField = await getMoveField(config, cookie);

    const receipts = await odooCall(config, 'stock.picking', 'read', [[receiptId], ['id', 'name', 'origin', 'partner_id', 'state', 'scheduled_date', moveField]], {}, cookie);
    if (!receipts || !receipts.length) return res.status(404).json({ error: 'Receipt not found' });
    const receipt = receipts[0];
    
    const pickingMoves = receipt[moveField] || [];
    let lines = [];
    if (pickingMoves.length > 0) {
      const moveFields = await odooCall(config, 'stock.move', 'fields_get', [[]], { attributes: ['type'] }, cookie);
      const qtyField = moveFields.quantity !== undefined ? 'quantity' : 'quantity_done';
      const hasName = moveFields.name !== undefined;
      const nameField = hasName ? 'name' : 'description_picking';
      
      const readFields = [nameField, 'product_id', 'product_uom_qty', qtyField, 'state'];
      if (moveFields.price_unit !== undefined) readFields.push('price_unit');
      
      lines = await odooCall(config, 'stock.move', 'read', [pickingMoves, readFields], {}, cookie);
      
      lines = lines.map(l => ({
        ...l,
        name: l[nameField] || l.name || '',
        quantity_done: l[qtyField]
      }));
    }
    
    res.json({ receipt, lines });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/odoo/receipts/:id/pdf', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const id = Number(req.params.id);

    const moveField = await getMoveField(config, cookie);

    const receipts = await odooCall(config, 'stock.picking', 'read', [[id], ['id', 'name', 'origin', 'partner_id', 'state', 'scheduled_date', moveField]], {}, cookie);
    if (!receipts || !receipts.length) return res.status(404).json({ error: 'Receipt not found' });
    const receipt = receipts[0];

    const partnerId = receipt.partner_id ? receipt.partner_id[0] : null;
    let vendor = { name: 'Nhà cung cấp lẻ', street: 'Không xác định', phone: '', email: '' };
    if (partnerId) {
      const partners = await odooCall(config, 'res.partner', 'read', [[partnerId], ['name', 'street', 'phone', 'email']], {}, cookie);
      if (partners && partners.length) {
        vendor = {
          name: partners[0].name || '',
          street: partners[0].street || 'Không xác định',
          phone: partners[0].phone || '',
          email: partners[0].email || ''
        };
      }
    }

    const pickingMoves = receipt[moveField] || [];
    let items = [];
    if (pickingMoves.length > 0) {
      const moveFields = await odooCall(config, 'stock.move', 'fields_get', [[]], { attributes: ['type'] }, cookie);
      const qtyField = moveFields.quantity !== undefined ? 'quantity' : 'quantity_done';
      const hasUom = moveFields.product_uom !== undefined;
      
      const readFields = ['product_id', 'product_uom_qty', qtyField];
      if (hasUom) readFields.push('product_uom');
      if (moveFields.price_unit !== undefined) readFields.push('price_unit');

      const moves = await odooCall(config, 'stock.move', 'read', [pickingMoves, readFields], {}, cookie);
      items = moves.map(m => ({
        productName: m.product_id ? m.product_id[1] : 'Sản phẩm',
        qtyPlanned: Number(m.product_uom_qty || 0),
        qtyDone: Number(m[qtyField] || 0),
        uomName: hasUom && m.product_uom ? m.product_uom[1] : 'Cái',
        price: Number(m.price_unit || 0),
        total: Number(m[qtyField] || 0) * Number(m.price_unit || 0)
      }));
    }

    const receiptDate = receipt.scheduled_date ? new Date(receipt.scheduled_date).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN');

    const htmlContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Phiếu Nhập Kho - ${receipt.name}</title>
  <style>
    body {
      font-family: 'Inter', 'Roboto', 'Segoe UI', Arial, sans-serif;
      margin: 0;
      padding: 40px;
      color: #333;
      background-color: #fff;
    }
    .receipt-card {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      padding: 20px;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .header-table td {
      vertical-align: top;
      border: none;
    }
    .company-logo {
      font-size: 24px;
      font-weight: 800;
      color: #1a56db;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .company-info {
      font-size: 12px;
      color: #666;
      line-height: 1.5;
      margin-top: 5px;
    }
    .receipt-title {
      font-size: 28px;
      font-weight: 800;
      color: #111827;
      text-align: right;
      text-transform: uppercase;
      margin: 0;
    }
    .receipt-meta {
      font-size: 13px;
      color: #4b5563;
      text-align: right;
      line-height: 1.6;
      margin-top: 10px;
    }
    .divider {
      border-bottom: 2px solid #e5e7eb;
      margin: 20px 0;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .details-table td {
      width: 50%;
      vertical-align: top;
      border: none;
      line-height: 1.6;
      font-size: 14px;
    }
    .details-title {
      font-weight: 700;
      color: #111827;
      margin-bottom: 8px;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.5px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .items-table th {
      background-color: #f9fafb;
      color: #4b5563;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      padding: 12px 10px;
      border-bottom: 2px solid #e5e7eb;
      letter-spacing: 0.5px;
    }
    .items-table td {
      padding: 12px 10px;
      border-bottom: 1px solid #f3f4f6;
      font-size: 14px;
      color: #374151;
    }
    .items-table tr:last-child td {
      border-bottom: 2px solid #e5e7eb;
    }
    .text-right {
      text-align: right;
    }
    .text-center {
      text-align: center;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      text-align: center;
      margin-top: 50px;
      page-break-inside: avoid;
    }
    .signature-title {
      font-weight: 600;
      font-size: 13px;
      color: #111827;
      text-transform: uppercase;
    }
    .signature-sub {
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 60px;
    }
    .print-bar {
      max-width: 800px;
      margin: 0 auto 20px auto;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .btn-print {
      background-color: #2563eb;
      color: #fff;
      border: none;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .btn-print:hover {
      background-color: #1d4ed8;
    }
    @media print {
      body {
        padding: 0;
        background-color: #fff;
      }
      .print-bar {
        display: none;
      }
      .receipt-card {
        padding: 0;
        margin: 0;
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="btn-print" onclick="window.print()">In Phiếu Nhập Kho (Print)</button>
  </div>
  <div class="receipt-card">
    <table class="header-table">
      <tr>
        <td>
          <div class="company-logo">DOANH NGHIỆP HOA BÌNH</div>
          <div class="company-info">
            Vật Liệu Xây Dựng & Thiết Kế Thi Công Công Trình<br>
            Địa chỉ: 123 Đường Hòa Bình, TP. Đà Nẵng<br>
            Hotline: 0905 123 456 | Email: info@hoabinh.com
          </div>
        </td>
        <td>
          <h1 class="receipt-title">PHIẾU NHẬP KHO</h1>
          <div class="receipt-meta">
            <strong>Số phiếu kho:</strong> ${receipt.name}<br>
            <strong>Chứng từ gốc:</strong> ${receipt.origin || 'N/A'}<br>
            <strong>Ngày lập:</strong> ${receiptDate}<br>
            <strong>Trạng thái:</strong> ${receipt.state === 'done' ? 'Đã nhập kho' : 'Chờ kiểm duyệt'}
          </div>
        </td>
      </tr>
    </table>

    <div class="divider"></div>

    <table class="details-table">
      <tr>
        <td>
          <div class="details-title">Giao từ (Nhà cung cấp)</div>
          <strong>${vendor.name}</strong><br>
          Địa chỉ: ${vendor.street}<br>
          Điện thoại: ${vendor.phone || 'N/A'}<br>
          Email: ${vendor.email || 'N/A'}
        </td>
        <td>
          <div class="details-title">Nhập vào kho (Địa điểm)</div>
          <strong>DOANH NGHIỆP HOA BÌNH - Kho chính</strong><br>
          Địa chỉ: 123 Đường Hòa Bình, TP. Đà Nẵng<br>
          Điện thoại: 0905 123 456<br>
          Người nhận: Thủ kho vật tư
        </td>
      </tr>
    </table>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 5%">STT</th>
          <th style="width: 50%; text-align: left;">Tên nguyên liệu / sản phẩm</th>
          <th style="width: 15%" class="text-center">ĐVT</th>
          <th style="width: 15%" class="text-center">SL Yêu cầu</th>
          <th style="width: 15%" class="text-center">SL Thực nhận</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, idx) => `
          <tr>
            <td class="text-center">${idx + 1}</td>
            <td><strong>${item.productName}</strong></td>
            <td class="text-center">${item.uomName}</td>
            <td class="text-center">${item.qtyPlanned}</td>
            <td class="text-center"><strong>${item.qtyDone}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="divider"></div>

    <div class="signature-grid">
      <div>
        <div class="signature-title">Người giao hàng</div>
        <div class="signature-sub">(Ký, ghi rõ họ tên)</div>
      </div>
      <div>
        <div class="signature-title">Người nhận hàng</div>
        <div class="signature-sub">(Ký, ghi rõ họ tên)</div>
      </div>
      <div>
        <div class="signature-title">Thủ kho</div>
        <div class="signature-sub">(Ký, xác nhận đã nhận)</div>
      </div>
    </div>
  </div>
</body>
</html>
    `;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlContent);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/odoo/receipts/:id/invoice-pdf', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const receiptId = Number(req.params.id);

    const moveField = await getMoveField(config, cookie);

    const receipts = await odooCall(config, 'stock.picking', 'read', [[receiptId], ['id', 'name', 'origin', 'partner_id', 'state', 'scheduled_date', moveField]], {}, cookie);
    if (!receipts || !receipts.length) return res.status(404).json({ error: 'Receipt not found' });
    const receipt = receipts[0];

    const supportsAccountMove = await checkModelSupport(config, 'account.move', cookie);
    if (supportsAccountMove) {
      let billId = null;
      let domain = [['invoice_origin', '=', receipt.name]];
      if (receipt.origin) {
        domain = [['invoice_origin', 'in', [receipt.name, receipt.origin]]];
      }
      const bills = await odooCall(config, 'account.move', 'search_read', [], {
        domain: [...domain, ['move_type', '=', 'in_invoice']],
        fields: ['id'],
        limit: 1
      }, cookie);

      if (bills && bills.length) {
        billId = bills[0].id;
      }

      if (billId) {
        let invoiceResponse;
        try {
          const reportUrl = `${config.odooUrl}/report/pdf/account.report_invoice_with_payments/${billId}`;
          invoiceResponse = await axios.get(reportUrl, {
            headers: { Cookie: cookie },
            responseType: 'arraybuffer',
            timeout: 15000,
            validateStatus: () => true
          });
          if (invoiceResponse.status === 200 && invoiceResponse.headers['content-type']?.includes('application/pdf')) {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=hoa_don_${receipt.name}.pdf`);
            return res.send(invoiceResponse.data);
          }
        } catch (err) {
          console.warn('Native bill PDF failed, falling back to custom invoice layout:', err.message);
        }
      }
    }

    const partnerId = receipt.partner_id ? receipt.partner_id[0] : null;
    let vendor = { name: 'Khách hàng lẻ', street: 'Không xác định', phone: '', email: '' };
    if (partnerId) {
      const partners = await odooCall(config, 'res.partner', 'read', [[partnerId], ['name', 'street', 'phone', 'email']], {}, cookie);
      if (partners && partners.length) {
        vendor = {
          name: partners[0].name || '',
          street: partners[0].street || 'Không xác định',
          phone: partners[0].phone || '',
          email: partners[0].email || ''
        };
      }
    }

    const pickingMoves = receipt[moveField] || [];
    let items = [];
    if (pickingMoves.length > 0) {
      const moveFields = await odooCall(config, 'stock.move', 'fields_get', [[]], { attributes: ['type'] }, cookie);
      const qtyField = moveFields.quantity !== undefined ? 'quantity' : 'quantity_done';
      
      const readFields = ['product_id', 'product_uom_qty', qtyField];
      if (moveFields.price_unit !== undefined) readFields.push('price_unit');

      const moves = await odooCall(config, 'stock.move', 'read', [pickingMoves, readFields], {}, cookie);
      items = moves.map(m => ({
        productName: m.product_id ? m.product_id[1] : 'Sản phẩm',
        qty: Number(m[qtyField] || m.product_uom_qty || 0),
        price: Number(m.price_unit || 0),
        total: Number(m[qtyField] || m.product_uom_qty || 0) * Number(m.price_unit || 0)
      }));
    }

    const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

    function numberToWords(number) {
      if (number === 0) return 'Không đồng';
      const units = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
      const places = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
      
      let words = [];
      let groupCount = 0;
      let temp = number;

      while (temp > 0) {
        let group = temp % 1000;
        temp = Math.floor(temp / 1000);
        
        if (group > 0) {
          let groupWords = [];
          let hundreds = Math.floor(group / 100);
          let tens = Math.floor((group % 100) / 10);
          let ones = group % 10;

          if (hundreds > 0 || words.length > 0) {
            groupWords.push(units[hundreds] + ' trăm');
          }

          if (tens > 1) {
            groupWords.push(units[tens] + ' mươi');
          } else if (tens === 1) {
            groupWords.push('mười');
          } else if (hundreds > 0 && ones > 0) {
            groupWords.push('lẻ');
          }

          if (ones > 0) {
            if (ones === 1 && tens > 1) {
              groupWords.push('mốt');
            } else if (ones === 5 && tens > 0) {
              groupWords.push('lăm');
            } else {
              groupWords.push(units[ones]);
            }
          }

          groupWords.push(places[groupCount]);
          words.unshift(groupWords.filter(Boolean).join(' '));
        } else {
          groupCount++;
        }
      }

      let res = words.filter(Boolean).join(' ');
      return res.charAt(0).toUpperCase() + res.slice(1) + ' đồng chẵn';
    }

    const totalWords = numberToWords(totalAmount);
    const invoiceDate = receipt.scheduled_date ? new Date(receipt.scheduled_date).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN');

    const htmlContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Hóa Đơn Mua Hàng - ${receipt.name}</title>
  <style>
    body {
      font-family: 'Inter', 'Roboto', 'Segoe UI', Arial, sans-serif;
      margin: 0;
      padding: 40px;
      color: #333;
      background-color: #fff;
    }
    .invoice-card {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      padding: 20px;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .header-table td {
      vertical-align: top;
      border: none;
    }
    .company-logo {
      font-size: 24px;
      font-weight: 800;
      color: #1a56db;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .company-info {
      font-size: 12px;
      color: #666;
      line-height: 1.5;
      margin-top: 5px;
    }
    .invoice-title {
      font-size: 28px;
      font-weight: 800;
      color: #111827;
      text-align: right;
      text-transform: uppercase;
      margin: 0;
    }
    .invoice-meta {
      font-size: 13px;
      color: #4b5563;
      text-align: right;
      line-height: 1.6;
      margin-top: 10px;
    }
    .divider {
      border-bottom: 2px solid #e5e7eb;
      margin: 20px 0;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .details-table td {
      width: 50%;
      vertical-align: top;
      border: none;
      line-height: 1.6;
      font-size: 14px;
    }
    .details-title {
      font-weight: 700;
      color: #111827;
      margin-bottom: 8px;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.5px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .items-table th {
      background-color: #f9fafb;
      color: #4b5563;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      padding: 12px 10px;
      border-bottom: 2px solid #e5e7eb;
      letter-spacing: 0.5px;
    }
    .items-table td {
      padding: 12px 10px;
      border-bottom: 1px solid #f3f4f6;
      font-size: 14px;
      color: #374151;
    }
    .items-table tr:last-child td {
      border-bottom: 2px solid #e5e7eb;
    }
    .text-right {
      text-align: right;
    }
    .text-center {
      text-align: center;
    }
    .totals-table {
      width: 40%;
      margin-left: 60%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .totals-table td {
      padding: 8px 10px;
      font-size: 14px;
      color: #374151;
    }
    .totals-table tr.grand-total td {
      font-size: 18px;
      font-weight: 800;
      color: #111827;
      border-top: 1px solid #e5e7eb;
      padding-top: 12px;
    }
    .words-total {
      font-style: italic;
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 40px;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      text-align: center;
      margin-top: 50px;
      page-break-inside: avoid;
    }
    .signature-title {
      font-weight: 600;
      font-size: 13px;
      color: #111827;
      text-transform: uppercase;
    }
    .signature-sub {
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 60px;
    }
    .print-bar {
      max-width: 800px;
      margin: 0 auto 20px auto;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .btn-print {
      background-color: #2563eb;
      color: #fff;
      border: none;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .btn-print:hover {
      background-color: #1d4ed8;
    }
    @media print {
      body {
        padding: 0;
        background-color: #fff;
      }
      .print-bar {
        display: none;
      }
      .invoice-card {
        padding: 0;
        margin: 0;
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="btn-print" onclick="window.print()">In Hóa Đơn (Print)</button>
  </div>
  <div class="invoice-card">
    <table class="header-table">
      <tr>
        <td>
          <div class="company-logo">DOANH NGHIỆP HOA BÌNH</div>
          <div class="company-info">
            Vật Liệu Xây Dựng & Thiết Kế Thi Công Công Trình<br>
            Địa chỉ: 123 Đường Hòa Bình, TP. Đà Nẵng<br>
            Hotline: 0905 123 456 | Email: info@hoabinh.com
          </div>
        </td>
        <td>
          <h1 class="invoice-title">HÓA ĐƠN MUA HÀNG</h1>
          <div class="invoice-meta">
            <strong>Mã hóa đơn:</strong> INV-${receipt.name.split('/').pop()}<br>
            <strong>Số phiếu kho:</strong> ${receipt.name}<br>
            <strong>Ngày lập:</strong> ${invoiceDate}
          </div>
        </td>
      </tr>
    </table>

    <div class="divider"></div>

    <table class="details-table">
      <tr>
        <td>
          <div class="details-title">Đơn vị bán (Nhà cung cấp)</div>
          <strong>${vendor.name}</strong><br>
          Địa chỉ: ${vendor.street}<br>
          Điện thoại: ${vendor.phone || 'N/A'}<br>
          Email: ${vendor.email || 'N/A'}
        </td>
        <td>
          <div class="details-title">Đơn vị mua (Khách hàng)</div>
          <strong>DOANH NGHIỆP HOA BÌNH</strong><br>
          Địa chỉ: 123 Đường Hòa Bình, TP. Đà Nẵng<br>
          Điện thoại: 0905 123 456<br>
          Email: ketoan@hoabinh.com
        </td>
      </tr>
    </table>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 5%">STT</th>
          <th style="width: 55%; text-align: left;">Tên nguyên liệu / sản phẩm</th>
          <th style="width: 10%" class="text-center">Số lượng</th>
          <th style="width: 15%" class="text-right">Đơn giá</th>
          <th style="width: 15%" class="text-right">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, idx) => `
          <tr>
            <td class="text-center">${idx + 1}</td>
            <td><strong>${item.productName}</strong></td>
            <td class="text-center">${item.qty}</td>
            <td class="text-right">${item.price.toLocaleString()} đ</td>
            <td class="text-right"><strong>${item.total.toLocaleString()} đ</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <table class="totals-table">
      <tr>
        <td>Cộng tiền hàng:</td>
        <td class="text-right">${totalAmount.toLocaleString()} đ</td>
      </tr>
      <tr>
        <td>Thuế GTGT (0%):</td>
        <td class="text-right">0 đ</td>
      </tr>
      <tr class="grand-total">
        <td>Tổng cộng:</td>
        <td class="text-right">${totalAmount.toLocaleString()} đ</td>
      </tr>
    </table>

    <div class="words-total">
      <strong>Số tiền viết bằng chữ:</strong> ${totalWords}
    </div>

    <div class="signature-grid">
      <div>
        <div class="signature-title">Người lập phiếu</div>
        <div class="signature-sub">(Ký, ghi rõ họ tên)</div>
      </div>
      <div>
        <div class="signature-title">Người giao hàng</div>
        <div class="signature-sub">(Ký, ghi rõ họ tên)</div>
      </div>
      <div>
        <div class="signature-title">Thủ kho</div>
        <div class="signature-sub">(Ký, xác nhận đã nhận)</div>
      </div>
    </div>
  </div>
</body>
</html>
    `;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlContent);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = {
  router,
  validatePickingInternal
};
