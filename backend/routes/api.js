const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { loadConfig, saveConfig } = require('../config/config');
const { loadUsers, saveUsers, loadProductionLog, saveProductionLog } = require('../services/fileService');
const { odooCall, odooAuth, resolveProductVariant } = require('../services/odooService');
const { resolveProductionBom } = require('../services/bomService');
const { checkRole } = require('../middlewares/authMiddleware');
const { hashPassword, isPasswordHash, safeUser, signToken, verifyPassword } = require('../services/authService');
const { getGoogleAccessToken } = require('../services/googleSheetsService');

function buildProductPayload(vals) {
  let typeVal = vals.type || 'consu';
  let isStorable = vals.is_storable === true;
  let purchase_ok = true;
  let sale_ok = true;

  if (typeVal === 'raw_material') {
    typeVal = 'consu';
    isStorable = true;
    purchase_ok = true;
    sale_ok = false;
  } else if (typeVal === 'manufactured') {
    typeVal = 'consu';
    isStorable = true;
    purchase_ok = false;
    sale_ok = true;
  } else if (typeVal === 'trading') {
    typeVal = 'consu';
    isStorable = true;
    purchase_ok = true;
    sale_ok = true;
  } else if (typeVal === 'product') {
    typeVal = 'consu';
    isStorable = true;
  } else if (typeVal === 'consu') {
    isStorable = vals.is_storable === true;
  } else if (!['service', 'combo'].includes(typeVal)) {
    typeVal = 'consu';
  }

  return {
    name: vals.name,
    default_code: vals.default_code || '',
    list_price: Number(vals.list_price || 0),
    standard_price: Number(vals.standard_price || 0),
    type: typeVal,
    is_storable: isStorable,
    purchase_ok: purchase_ok,
    sale_ok: sale_ok,
    description: vals.description || ''
  };
}

async function updateProductCostsFromReceipt(config, pickingId, cookie) {
  try {
    const pickings = await odooCall(config, 'stock.picking', 'read', [[pickingId], ['origin', 'purchase_id']], {}, cookie);
    if (!pickings || !pickings.length) return;
    const origin = pickings[0].origin;
    const purchaseId = pickings[0].purchase_id ? pickings[0].purchase_id[0] : null;

    const moves = await odooCall(config, 'stock.move', 'search_read', [], {
      domain: [['picking_id', '=', pickingId]],
      fields: ['id', 'product_id', 'purchase_line_id']
    }, cookie);

    for (const move of moves) {
      if (!move.product_id) continue;
      const variantId = move.product_id[0];
      let priceUnit = 0;

      if (move.purchase_line_id) {
        const poLines = await odooCall(config, 'purchase.order.line', 'read', [[move.purchase_line_id[0]], ['price_unit']], {}, cookie);
        if (poLines && poLines.length) {
          priceUnit = Number(poLines[0].price_unit || 0);
        }
      }

      if (priceUnit <= 0) {
        let poDomain = [];
        if (purchaseId) {
          poDomain = [['id', '=', purchaseId]];
        } else if (origin) {
          poDomain = [['name', '=', origin]];
        }
        if (poDomain.length) {
          const pos = await odooCall(config, 'purchase.order', 'search_read', [], {
            domain: poDomain,
            fields: ['id'],
            limit: 1
          }, cookie);
          if (pos && pos.length) {
            const lines = await odooCall(config, 'purchase.order.line', 'search_read', [], {
              domain: [['order_id', '=', pos[0].id], ['product_id', '=', variantId]],
              fields: ['price_unit'],
              limit: 1
            }, cookie);
            if (lines && lines.length) {
              priceUnit = Number(lines[0].price_unit || 0);
            }
          }
        }
      }

      if (priceUnit > 0) {
        const variants = await odooCall(config, 'product.product', 'read', [[variantId], ['product_tmpl_id']], {}, cookie);
        if (variants && variants.length && variants[0].product_tmpl_id) {
          const templateId = variants[0].product_tmpl_id[0];
          await odooCall(config, 'product.template', 'write', [[templateId], { standard_price: priceUnit }], {}, cookie);
          console.log(`Updated standard_price of template ${templateId} to ${priceUnit}`);
        }
      }
    }
  } catch (err) {
    console.error('Error updating product costs from receipt:', err.message);
  }
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

  await updateProductCostsFromReceipt(config, pickingId, cookie);
}

async function createVendorBillForPO(config, poId, cookie) {
  try {
    try {
      await odooCall(config, 'purchase.order', 'action_create_bill', [[poId]], {}, cookie);
    } catch (billErr) {
      console.warn('Odoo action_create_bill method call failed:', billErr.message);
    }
    
    const poData = await odooCall(config, 'purchase.order', 'read', [[poId], ['invoice_ids', 'partner_id', 'order_line', 'name']], {}, cookie);
    if (poData && poData.length && poData[0].invoice_ids && poData[0].invoice_ids.length) {
      console.log('Vendor bill created successfully via action_create_bill:', poData[0].invoice_ids);
      return poData[0].invoice_ids[0];
    }

    console.log('Falling back to manual vendor bill creation for PO', poId);
    const partnerId = poData[0].partner_id[0];
    const lineIds = poData[0].order_line;
    const lines = await odooCall(config, 'purchase.order.line', 'read', [lineIds, ['product_id', 'product_qty', 'price_unit', 'name']], {}, cookie);

    const invoiceLineIds = lines.map(l => [0, 0, {
      product_id: l.product_id[0],
      quantity: Number(l.product_qty),
      price_unit: Number(l.price_unit),
      name: l.name || 'Nhập hàng từ PO'
    }]);

    if (invoiceLineIds.length) {
      const invoiceId = await odooCall(config, 'account.move', 'create', [{
        move_type: 'in_invoice',
        partner_id: partnerId,
        invoice_origin: poData[0].name || `PO${poId}`,
        invoice_line_ids: invoiceLineIds
      }], {}, cookie);
      
      try {
        await odooCall(config, 'account.move', 'write', [[invoiceId], { purchase_id: poId }], {}, cookie);
      } catch (e) {
      }
      return invoiceId;
    }
  } catch (err) {
    console.error('Error creating vendor bill for PO:', err.message);
  }
  return null;
}


