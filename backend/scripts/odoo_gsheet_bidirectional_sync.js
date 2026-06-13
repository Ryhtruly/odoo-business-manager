// odoo_gsheet_bidirectional_sync.js
// 2-way sync: Odoo <-> Google Sheets | Odoo wins on conflicts
// Scope: Products, Stock (quant), Invoices (account.move)
//
// Run: node odoo_gsheet_bidirectional_sync.js

const axios = require('axios');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const CONFIG = {
  odooUrl: process.env.ODOO_URL || 'https://quanly-san-xuat.odoo.com',
  db: process.env.ODOO_DB || 'quanly-san-xuat',
  login: process.env.ODOO_LOGIN || 'vanquyen607@gmail.com',
  password: process.env.ODOO_PASSWORD || null,
  sheetId: process.env.GSHEET_ID || '1Jzw_V9e4Gfw1QKr11YIa9SVLqaLwvD8cH7dZ7HgWGYE',
  credsPath: process.env.GOOGLE_CREDENTIALS || 'C:/Users/Admin/.openclaw/credentials/google-credentials.json',
  tabs: { products: 'Products', stock: 'Stock', invoices: 'Invoices', po: 'PO', receipts: 'Receipts', log: 'Sync_Log' },
};

let cookie = '';

// ── Odoo helpers ──────────────────────────────────────────────

function readPasswordFromFile() {
  try {
    const txt = fs.readFileSync('C:/Users/Admin/.openclaw/workspace/skills/odoo-login.txt', 'utf8');
    const m = txt.match(/Mật khẩu\s*:\s*(.+)/i);
    return m ? m[1].trim() : null;
  } catch { return null; }
}
function getPassword() { return CONFIG.password || readPasswordFromFile(); }

async function odooRpc(path, payload) {
  const res = await axios.post(CONFIG.odooUrl + path, payload, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cookie ? { Cookie: cookie } : {}) },
    validateStatus: () => true,
  });
  const sc = res.headers['set-cookie'];
  if (sc && sc.length) cookie = sc.map(x => x.split(';')[0]).join('; ');
  const data = res.data;
  if (data && data.error) throw new Error(data.error.data?.message || data.error.message || JSON.stringify(data.error));
  return data.result;
}

async function odooCall(model, method, args = [], kwargs = {}) {
  return odooRpc('/web/dataset/call_kw', { jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } });
}

async function odooAuth() {
  const password = getPassword();
  if (!password) throw new Error('Missing Odoo password — check odoo-login.txt or ODOO_PASSWORD env');
  await odooRpc('/web/session/authenticate', { jsonrpc: '2.0', method: 'call', params: { db: CONFIG.db, login: CONFIG.login, password } });
}

