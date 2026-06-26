const express = require('express');
const router = express.Router();

const { loadConfig } = require('../config/config');
const { odooCall, odooAuth } = require('../services/odooService');
const { checkRole } = require('../middlewares/authMiddleware');

function buildProductPayload(vals) {
  const typeVal = vals.type || 'trading';
  let purchase_ok = true;
  let sale_ok = true;

  if (typeVal === 'raw_material') {
    purchase_ok = true;
    sale_ok = false;
  } else if (typeVal === 'manufactured') {
    purchase_ok = false;
    sale_ok = true;
  } else {
    // Default to 'trading' (Hàng hóa thương mại)
    purchase_ok = true;
    sale_ok = true;
  }

  return {
    name: vals.name,
    default_code: vals.default_code || '',
    list_price: Number(vals.list_price || 0),
    standard_price: Number(vals.standard_price || 0),
    type: 'consu',
    is_storable: true,
    purchase_ok: purchase_ok,
    sale_ok: sale_ok,
    description: vals.description || ''
  };
}

router.get('/odoo/products', checkRole(['ke_toan_kho', 'san_xuat', 'kinh_doanh']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const products = await odooCall(config, 'product.template', 'search_read', [], {
      domain: [],
      limit: 1000,
      order: 'id desc',
      fields: ['id', 'name', 'default_code', 'list_price', 'standard_price', 'type', 'qty_available', 'write_date', 'sale_ok', 'purchase_ok']
    }, cookie);

    const filteredProducts = products.filter(p => {
      const name = (p.name || '').trim().toUpperCase();
      const code = (p.default_code || '').trim().toUpperCase();
      const isValid = name && name !== 'N/A' && code !== 'N/A' && p.write_date;
      if (!isValid) return false;

      // Exclude services and combos
      if (p.type === 'service' || p.type === 'combo') return false;

      // Must be raw_material (purchase_ok && !sale_ok), manufactured (!purchase_ok && sale_ok), or trading (purchase_ok && sale_ok)
      return p.purchase_ok || p.sale_ok;
    });

    filteredProducts.sort((a, b) => {
      const nameA = a.name || '';
      const nameB = b.name || '';
      return nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
    });

    res.json(filteredProducts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/odoo/products', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const vals = req.body;
    
    const payload = buildProductPayload(vals);
    
    const result = await odooCall(config, 'product.template', 'create', [payload], {}, cookie);
    res.json({ success: true, id: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/odoo/products/:id', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const id = Number(req.params.id);
    const vals = req.body;
    
    const payload = buildProductPayload(vals);
    
    await odooCall(config, 'product.template', 'write', [[id], payload], {}, cookie);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/odoo/products/:id', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const id = Number(req.params.id);
    
    await odooCall(config, 'product.template', 'write', [[id], { active: false }], {}, cookie);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
