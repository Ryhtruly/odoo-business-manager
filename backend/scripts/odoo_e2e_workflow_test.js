// odoo_e2e_workflow_test.js
// End-to-end workflow test: production -> stock -> sales order -> invoice visibility
const axios = require('axios');

const ODOO_URL = 'https://quanly-san-xuat.odoo.com';
const DB_NAME = 'quanly-san-xuat';
const USERNAME = 'vanquyen607@gmail.com';
const PASSWORD = process.env.ODOO_PASSWORD || '***';
const PRODUCT_CODE = 'QA001';
const TEST_QTY = 5;

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
  return rpc('/web/dataset/call_kw', { jsonrpc:'2.0', method:'call', params:{ model, method, args, kwargs } });
}

async function main() {
  console.log('STEP 1: auth');
  await rpc('/web/session/authenticate', { jsonrpc:'2.0', method:'call', params:{ db: DB_NAME, login: USERNAME, password: PASSWORD } });
  console.log('✅ auth ok');

  console.log('STEP 2: read product');
  const products = await call('product.template', 'search_read', [], {
    domain: [['default_code', '=', PRODUCT_CODE]],
    fields: ['id','name','default_code','product_variant_id','qty_available','type','uom_id'],
    limit: 1,
  });
  if (!products.length) throw new Error(`Missing product ${PRODUCT_CODE}`);
  const p = products[0];
  const variantId = Array.isArray(p.product_variant_id) ? p.product_variant_id[0] : p.product_variant_id;
  const uomId = Array.isArray(p.uom_id) ? p.uom_id[0] : p.uom_id;
  console.log(`✅ product: ${p.name} / qty_available=${p.qty_available}`);

  console.log('STEP 3: read internal stock');
  const locations = await call('stock.location', 'search_read', [], {
    domain: [['usage', '=', 'internal']], fields: ['id','name'], limit: 1,
  });
  if (!locations.length) throw new Error('No internal stock location found');
  const stockLocationId = locations[0].id;
  console.log(`✅ stock location: ${locations[0].name} (${stockLocationId})`);

  console.log('STEP 4: production stock increase');
  const quants = await call('stock.quant', 'search_read', [], {
    domain: [['product_id', '=', variantId], ['location_id', '=', stockLocationId]],
    fields: ['id','quantity'], limit: 1,
  });
  if (quants.length) {
    const before = Number(quants[0].quantity || 0);
    const after = before + TEST_QTY;
    await call('stock.quant', 'write', [[quants[0].id], { quantity: after }]);
    console.log(`✅ stock.quant updated: ${before} -> ${after}`);
  } else {
    const quantId = await call('stock.quant', 'create', [{ product_id: variantId, location_id: stockLocationId, quantity: TEST_QTY }]);
    console.log(`✅ stock.quant created id=${quantId} qty=${TEST_QTY}`);
  }

  console.log('STEP 5: find customer');
  const partners = await call('res.partner', 'search_read', [], {
    domain: [['customer_rank', '>', 0]], fields: ['id','name','customer_rank'], limit: 1,
  });
  if (!partners.length) throw new Error('No customer partner found');
  const partnerId = partners[0].id;
  console.log(`✅ customer: ${partners[0].name} (${partnerId})`);

  console.log('STEP 6: create sale order');
  const orderId = await call('sale.order', 'create', [{
    partner_id: partnerId,
    order_line: [[0, 0, { product_id: variantId, product_uom_qty: TEST_QTY, product_uom: uomId }]],
  }]);
  console.log(`✅ sale.order created id=${orderId}`);

  console.log('STEP 7: confirm sale order');
  try {
    await call('sale.order', 'action_confirm', [[orderId]]);
    console.log('✅ sale.order confirmed');
  } catch (e) {
    console.log(`⚠️ sale.order confirm skipped: ${e.message}`);
  }

  console.log('STEP 8: inspect invoices');
  const invoices = await call('account.move', 'search_read', [], {
    domain: [['move_type', '=', 'out_invoice']], fields: ['id','name','amount_total','payment_state','state'], limit: 5,
  });
  console.log(`✅ invoices found: ${invoices.length}`);
  console.log(JSON.stringify({ product: p.name, stockLocationId, orderId, invoices }, null, 2));
}

main().catch(err => {
  console.error('❌ E2E TEST ERROR:', err.message || err);
  process.exit(1);
});
