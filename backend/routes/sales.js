const express = require('express');
const router = express.Router();
const axios = require('axios');

const { loadConfig } = require('../config/config');
const { odooCall, odooAuth, resolveProductVariant } = require('../services/odooService');
const { checkRole } = require('../middlewares/authMiddleware');
const { validatePickingInternal } = require('./orders');
const { getPickingType, getMoveField } = require('../helpers/stockHelpers');

const { getCachedModelSupport, setCachedModelSupport } = require('../helpers/modelCache');

async function checkModelSupport(config, model, cookie) {
  const cached = getCachedModelSupport(model);
  if (cached !== undefined) return cached;
  
  try {
    const fields = await odooCall(config, model, 'fields_get', [[]], { attributes: ['type'] }, cookie);
    const supported = (fields && Object.keys(fields).length > 0);
    setCachedModelSupport(model, supported);
    return supported;
  } catch (e) {
    setCachedModelSupport(model, false);
    return false;
  }
}

async function resolveStockForVariant(config, variantId, locationId, cookie) {
  const domain = [['product_id', '=', variantId]];
  if (locationId) {
    domain.push(['location_id', '=', locationId]);
  } else {
    domain.push(['location_id.usage', '=', 'internal']);
  }
  const quants = await odooCall(config, 'stock.quant', 'search_read', [], {
    domain,
    fields: ['quantity']
  }, cookie);
  return quants.reduce((sum, q) => sum + (q.quantity || 0), 0);
}

async function checkStockSufficient(config, lines, locationId, cookie) {
  const demandMap = {};
  for (const line of lines) {
    const variantId = await resolveProductVariant(config, line.product_id, cookie);
    demandMap[variantId] = (demandMap[variantId] || 0) + Number(line.product_qty || line.product_uom_qty || 0);
  }

  const details = [];
  let sufficient = true;

  for (const variantIdStr of Object.keys(demandMap)) {
    const variantId = Number(variantIdStr);
    const needed = demandMap[variantIdStr];
    const available = await resolveStockForVariant(config, variantId, locationId, cookie);
    const shortage = Math.max(0, needed - available);

    const prods = await odooCall(config, 'product.product', 'read', [[variantId], ['name']], {}, cookie);
    const name = prods && prods.length ? prods[0].name : `Product #${variantId}`;

    details.push({
      product_id: variantId,
      product_name: name,
      needed,
      available,
      shortage
    });

    if (shortage > 0) {
      sufficient = false;
    }
  }

  return { sufficient, details };
}

