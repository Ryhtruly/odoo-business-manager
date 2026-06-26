const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { loadConfig, saveConfig } = require('../config/config');
const { loadUsers, saveUsers } = require('../services/fileService');
const { odooAuth, clearOdooSessionCache } = require('../services/odooService');
const { checkRole } = require('../middlewares/authMiddleware');
const { hashPassword, isPasswordHash, safeUser, signToken, verifyPassword } = require('../services/authService');
const { getGoogleAccessToken } = require('../services/googleSheetsService');

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
      clearOdooSessionCache(); // Invalidate old session cookie
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

router.get('/odoo/status', checkRole(['ke_toan_kho', 'san_xuat', 'kinh_doanh', 'ke_toan_ban_hang']), async (req, res) => {
  const config = loadConfig();
  let odooConnected = false;
  let odooError = null;
  let gsheetConnected = false;
  let gsheetError = null;

  try {
    const cookie = await odooAuth(config);
    if (cookie) odooConnected = true;
  } catch (e) {
    odooError = e.message;
  }

  if (config.credsContent && config.sheetId) {
    try {
      const token = await getGoogleAccessToken(config);
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

router.get('/run-script/stream', checkRole([]), (req, res) => {
  const scriptName = req.query.script;
  const scriptMapping = {
    'odoo_gsheet_bidirectional_sync.js': 'sync_data.js',
    'fix_odoo_products_utf8.js': 'products.js',
    'fix_duplicates_and_combos.js': 'products.js',
    'odoo_process_stock_receipts.js': 'recepts.js',
    'odoo_e2e_workflow_test.js': 'invoice.js',
    'odoo_create_sample_orders_test.js': 'invoice.js',
    'odoo_create_sample_purchase_and_receipt_test.js': 'recepts.js',
    'odoo_create_invoice_ab.js': 'invoice.js',
    'odoo_sync_production.js': 'production.js',
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