// ── Google Sheets helpers ─────────────────────────────────────

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJwt(sa) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const sig = signer.sign(sa.private_key, 'base64');
  return `${unsigned}.${sig.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
}

async function getGoogleAccessToken() {
  const sa = JSON.parse(fs.readFileSync(CONFIG.credsPath, 'utf8'));
  const jwt = signJwt(sa);
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString();
  const res = await axios.post('https://oauth2.googleapis.com/token', body, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return res.data.access_token;
}

async function gs(method, url, token, data) {
  const res = await axios({ method, url, data, httpsAgent: new https.Agent({ keepAlive: true }), headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true });
  if (res.status >= 400) throw new Error(`Google API ${res.status}: ${JSON.stringify(res.data)}`);
  return res.data;
}

async function ensureSheet(token, title) {
  const meta = await gs('get', `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetId}?fields=sheets.properties`, token);
  if ((meta.sheets || []).some(s => s.properties?.title === title)) return;
  await gs('post', `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetId}:batchUpdate`, token, { requests: [{ addSheet: { properties: { title } } }] });
}

async function clearAndWrite(token, range, values) {
  const enc = encodeURIComponent(range);
  await gs('post', `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetId}/values/${enc}:clear`, token, {});
  await gs('put', `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetId}/values/${enc}?valueInputOption=RAW`, token, { values });
}

async function readRange(token, range) {
  const data = await gs('get', `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetId}/values/${encodeURIComponent(range)}`, token);
  return data.values || [];
}

function parseSheet(rows) {
  if (!rows.length) return [];
  const h = rows[0];
  return rows.slice(1).filter(r => r.length).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}

// ── Fetch Odoo data ───────────────────────────────────────────

async function fetchProducts() {
  const rows = await odooCall('product.template', 'search_read', [], {
    domain: [], limit: 1000, order: 'id asc',
    fields: ['id', 'name', 'default_code', 'list_price', 'standard_price', 'type', 'description', 'write_date'],
  });
  return rows.map(p => ({ id: p.id, default_code: p.default_code || '', name: p.name || '', list_price: p.list_price ?? '', standard_price: p.standard_price ?? '', type: p.type || '', description: p.description || '', write_date: p.write_date || '', source: 'odoo' }));
}

async function fetchStock() {
  const quants = await odooCall('stock.quant', 'search_read', [], {
    domain: [], limit: 2000,
    fields: ['id', 'product_id', 'location_id', 'quantity', 'write_date'],
  });
  const products = await odooCall('product.product', 'search_read', [], { fields: ['id', 'default_code', 'name'], limit: 2000 });
  const locations = await odooCall('stock.location', 'search_read', [], { fields: ['id', 'name', 'usage'], limit: 200 });
  const pMap = new Map(products.map(p => [p.id, p]));
  const lMap = new Map(locations.map(l => [l.id, l]));
  return quants.map(q => {
    const p = pMap.get(q.product_id[0]);
    const l = lMap.get(q.location_id[0]);
    return { id: q.id, product_code: p?.default_code || '', product_name: p?.name || '', location: l?.name || '', usage: l?.usage || '', quantity: q.quantity ?? 0, write_date: q.write_date || '', source: 'odoo' };
  });
}

async function fetchInvoices() {
  const rows = await odooCall('account.move', 'search_read', [], {
    domain: [['move_type', '=', 'out_invoice']], limit: 1000, order: 'id desc',
    fields: ['id', 'name', 'partner_id', 'amount_total', 'amount_residual', 'payment_state', 'state', 'invoice_date', 'write_date'],
  });
  const partners = await odooCall('res.partner', 'search_read', [], { fields: ['id', 'name'], limit: 1000 });
  const partnerMap = new Map(partners.map(p => [p.id, p]));
  return rows.map(i => ({ id: i.id, invoice_number: i.name || '', partner: partnerMap.get(i.partner_id?.[0])?.name || '', amount_total: i.amount_total ?? 0, amount_residual: i.amount_residual ?? 0, payment_state: i.payment_state || '', state: i.state || '', invoice_date: i.invoice_date || '', write_date: i.write_date || '', source: 'odoo' }));
}

async function fetchPO() {
  const rows = await odooCall('purchase.order', 'search_read', [], {
    domain: [], limit: 1000, order: 'id desc',
    fields: ['id', 'name', 'partner_id', 'amount_total', 'state', 'date_order', 'write_date'],
  });
  const partners = await odooCall('res.partner', 'search_read', [], { fields: ['id', 'name'], limit: 1000 });
  const partnerMap = new Map(partners.map(p => [p.id, p]));
  return rows.map(o => ({ id: o.id, po_number: o.name || '', vendor: partnerMap.get(o.partner_id?.[0])?.name || '', amount_total: o.amount_total ?? 0, state: o.state || '', date_order: o.date_order || '', write_date: o.write_date || '', source: 'odoo' }));
}

async function fetchReceipts() {
  const rows = await odooCall('stock.picking', 'search_read', [], {
    domain: [['picking_type_code', '=', 'incoming']], limit: 1000, order: 'id desc',
    fields: ['id', 'name', 'origin', 'partner_id', 'state', 'scheduled_date', 'write_date'],
  });
  const partners = await odooCall('res.partner', 'search_read', [], { fields: ['id', 'name'], limit: 1000 });
  const partnerMap = new Map(partners.map(p => [p.id, p]));
  return rows.map(r => ({ id: r.id, receipt_number: r.name || '', origin: r.origin || '', vendor: partnerMap.get(r.partner_id?.[0])?.name || '', state: r.state || '', scheduled_date: r.scheduled_date || '', write_date: r.write_date || '', source: 'odoo' }));
}

// ── Push Odoo → Sheet ─────────────────────────────────────────

async function pushToSheet(token) {
  await ensureSheet(token, CONFIG.tabs.products);
  await ensureSheet(token, CONFIG.tabs.stock);
  await ensureSheet(token, CONFIG.tabs.invoices);
  await ensureSheet(token, CONFIG.tabs.po);
  await ensureSheet(token, CONFIG.tabs.receipts);

  const products = await fetchProducts();
  await clearAndWrite(token, `${CONFIG.tabs.products}!A1`, [
    ['default_code', 'name', 'list_price', 'standard_price', 'type', 'description', 'write_date', 'source'],
    ...products.map(r => [r.default_code, r.name, r.list_price, r.standard_price, r.type, r.description, r.write_date, r.source]),
  ]);

  const stock = await fetchStock();
  await clearAndWrite(token, `${CONFIG.tabs.stock}!A1`, [
    ['id', 'product_code', 'product_name', 'location', 'usage', 'quantity', 'write_date', 'source'],
    ...stock.map(r => [r.id, r.product_code, r.product_name, r.location, r.usage, r.quantity, r.write_date, r.source]),
  ]);

  const invoices = await fetchInvoices();
  await clearAndWrite(token, `${CONFIG.tabs.invoices}!A1`, [
    ['id', 'invoice_number', 'partner', 'amount_total', 'amount_residual', 'payment_state', 'state', 'invoice_date', 'write_date', 'source'],
    ...invoices.map(r => [r.id, r.invoice_number, r.partner, r.amount_total, r.amount_residual, r.payment_state, r.state, r.invoice_date, r.write_date, r.source]),
  ]);

  const pos = await fetchPO();
  await clearAndWrite(token, `${CONFIG.tabs.po}!A1`, [
    ['id', 'po_number', 'vendor', 'amount_total', 'state', 'date_order', 'write_date', 'source'],
    ...pos.map(r => [r.id, r.po_number, r.vendor, r.amount_total, r.state, r.date_order, r.write_date, r.source]),
  ]);

  const receipts = await fetchReceipts();
  await clearAndWrite(token, `${CONFIG.tabs.receipts}!A1`, [
    ['id', 'receipt_number', 'origin', 'vendor', 'state', 'scheduled_date', 'write_date', 'source'],
    ...receipts.map(r => [r.id, r.receipt_number, r.origin, r.vendor, r.state, r.scheduled_date, r.write_date, r.source]),
  ]);

  return { products: products.length, stock: stock.length, invoices: invoices.length, PO: pos.length, receipts: receipts.length };
}

// ── Pull Sheet → Odoo (Products only — stock/invoices read-only) ──

async function pullToOdoo(token) {
  const raw = await readRange(token, `${CONFIG.tabs.products}!A1:H2000`);
  const sheetRows = parseSheet(raw);
  const odooRows = await fetchProducts();
  let applied = 0;
  let skipped = 0;
  const odooMap = new Map(odooRows.map(o => [o.default_code, o]));

  for (const row of sheetRows) {
    if (!row.default_code || !row.name) continue;
    const match = odooMap.get(row.default_code);

    // New product from sheet → create in Odoo
    if (!match) {
      try {
        let typeVal = row.type;
        let isStorable = false;
        if (typeVal === 'product') {
          typeVal = 'consu';
          isStorable = true;
        } else if (typeVal === 'consu') {
          typeVal = 'consu';
          isStorable = false;
        } else if (typeVal === 'service') {
          typeVal = 'service';
        } else if (typeVal === 'combo') {
          typeVal = 'combo';
        } else {
          typeVal = 'consu';
        }
        await odooCall('product.template', 'create', [{
          name: row.name, default_code: row.default_code,
          list_price: Number(row.list_price || 0), standard_price: Number(row.standard_price || 0),
          type: typeVal, is_storable: isStorable, description: row.description || '',
        }]);
        applied++;
      } catch (e) { skipped++; console.log(`  SKIP create ${row.default_code}: ${e.message}`); }
      continue;
    }

    // Existing → Odoo wins unless sheet is newer
    const sheetDate = row.write_date ? new Date(row.write_date) : null;
    const odooDate = match.write_date ? new Date(match.write_date) : null;
    if (sheetDate && odooDate && sheetDate > odooDate) {
      try {
        let typeVal = row.type || match.type;
        let isStorable = false;
        if (typeVal === 'product') {
          typeVal = 'consu';
          isStorable = true;
        } else if (typeVal === 'consu') {
          typeVal = 'consu';
          isStorable = false;
        } else if (typeVal === 'service') {
          typeVal = 'service';
        } else if (typeVal === 'combo') {
          typeVal = 'combo';
        } else {
          typeVal = 'consu';
        }
        await odooCall('product.template', 'write', [[match.id], {
          name: row.name, list_price: Number(row.list_price || 0), standard_price: Number(row.standard_price || 0),
          type: typeVal, is_storable: isStorable, description: row.description || '',
        }]);
        applied++;
      } catch (e) { skipped++; console.log(`  SKIP update ${row.default_code}: ${e.message}`); }
    } else {
      skipped++;
    }
  }

  return { applied, skipped };
}

// ── Log ───────────────────────────────────────────────────────

async function logSync(token, message) {
  await ensureSheet(token, CONFIG.tabs.log);
  await gs('post', `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetId}/values/${encodeURIComponent(CONFIG.tabs.log)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, token, {
    values: [[new Date().toISOString(), message]],
  });
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('1. Authenticating Odoo...');
  await odooAuth();
  console.log('   ✅ Odoo OK');

  console.log('2. Authenticating Google Sheets...');
  const token = await getGoogleAccessToken();
  console.log('   ✅ Google OK');

  console.log('3. Pushing Odoo → Sheet...');
  const pushed = await pushToSheet(token);
  console.log(`   ✅ Products: ${pushed.products} | Stock: ${pushed.stock} | Invoices: ${pushed.invoices} | PO: ${pushed.PO} | Receipts: ${pushed.receipts}`);

  console.log('4. Pulling Sheet → Odoo (Products)...');
  const pulled = await pullToOdoo(token);
  console.log(`   ✅ Applied: ${pulled.applied} | Skipped (Odoo wins): ${pulled.skipped}`);

  console.log('5. Logging sync...');
  await logSync(token, `sync ok | push P:${pushed.products} S:${pushed.stock} I:${pushed.invoices} PO:${pushed.PO} RC:${pushed.receipts} | pull applied:${pulled.applied} skipped:${pulled.skipped}`);
  console.log('   ✅ Done');

  console.log('\n📊 RESULT:', JSON.stringify({ ok: true, pushed, pulled }, null, 2));
}

main().catch(err => {
  console.error('❌ SYNC FAILED:', err.message || err);
  process.exit(1);
});
