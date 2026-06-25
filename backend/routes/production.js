const express = require('express');
const router = express.Router();

const { loadConfig } = require('../config/config');
const { odooCall, odooAuth } = require('../services/odooService');
const { loadProductionLog, saveProductionLog } = require('../services/fileService');
const { resolveProductionBom } = require('../services/bomService');
const { checkRole } = require('../middlewares/authMiddleware');
const { getPickingType, getInternalLocation, getMoveField } = require('../helpers/stockHelpers');
const { validatePickingInternal } = require('./orders');

router.get('/odoo/production-log', checkRole(['san_xuat']), (req, res) => {
  res.json(loadProductionLog());
});

router.get('/odoo/production-bom/:productId', checkRole(['san_xuat']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const productId = Number(req.params.productId);
    if (!productId) {
      return res.status(400).json({ success: false, error: 'Missing product id' });
    }

    const prods = await odooCall(config, 'product.template', 'search_read', [], {
      domain: [['id', '=', productId]],
      fields: ['id', 'name', 'default_code', 'product_variant_id'],
      limit: 1
    }, cookie);
    if (!prods.length) {
      return res.status(404).json({ success: false, error: `Product template ID ${productId} not found` });
    }

    const product = prods[0];
    const variantId = Array.isArray(product.product_variant_id) ? product.product_variant_id[0] : product.product_variant_id;
    const bom = await resolveProductionBom(config, cookie, product, variantId);

    res.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        code: product.default_code || ''
      },
      source: bom.source,
      lines: bom.lines
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/odoo/production', checkRole(['san_xuat']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const body = req.body;
    
    const productId = Number(body.product_id);
    const yieldQty = Number(body.yield_qty);
    if (!productId || !yieldQty || yieldQty <= 0) {
      return res.status(400).json({ success: false, error: 'Missing or invalid product_id/yield_qty' });
    }
    
    const pType = await getPickingType(config, cookie, 'internal');
    const moveField = await getMoveField(config, cookie);
    
    const prods = await odooCall(config, 'product.template', 'search_read', [], {
      domain: [['id', '=', productId]],
      fields: ['id', 'name', 'default_code', 'product_variant_id', 'type', 'uom_id'],
      limit: 1
    }, cookie);
    if (!prods.length) throw new Error(`Product template ID ${productId} not found`);
    const product = prods[0];
    const variantId = Array.isArray(product.product_variant_id) ? product.product_variant_id[0] : product.product_variant_id;
    if (!variantId) throw new Error(`Product variant not found for template ID ${productId}`);

    const bom = await resolveProductionBom(config, cookie, product, variantId);
    const bomLines = bom && Array.isArray(bom.lines) ? bom.lines : [];
    
    const actualBomLines = body.actual_bom_lines || [];

    // Construct unified list of materials to deduct
    let materialsToDeduct = [];
    if (actualBomLines.length > 0) {
      for (const line of actualBomLines) {
        const rawProductId = Number(line.product_id);
        const rawDeductQty = Number(line.qty || 0);
        if (!rawProductId || rawDeductQty <= 0) continue;

        // Try to find matching info from Odoo BOM to preserve metadata
        const matchingBomLine = bomLines.find(bl => bl.productId === rawProductId);

        materialsToDeduct.push({
          productId: rawProductId,
          variantId: rawProductId,
          name: matchingBomLine?.name || null,
          code: matchingBomLine?.code || null,
          qtyPerUnit: matchingBomLine?.qtyPerUnit || 0,
          deductQty: rawDeductQty
        });
      }
    } else if (bomLines.length > 0) {
      for (const line of bomLines) {
        const rawDeductQty = yieldQty * line.qtyPerUnit;
        materialsToDeduct.push({
          productId: line.productId,
          variantId: line.variantId,
          name: line.name,
          code: line.code,
          qtyPerUnit: line.qtyPerUnit,
          deductQty: rawDeductQty
        });
      }
    }

    // Process all deductions (Read original quants first at source location)
    let deductedDetails = [];
    const consumeMoveLines = [];

    for (const mat of materialsToDeduct) {
      let rawName = mat.name;
      let rawCode = mat.code;

      if (!rawName) {
        try {
          const rawProds = await odooCall(config, 'product.product', 'read', [[mat.productId], ['name', 'default_code']], {}, cookie);
          if (rawProds && rawProds.length) {
            rawName = rawProds[0].name || '';
            rawCode = rawProds[0].default_code || '';
          }
        } catch (e) {
          console.warn('Failed to read manual raw product details:', e.message);
        }
      }

      const rawQuants = await odooCall(config, 'stock.quant', 'search_read', [], {
        domain: [['product_id', '=', mat.variantId], ['location_id', '=', pType.default_location_src_id[0]]],
        fields: ['id', 'quantity'],
        limit: 1
      }, cookie);

      const previousQty = rawQuants.length ? Number(rawQuants[0].quantity || 0) : 0;
      const newRawQty = Math.max(0, previousQty - mat.deductQty);

      deductedDetails.push({
        product_id: mat.productId,
        variant_id: mat.variantId,
        name: rawName || `Product #${mat.productId}`,
        code: rawCode || '',
        qty_per_unit: mat.qtyPerUnit,
        deducted: mat.deductQty,
        previous: previousQty,
        remaining: newRawQty,
        shortage: Math.max(0, mat.deductQty - previousQty)
      });

      const rawProductRead = await odooCall(config, 'product.product', 'read', [[mat.variantId], ['uom_id']], {}, cookie);
      const uomId = rawProductRead && rawProductRead.length && rawProductRead[0].uom_id ? rawProductRead[0].uom_id[0] : 1;

      consumeMoveLines.push([0, 0, {
        product_id: mat.variantId,
        product_uom_qty: mat.deductQty,
        uom_id: uomId,
        location_id: pType.default_location_src_id[0],
        location_dest_id: pType.default_location_dest_id[0],
        description_picking: 'Tiêu hao nguyên vật liệu cho sản xuất'
      }]);
    }

    let consumePickingId = null;
    let producePickingId = null;
    let warningMessage = '';

    // Step 1: Create TIÊU HAO NVL picking
    if (consumeMoveLines.length > 0) {
      try {
        const consumePickingData = {
          picking_type_id: pType.id,
          location_id: pType.default_location_src_id[0],
          location_dest_id: pType.default_location_dest_id[0],
          origin: `PROD/${Date.now()}/consume`,
          [moveField]: consumeMoveLines
        };
        consumePickingId = await odooCall(config, 'stock.picking', 'create', [consumePickingData], {}, cookie);
        
        // Step 2: Validate consume picking
        try {
          await validatePickingInternal(config, consumePickingId, cookie);
        } catch (valErr) {
          console.warn('Failed to validate consume picking:', valErr.message);
          warningMessage += `Lỗi duyệt phiếu tiêu hao NVL: ${valErr.message}. `;
        }
      } catch (createErr) {
        console.warn('Failed to create consume picking:', createErr.message);
        warningMessage += `Lỗi tạo phiếu tiêu hao NVL: ${createErr.message}. `;
      }
    }

    // Step 3: Create NHẬP THÀNH PHẨM picking
    try {
      const produceMoveLines = [[0, 0, {
        product_id: variantId,
        product_uom_qty: yieldQty,
        uom_id: product.uom_id ? product.uom_id[0] : 1,
        location_id: pType.default_location_dest_id[0],
        location_dest_id: pType.default_location_src_id[0],
        description_picking: 'Sản xuất thành phẩm'
      }]];

      const producePickingData = {
        picking_type_id: pType.id,
        location_id: pType.default_location_dest_id[0],
        location_dest_id: pType.default_location_src_id[0],
        origin: `PROD/${Date.now()}/produce`,
        [moveField]: produceMoveLines
      };
      producePickingId = await odooCall(config, 'stock.picking', 'create', [producePickingData], {}, cookie);

      // Step 4: Validate produce picking
      try {
        await validatePickingInternal(config, producePickingId, cookie);
      } catch (valErr) {
        console.warn('Failed to validate produce picking:', valErr.message);
        warningMessage += `Lỗi duyệt phiếu nhập thành phẩm: ${valErr.message}. `;
      }
    } catch (createErr) {
      console.warn('Failed to create produce picking:', createErr.message);
      warningMessage += `Lỗi tạo phiếu nhập thành phẩm: ${createErr.message}. `;
    }

    // Step 5: Read stock.quant mới để trả updatedQty về UI (chỉ ĐỌC, không ghi)
    const newQuants = await odooCall(config, 'stock.quant', 'search_read', [], {
      domain: [['product_id', '=', variantId], ['location_id', '=', pType.default_location_src_id[0]]],
      fields: ['id', 'quantity'],
      limit: 1
    }, cookie);
    const updatedQty = newQuants.length ? Number(newQuants[0].quantity || 0) : 0;
    
    const productionEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      product_id: productId,
      variant_id: variantId,
      productName: product.name,
      productCode: product.default_code || '',
      qty: yieldQty,
      updatedQty,
      bomSource: bom.source,
      deducted: deductedDetails,
      status: 'completed',
      shift_code: body.shift_code || '',
      production_date: body.production_date || '',
      shift: body.shift || '',
      consumePickingId,
      producePickingId
    };
    const productionLog = loadProductionLog();
    productionLog.unshift(productionEntry);
    saveProductionLog(productionLog);

    res.json({
      success: true,
      productName: product.name,
      updatedQty,
      bomSource: bom.source,
      deducted: deductedDetails,
      productionLog: productionEntry,
      warning: warningMessage || undefined
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/odoo/production-batch', checkRole(['san_xuat']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const body = req.body;

    const entries = body.entries || [];
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ success: false, error: 'No production entries provided' });
    }

    // Validate first
    for (const entry of entries) {
      if (!entry.product_id || !entry.yield_qty || Number(entry.yield_qty) <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid product_id or yield_qty' });
      }
    }

    const pType = await getPickingType(config, cookie, 'internal');
    const moveField = await getMoveField(config, cookie);

    const processedEntries = [];
    let warningMessage = '';

    for (const entry of entries) {
      const productId = Number(entry.product_id);
      const yieldQty = Number(entry.yield_qty);

      const prods = await odooCall(config, 'product.template', 'search_read', [], {
        domain: [['id', '=', productId]],
        fields: ['id', 'name', 'default_code', 'product_variant_id', 'type', 'uom_id'],
        limit: 1
      }, cookie);
      if (!prods.length) throw new Error(`Product template ID ${productId} not found`);
      const product = prods[0];
      const variantId = Array.isArray(product.product_variant_id) ? product.product_variant_id[0] : product.product_variant_id;
      if (!variantId) throw new Error(`Product variant not found for template ID ${productId}`);

      const bom = await resolveProductionBom(config, cookie, product, variantId);
      const bomLines = bom && Array.isArray(bom.lines) ? bom.lines : [];
      const actualBomLines = entry.actual_bom_lines || [];

      // Construct unified list of materials to deduct
      let materialsToDeduct = [];
      if (actualBomLines.length > 0) {
        for (const line of actualBomLines) {
          const rawProductId = Number(line.product_id);
          const rawDeductQty = Number(line.qty || 0);
          if (!rawProductId || rawDeductQty <= 0) continue;

          const matchingBomLine = bomLines.find(bl => bl.productId === rawProductId);
          materialsToDeduct.push({
            productId: rawProductId,
            variantId: rawProductId,
            name: matchingBomLine?.name || null,
            code: matchingBomLine?.code || null,
            qtyPerUnit: matchingBomLine?.qtyPerUnit || 0,
            deductQty: rawDeductQty
          });
        }
      } else if (bomLines.length > 0) {
        for (const line of bomLines) {
          const rawDeductQty = yieldQty * line.qtyPerUnit;
          materialsToDeduct.push({
            productId: line.productId,
            variantId: line.variantId,
            name: line.name,
            code: line.code,
            qtyPerUnit: line.qtyPerUnit,
            deductQty: rawDeductQty
          });
        }
      }

      // Process all deductions
      let deductedDetails = [];
      const consumeMoveLines = [];

      for (const mat of materialsToDeduct) {
        let rawName = mat.name;
        let rawCode = mat.code;

        if (!rawName) {
          try {
            const rawProds = await odooCall(config, 'product.product', 'read', [[mat.productId], ['name', 'default_code']], {}, cookie);
            if (rawProds && rawProds.length) {
              rawName = rawProds[0].name || '';
              rawCode = rawProds[0].default_code || '';
            }
          } catch (e) {
            console.warn('Failed to read manual raw product details:', e.message);
          }
        }

        const rawQuants = await odooCall(config, 'stock.quant', 'search_read', [], {
          domain: [['product_id', '=', mat.variantId], ['location_id', '=', pType.default_location_src_id[0]]],
          fields: ['id', 'quantity'],
          limit: 1
        }, cookie);

        const previousQty = rawQuants.length ? Number(rawQuants[0].quantity || 0) : 0;
        const newRawQty = Math.max(0, previousQty - mat.deductQty);

        deductedDetails.push({
          product_id: mat.productId,
          variant_id: mat.variantId,
          name: rawName || `Product #${mat.productId}`,
          code: rawCode || '',
          qty_per_unit: mat.qtyPerUnit,
          deducted: mat.deductQty,
          previous: previousQty,
          remaining: newRawQty,
          shortage: Math.max(0, mat.deductQty - previousQty)
        });

        const rawProductRead = await odooCall(config, 'product.product', 'read', [[mat.variantId], ['uom_id']], {}, cookie);
        const uomId = rawProductRead && rawProductRead.length && rawProductRead[0].uom_id ? rawProductRead[0].uom_id[0] : 1;

        consumeMoveLines.push([0, 0, {
          product_id: mat.variantId,
          product_uom_qty: mat.deductQty,
          uom_id: uomId,
          location_id: pType.default_location_src_id[0],
          location_dest_id: pType.default_location_dest_id[0],
          description_picking: 'Tiêu hao nguyên vật liệu cho sản xuất (Batch)'
        }]);
      }

      let consumePickingId = null;
      let producePickingId = null;

      // Step 1: Create TIÊU HAO NVL picking
      if (consumeMoveLines.length > 0) {
        try {
          const consumePickingData = {
            picking_type_id: pType.id,
            location_id: pType.default_location_src_id[0],
            location_dest_id: pType.default_location_dest_id[0],
            origin: `PROD-BATCH/${Date.now()}/consume`,
            [moveField]: consumeMoveLines
          };
          consumePickingId = await odooCall(config, 'stock.picking', 'create', [consumePickingData], {}, cookie);
          try {
            await validatePickingInternal(config, consumePickingId, cookie);
          } catch (valErr) {
            console.warn('Failed to validate consume picking:', valErr.message);
            warningMessage += `Lỗi duyệt phiếu tiêu hao NVL (${product.name}): ${valErr.message}. `;
          }
        } catch (createErr) {
          console.warn('Failed to create consume picking:', createErr.message);
          warningMessage += `Lỗi tạo phiếu tiêu hao NVL (${product.name}): ${createErr.message}. `;
        }
      }

      // Step 2: Create NHẬP THÀNH PHẨM picking
      try {
        const produceMoveLines = [[0, 0, {
          product_id: variantId,
          product_uom_qty: yieldQty,
          uom_id: product.uom_id ? product.uom_id[0] : 1,
          location_id: pType.default_location_dest_id[0],
          location_dest_id: pType.default_location_src_id[0],
          description_picking: 'Sản xuất thành phẩm (Batch)'
        }]];

        const producePickingData = {
          picking_type_id: pType.id,
          location_id: pType.default_location_dest_id[0],
          location_dest_id: pType.default_location_src_id[0],
          origin: `PROD-BATCH/${Date.now()}/produce`,
          [moveField]: produceMoveLines
        };
        producePickingId = await odooCall(config, 'stock.picking', 'create', [producePickingData], {}, cookie);
        try {
          await validatePickingInternal(config, producePickingId, cookie);
        } catch (valErr) {
          console.warn('Failed to validate produce picking:', valErr.message);
          warningMessage += `Lỗi duyệt phiếu nhập thành phẩm (${product.name}): ${valErr.message}. `;
        }
      } catch (createErr) {
        console.warn('Failed to create produce picking:', createErr.message);
        warningMessage += `Lỗi tạo phiếu nhập thành phẩm (${product.name}): ${createErr.message}. `;
      }

      const newQuants = await odooCall(config, 'stock.quant', 'search_read', [], {
        domain: [['product_id', '=', variantId], ['location_id', '=', pType.default_location_src_id[0]]],
        fields: ['id', 'quantity'],
        limit: 1
      }, cookie);
      const updatedQty = newQuants.length ? Number(newQuants[0].quantity || 0) : 0;

      processedEntries.push({
        product_id: productId,
        variant_id: variantId,
        productName: product.name,
        productCode: product.default_code || '',
        qty: yieldQty,
        updatedQty,
        bomSource: bom.source,
        deducted: deductedDetails,
        consumePickingId,
        producePickingId
      });
    }

    const productionEntry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      status: 'completed',
      shift_code: body.shift_code || '',
      production_date: body.production_date || '',
      shift: body.shift || '',
      entries: processedEntries
    };

    const productionLog = loadProductionLog();
    productionLog.unshift(productionEntry);
    saveProductionLog(productionLog);

    res.json({
      success: true,
      productionLog: productionEntry,
      warning: warningMessage || undefined
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/odoo/production/:index', checkRole(['san_xuat']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const index = Number(req.params.index);
    
    const productionLog = loadProductionLog();
    if (index < 0 || index >= productionLog.length) {
      return res.status(404).json({ success: false, error: 'Production log not found' });
    }
    
    const logItem = productionLog[index];
    if (logItem.status === 'canceled') {
      return res.status(400).json({ success: false, error: 'Already canceled' });
    }
    
    const pickingsToCancel = [];
    if (logItem.entries && Array.isArray(logItem.entries)) {
      for (const ent of logItem.entries) {
        if (ent.consumePickingId) pickingsToCancel.push(ent.consumePickingId);
        if (ent.producePickingId) pickingsToCancel.push(ent.producePickingId);
      }
    } else {
      if (logItem.consumePickingId) pickingsToCancel.push(logItem.consumePickingId);
      if (logItem.producePickingId) pickingsToCancel.push(logItem.producePickingId);
    }

    if (pickingsToCancel.length > 0) {
      await odooCall(config, 'stock.picking', 'write', [pickingsToCancel, { state: 'cancel' }], {}, cookie);
    }
    
    logItem.status = 'canceled';
    saveProductionLog(productionLog);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
