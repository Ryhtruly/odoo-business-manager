// Create sample sale orders on Odoo and verify workflow
const axios = require('axios');
const fs = require('fs');

const ODOO_URL = 'https://quanly-san-xuat.odoo.com';
const DB_NAME = 'quanly-san-xuat';
const USERNAME = 'vanquyen607@gmail.com';

const PRODUCT_CODES = ['QA001','ASM001','QJ001','GT001','MLT001','TX001','DN001','VT001','KQ001','AK001'];

function getPassword() {
  const txt = fs.readFileSync('C:/Users/Admin/.openclaw/workspace/skills/odoo-login.txt', 'utf8');
  const m = txt.match(/Mật khẩu\s*:\s*(.+)/i);
  if (!m) throw new Error('Missing password in odoo-login.txt');
  return m[1].trim();
}

let cookie = '';
async function rpc(path, payload) {
  const res = await axios.post(ODOO_URL + path, payload, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cookie ? { Cookie: cookie } : {}) },
    validateStatus: () => true,
  });
  const sc = res.headers['set-cookie'];
  if (sc && sc.length) cookie = sc.map(x => x.split(';')[0]).join('; ');
  const data = res.data;
  if (data && data.error) throw new Error(data.error.data?.message || data.error.message || JSON.stringify(data.error));
  return data.result;
}
async function call(model, method, args = [], kwargs = {}) {
  return rpc('/web/dataset/call_kw', { jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } });
}

function pick(arr, idx) {
  return arr[idx % arr.length];
}

async function main() {
  console.log('Auth...');
  await rpc('/web/session/authenticate', { jsonrpc: '2.0', method: 'call', params: { db: DB_NAME, login: USERNAME, password: getPassword() } });
  console.log('✅ authenticated');

  const products = await call('product.template', 'search_read', [], {
    domain: [['default_code', 'in', PRODUCT_CODES]],
    fields: ['id', 'name', 'default_code', 'product_variant_id', 'uom_id'],
    limit: 20,
  });
  if (!products.length) throw new Error('No sample products found');
  console.log(`✅ found ${products.length} products`);

  const customers = await call('res.partner', 'search_read', [], {
    domain: [['customer_rank', '>', 0]],
    fields: ['id', 'name'],
    limit: 10,
  });
  if (!customers.length) throw new Error('No customer found');
  console.log(`✅ found ${customers.length} customers`);

  const createdOrders = [];
  for (let i = 0; i < Math.min(3, customers.length); i++) {
    const customer = customers[i];
    const p1 = pick(products, i);
    const p2 = pick(products, i + 2);
    const v1 = Array.isArray(p1.product_variant_id) ? p1.product_variant_id[0] : p1.product_variant_id;
    const v2 = Array.isArray(p2.product_variant_id) ? p2.product_variant_id[0] : p2.product_variant_id;

    const orderId = await call('sale.order', 'create', [{
      partner_id: customer.id,
      order_line: [
        [0, 0, { product_id: v1, product_uom_qty: 2 + i }],
        [0, 0, { product_id: v2, product_uom_qty: 1 + i }],
      ],
    }]);
    console.log(`✅ sale.order created: ${orderId} for ${customer.name}`);
    createdOrders.push(orderId);
    try {
      await call('sale.order', 'action_confirm', [[orderId]]);
      console.log(`✅ sale.order confirmed: ${orderId}`);
    } catch (e) {
      console.log(`⚠️ confirm skipped for ${orderId}: ${e.message}`);
    }
  }

  const invoices = await call('account.move', 'search_read', [], {
    domain: [['move_type', '=', 'out_invoice']],
    fields: ['id', 'name', 'amount_total', 'payment_state', 'state', 'invoice_date'],
    limit: 10,
    order: 'id desc',
  });

  console.log(JSON.stringify({ createdOrders, invoices: invoices.slice(0, 5) }, null, 2));
}

main().catch(err => {
  console.error('❌ TEST FAILED:', err.message || err);
  process.exit(1);
});
