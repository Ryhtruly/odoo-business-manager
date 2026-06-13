// Create sample purchase orders and receipts on Odoo
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

function pick(arr, idx) { return arr[idx % arr.length]; }

async function ensureVendors() {
  let vendors = await call('res.partner', 'search_read', [], {
    domain: [['supplier_rank', '>', 0]],
    fields: ['id', 'name'],
    limit: 10,
  });
  if (vendors.length >= 2) return vendors;

  const names = ['Vendor A - Sample', 'Vendor B - Sample'];
  for (const name of names) {
    const existing = await call('res.partner', 'search_read', [], {
      domain: [['name', '=', name]],
      fields: ['id', 'name', 'supplier_rank'],
      limit: 1,
    });
    if (existing.length) continue;
    await call('res.partner', 'create', [{ name, supplier_rank: 1, is_company: true }]);
  }

  vendors = await call('res.partner', 'search_read', [], {
    domain: [['supplier_rank', '>', 0]],
    fields: ['id', 'name'],
    limit: 10,
  });
  return vendors;
}

async function main() {
  console.log('Auth...');
  await rpc('/web/session/authenticate', { jsonrpc: '2.0', method: 'call', params: { db: DB_NAME, login: USERNAME, password: getPassword() } });
  console.log('✅ authenticated');

  const products = await call('product.template', 'search_read', [], {
    domain: [['default_code', 'in', PRODUCT_CODES]],
    fields: ['id', 'name', 'default_code', 'product_variant_id'],
    limit: 20,
  });
  if (!products.length) throw new Error('No sample products found');
  console.log(`✅ found ${products.length} products`);

  const vendors = await ensureVendors();
  if (!vendors.length) throw new Error('No vendor available even after create');
  console.log(`✅ found ${vendors.length} vendors`);

  const purchaseIds = [];
  for (let i = 0; i < Math.min(2, vendors.length); i++) {
    const vendor = vendors[i];
    const p1 = pick(products, i);
    const p2 = pick(products, i + 3);
    const v1 = Array.isArray(p1.product_variant_id) ? p1.product_variant_id[0] : p1.product_variant_id;
    const v2 = Array.isArray(p2.product_variant_id) ? p2.product_variant_id[0] : p2.product_variant_id;

    const poId = await call('purchase.order', 'create', [{
      partner_id: vendor.id,
      order_line: [
        [0, 0, { product_id: v1, product_qty: 10 + i }],
        [0, 0, { product_id: v2, product_qty: 5 + i }],
      ],
    }]);
    console.log(`✅ purchase.order created: ${poId} for ${vendor.name}`);
    purchaseIds.push(poId);

    try {
      await call('purchase.order', 'button_confirm', [[poId]]);
      console.log(`✅ purchase.order confirmed: ${poId}`);
    } catch (e) {
      console.log(`⚠️ purchase confirm skipped for ${poId}: ${e.message}`);
    }
  }

  const receipts = await call('stock.picking', 'search_read', [], {
    domain: [['picking_type_code', '=', 'incoming']],
    fields: ['id', 'name', 'state', 'origin'],
    limit: 10,
    order: 'id desc',
  });

  console.log(JSON.stringify({ purchaseIds, receipts: receipts.slice(0, 5) }, null, 2));
}

main().catch(err => {
  console.error('❌ TEST FAILED:', err.message || err);
  process.exit(1);
});
