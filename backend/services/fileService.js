const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '../../users.json');
const PRODUCTION_LOG_FILE = path.join(__dirname, '../../production_log.json');
const PRODUCTION_BOM_FILE = path.join(__dirname, '../../production_bom.json');

const DEFAULT_USERS = [
  { "username": "admin", "password": "123", "name": "Quản trị viên", "role": "admin", "approved": true },
  { "username": "ketoankho", "password": "123", "name": "Kế toán kho", "role": "ke_toan_kho", "approved": true },
  { "username": "sanxuat", "password": "123", "name": "Bộ phận sản xuất", "role": "san_xuat", "approved": true },
  { "username": "kinhdoanh", "password": "123", "name": "Bộ phận kinh doanh", "role": "kinh_doanh", "approved": true },
  { "username": "ketoanbanhang", "password": "123", "name": "Kế toán bán hàng", "role": "ke_toan_ban_hang", "approved": true }
];

const DEFAULT_PRODUCTION_BOM = {
  rules: [
    {
      match: { product_code: 'XD-TP-CUA-001' },
      lines: [
        { code: 'XD-THEP-002', qty_per_unit: 6 },
        { code: 'XD-THEP-001', qty_per_unit: 2 }
      ]
    },
    {
      match: { product_code: 'XD-TP-COFA-001' },
      lines: [
        { code: 'XD-THEP-003', qty_per_unit: 4 }
      ]
    },
    {
      match: { product_code: 'XD-TP-RAO-001' },
      lines: [
        { code: 'XD-THEP-002', qty_per_unit: 3 }
      ]
    },
    {
      match: { product_code: 'XD-TP-BTONG-001' },
      lines: [
        { code: 'XD-THEP-003', qty_per_unit: 4 },
        { code: 'XD-XM-001', qty_per_unit: 2 },
        { code: 'XD-CAT-002', qty_per_unit: 0.05 },
        { code: 'XD-DA-001', qty_per_unit: 0.08 }
      ]
    },
    {
      match: { default: true },
      lines: []
    }
  ]
};

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } else {
      fs.writeFileSync(USERS_FILE, JSON.stringify(DEFAULT_USERS, null, 2), 'utf8');
      return DEFAULT_USERS;
    }
  } catch (e) {
    console.error('Error loading users.json', e);
    return DEFAULT_USERS;
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error saving users.json', e);
    return false;
  }
}

function loadProductionLog() {
  try {
    if (fs.existsSync(PRODUCTION_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(PRODUCTION_LOG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading production_log.json', e);
  }
  return [];
}

function saveProductionLog(items) {
  try {
    fs.writeFileSync(PRODUCTION_LOG_FILE, JSON.stringify(items.slice(0, 500), null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error saving production_log.json', e);
    return false;
  }
}

function loadProductionBomConfig() {
  try {
    if (fs.existsSync(PRODUCTION_BOM_FILE)) {
      return JSON.parse(fs.readFileSync(PRODUCTION_BOM_FILE, 'utf8'));
    }
    fs.writeFileSync(PRODUCTION_BOM_FILE, JSON.stringify(DEFAULT_PRODUCTION_BOM, null, 2), 'utf8');
  } catch (e) {
    console.error('Error loading production_bom.json', e);
  }
  return DEFAULT_PRODUCTION_BOM;
}

module.exports = {
  loadUsers,
  saveUsers,
  loadProductionLog,
  saveProductionLog,
  loadProductionBomConfig
};