router.post('/odoo/sale-orders', checkRole(['kinh_doanh']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const body = req.body;

    const supportsSO = await checkModelSupport(config, 'sale.order', cookie);

    if (!supportsSO) {
      console.log('sale.order not supported. Creating standalone stock.picking (Delivery)...');
      
      const pType = await getPickingType(config, cookie, 'outgoing');
      const sourceLocId = pType.default_location_src_id ? pType.default_location_src_id[0] : 12;
      const destLocId = pType.default_location_dest_id ? pType.default_location_dest_id[0] : 9;

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
          description_picking: 'Xuất kho sản phẩm'
        }]);
      }

      const pickingData = {
        partner_id: Number(body.partner_id),
        picking_type_id: pType.id,
        location_id: sourceLocId,
        location_dest_id: destLocId,
        origin: body.date_order ? `Đơn bán ngày ${body.date_order.substring(0, 10)}` : 'Đơn bán hàng',
        move_ids: moveLines
      };

      const pickingId = await odooCall(config, 'stock.picking', 'create', [pickingData], {}, cookie);

      if (body.draft === true) {
        return res.json({ success: true, id: null, pickingId, state: 'draft', isFallback: true });
      }

      // Check stock sufficiency
      const { sufficient, details } = await checkStockSufficient(config, body.order_line, sourceLocId, cookie);
      if (!sufficient) {
        return res.json({
          success: true,
          id: null,
          pickingId,
          state: 'draft',
          stockShortage: true,
          isFallback: true,
          warning: 'Không đủ tồn kho để tự động xuất hàng. Đơn hàng đã được tạo dưới dạng Nháp.',
          details
        });
      }

      let warning = '';
      try {
        await validatePickingInternal(config, pickingId, cookie);
      } catch (pickingErr) {
        console.warn('Validate fallback outgoing picking failed:', pickingErr.message);
        warning = `Đơn xuất kho đã tạo nhưng gặp lỗi tự động duyệt: ${pickingErr.message}.`;
      }

      return res.json({ success: true, id: null, pickingId, state: 'done', isFallback: true, warning: warning || undefined });
    }

    const resolvedOrderLines = [];
    const invoiceLineIds = [];
    for (const line of body.order_line) {
      const variantId = await resolveProductVariant(config, line.product_id, cookie);
      resolvedOrderLines.push([0, 0, {
        product_id: variantId,
        product_uom_qty: Number(line.product_qty),
        price_unit: Number(line.price_unit)
      }]);
      invoiceLineIds.push([0, 0, {
        product_id: variantId,
        quantity: Number(line.product_qty),
        price_unit: Number(line.price_unit),
        name: 'Bán hàng qua SO'
      }]);
    }
    
    const createPayload = {
      partner_id: Number(body.partner_id),
      order_line: resolvedOrderLines
    };
    if (body.date_order) {
      try {
        const d = new Date(body.date_order);
        if (!isNaN(d.getTime())) {
          createPayload.date_order = d.toISOString().replace('T', ' ').substring(0, 19);
        }
      } catch (dateErr) {
        console.warn('Invalid date format provided, using Odoo default:', dateErr.message);
      }
    }
    
    const soId = await odooCall(config, 'sale.order', 'create', [createPayload], {}, cookie);
    
    if (body.draft === true) {
      return res.json({ success: true, id: soId, state: 'draft', warning: '' });
    }

    // Check stock sufficiency
    const { sufficient, details } = await checkStockSufficient(config, body.order_line, null, cookie);
    if (!sufficient) {
      return res.json({
        success: true,
        id: soId,
        state: 'draft',
        stockShortage: true,
        warning: 'Không đủ tồn kho để tự động xuất và sinh hóa đơn. Đơn hàng đã được tạo dưới dạng Nháp.',
        details
      });
    }

    let warningMsg = '';
    let invoiceId = null;
    let pickingId = null;

    try {
      await odooCall(config, 'sale.order', 'action_confirm', [[soId]], {}, cookie);
      
      const pickings = await odooCall(config, 'stock.picking', 'search_read', [], {
        domain: [['sale_id', '=', soId], ['state', 'not in', ['done', 'cancel']]],
        fields: ['id'],
        limit: 1
      }, cookie);
      if (pickings && pickings.length) {
        pickingId = pickings[0].id;
        await validatePickingInternal(config, pickingId, cookie);
      }
    } catch (confirmErr) {
      console.warn('Auto validate picking failed:', confirmErr.message);
      warningMsg += `Đã xác nhận đơn hàng nhưng lỗi tự động trừ kho: ${confirmErr.message}. `;
    }

    try {
      const context = { active_ids: [soId], active_id: soId, active_model: 'sale.order' };
      const wizardId = await odooCall(config, 'sale.advance.payment.inv', 'create', [{
        advance_payment_method: 'delivered'
      }], { context }, cookie);
      await odooCall(config, 'sale.advance.payment.inv', 'create_invoices', [[wizardId]], { context }, cookie);
      
      const updatedSO = await odooCall(config, 'sale.order', 'read', [[soId], ['invoice_ids']], {}, cookie);
      if (updatedSO && updatedSO.length && updatedSO[0].invoice_ids && updatedSO[0].invoice_ids.length) {
        invoiceId = updatedSO[0].invoice_ids[0];
      }
    } catch (invoiceErr) {
      console.warn('Invoice wizard auto-create failed, falling back to manual creation:', invoiceErr.message);
      try {
        if (invoiceLineIds.length) {
          invoiceId = await odooCall(config, 'account.move', 'create', [{
            move_type: 'out_invoice',
            partner_id: Number(body.partner_id),
            invoice_origin: `SO${soId}`,
            invoice_line_ids: invoiceLineIds
          }], {}, cookie);
        }
      } catch (manualErr) {
        console.error('Manual invoice creation fallback failed:', manualErr.message);
        warningMsg += `Không thể tự động sinh Hóa đơn: ${manualErr.message}.`;
      }
    }
    
    res.json({ success: true, id: soId, invoiceId, pickingId, state: 'sale', warning: warningMsg || undefined });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/odoo/deliveries/:id/validate', checkRole(['kinh_doanh']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const pickingId = Number(req.params.id);

    const moveField = await getMoveField(config, cookie);
    const pickings = await odooCall(config, 'stock.picking', 'read', [[pickingId], ['id', 'location_id', moveField]], {}, cookie);
    if (!pickings || !pickings.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy phiếu xuất kho' });
    }
    const picking = pickings[0];
    const sourceLocId = picking.location_id ? picking.location_id[0] : null;

    const moveIds = picking[moveField] || [];
    if (moveIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Phiếu xuất kho không có dòng sản phẩm nào' });
    }

    const moves = await odooCall(config, 'stock.move', 'read', [moveIds, ['product_id', 'product_uom_qty']], {}, cookie);
    const lines = moves.map(m => ({
      product_id: m.product_id ? m.product_id[0] : null,
      product_qty: Number(m.product_uom_qty || 0)
    }));

    const { sufficient, details } = await checkStockSufficient(config, lines, sourceLocId, cookie);
    if (!sufficient) {
      return res.status(400).json({
        success: false,
        error: 'Không đủ tồn kho để xuất hàng',
        stockShortage: true,
        details
      });
    }

    await validatePickingInternal(config, pickingId, cookie);

    res.json({ success: true, message: 'Đã xuất kho và cập nhật tồn kho thành công!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// sales.js - router.post('/odoo/so/:id/cancel') - VIẾT LẠI TOÀN BỘ
router.post('/odoo/so/:id/cancel', checkRole(['kinh_doanh']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const soId = Number(req.params.id);

    const supportsSO = await checkModelSupport(config, 'sale.order', cookie);
    if (!supportsSO) {
      // Fallback: chỉ cancel picking thẳng
      await odooCall(config, 'stock.picking', 'write', [[soId], { state: 'cancel' }], {}, cookie);
      return res.json({ success: true, message: 'Đã hủy đơn xuất kho thành công.' });
    }

    const order = await odooCall(config, 'sale.order', 'read', 
      [[soId], ['id', 'name', 'partner_id', 'state', 'order_line']], {}, cookie);
    if (!order || !order.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn bán hàng' });
    }
    const so = order[0];

    // ✅ BƯỚC MỚI: Kiểm tra picking đã done chưa
    const pickings = await odooCall(config, 'stock.picking', 'search_read', [], {
      domain: [['sale_id', '=', soId]],
      fields: ['id', 'state', 'name', 'move_ids', 'picking_type_id', 'location_id', 'location_dest_id']
    }, cookie);

    const donePickings = pickings.filter(p => p.state === 'done');
    let returnPickingId = null;
    let returnWarning = '';

    if (donePickings.length > 0) {
      // ✅ TẠO RETURN PICKING thay vì sửa stock.quant
      console.log(`SO ${soId} có ${donePickings.length} picking done → tạo return picking`);
      
      try {
        returnPickingId = await createReturnPicking(config, cookie, donePickings, so);
      } catch (returnErr) {
        console.error('Lỗi tạo return picking:', returnErr.message);
        return res.status(500).json({
          success: false,
          error: 'Không thể tạo phiếu nhập lại hàng: ' + returnErr.message
        });
      }
    }

    // ✅ HỦY các picking chưa done
    for (const p of pickings) {
      if (p.state !== 'done' && p.state !== 'cancel') {
        try {
          await odooCall(config, 'stock.picking', 'write', [[p.id], { state: 'cancel' }], {}, cookie);
        } catch (pickErr) {
          console.warn(`Could not cancel picking ${p.id}:`, pickErr.message);
        }
      }
    }

    // ✅ HỦY sale.order
    await odooCall(config, 'sale.order', 'write', [[soId], { state: 'cancel' }], {}, cookie);

    res.json({
      success: true,
      message: returnPickingId 
        ? `Đã hủy đơn và tạo phiếu nhập lại hàng #${returnPickingId}`
        : 'Đã hủy đơn thành công',
      returnPickingId,
      warning: returnWarning || undefined
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * ✅ HÀM MỚI: Tạo return picking đúng chuẩn Odoo
 * Tạo stock.move với origin trỏ về picking gốc
 * Odoo sẽ tự sinh accounting entries
 */
async function createReturnPicking(config, cookie, originalPickings, saleOrder) {
  const moveField = await getMoveField(config, cookie);
  
  // Lấy tất cả move IDs từ các picking đã done
  const allMoveIds = [];
  for (const p of originalPickings) {
    const moves = p[moveField] || p.move_ids || [];
    allMoveIds.push(...moves);
  }

  if (allMoveIds.length === 0) {
    throw new Error('Không có dòng hàng nào trong picking gốc');
  }

  // Đọc chi tiết các move
  const moveFields = await odooCall(config, 'stock.move', 'fields_get', [[]], { attributes: ['type'] }, cookie);
  const qtyField = moveFields.quantity !== undefined ? 'quantity' : 'quantity_done';
  
  const readFields = ['product_id', qtyField, 'state', 'uom_id', 'product_uom_qty', 'location_id', 'location_dest_id'];
  if (moveFields.price_unit !== undefined) readFields.push('price_unit');

  const originalMoves = await odooCall(config, 'stock.move', 'read', [allMoveIds, readFields], {}, cookie);
  
  // Lấy return picking type
  const returnPickingType = await odooCall(config, 'stock.picking.type', 'search_read', [], {
    domain: [['code', '=', 'incoming']],  // Phiếu nhập lại vào kho
    fields: ['id', 'name', 'default_location_src_id', 'default_location_dest_id'],
    limit: 1
  }, cookie);
  
  if (!returnPickingType.length) {
    throw new Error('Không tìm thấy Operation Type "incoming" trong Odoo');
  }
  
  const pType = returnPickingType[0];
  const sourceLocId = pType.default_location_src_id[0];  // Supplier location
  const destLocId = pType.default_location_dest_id[0];    // Internal location

  // Tạo return moves
  const returnMoveLines = originalMoves
    .filter(m => m.state === 'done')
    .map(m => {
      const qty = Number(m[qtyField] || m.product_uom_qty || 0);
      const variantId = Array.isArray(m.product_id) ? m.product_id[0] : m.product_id;
      const uomId = m.uom_id ? (Array.isArray(m.uom_id) ? m.uom_id[0] : m.uom_id) : 1;

      return [0, 0, {
        product_id: variantId,
        product_uom_qty: qty,
        uom_id: uomId,
        location_id: sourceLocId,
        location_dest_id: destLocId,
        origin_returned_move_id: m.id,  // ✅ Liên kết với move gốc
        price_unit: Number(m.price_unit || 0),
        description_picking: `Hoàn trả từ SO ${saleOrder.name}`
      }];
    });

  if (returnMoveLines.length === 0) {
    throw new Error('Không có move nào ở trạng thái done để hoàn trả');
  }

  // Tạo return picking
  const returnPickingId = await odooCall(config, 'stock.picking', 'create', [{
    partner_id: saleOrder.partner_id ? saleOrder.partner_id[0] : null,
    picking_type_id: pType.id,
    location_id: sourceLocId,
    location_dest_id: destLocId,
    origin: `Return of ${saleOrder.name}`,
    [moveField]: returnMoveLines
  }], {}, cookie);

  console.log(`Created return picking ${returnPickingId} for SO ${saleOrder.id}`);

  // Validate return picking ngay để cập nhật tồn kho
  try {
    await validatePickingInternal(config, returnPickingId, cookie);
    console.log(`✅ Return picking ${returnPickingId} validated → stock restored`);
  } catch (valErr) {
    console.warn(`⚠️ Return picking created but not validated: ${valErr.message}`);
    console.warn('   → User cần vào Odoo validate thủ công để cập nhật tồn kho');
  }

  return returnPickingId;
}


router.get('/odoo/so/:id', checkRole(['kinh_doanh']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const id = Number(req.params.id);
    
    const supportsSO = await checkModelSupport(config, 'sale.order', cookie);
    if (!supportsSO) {
      const moveField = await getMoveField(config, cookie);

      const receipts = await odooCall(config, 'stock.picking', 'read', [[id], ['id', 'name', 'origin', 'partner_id', 'state', 'scheduled_date', moveField]], {}, cookie);
      if (!receipts || !receipts.length) return res.status(404).json({ error: 'Order not found' });
      const receipt = receipts[0];

      const pickingMoves = receipt[moveField] || [];
      let lines = [];
      if (pickingMoves.length > 0) {
        const moveFields = await odooCall(config, 'stock.move', 'fields_get', [[]], { attributes: ['type'] }, cookie);
        const qtyField = moveFields.quantity !== undefined ? 'quantity' : 'quantity_done';
        const nameField = moveFields.name !== undefined ? 'name' : 'description_picking';

        const readFields = [nameField, 'product_id', 'product_uom_qty', qtyField, 'state'];
        if (moveFields.price_unit !== undefined) readFields.push('price_unit');

        const moves = await odooCall(config, 'stock.move', 'read', [pickingMoves, readFields], {}, cookie);
        lines = moves.map(m => {
          const qty = Number(m.product_uom_qty || 0);
          const price = Number(m.price_unit || 0);
          return {
            product_id: m.product_id ? m.product_id[0] : null,
            product_name: m.product_id ? m.product_id[1] : 'Sản phẩm',
            product_qty: qty,
            price_unit: price,
            price_subtotal: qty * price
          };
        });
      }

      const totalAmount = lines.reduce((sum, l) => sum + l.price_subtotal, 0);

      const mockSo = {
        id: receipt.id,
        name: receipt.name,
        partner_id: receipt.partner_id ? receipt.partner_id[0] : null,
        date_order: receipt.scheduled_date,
        state: receipt.state === 'draft' ? 'draft' : (receipt.state === 'done' ? 'sale' : (receipt.state === 'cancel' ? 'cancel' : 'sale')),
        amount_total: totalAmount,
        picking_ids: [receipt.id],
        order_line: lines
      };

      return res.json(mockSo);
    }

    const orders = await odooCall(config, 'sale.order', 'read', [[id], ['id', 'name', 'partner_id', 'amount_total', 'state', 'invoice_ids', 'date_order', 'order_line', 'picking_ids']], {}, cookie);
    if (!orders || !orders.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng' });
    }
    const order = orders[0];
    
    let lines = [];
    if (order.order_line && order.order_line.length) {
      lines = await odooCall(config, 'sale.order.line', 'read', [order.order_line, ['product_id', 'product_uom_qty', 'price_unit', 'price_subtotal']], {}, cookie);
    }
    
    const data = {
      id: order.id,
      name: order.name,
      partner_id: order.partner_id ? order.partner_id[0] : null,
      date_order: order.date_order,
      state: order.state,
      amount_total: order.amount_total,
      picking_ids: order.picking_ids || [],
      order_line: lines.map(l => ({
        product_id: l.product_id ? l.product_id[0] : null,
        product_name: l.product_id ? l.product_id[1] : '',
        product_qty: l.product_uom_qty,
        price_unit: l.price_unit,
        price_subtotal: l.price_subtotal
      }))
    };
    
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/odoo/so', checkRole(['kinh_doanh']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    
    const supportsSO = await checkModelSupport(config, 'sale.order', cookie);
    const partners = await odooCall(config, 'res.partner', 'search_read', [], {
      fields: ['id', 'name'],
      limit: 500
    }, cookie);
    const partnerMap = new Map(partners.map(p => [p.id, p]));

    if (!supportsSO) {
      const moveField = await getMoveField(config, cookie);

      const receipts = await odooCall(config, 'stock.picking', 'search_read', [], {
        domain: [['picking_type_code', '=', 'outgoing']],
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
        else if (r.state === 'done') mappedState = 'sale';
        else if (r.state === 'cancel') mappedState = 'cancel';
        else mappedState = 'sale';

        return {
          id: r.id,
          name: r.name || '',
          partner: partnerMap.get(r.partner_id?.[0])?.name || '',
          amount_total: totalAmount,
          state: mappedState,
          delivery_state: r.state || '',
          invoice_ids: [],
          invoice_ref: 'Chưa xuất',
          date_order: r.scheduled_date || r.write_date || '',
          isFallback: true
        };
      });

      return res.json(data);
    }

    const orders = await odooCall(config, 'sale.order', 'search_read', [], {
      domain: [],
      limit: 100,
      order: 'id desc',
      fields: ['id', 'name', 'partner_id', 'amount_total', 'state', 'invoice_ids', 'write_date', 'picking_ids', 'date_order']
    }, cookie);
    
    const allPickingIds = [];
    orders.forEach(o => {
      if (o.picking_ids && o.picking_ids.length) {
        allPickingIds.push(...o.picking_ids);
      }
    });

    let pickingMap = new Map();
    if (allPickingIds.length) {
      try {
        const pickings = await odooCall(config, 'stock.picking', 'search_read', [], {
          domain: [['id', 'in', allPickingIds]],
          fields: ['id', 'state']
        }, cookie);
        pickingMap = new Map(pickings.map(p => [p.id, p.state]));
      } catch (pickErr) {
        console.warn('Failed to fetch pickings in batch:', pickErr.message);
      }
    }

    const data = orders.map(o => {
      let pickingState = '';
      if (o.picking_ids && o.picking_ids.length) {
        const states = o.picking_ids.map(id => pickingMap.get(id)).filter(Boolean);
        if (states.length && states.every(s => s === 'done')) {
          pickingState = 'done';
        } else if (states.some(s => s === 'assigned')) {
          pickingState = 'assigned';
        } else if (states.some(s => s === 'confirmed' || s === 'waiting')) {
          pickingState = 'confirmed';
        } else if (states.includes('cancel')) {
          pickingState = 'cancel';
        } else {
          pickingState = states[0] || '';
        }
      }

      return {
        id: o.id,
        name: o.name || '',
        partner: partnerMap.get(o.partner_id?.[0])?.name || '',
        amount_total: o.amount_total ?? 0,
        state: o.state || '',
        delivery_state: pickingState,
        invoice_ids: o.invoice_ids || [],
        invoice_ref: Array.isArray(o.invoice_ids) && o.invoice_ids.length ? `Invoice: ${o.invoice_ids.join(', ')}` : 'Chưa xuất',
        date_order: o.date_order || ''
      };
    });
    
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/odoo/so/:id/invoice-pdf', checkRole(['ke_toan_ban_hang', 'kinh_doanh']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const soId = Number(req.params.id);

    const supportsSO = await checkModelSupport(config, 'sale.order', cookie);
    const moveField = await getMoveField(config, cookie);

    let pickingId = soId;
    if (supportsSO) {
      const pickings = await odooCall(config, 'stock.picking', 'search_read', [], {
        domain: [['sale_id', '=', soId]],
        fields: ['id'],
        limit: 1
      }, cookie);
      if (pickings && pickings.length) {
        pickingId = pickings[0].id;
      }
    }

    // Render custom HTML Invoice PDF from picking info
    const receipts = await odooCall(config, 'stock.picking', 'read', [[pickingId], ['id', 'name', 'origin', 'partner_id', 'state', 'scheduled_date', moveField]], {}, cookie);
    if (!receipts || !receipts.length) return res.status(404).json({ error: 'Receipt not found' });
    const receipt = receipts[0];

    const partnerId = receipt.partner_id ? receipt.partner_id[0] : null;
    let customer = { name: 'Khách hàng lẻ', street: 'Không xác định', phone: '', email: '' };
    if (partnerId) {
      const partners = await odooCall(config, 'res.partner', 'read', [[partnerId], ['name', 'street', 'phone', 'email']], {}, cookie);
      if (partners && partners.length) {
        customer = {
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

      let resWords = words.filter(Boolean).join(' ');
      return resWords.charAt(0).toUpperCase() + resWords.slice(1) + ' đồng chẵn';
    }

    const totalWords = numberToWords(totalAmount);
    const invoiceDate = receipt.scheduled_date ? new Date(receipt.scheduled_date).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN');

    const htmlContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Hóa Đơn Bán Hàng - ${receipt.name}</title>
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
          <h1 class="invoice-title">HÓA ĐƠN BÁN HÀNG</h1>
          <div class="invoice-meta">
            <strong>Mã hóa đơn:</strong> INV-${receipt.name.split('/').pop()}<br>
            <strong>Số phiếu xuất:</strong> ${receipt.name}<br>
            <strong>Ngày lập:</strong> ${invoiceDate}
          </div>
        </td>
      </tr>
    </table>

    <div class="divider"></div>

    <table class="details-table">
      <tr>
        <td>
          <div class="details-title">Đơn vị bán (Người bán)</div>
          <strong>DOANH NGHIỆP HOA BÌNH</strong><br>
          Địa chỉ: 123 Đường Hòa Bình, TP. Đà Nẵng<br>
          Điện thoại: 0905 123 456<br>
          Email: kinhdoanh@hoabinh.com
        </td>
        <td>
          <div class="details-title">Đơn vị mua (Khách hàng)</div>
          <strong>${customer.name}</strong><br>
          Địa chỉ: ${customer.street}<br>
          Điện thoại: ${customer.phone || 'N/A'}<br>
          Email: ${customer.email || 'N/A'}
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
        <div class="signature-title">Người nhận hàng</div>
        <div class="signature-sub">(Ký, ghi rõ họ tên)</div>
      </div>
      <div>
        <div class="signature-title">Thủ kho xuất</div>
        <div class="signature-sub">(Ký, xác nhận)</div>
      </div>
    </div>
  </div>
</body>
</html>
    `;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(htmlContent);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/odoo/so/:id', checkRole(['admin', 'kinh_doanh', 'ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const soId = Number(req.params.id);
    const force = req.query.force === 'true' || req.body?.force === true;
    
    const supportsSO = await checkModelSupport(config, 'sale.order', cookie);
    const moveField = await getMoveField(config, cookie);
    
    // ===== NHÁNH 1: Chỉ có Inventory (fallback) =====
    if (!supportsSO) {
      const pickings = await odooCall(config, 'stock.picking', 'read', [[soId], ['state']], {}, cookie);
      if (!pickings?.length) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy phiếu xuất' });
      }
      
      const state = pickings[0].state;
      
      // Không cho xóa nếu đã done (trừ khi force)
      if (state === 'done' && !force) {
        return res.status(400).json({
          success: false,
          error: 'Không thể xóa phiếu đã xuất kho (state=done). Vui lòng HỦY đơn trước nếu muốn trả hàng vào kho.'
        });
      }
      
      try {
        await odooCall(config, 'stock.picking', 'unlink', [[soId]], {}, cookie);
      } catch (err) {
        console.warn('Direct unlink failed, trying cancel first:', err.message);
        try {
          await odooCall(config, 'stock.picking', 'write', [[soId], { state: 'cancel' }], {}, cookie);
          await odooCall(config, 'stock.picking', 'unlink', [[soId]], {}, cookie);
        } catch (err2) {
          return res.status(500).json({
            success: false,
            error: 'Không thể xóa phiếu: ' + err2.message
          });
        }
      }
      
      return res.json({
        success: true,
        message: force && state === 'done' 
          ? 'Đã FORCE xóa phiếu đã xuất kho (tồn kho KHÔNG được hoàn trả)'
          : 'Đã xóa phiếu xuất kho thành công'
      });
    }
    
    // ===== NHÁNH 2: Có sale.order =====
    const orders = await odooCall(config, 'sale.order', 'read', 
      [[soId], ['id', 'name', 'state', 'picking_ids', 'invoice_ids', 'order_line']], {}, cookie);
    
    if (!orders?.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn bán' });
    }
    
    const order = orders[0];
    
    // ===== CHECK QUYỀN XÓA =====
    if ((order.state === 'sale' || order.state === 'done') && !force) {
      return res.status(400).json({
        success: false,
        error: `Không thể xóa đơn đã ở trạng thái "${order.state === 'sale' ? 'Đã xác nhận' : 'Hoàn thành'}". Vui lòng HỦY đơn trước nếu muốn trả hàng vào kho.`
      });
    }
    
    // ===== XÓA INVOICE LIÊN QUAN (nếu có và là draft) =====
    if (order.invoice_ids?.length) {
      const invoices = await odooCall(config, 'account.move', 'read', 
        [order.invoice_ids, ['state']], {}, cookie);
      
      const draftInvoiceIds = invoices
        .filter(inv => inv.state === 'draft')
        .map(inv => inv.id);
      
      if (draftInvoiceIds.length) {
        try {
          await odooCall(config, 'account.move', 'unlink', [draftInvoiceIds], {}, cookie);
          console.log(`Deleted ${draftInvoiceIds.length} draft invoice(s) of SO ${soId}`);
        } catch (invErr) {
          console.warn('Failed to delete draft invoices:', invErr.message);
        }
      }
      
      // Cảnh báo nếu có invoice posted
      const postedInvoices = invoices.filter(inv => inv.state === 'posted');
      if (postedInvoices.length && !force) {
        return res.status(400).json({
          success: false,
          error: `Đơn hàng đã có ${postedInvoices.length} hóa đơn đã vào sổ. Không thể xóa. Vui lòng hủy hóa đơn trước.`
        });
      }
    }
    
    // ===== HỦY PICKINGS TRƯỚC (nếu chưa done) =====
    if (order.picking_ids?.length) {
      const pickings = await odooCall(config, 'stock.picking', 'read', 
        [order.picking_ids, ['state']], {}, cookie);
      
      const activePickingIds = pickings
        .filter(p => p.state !== 'done' && p.state !== 'cancel')
        .map(p => p.id);
      
      // Cancel pickings chưa done
      if (activePickingIds.length) {
        try {
          await odooCall(config, 'stock.picking', 'write', 
            [activePickingIds, { state: 'cancel' }], {}, cookie);
        } catch (e) {
          console.warn('Failed to cancel pickings:', e.message);
        }
      }
      
      // Nếu picking đã done và force → cảnh báo mất tồn kho
      const donePickings = pickings.filter(p => p.state === 'done');
      if (donePickings.length && force) {
        console.warn(`Force deleting SO ${soId} with ${donePickings.length} done picking(s). Stock NOT restored!`);
      }
    }
    
    // ===== SET SALE.ORDER VỀ DRAFT TRƯỚC (nếu đang sale/done) =====
    if (order.state !== 'draft' && order.state !== 'cancel') {
      try {
        await odooCall(config, 'sale.order', 'action_cancel', [[soId]], {}, cookie);
      } catch (e) {
        console.warn('action_cancel failed, trying write state:', e.message);
        try {
          await odooCall(config, 'sale.order', 'write', [[soId], { state: 'cancel' }], {}, cookie);
        } catch (e2) {
          return res.status(500).json({
            success: false,
            error: 'Không thể chuyển trạng thái đơn: ' + e2.message
          });
        }
      }
    }
    
    // ===== XÓA ORDER =====
    try {
      await odooCall(config, 'sale.order', 'unlink', [[soId]], {}, cookie);
    } catch (unlinkErr) {
      console.error('Failed to unlink SO:', unlinkErr.message);
      return res.status(500).json({
        success: false,
        error: 'Không thể xóa đơn: ' + unlinkErr.message
      });
    }
    
    res.json({
      success: true,
      message: force 
        ? `Đã force xóa đơn ${order.name}. Tồn kho KHÔNG được hoàn trả.`
        : `Đã xóa đơn ${order.name} thành công`
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
