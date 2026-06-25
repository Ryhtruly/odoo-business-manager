const express = require('express');
const router = express.Router();

const { loadConfig } = require('../config/config');
const { odooCall, odooAuth, resolveProductVariant } = require('../services/odooService');
const { checkRole } = require('../middlewares/authMiddleware');

router.post('/odoo/products/:id/adjust-stock', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const id = Number(req.params.id);
    const { newQty } = req.body;
    
    if (newQty === undefined || isNaN(Number(newQty))) {
      return res.status(400).json({ success: false, error: 'Số lượng điều chỉnh không hợp lệ' });
    }

    const variantId = await resolveProductVariant(config, id, cookie);
    const locs = await odooCall(config, 'stock.location', 'search_read', [], {
      domain: [['usage', '=', 'internal']],
      fields: ['id', 'name'],
      limit: 1
    }, cookie);
    const locationId = locs[0]?.id;
    if (!locationId) throw new Error('Không tìm thấy địa điểm kho Odoo');

    const quants = await odooCall(config, 'stock.quant', 'search_read', [], {
      domain: [['product_id', '=', variantId], ['location_id', '=', locationId]],
      fields: ['id', 'quantity'],
      limit: 1
    }, cookie);

    if (quants.length) {
      await odooCall(config, 'stock.quant', 'write', [[quants[0].id], { quantity: Number(newQty) }], {}, cookie);
    } else {
      await odooCall(config, 'stock.quant', 'create', [{
        product_id: variantId,
        location_id: locationId,
        quantity: Number(newQty)
      }], {}, cookie);
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/odoo/stock', checkRole(['ke_toan_kho', 'san_xuat', 'kinh_doanh']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    
    const quants = await odooCall(config, 'stock.quant', 'search_read', [], {
      domain: [],
      limit: 100,
      fields: ['id', 'product_id', 'location_id', 'quantity', 'write_date']
    }, cookie);
    
    const products = await odooCall(config, 'product.product', 'search_read', [], {
      fields: ['id', 'default_code', 'name'],
      limit: 500
    }, cookie);
    
    const locations = await odooCall(config, 'stock.location', 'search_read', [], {
      fields: ['id', 'name', 'usage'],
      limit: 100
    }, cookie);
    
    const pMap = new Map(products.map(p => [p.id, p]));
    const lMap = new Map(locations.map(l => [l.id, l]));
    
    const data = quants.map(q => {
      const p = pMap.get(q.product_id[0]);
      const l = lMap.get(q.location_id[0]);
      return {
        id: q.id,
        product_code: p?.default_code || '',
        product_name: p?.name || '',
        location: l?.name || '',
        usage: l?.usage || '',
        quantity: q.quantity ?? 0,
        write_date: q.write_date || ''
      };
    }).filter(item => {
      const name = (item.product_name || '').trim().toUpperCase();
      const code = (item.product_code || '').trim().toUpperCase();
      return name && name !== 'N/A' && code !== 'N/A';
    });
    
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/odoo/stock/check', checkRole(['kinh_doanh', 'ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const { lines } = req.body;
    if (!lines || !Array.isArray(lines)) {
      return res.status(400).json({ success: false, error: 'Invalid lines parameter' });
    }

    const details = [];
    let sufficient = true;

    for (const line of lines) {
      const variantId = await resolveProductVariant(config, line.product_id, cookie);
      const quants = await odooCall(config, 'stock.quant', 'search_read', [], {
        domain: [['product_id', '=', variantId], ['location_id.usage', '=', 'internal']],
        fields: ['quantity']
      }, cookie);
      const stockQty = quants.reduce((sum, q) => sum + (q.quantity || 0), 0);
      const needed = Number(line.qty || line.product_qty || 0);
      const shortage = Math.max(0, needed - stockQty);

      const prods = await odooCall(config, 'product.product', 'read', [[variantId], ['name']], {}, cookie);
      const name = prods && prods.length ? prods[0].name : `Product #${variantId}`;

      details.push({
        product_id: variantId,
        product_name: name,
        needed,
        available: stockQty,
        shortage
      });

      if (shortage > 0) {
        sufficient = false;
      }
    }

    res.json({ success: true, sufficient, details });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/odoo/stock/refresh', checkRole(['ke_toan_kho', 'san_xuat', 'kinh_doanh']), async (req, res) => {
  try {
    const config = loadConfig();
    await odooAuth(config);
    res.json({ success: true, message: 'Stock data refreshed successfully' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
