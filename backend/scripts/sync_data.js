// odoo_gsheet_bidirectional_sync.js
// 2-way sync: Odoo <-> Google Sheets | Odoo wins on conflicts
// Scope: Products, Stock (quant), Invoices (account.move)
//
// Run: node odoo_gsheet_bidirectional_sync.js

const { loadConfig } = require('../config/config');
const { odooCall: serviceCall, odooAuth: serviceAuth, odooRpc: serviceRpc } = require('../services/odooService');
const { getGoogleAccessToken, ensureSheet, clearAndWrite, readRange, parseSheet, gs } = require('../services/googleSheetsService');

const CONFIG = {
  sheetId: process.env.GSHEET_ID || '1Jzw_V9e4Gfw1QKr11YIa9SVLqaLwvD8cH7dZ7HgWGYE',
  credsPath: process.env.GOOGLE_CREDENTIALS || 'google-credentials.json',
  tabs: { products: 'Products', stock: 'Stock', invoices: 'Invoices', po: 'PO', receipts: 'Receipts', log: 'Sync_Log' },
};

let config;
let cookie = '';

// ── Odoo helpers ──────────────────────────────────────────────

async function odooRpc(path, payload) {
  const { result, cookie: newCookie } = await serviceRpc(config, path, payload, cookie);
  if (newCookie) cookie = newCookie;
  return result;
}

async function odooCall(model, method, args = [], kwargs = {}) {
  return serviceCall(config, model, method, args, kwargs, cookie);
}

async function odooAuth() {
  cookie = await serviceAuth(config);
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
  await ensureSheet(CONFIG.sheetId, token, CONFIG.tabs.products);
  await ensureSheet(CONFIG.sheetId, token, CONFIG.tabs.stock);
  await ensureSheet(CONFIG.sheetId, token, CONFIG.tabs.invoices);
  await ensureSheet(CONFIG.sheetId, token, CONFIG.tabs.po);
  await ensureSheet(CONFIG.sheetId, token, CONFIG.tabs.receipts);

  const products = await fetchProducts();
  await clearAndWrite(CONFIG.sheetId, token, `${CONFIG.tabs.products}!A1`, [
    ['default_code', 'name', 'list_price', 'standard_price', 'type', 'description', 'write_date', 'source'],
    ...products.map(r => [r.default_code, r.name, r.list_price, r.standard_price, r.type, r.description, r.write_date, r.source]),
  ]);

  const stock = await fetchStock();
  await clearAndWrite(CONFIG.sheetId, token, `${CONFIG.tabs.stock}!A1`, [
    ['id', 'product_code', 'product_name', 'location', 'usage', 'quantity', 'write_date', 'source'],
    ...stock.map(r => [r.id, r.product_code, r.product_name, r.location, r.usage, r.quantity, r.write_date, r.source]),
  ]);

  const invoices = await fetchInvoices();
  await clearAndWrite(CONFIG.sheetId, token, `${CONFIG.tabs.invoices}!A1`, [
    ['id', 'invoice_number', 'partner', 'amount_total', 'amount_residual', 'payment_state', 'state', 'invoice_date', 'write_date', 'source'],
    ...invoices.map(r => [r.id, r.invoice_number, r.partner, r.amount_total, r.amount_residual, r.payment_state, r.state, r.invoice_date, r.write_date, r.source]),
  ]);

  const pos = await fetchPO();
  await clearAndWrite(CONFIG.sheetId, token, `${CONFIG.tabs.po}!A1`, [
    ['id', 'po_number', 'vendor', 'amount_total', 'state', 'date_order', 'write_date', 'source'],
    ...pos.map(r => [r.id, r.po_number, r.vendor, r.amount_total, r.state, r.date_order, r.write_date, r.source]),
  ]);

  const receipts = await fetchReceipts();
  await clearAndWrite(CONFIG.sheetId, token, `${CONFIG.tabs.receipts}!A1`, [
    ['id', 'receipt_number', 'origin', 'vendor', 'state', 'scheduled_date', 'write_date', 'source'],
    ...receipts.map(r => [r.id, r.receipt_number, r.origin, r.vendor, r.state, r.scheduled_date, r.write_date, r.source]),
  ]);

  return { products: products.length, stock: stock.length, invoices: invoices.length, PO: pos.length, receipts: receipts.length };
}

// ── Pull Sheet → Odoo (Products only — stock/invoices read-only) ──

async function pullToOdoo(token) {
  const raw = await readRange(CONFIG.sheetId, token, `${CONFIG.tabs.products}!A1:H2000`);
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
  await ensureSheet(CONFIG.sheetId, token, CONFIG.tabs.log);
  await gs('post', `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetId}/values/${encodeURIComponent(CONFIG.tabs.log)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, token, {
    values: [[new Date().toISOString(), message]],
  });
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  config = loadConfig();
  if (config.sheetId) {
    CONFIG.sheetId = config.sheetId;
  }
  console.log('1. Authenticating Odoo...');
  await odooAuth();
  console.log('   ✅ Odoo OK');

  console.log('2. Authenticating Google Sheets...');
  const token = await getGoogleAccessToken(config, CONFIG.credsPath);
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
