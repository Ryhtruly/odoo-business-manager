// odoo_sync_production.js
// Workflow khép kín cho Odoo: Sản xuất -> Kho -> Bán hàng -> Hóa đơn -> Thanh toán -> Báo cáo

const axios = require('axios');

const ODOO_URL = 'https://quanly-san-xuat.odoo.com';
const DB_NAME = 'quanly-san-xuat';
const USERNAME = 'vanquyen607@gmail.com';
const PASSWORD = process.env.ODOO_PASSWORD || '123456789';

const PRODUCT_CODES = ['QA001','ASM001','QJ001','GT001','MLT001','TX001','DN001','VT001','KQ001','AK001','PHO001','BM001','TRASU001','SUC001','CAF001','SHIP001','CONS001','CBO001','CBO002'];

let cookieHeaders = [];
async function post(path, payload) {
  const url = ODOO_URL + path; // Construct the full URL
  console.log(`Attempting POST to: ${url}`); // Log the URL
  const res = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', Cookie: cookieHeaders.join('; ') },
    validateStatus: () => true,
  });
  const setCookie = res.headers['set-cookie'];
  if (setCookie) cookieHeaders = setCookie.map(x => x.split(';')[0]);
  const data = res.data;
  if (data && data.error) throw new Error(data.error.data?.message || data.error.message || JSON.stringify(data.error));
  return data.result;
}
async function call(model, method, args = [], kwargs = {}) {
  // This function always calls post with '/web/dataset/call_kw'
  return post('/web/dataset/call_kw', { jsonrpc:'2.0', method:'call', params:{ model, method, args, kwargs } });
}

async function authenticate() {
  console.log('Attempting authentication...');
  await post('/web/session/authenticate', { jsonrpc:'2.0', method:'call', params:{ db: DB_NAME, login: USERNAME, password: PASSWORD } });
  console.log('Authentication successful (or server error returned).');
}

async function ensureStock(productCode, qtyToAdd) {
  console.log(`Ensuring stock for ${productCode}...`);
  const found = await call('product.template', 'search_read', [], {domain:[['default_code','=',productCode]], fields:['id','name','default_code','product_variant_id','type'], limit:1 });
  if (!found.length) return { ok:false, reason:`missing product ${productCode}` };
  const product = found[0];
  const variantId = Array.isArray(product.product_variant_id) ? product.product_variant_id[0] : product.product_variant_id;
  const locs = await call('stock.location', 'search_read', [], {domain:[['usage','=','internal']], fields:['id','name'], limit:1 });
  const locationId = locs[0]?.id;
  if (!variantId || !locationId) return { ok:false, reason:`missing variant/location for ${productCode}` };
  const quants = await call('stock.quant', 'search_read', [], {domain:[['product_id','=',variantId],['location_id','=',locationId]], fields:['id','quantity'], limit:1 });
  if (quants.length) {
    const q = quants[0];
    const newQty = Number(q.quantity || 0) + qtyToAdd;
    await call('stock.quant', 'write', [[q.id], { quantity: newQty }]);
    return { ok:true, action:'updated', name: product.name, qty:newQty };
  }
  const quantId = await call('stock.quant', 'create', [{ product_id: variantId, location_id: locationId, quantity: qtyToAdd }]);
  return { ok:true, action:'created', name: product.name, qty:qtyToAdd, quantId };
}

async function salesReport() {
  console.log('Generating sales report...');
  const orders = await call('sale.order', 'search_read', [], { domain:[['state','in',['sale','done']]], fields:['id','name','amount_total','state','invoice_status'], limit:100, order:'id desc' });
  const invoices = await call('account.move', 'search_read', [], { domain:[['move_type','=','out_invoice']], fields:['id','name','amount_total','payment_state','invoice_date'], limit:100, order:'id desc' });
  console.log('Sales report generated.');
  return { orders, invoices };
}

async function main() {
  await authenticate();
  const results = [];
  for (const code of PRODUCT_CODES) {
    if (['SHIP001','CONS001','CBO001','CBO002'].includes(code)) continue;
    results.push(await ensureStock(code, 100));
  }
  const report = await salesReport();
  console.log(JSON.stringify({ results, salesCount: report.orders.length, invoiceCount: report.invoices.length, samples:{ orders: report.orders.slice(0,5), invoices: report.invoices.slice(0,5) } }, null, 2));
}

main().catch(err => {
  console.error('❌ Workflow error:', err.message || err);
  process.exit(1);
});