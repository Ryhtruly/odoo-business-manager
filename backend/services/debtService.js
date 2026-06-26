const fs = require('fs');
const path = require('path');

const DEBT_FILE_DIR = path.join(__dirname, '../data');
const DEBT_FILE_PATH = path.join(DEBT_FILE_DIR, 'debt_log.json');

// Ensure data directory exists
function ensureDirectoryExistence() {
  try {
    if (!fs.existsSync(DEBT_FILE_DIR)) {
      fs.mkdirSync(DEBT_FILE_DIR, { recursive: true });
    }
  } catch (e) {
    console.error('Error creating directory for debt log:', e.message);
  }
}

function loadDebt() {
  ensureDirectoryExistence();
  try {
    if (fs.existsSync(DEBT_FILE_PATH)) {
      const data = fs.readFileSync(DEBT_FILE_PATH, 'utf8');
      return JSON.parse(data || '[]');
    }
  } catch (e) {
    console.error('Error reading debt_log.json:', e.message);
  }
  return [];
}

function saveDebt(items) {
  ensureDirectoryExistence();
  try {
    fs.writeFileSync(DEBT_FILE_PATH, JSON.stringify(items, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error writing to debt_log.json:', e.message);
    return false;
  }
}

function recordDebt({ partner_id, partner_name, picking_id, total_amount }) {
  try {
    const items = loadDebt();
    
    // Check if debt for this picking already exists to prevent duplicate entries
    const existing = items.find(item => item.picking_id === Number(picking_id));
    if (existing) {
      return existing;
    }

    const tAmount = Number(total_amount || 0);
    const newDebt = {
      id: `DEBT-${Date.now()}`,
      partner_id: Number(partner_id),
      partner_name: String(partner_name || ''),
      picking_id: Number(picking_id),
      total_amount: tAmount,
      paid_amount: 0,
      debt_amount: tAmount,
      status: 'unpaid',
      created_at: new Date().toISOString(),
      payments: []
    };

    items.unshift(newDebt);
    saveDebt(items);
    return newDebt;
  } catch (e) {
    console.error('Error recording debt:', e.message);
    throw e;
  }
}

function recordPayment(picking_id, amount, method, note) {
  try {
    const items = loadDebt();
    const target = items.find(item => item.picking_id === Number(picking_id));
    
    if (!target) {
      throw new Error(`Không tìm thấy thông tin công nợ cho phiếu kho ID ${picking_id}`);
    }

    const pAmount = Number(amount || 0);
    target.paid_amount = Number((target.paid_amount + pAmount).toFixed(2));
    target.debt_amount = Number((target.total_amount - target.paid_amount).toFixed(2));

    if (target.debt_amount <= 0) {
      target.status = 'paid';
      target.debt_amount = 0; // Prevent negative values
    } else if (target.paid_amount > 0) {
      target.status = 'partial';
    } else {
      target.status = 'unpaid';
    }

    target.payments.push({
      date: new Date().toISOString(),
      amount: pAmount,
      method: method || 'other',
      note: note || ''
    });

    saveDebt(items);
    return target;
  } catch (e) {
    console.error('Error recording payment:', e.message);
    throw e;
  }
}

function getDebtByPartner(partner_id) {
  try {
    const items = loadDebt();
    return items.filter(item => item.partner_id === Number(partner_id));
  } catch (e) {
    console.error('Error getting debt by partner:', e.message);
    return [];
  }
}

function getDebtByPicking(picking_id) {
  try {
    const items = loadDebt();
    return items.find(item => item.picking_id === Number(picking_id));
  } catch (e) {
    console.error('Error getting debt by picking:', e.message);
    return undefined;
  }
}

module.exports = {
  loadDebt,
  saveDebt,
  recordDebt,
  recordPayment,
  getDebtByPartner,
  getDebtByPicking
};
