const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../../sync_config.json');

function normalizeUrl(url) {
  if (!url) return '';
  return 'https://' + url.trim().replace(/^https?:\/\//i, '').replace(/\/odoo\/?$/i, '').replace(/\/$/, '');
}

// Helper to load credentials from odoo-login.txt
function loadOdooLogin() {
  try {
    const filePath = path.join(__dirname, '../../odoo-login.txt');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const urlMatch = content.match(/URL Odoo\s*:\s*(.+)/i);
      const dbMatch = content.match(/Tên database\s*:\s*(.+)/i);
      const userMatch = content.match(/Tên đăng nhập\s*:\s*(.+)/i);
      const passMatch = content.match(/Mật khẩu\s*:\s*(.+)/i);
      return {
        odooUrl: urlMatch ? normalizeUrl(urlMatch[1]) : 'https://hoabinh.odoo.com',
        db: dbMatch ? dbMatch[1].trim() : 'hoabinh',
        login: userMatch ? userMatch[1].trim() : 'lanhuong04011643@gmail.com',
        password: passMatch ? passMatch[1].trim() : '123456789'
      };
    }
  } catch (e) {
    console.error('Failed to read odoo-login.txt', e);
  }
  return {
    odooUrl: 'https://hoabinh.odoo.com',
    db: 'hoabinh',
    login: 'lanhuong04011643@gmail.com',
    password: '123456789'
  };
}

// Load current configuration
function loadConfig() {
  const defaults = loadOdooLogin();
  let saved = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading sync_config.json', e);
  }
  return {
    odooUrl: normalizeUrl(saved.odooUrl || defaults.odooUrl),
    db: saved.db || defaults.db,
    login: saved.login || defaults.login,
    password: saved.password || defaults.password,
    sheetId: saved.sheetId || '1Jzw_V9e4Gfw1QKr11YIa9SVLqaLwvD8cH7dZ7HgWGYE',
    credsContent: saved.credsContent || '',
  };
}

// Save configuration
function saveConfig(config) {
  try {
    if (config && config.odooUrl) {
      config.odooUrl = normalizeUrl(config.odooUrl);
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error saving sync_config.json', e);
    return false;
  }
}

module.exports = {
  loadOdooLogin,
  loadConfig,
  saveConfig
};