router.post('/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Vui lòng điền đầy đủ tên đăng nhập và mật khẩu.' });
    }
    const users = loadUsers();
    const user = users.find(u => u.username && u.username.trim() === username.trim());
    if (user) {
      if (!verifyPassword(password, user.password)) {
        return res.status(401).json({ success: false, error: 'Ten dang nhap hoac mat khau khong dung.' });
      }
      if (user.approved === false) {
        return res.status(403).json({ success: false, error: 'Tài khoản của bạn đang chờ Admin phê duyệt.' });
      }
      if (!isPasswordHash(user.password)) {
        user.password = hashPassword(password);
        saveUsers(users);
      }
      res.json({
        success: true,
        user: safeUser(user),
        token: signToken(safeUser(user))
      });
    } else {
      res.status(401).json({ success: false, error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ: ' + err.message });
  }
});

router.post('/auth/register', (req, res) => {
  try {
    const { username, password, name, role } = req.body;
    if (!username || !password || !name || !role) {
      return res.status(400).json({ success: false, error: 'Vui lòng điền đầy đủ thông tin.' });
    }
    if (role === 'admin') {
      return res.status(403).json({ success: false, error: 'Không thể đăng ký tài khoản Quản trị viên.' });
    }
    const users = loadUsers();
    if (!Array.isArray(users)) {
      return res.status(500).json({ success: false, error: 'Lỗi dữ liệu người dùng không hợp lệ.' });
    }
    if (users.find(u => u.username && u.username.toLowerCase() === username.trim().toLowerCase())) {
      return res.status(400).json({ success: false, error: 'Tên đăng nhập đã tồn tại.' });
    }
    users.push({
      username: username.trim(),
      password: hashPassword(password),
      name: name.trim(),
      role: role,
      approved: false
    });
    saveUsers(users);
    res.json({ success: true, message: 'Đăng ký thành công. Vui lòng chờ Admin phê duyệt.' });
  } catch (err) {
    console.error('Register Error:', err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ: ' + err.message });
  }
});

router.post('/auth/change-password', checkRole(['ke_toan_kho', 'san_xuat', 'kinh_doanh', 'ke_toan_ban_hang']), (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const username = req.user?.username || req.body.username;
    if (!username || !oldPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Vui lòng điền đầy đủ thông tin.' });
    }
    const users = loadUsers();
    const userIndex = users.findIndex(u => u.username && u.username.trim() === username.trim());
    if (userIndex !== -1) {
      if (!verifyPassword(oldPassword, users[userIndex].password)) {
        return res.status(401).json({ success: false, error: 'Mat khau cu khong chinh xac.' });
      }
      users[userIndex].password = hashPassword(newPassword);
      saveUsers(users);
      res.json({ success: true, message: 'Đổi mật khẩu thành công.' });
    } else {
      res.status(401).json({ success: false, error: 'Mật khẩu cũ không chính xác.' });
    }
  } catch (err) {
    console.error('Change Password Error:', err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ: ' + err.message });
  }
});

router.get('/users', checkRole(['admin']), (req, res) => {
  try {
    const users = loadUsers();
    if (!Array.isArray(users)) {
      return res.status(500).json({ success: false, error: 'Dữ liệu không hợp lệ.' });
    }
    const safeUsers = users.map(u => ({ username: u.username, name: u.name, role: u.role, approved: u.approved }));
    res.json(safeUsers);
  } catch (err) {
    console.error('Fetch Users Error:', err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ: ' + err.message });
  }
});

router.put('/users/:username/approve', checkRole(['admin']), (req, res) => {
  try {
    const username = req.params.username;
    const users = loadUsers();
    const user = users.find(u => u.username && u.username === username);
    if (user) {
      user.approved = true;
      saveUsers(users);
      res.json({ success: true, message: 'Đã duyệt tài khoản.' });
    } else {
      res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản.' });
    }
  } catch (err) {
    console.error('Approve User Error:', err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ: ' + err.message });
  }
});

router.delete('/users/:username', checkRole(['admin']), (req, res) => {
  try {
    const username = req.params.username;
    let users = loadUsers();
    const user = users.find(u => u.username && u.username === username);
    if (user) {
      if (user.role === 'admin') {
         const adminCount = users.filter(u => u.role === 'admin').length;
         if (adminCount <= 1) {
           return res.status(403).json({ success: false, error: 'Không thể xóa tài khoản Quản trị viên duy nhất.' });
         }
      }
      users = users.filter(u => u.username !== username);
      saveUsers(users);
      res.json({ success: true, message: 'Đã xóa tài khoản.' });
    } else {
      res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản.' });
    }
  } catch (err) {
    console.error('Delete User Error:', err);
    res.status(500).json({ success: false, error: 'Lỗi máy chủ: ' + err.message });
  }
});


router.get('/config', checkRole([]), (req, res) => {
  const config = loadConfig();
  // Mask password for safety
  const safeConfig = { ...config, password: config.password ? '********' : '' };
  res.json(safeConfig);
});

router.post('/config', checkRole([]), (req, res) => {
  try {
    const newConfig = req.body;
    console.log('Received config save request:', { ...newConfig, password: newConfig.password ? '***' : '' });
    const currentConfig = loadConfig();
    
    // If password is masked, keep original password
    if (newConfig.password === '********') {
      newConfig.password = currentConfig.password;
    }
    
    if (saveConfig(newConfig)) {
      console.log('Configuration saved successfully to sync_config.json');
      res.json({ success: true, message: 'Configuration saved successfully' });
    } else {
      console.error('Failed to save configuration via saveConfig');
      res.status(500).json({ success: false, message: 'Failed to save configuration' });
    }
  } catch (err) {
    console.error('Error in POST /config handler:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Endpoint to check status of Odoo and Google Sheets
router.get('/odoo/status', checkRole(['ke_toan_kho', 'san_xuat', 'kinh_doanh', 'ke_toan_ban_hang']), async (req, res) => {
  const config = loadConfig();
  let odooConnected = false;
  let odooError = null;
  let gsheetConnected = false;
  let gsheetError = null;

  // Test Odoo Connection
  try {
    const cookie = await odooAuth(config);
    if (cookie) odooConnected = true;
  } catch (e) {
    odooError = e.message;
  }

  // Test Google Sheets Connection (only if creds content is provided)
  if (config.credsContent && config.sheetId) {
    try {
      const token = await getGoogleAccessToken(config);
      // Fetch sheet info
      const sheetRes = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}?fields=properties.title`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000
      });
      if (sheetRes.data) {
        gsheetConnected = true;
      }
    } catch (e) {
      gsheetError = e.message;
    }
  } else {
    gsheetError = 'Credentials or Spreadsheet ID not configured';
  }

  res.json({
    odoo: { connected: odooConnected, error: odooError },
    gsheet: { connected: gsheetConnected, error: gsheetError }
  });
});

// Proxy Odoo Data API endpoints
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

    // Filter out products with name 'N/A' or default_code 'N/A' (case-insensitive), empty names, or falsy write_date
    const filteredProducts = products.filter(p => {
      const name = (p.name || '').trim().toUpperCase();
      const code = (p.default_code || '').trim().toUpperCase();
      return name && name !== 'N/A' && code !== 'N/A' && p.write_date;
    });

    // Sort products alphabetically A-Z by name
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
    
    // Always archive instead of hard delete to preserve database integrity
    await odooCall(config, 'product.template', 'write', [[id], { active: false }], {}, cookie);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

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

router.get('/odoo/partners/:id/purchased-products', checkRole(['ke_toan_kho', 'kinh_doanh']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const partnerId = Number(req.params.id);
    
    // Find all purchase order lines for this partner
    const lines = await odooCall(config, 'purchase.order.line', 'search_read', [], {
      domain: [['partner_id', '=', partnerId]],
      fields: ['product_id'],
      limit: 100
    }, cookie);
    
    if (!lines.length) {
      return res.json([]);
    }
    
    const variantIds = [...new Set(lines.map(l => l.product_id?.[0]).filter(Boolean))];
    if (!variantIds.length) {
      return res.json([]);
    }
    
    // Get product templates for these variants
    const variants = await odooCall(config, 'product.product', 'search_read', [], {
      domain: [['id', 'in', variantIds]],
      fields: ['product_tmpl_id'],
      limit: 200
    }, cookie);
    
    const templateIds = [...new Set(variants.map(v => v.product_tmpl_id?.[0]).filter(Boolean))];
    res.json(templateIds);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/odoo/partners', checkRole(['ke_toan_kho', 'kinh_doanh', 'ke_toan_ban_hang']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const type = req.query.type;
    let domain = [['active', 'in', [true, false]]]; // Show active and archived to see Ngừng hợp tác
    if (type === 'customer') {
      domain.push(['customer_rank', '>', 0]);
    } else if (type === 'vendor') {
      domain.push(['supplier_rank', '>', 0]);
    }
    
    let fields = ['id', 'name', 'street', 'phone', 'active', 'debit', 'credit', 'purchase_order_count', 'sale_order_count'];
    let partners;
    try {
      partners = await odooCall(config, 'res.partner', 'search_read', [], {
        domain,
        limit: 100,
        order: 'name asc',
        fields
      }, cookie);
    } catch (fieldsErr) {
      console.warn('Odoo does not support all partner details fields, falling back to standard fields:', fieldsErr.message);
      fields = ['id', 'name', 'street', 'phone', 'active'];
      partners = await odooCall(config, 'res.partner', 'search_read', [], {
        domain,
        limit: 100,
        order: 'name asc',
        fields
      }, cookie);
    }

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
    
    if (body.type === 'vendor') {
      payload.supplier_rank = 1;
    } else if (body.type === 'customer') {
      payload.customer_rank = 1;
    }
    
    const partnerId = await odooCall(config, 'res.partner', 'create', [payload], {}, cookie);
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
    
    if (body.type === 'vendor') {
      payload.supplier_rank = 1;
    } else if (body.type === 'customer') {
      payload.customer_rank = 1;
    }
    
    await odooCall(config, 'res.partner', 'write', [[id], payload], {}, cookie);
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

    // Check transaction count first to be safe
    let hasTransactions = false;
    try {
      const p = await odooCall(config, 'res.partner', 'read', [[id], ['purchase_order_count', 'sale_order_count']], {}, cookie);
      if (p && p.length) {
        hasTransactions = (p[0].purchase_order_count > 0 || p[0].sale_order_count > 0);
      }
    } catch (e) {
      // Fallback
    }

    if (hasTransactions) {
      // Archive instead of delete
      await odooCall(config, 'res.partner', 'write', [[id], { active: false }], {}, cookie);
      return res.json({ success: true, action: 'archive', message: 'Đối tác đã có giao dịch. Đã tự động lưu trữ/ngừng hợp tác để bảo toàn dữ liệu.' });
    }

    try {
      // Try unlinking
      await odooCall(config, 'res.partner', 'unlink', [[id]], {}, cookie);
      res.json({ success: true, action: 'delete', message: 'Đã xóa đối tác thành công.' });
    } catch (err) {
      console.warn(`Unlink failed for partner ${id}, archiving instead:`, err.message);
      // Archive on failure due to constraints
      await odooCall(config, 'res.partner', 'write', [[id], { active: false }], {}, cookie);
      res.json({ success: true, action: 'archive', message: 'Đối tác đã phát sinh giao dịch trong Odoo. Đã tự động chuyển trạng thái ngừng hợp tác.' });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/odoo/purchase-orders', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const body = req.body;
    
    // Resolve template IDs to variant IDs
    const resolvedOrderLines = [];
    for (const line of body.order_line) {
      const variantId = await resolveProductVariant(config, line.product_id, cookie);
      resolvedOrderLines.push([0, 0, {
        product_id: variantId,
        product_qty: Number(line.product_qty),
        price_unit: Number(line.price_unit)
      }]);
    }
    
    // Create PO
    const createData = {
      partner_id: Number(body.partner_id),
      order_line: resolvedOrderLines
    };
    if (body.date_order) {
      createData.date_order = body.date_order;
    }
    const poId = await odooCall(config, 'purchase.order', 'create', [createData], {}, cookie);
    
    if (body.draft === true) {
      return res.json({ success: true, id: poId, state: 'draft' });
    }

    // Confirm PO (button_confirm)
    let pickingId = null;
    let billId = null;
    let warning = '';
    try {
      await odooCall(config, 'purchase.order', 'button_confirm', [[poId]], {}, cookie);

      // Read PO to get name
      const poData = await odooCall(config, 'purchase.order', 'read', [[poId], ['name']], {}, cookie);
      const poName = poData[0]?.name;

      // Find picking
      const pickings = await odooCall(config, 'stock.picking', 'search_read', [], {
        domain: [['purchase_id', '=', poId], ['state', '!=', 'done']],
        fields: ['id'],
        limit: 1
      }, cookie);

      if (pickings && pickings.length) {
        pickingId = pickings[0].id;
      } else if (poName) {
        const pickingsByOrigin = await odooCall(config, 'stock.picking', 'search_read', [], {
          domain: [['origin', '=', poName], ['state', '!=', 'done']],
          fields: ['id'],
          limit: 1
        }, cookie);
        if (pickingsByOrigin && pickingsByOrigin.length) {
          pickingId = pickingsByOrigin[0].id;
        }
      }

      // Validate picking and update prices
      if (pickingId) {
        try {
          await validatePickingInternal(config, pickingId, cookie);
        } catch (pickingErr) {
          console.warn('Validate picking failed during PO confirm:', pickingErr.message);
          warning += ` Đơn hàng đã xác nhận nhưng lỗi tự động nhập kho: ${pickingErr.message}.`;
        }
      }

      // Create draft vendor bill
      try {
        billId = await createVendorBillForPO(config, poId, cookie);
      } catch (billErr) {
        console.warn('Create bill failed during PO confirm:', billErr.message);
        warning += ` Đơn hàng đã xác nhận nhưng lỗi tự động tạo hóa đơn nháp: ${billErr.message}.`;
      }

    } catch (confirmErr) {
      console.warn('PO Confirm failed:', confirmErr.message);
      warning = `Tạo đơn nháp thành công, nhưng không thể tự động xác nhận: ${confirmErr.message}`;
    }
    
    res.json({ success: true, id: poId, pickingId, billId, warning: warning || undefined });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/odoo/purchase-orders/:id/confirm', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const poId = Number(req.params.id);

    // 1. Confirm PO
    await odooCall(config, 'purchase.order', 'button_confirm', [[poId]], {}, cookie);

    // 2. Read PO to get name
    const poData = await odooCall(config, 'purchase.order', 'read', [[poId], ['name']], {}, cookie);
    const poName = poData[0]?.name;

    // 3. Find related picking
    let pickingId = null;
    const pickings = await odooCall(config, 'stock.picking', 'search_read', [], {
      domain: [['purchase_id', '=', poId], ['state', '!=', 'done']],
      fields: ['id'],
      limit: 1
    }, cookie);

    if (pickings && pickings.length) {
      pickingId = pickings[0].id;
    } else if (poName) {
      const pickingsByOrigin = await odooCall(config, 'stock.picking', 'search_read', [], {
        domain: [['origin', '=', poName], ['state', '!=', 'done']],
        fields: ['id'],
        limit: 1
      }, cookie);
      if (pickingsByOrigin && pickingsByOrigin.length) {
        pickingId = pickingsByOrigin[0].id;
      }
    }

    let warning = '';
    // 4. Validate the picking and update costs
    if (pickingId) {
      try {
        await validatePickingInternal(config, pickingId, cookie);
      } catch (pickingErr) {
        console.warn('Validate picking failed during PO manual confirm:', pickingErr.message);
        warning += ` Lỗi tự động nhập kho: ${pickingErr.message}.`;
      }
    }

    // 5. Create draft vendor bill
    let billId = null;
    try {
      billId = await createVendorBillForPO(config, poId, cookie);
    } catch (billErr) {
      console.warn('Create bill failed during PO manual confirm:', billErr.message);
      warning += ` Lỗi tự động tạo hóa đơn nháp: ${billErr.message}.`;
    }

    res.json({ success: true, message: 'Đơn mua hàng đã được xác nhận thành công.', pickingId, billId, warning: warning || undefined });
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
    res.json({ success: true });
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

    const pickings = await odooCall(config, 'stock.picking', 'read', [[pickingId], ['id', 'name', 'partner_id', 'location_id', 'location_dest_id', 'picking_type_id', 'move_lines']], {}, cookie);
    if (!pickings || !pickings.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy phiếu nhận kho gốc' });
    }
    const picking = pickings[0];

    let originalMoves = [];
    if (picking.move_lines && picking.move_lines.length) {
      originalMoves = await odooCall(config, 'stock.move', 'read', [picking.move_lines, ['product_id', 'quantity_done', 'state']], {}, cookie);
    }
    
    const doneQtyMap = new Map();
    for (const move of originalMoves) {
      if (move.product_id) {
        const varId = move.product_id[0];
        doneQtyMap.set(varId, (doneQtyMap.get(varId) || 0) + Number(move.quantity_done || 0));
      }
    }

    const returnMoves = [];
    const creditNoteLines = [];

    for (const item of items) {
      const variantId = item.variant_id ? Number(item.variant_id) : await resolveProductVariant(config, Number(item.product_tmpl_id), cookie);
      const originalDone = doneQtyMap.get(variantId) || 0;
      if (Number(item.qty) > originalDone) {
        return res.status(400).json({
          success: false,
          error: `Số lượng trả (${item.qty}) vượt quá số lượng đã nhận thực tế (${originalDone}) của sản phẩm ID ${item.product_tmpl_id || variantId}`
        });
      }

      returnMoves.push([0, 0, {
        name: `Return of ${picking.name}`,
        product_id: variantId,
        product_uom_qty: Number(item.qty),
        product_uom: 1,
        location_id: picking.location_dest_id[0],
        location_dest_id: picking.location_id[0]
      }]);

      creditNoteLines.push([0, 0, {
        product_id: variantId,
        quantity: Number(item.qty),
        price_unit: Number(item.price_unit || 0),
        name: `Trả hàng từ phiếu ${picking.name}`
      }]);
    }

    const pTypes = await odooCall(config, 'stock.picking.type', 'search_read', [], {
      domain: [['code', '=', 'outgoing']],
      fields: ['id'],
      limit: 1
    }, cookie);
    const pickingTypeId = pTypes[0]?.id || picking.picking_type_id[0];

    const returnPickingId = await odooCall(config, 'stock.picking', 'create', [{
      partner_id: picking.partner_id[0],
      picking_type_id: pickingTypeId,
      location_id: picking.location_dest_id[0],
      location_dest_id: picking.location_id[0],
      origin: `Return of ${picking.name}`,
      move_ids_without_package: returnMoves
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

    let creditNoteId = null;
    let creditNoteWarning = '';
    try {
      creditNoteId = await odooCall(config, 'account.move', 'create', [{
        move_type: 'in_refund',
        partner_id: picking.partner_id[0],
        invoice_origin: picking.name,
        ref: `Trả hàng cho ${picking.name}`,
        invoice_line_ids: creditNoteLines
      }], {}, cookie);
    } catch (cnErr) {
      console.warn('Could not create draft credit note:', cnErr.message);
      creditNoteWarning = `Không thể tự động tạo Credit Note: ${cnErr.message}.`;
    }

    res.json({
      success: true,
      returnPickingId,
      creditNoteId,
      pickingValidated,
      warning: [pickingWarning, creditNoteWarning].filter(Boolean).join(' ') || undefined
    });

  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/odoo/sale-orders', checkRole(['kinh_doanh']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const body = req.body;
    
    // Resolve template IDs to variant IDs
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
    
    // Create SO Payload
    const createPayload = {
      partner_id: Number(body.partner_id),
      order_line: resolvedOrderLines
    };
    if (body.date_order) {
      // Format as YYYY-MM-DD HH:mm:ss for Odoo
      try {
        const d = new Date(body.date_order);
        if (!isNaN(d.getTime())) {
          createPayload.date_order = d.toISOString().replace('T', ' ').substring(0, 19);
        }
      } catch (dateErr) {
        console.warn('Invalid date format provided, using Odoo default:', dateErr.message);
      }
    }
    
    // Create SO
    const soId = await odooCall(config, 'sale.order', 'create', [createPayload], {}, cookie);
    
    // If saving as draft (Báo giá)
    if (body.draft === true) {
      return res.json({ success: true, id: soId, state: 'draft', warning: '' });
    }

    // Otherwise, Confirm flow (Xác nhận)
    // Check inventory before confirming SO
    let canConfirm = true;
    for (const line of body.order_line) {
      const variantId = await resolveProductVariant(config, line.product_id, cookie);
      const quants = await odooCall(config, 'stock.quant', 'search_read', [], {
        domain: [['product_id', '=', variantId], ['location_id.usage', '=', 'internal']],
        fields: ['quantity']
      }, cookie);
      const stockQty = quants.reduce((sum, q) => sum + (q.quantity || 0), 0);
      if (stockQty < Number(line.product_qty)) {
        canConfirm = false;
        break;
      }
    }

    let warningMsg = '';
    let invoiceId = null;

    if (canConfirm) {
      // Confirm SO
      try {
        await odooCall(config, 'sale.order', 'action_confirm', [[soId]], {}, cookie);
      } catch (confirmErr) {
        console.warn('SO Confirm skipped or failed:', confirmErr.message);
      }
      
      // Auto deduct stock (validate picking)
      let pickingId = null;
      try {
        const pickings = await odooCall(config, 'stock.picking', 'search_read', [], {
          domain: [['sale_id', '=', soId], ['state', 'not in', ['done', 'cancel']]],
          fields: ['id'],
          limit: 1
        }, cookie);
        if (pickings && pickings.length) {
          pickingId = pickings[0].id;
          await validatePickingInternal(config, pickingId, cookie);
        }
      } catch (pickingErr) {
        console.warn('Auto validate picking failed:', pickingErr.message);
        warningMsg += `Đã xác nhận đơn hàng nhưng lỗi tự động trừ kho: ${pickingErr.message}. `;
      }

      // Auto generate invoice using the wizard flow (keep as DRAFT)
      try {
        const context = { active_ids: [soId], active_id: soId, active_model: 'sale.order' };
        const wizardId = await odooCall(config, 'sale.advance.payment.inv', 'create', [{
          advance_payment_method: 'delivered'
        }], { context }, cookie);
        await odooCall(config, 'sale.advance.payment.inv', 'create_invoices', [[wizardId]], { context }, cookie);
        
        // Get the invoice ID from the Sales Order
        const updatedSO = await odooCall(config, 'sale.order', 'read', [[soId], ['invoice_ids']], {}, cookie);
        if (updatedSO && updatedSO.length && updatedSO[0].invoice_ids && updatedSO[0].invoice_ids.length) {
          invoiceId = updatedSO[0].invoice_ids[0];
          // CRITICAL: We DO NOT post or register payment automatically for invoices anymore.
        }
      } catch (invoiceErr) {
        console.warn('Invoice wizard auto-create failed, falling back to manual creation:', invoiceErr.message);
        // Fallback to manual account.move creation if the wizard fails
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
    } else {
      // Insufficient stock: Confirm the SO to place in confirmed state, but leave picking and do not create invoice
      try {
        await odooCall(config, 'sale.order', 'action_confirm', [[soId]], {}, cookie);
      } catch (confirmErr) {
        console.warn('SO Confirm with low stock failed:', confirmErr.message);
      }
      warningMsg = 'Kho không đủ hàng giao, đơn hàng sẽ chuyển sang trạng thái Chờ sản xuất';
    }
    
    res.json({ success: true, id: soId, invoiceId, warning: warningMsg || undefined });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/odoo/invoices/:id/post', checkRole(['ke_toan_ban_hang']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
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
    const id = Number(req.params.id);
    const { payment_amount, payment_ref, ref, invoice_state, payment_method, payment_date } = req.body;

    const invs = await odooCall(config, 'account.move', 'read', [[id], ['state', 'amount_total', 'amount_residual', 'payment_state']], {}, cookie);
    if (!invs || !invs.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy hóa đơn' });
    }
    const invoice = invs[0];

    // Validate payment amount limit
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

    // Post invoice if transition is requested
    if (invoice_state === 'posted' && invoice.state === 'draft') {
      await odooCall(config, 'account.move', 'action_post', [[id]], {}, cookie);
      // Re-read residual values after post
      const updated = await odooCall(config, 'account.move', 'read', [[id], ['state', 'amount_total', 'amount_residual', 'payment_state']], {}, cookie);
      if (updated && updated.length) {
        Object.assign(invoice, updated[0]);
      }
    }

    // Register payment if amount > 0 and invoice is posted
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
    const id = Number(req.params.id);

    // Read the original invoice
    const inv = await odooCall(config, 'account.move', 'read', [[id], ['id', 'name', 'partner_id', 'ref', 'invoice_line_ids']], {}, cookie);
    if (!inv || !inv.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy hóa đơn gốc' });
    }
    const invoice = inv[0];

    // Read the invoice lines
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
    const id = Number(req.params.id);

    const invs = await odooCall(config, 'account.move', 'read', [[id], ['state']], {}, cookie);
    if (invs && invs.length && invs[0].state === 'posted') {
      return res.status(400).json({ success: false, error: 'Nghiêm cấm xóa hóa đơn đã ở trạng thái Đã vào sổ (Posted). Vui lòng sử dụng Credit Note để hoàn trả.' });
    }
    
    try {
      // Try to unlink directly (works if in draft status)
      await odooCall(config, 'account.move', 'unlink', [[id]], {}, cookie);
    } catch (err) {
      console.warn('Direct invoice unlink failed, attempting draft reset first:', err.message);
      try {
        // Reset to draft status
        await odooCall(config, 'account.move', 'button_draft', [[id]], {}, cookie);
        // Delete the draft invoice
        await odooCall(config, 'account.move', 'unlink', [[id]], {}, cookie);
      } catch (err2) {
        console.warn('Draft reset and unlink failed, attempting cancel and unlink:', err2.message);
        // Fallback: cancel first, then delete
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

router.get('/odoo/so/:id/invoice-pdf', checkRole(['ke_toan_ban_hang', 'kinh_doanh']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const soId = Number(req.params.id);

    // 1. Fetch Sales Order to check if a linked invoice exists
    const order = await odooCall(config, 'sale.order', 'read', [[soId], ['invoice_ids', 'partner_id', 'order_line']], {}, cookie);
    if (!order || !order.length) {
      return res.status(404).json({ success: false, error: 'Sales Order not found' });
    }

    let invoiceId = null;
    if (order[0].invoice_ids && order[0].invoice_ids.length) {
      invoiceId = order[0].invoice_ids[0];
    } else {
      // 2. Create the invoice via wizard flow
      try {
        const context = { active_ids: [soId], active_id: soId, active_model: 'sale.order' };
        const wizardId = await odooCall(config, 'sale.advance.payment.inv', 'create', [{
          advance_payment_method: 'percentage',
          amount: 100
        }], { context }, cookie);
        await odooCall(config, 'sale.advance.payment.inv', 'create_invoices', [[wizardId]], { context }, cookie);

        const updatedSO = await odooCall(config, 'sale.order', 'read', [[soId], ['invoice_ids']], {}, cookie);
        if (updatedSO && updatedSO.length && updatedSO[0].invoice_ids && updatedSO[0].invoice_ids.length) {
          invoiceId = updatedSO[0].invoice_ids[0];
          // Automatically post the invoice to generate the code
          try {
            await odooCall(config, 'account.move', 'action_post', [[invoiceId]], {}, cookie);
          } catch (postErr) {
            console.warn('Auto action_post failed for wizard-created invoice on-demand:', postErr.message);
          }
        }
      } catch (wizardErr) {
        console.warn('On-demand wizard invoice creation failed, trying manual fallback:', wizardErr.message);
        
        // Manual fallback: read SO lines and map to invoice lines
        try {
          const partnerId = Array.isArray(order[0].partner_id) ? order[0].partner_id[0] : order[0].partner_id;
          const lineIds = order[0].order_line || [];
          const lines = await odooCall(config, 'sale.order.line', 'read', [lineIds, ['product_id', 'product_uom_qty', 'price_unit', 'name']], {}, cookie);
          
          const invoiceLineIds = lines.map(l => [0, 0, {
            product_id: Array.isArray(l.product_id) ? l.product_id[0] : l.product_id,
            quantity: Number(l.product_uom_qty),
            price_unit: Number(l.price_unit),
            name: l.name || 'Bán hàng qua SO'
          }]);

          if (invoiceLineIds.length) {
            invoiceId = await odooCall(config, 'account.move', 'create', [{
              move_type: 'out_invoice',
              partner_id: Number(partnerId),
              invoice_origin: `SO${soId}`,
              invoice_line_ids: invoiceLineIds
            }], {}, cookie);
            // Automatically post the manual fallback invoice
            try {
              await odooCall(config, 'account.move', 'action_post', [[invoiceId]], {}, cookie);
            } catch (postErr) {
              console.warn('Auto action_post failed for manual fallback-created invoice on-demand:', postErr.message);
            }
          }
        } catch (manualErr) {
          console.error('On-demand manual invoice creation fallback failed:', manualErr.message);
          throw new Error('Could not create invoice for Sales Order: ' + manualErr.message);
        }
      }
    }

    if (!invoiceId) {
      throw new Error('Failed to create or retrieve invoice for the Sales Order');
    }

    // 3. Fetch PDF and stream it
    let response;
    try {
      const reportUrl = `${config.odooUrl}/report/pdf/account.report_invoice_with_payments/${invoiceId}`;
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
      const reportUrl = `${config.odooUrl}/report/pdf/account.report_invoice/${invoiceId}`;
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
    res.setHeader('Content-Disposition', `attachment; filename=invoice_${invoiceId}.pdf`);
    res.send(response.data);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

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
    
    const locs = await odooCall(config, 'stock.location', 'search_read', [], {
      domain: [['usage', '=', 'internal']],
      fields: ['id', 'name'],
      limit: 1
    }, cookie);
    const locationId = locs[0]?.id;
    if (!locationId) throw new Error('No internal warehouse location found in Odoo');
    
    const prods = await odooCall(config, 'product.template', 'search_read', [], {
      domain: [['id', '=', productId]],
      fields: ['id', 'name', 'default_code', 'product_variant_id', 'type'],
      limit: 1
    }, cookie);
    if (!prods.length) throw new Error(`Product template ID ${productId} not found`);
    const product = prods[0];
    const variantId = Array.isArray(product.product_variant_id) ? product.product_variant_id[0] : product.product_variant_id;
    if (!variantId) throw new Error(`Product variant not found for template ID ${productId}`);

    const bom = await resolveProductionBom(config, cookie, product, variantId);
    if (!bom.lines.length) {
      return res.status(400).json({
        success: false,
        error: `No BOM configured for product ${product.default_code || product.name}. Please configure an Odoo BOM or local production_bom rule before recording production.`
      });
    }
    
    const quants = await odooCall(config, 'stock.quant', 'search_read', [], {
      domain: [['product_id', '=', variantId], ['location_id', '=', locationId]],
      fields: ['id', 'quantity'],
      limit: 1
    }, cookie);
    
    let updatedQty = yieldQty;
    if (quants.length) {
      const q = quants[0];
      updatedQty = Number(q.quantity || 0) + yieldQty;
      await odooCall(config, 'stock.quant', 'write', [[q.id], { quantity: updatedQty }], {}, cookie);
    } else {
      await odooCall(config, 'stock.quant', 'create', [{
        product_id: variantId,
        location_id: locationId,
        quantity: yieldQty
      }], {}, cookie);
    }
    
    let deductedDetails = [];
    const actualBomLines = body.actual_bom_lines || [];

    for (const rawLine of bom.lines) {
      let rawDeductQty = yieldQty * rawLine.qtyPerUnit;
      const actualInput = actualBomLines.find(l => l.product_id === rawLine.productId);
      if (actualInput && actualInput.qty !== undefined) {
         rawDeductQty = Number(actualInput.qty);
      }
      
      const rawQuants = await odooCall(config, 'stock.quant', 'search_read', [], {
        domain: [['product_id', '=', rawLine.variantId], ['location_id', '=', locationId]],
        fields: ['id', 'quantity'],
        limit: 1
      }, cookie);

      if (rawQuants.length) {
        const rq = rawQuants[0];
        const previousQty = Number(rq.quantity || 0);
        const newRawQty = Math.max(0, previousQty - rawDeductQty);
        await odooCall(config, 'stock.quant', 'write', [[rq.id], { quantity: newRawQty }], {}, cookie);
        deductedDetails.push({
          product_id: rawLine.productId,
          variant_id: rawLine.variantId,
          name: rawLine.name,
          code: rawLine.code,
          qty_per_unit: rawLine.qtyPerUnit,
          deducted: rawDeductQty,
          previous: previousQty,
          remaining: newRawQty,
          shortage: Math.max(0, rawDeductQty - previousQty)
        });
      } else {
        deductedDetails.push({
          product_id: rawLine.productId,
          variant_id: rawLine.variantId,
          name: rawLine.name,
          code: rawLine.code,
          qty_per_unit: rawLine.qtyPerUnit,
          deducted: 0,
          previous: 0,
          remaining: 0,
          shortage: rawDeductQty,
          warning: 'No stock quant found'
        });
      }
    }
    
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
      shift: body.shift || ''
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
      productionLog: productionEntry
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
    
    // Check if we have enough stock of the produced item to cancel it
    const locs = await odooCall(config, 'stock.location', 'search_read', [], {
      domain: [['usage', '=', 'internal']],
      fields: ['id', 'name'],
      limit: 1
    }, cookie);
    const locationId = locs[0]?.id;
    if (!locationId) throw new Error('No internal warehouse location found in Odoo');

    const quants = await odooCall(config, 'stock.quant', 'search_read', [], {
      domain: [['product_id', '=', logItem.variant_id], ['location_id', '=', locationId]],
      fields: ['id', 'quantity'],
      limit: 1
    }, cookie);
    
    const currentStock = quants.length ? Number(quants[0].quantity || 0) : 0;
    if (currentStock < logItem.qty) {
      return res.status(400).json({ success: false, error: 'Thành phẩm đã xuất bán, không thể hủy phiếu sản xuất.' });
    }
    
    // Subtract produced item
    const newStock = currentStock - logItem.qty;
    await odooCall(config, 'stock.quant', 'write', [[quants[0].id], { quantity: newStock }], {}, cookie);
    
    // Refund deducted raw materials
    if (Array.isArray(logItem.deducted)) {
      for (const raw of logItem.deducted) {
        if (!raw.variant_id || !raw.deducted) continue;
        
        const rawQuants = await odooCall(config, 'stock.quant', 'search_read', [], {
          domain: [['product_id', '=', raw.variant_id], ['location_id', '=', locationId]],
          fields: ['id', 'quantity'],
          limit: 1
        }, cookie);
        
        if (rawQuants.length) {
          const rq = rawQuants[0];
          const restoredQty = Number(rq.quantity || 0) + raw.deducted;
          await odooCall(config, 'stock.quant', 'write', [[rq.id], { quantity: restoredQty }], {}, cookie);
        } else {
          await odooCall(config, 'stock.quant', 'create', [{
            product_id: raw.variant_id,
            location_id: locationId,
            quantity: raw.deducted
          }], {}, cookie);
        }
      }
    }
    
    logItem.status = 'canceled';
    saveProductionLog(productionLog);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
router.post('/odoo/so/:id/cancel', checkRole(['kinh_doanh']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const soId = Number(req.params.id);

    // 1. Read Sales Order
    const order = await odooCall(config, 'sale.order', 'read', [[soId], ['id', 'name', 'partner_id', 'state', 'order_line']], {}, cookie);
    if (!order || !order.length) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn bán hàng' });
    }
    const so = order[0];

    // 2. Fetch all order line details
    let lines = [];
    if (so.order_line && so.order_line.length) {
      lines = await odooCall(config, 'sale.order.line', 'read', [so.order_line, ['product_id', 'product_uom_qty', 'price_unit']], {}, cookie);
    }

    // 3. Find pickings for this Sales Order
    const pickings = await odooCall(config, 'stock.picking', 'search_read', [], {
      domain: [['sale_id', '=', soId]],
      fields: ['id', 'state']
    }, cookie);

    // 4. Return items if any picking was done
    const isPickingDone = pickings.some(p => p.state === 'done');
    if (isPickingDone && lines.length) {
      // Find internal stock location
      const locs = await odooCall(config, 'stock.location', 'search_read', [], {
        domain: [['usage', '=', 'internal']],
        fields: ['id', 'name'],
        limit: 1
      }, cookie);
      const locationId = locs[0]?.id;
      if (locationId) {
        for (const line of lines) {
          const variantId = Array.isArray(line.product_id) ? line.product_id[0] : line.product_id;
          const qty = Number(line.product_uom_qty);
          if (qty > 0) {
            // Find or create stock.quant
            const quants = await odooCall(config, 'stock.quant', 'search_read', [], {
              domain: [['product_id', '=', variantId], ['location_id', '=', locationId]],
              fields: ['id', 'quantity']
            }, cookie);
            if (quants && quants.length) {
              const rq = quants[0];
              const restoredQty = (rq.quantity || 0) + qty;
              await odooCall(config, 'stock.quant', 'write', [[rq.id], { quantity: restoredQty }], {}, cookie);
            } else {
              await odooCall(config, 'stock.quant', 'create', [{
                product_id: variantId,
                location_id: locationId,
                quantity: qty
              }], {}, cookie);
            }
          }
        }
      }
    }

    // 5. Cancel pickings that are not done or cancel
    for (const p of pickings) {
      if (p.state !== 'done' && p.state !== 'cancel') {
        try {
          await odooCall(config, 'stock.picking', 'write', [[p.id], { state: 'cancel' }], {}, cookie);
        } catch (pickErr) {
          console.warn(`Could not cancel picking ${p.id}:`, pickErr.message);
        }
      }
    }

    // 6. Cancel the Sales Order itself
    await odooCall(config, 'sale.order', 'write', [[soId], { state: 'cancel' }], {}, cookie);

    // 7. Auto generate Credit Note (out_refund)
    let creditNoteId = null;
    let creditNoteWarning = '';
    if (lines.length) {
      try {
        const creditNoteLines = lines.map(line => {
          const variantId = Array.isArray(line.product_id) ? line.product_id[0] : line.product_id;
          return [0, 0, {
            product_id: variantId,
            quantity: Number(line.product_uom_qty),
            price_unit: Number(line.price_unit || 0),
            name: `Hủy đơn & Hoàn trả sản phẩm của đơn ${so.name}`
          }];
        });

        creditNoteId = await odooCall(config, 'account.move', 'create', [{
          move_type: 'out_refund',
          partner_id: so.partner_id[0],
          invoice_origin: so.name,
          ref: `Hủy đơn ${so.name}`,
          invoice_line_ids: creditNoteLines
        }], {}, cookie);
      } catch (cnErr) {
        console.warn('Could not create draft credit note:', cnErr.message);
        creditNoteWarning = `Lưu ý: Không thể tự động tạo Credit Note trên Odoo: ${cnErr.message}.`;
      }
    }

    res.json({
      success: true,
      creditNoteId,
      warning: creditNoteWarning || undefined
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/odoo/so/:id', checkRole(['kinh_doanh']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    const id = Number(req.params.id);
    
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
    const orders = await odooCall(config, 'sale.order', 'search_read', [], {
      domain: [],
      limit: 100,
      order: 'id desc',
      fields: ['id', 'name', 'partner_id', 'amount_total', 'state', 'invoice_ids', 'write_date', 'picking_ids']
    }, cookie);
    
    // Collect all picking IDs
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

    const partners = await odooCall(config, 'res.partner', 'search_read', [], {
      fields: ['id', 'name'],
      limit: 500
    }, cookie);
    
    const partnerMap = new Map(partners.map(p => [p.id, p]));
    
    const data = orders.map(o => {
      // Determine delivery state
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
        invoice_ref: Array.isArray(o.invoice_ids) && o.invoice_ids.length ? `Invoice: ${o.invoice_ids.join(', ')}` : 'Chưa xuất'
      };
    });
    
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
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

router.get('/odoo/invoices', checkRole(['ke_toan_ban_hang']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    
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

router.get('/odoo/po', checkRole(['ke_toan_kho']), async (req, res) => {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    
    const pos = await odooCall(config, 'purchase.order', 'search_read', [], {
      domain: [],
      limit: 100,
      order: 'id desc',
      fields: ['id', 'name', 'partner_id', 'amount_total', 'state', 'date_order', 'write_date']
    }, cookie);
    
    const partners = await odooCall(config, 'res.partner', 'search_read', [], {
      fields: ['id', 'name'],
      limit: 500
    }, cookie);
    
    const partnerMap = new Map(partners.map(p => [p.id, p]));
    
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
    
    const receipts = await odooCall(config, 'stock.picking', 'read', [[receiptId], ['id', 'name', 'origin', 'partner_id', 'state', 'scheduled_date', 'move_lines']], {}, cookie);
    if (!receipts || !receipts.length) return res.status(404).json({ error: 'Receipt not found' });
    const receipt = receipts[0];
    
    let lines = [];
    if (receipt.move_lines && receipt.move_lines.length > 0) {
      lines = await odooCall(config, 'stock.move', 'read', [receipt.move_lines, ['name', 'product_id', 'product_uom_qty', 'quantity_done', 'state']], {}, cookie);
    }
    
    res.json({ receipt, lines });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SSE Real-time child process runner
router.get('/run-script/stream', checkRole([]), (req, res) => {
  const scriptName = req.query.script;
  const scriptMapping = {
    // Old script names
    'odoo_gsheet_bidirectional_sync.js': 'sync_data.js',
    'fix_odoo_products_utf8.js': 'products.js',
    'fix_duplicates_and_combos.js': 'products.js',
    'odoo_process_stock_receipts.js': 'recepts.js',
    'odoo_e2e_workflow_test.js': 'invoice.js',
    'odoo_create_sample_orders_test.js': 'invoice.js',
    'odoo_create_sample_purchase_and_receipt_test.js': 'recepts.js',
    'odoo_create_invoice_ab.js': 'invoice.js',
    'odoo_sync_production.js': 'production.js',

    // New script names
    'sync_data.js': 'sync_data.js',
    'products.js': 'products.js',
    'recepts.js': 'recepts.js',
    'invoice.js': 'invoice.js',
    'production.js': 'production.js'
  };

  const actualScript = scriptMapping[scriptName];
  if (!actualScript) {
    return res.status(400).json({ error: 'Invalid script name: ' + scriptName });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const config = loadConfig();
  let credsPath = '';

  if (config.credsContent) {
    credsPath = path.join(__dirname, '../../../google-credentials-local.json');
    try {
      JSON.parse(config.credsContent);
      fs.writeFileSync(credsPath, config.credsContent, 'utf8');
    } catch (e) {
      res.write(`data: [SYSTEM ERROR] Invalid Google Credentials JSON: ${e.message}\n\n`);
      res.end();
      return;
    }
  } else {
    credsPath = 'google-credentials-local.json';
  }

  // Pass active configs as env vars to child process
  const env = {
    ...process.env,
    ODOO_URL: config.odooUrl,
    ODOO_DB: config.db,
    ODOO_LOGIN: config.login,
    ODOO_PASSWORD: config.password,
    GSHEET_ID: config.sheetId,
    GOOGLE_CREDENTIALS: path.resolve(credsPath)
  };

  res.write(`data: [SYSTEM] Spawning process: ${process.execPath} ${actualScript}...\n\n`);

  const child = spawn(process.execPath, [actualScript], { env, cwd: path.join(__dirname, '../../scripts') });

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim() || line === '') {
        res.write(`data: ${line}\n\n`);
      }
    });
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim() || line === '') {
        res.write(`data: [STDERR] ${line}\n\n`);
      }
    });
  });

  child.on('close', (code) => {
    res.write(`data: [SYSTEM] Process exited with code ${code}\n\n`);
    res.end();
  });

  child.on('error', (err) => {
    res.write(`data: [SYSTEM ERROR] Failed to start process: ${err.message}\n\n`);
    res.end();
  });

  req.on('close', () => {
    child.kill();
  });
});



module.exports = router;
