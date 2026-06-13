const axios = require('axios');

const ODOO_URL = 'https://quanly-san-xuat.odoo.com';
const DB = 'quanly-san-xuat';
const LOGIN = 'vanquyen607@gmail.com';
const PASSWORD = process.env.ODOO_PASSWORD || '123456789@Quyen';
const PRODUCT_CODE = 'NON_VAN_QUYEN';
const CUSTOMER_NAME = 'Đạt';
const SHIP_ADDRESS = 'Gò Vấp';
const QTY = 10;
const COST = 100000;
const PRICE = 150000;

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
async function main() {
  console.log('AUTH...');
  await rpc('/web/session/authenticate', { jsonrpc: '2.0', method: 'call', params: { db: DB, login: LOGIN, password: PASSWORD } });
  console.log('AUTH OK');

  const product = await call('product.template', 'search_read', [], {
    domain: [['default_code', '=', PRODUCT_CODE]],
    fields: ['id', 'name', 'default_code', 'product_variant_id'],
    limit: 1,
  });
  if (!product.length) throw new Error(`Missing product ${PRODUCT_CODE}`);
  const p = product[0];
  const variantId = Array.isArray(p.product_variant_id) ? p.product_variant_id[0] : p.product_variant_id;
  console.log('PRODUCT', p.name, p.id, variantId);

  await call('product.template', 'write', [[p.id], { standard_price: COST, list_price: PRICE }]);
  console.log('UPDATED PRICE', COST, PRICE);

  let partners = await call('res.partner', 'search_read', [], {
    domain: [['name', '=', CUSTOMER_NAME]],
    fields: ['id', 'name'],
    limit: 1,
  });
  let partnerId;
  if (partners.length) {
    partnerId = partners[0].id;
  } else {
    partnerId = await call('res.partner', 'create', [{
      name: CUSTOMER_NAME,
      type: 'contact',
      street: SHIP_ADDRESS,
      customer_rank: 1,
    }]);
  }
  console.log('PARTNER', partnerId);

  const customer = await call('res.partner', 'read', [[partnerId], ['id', 'name', 'street']], {});
  console.log('CUSTOMER', JSON.stringify(customer[0]));

  const saleOrderId = await call('sale.order', 'create', [{
    partner_id: partnerId,
    client_order_ref: 'Gò Vấp',
    note: 'Giao hàng tại Gò Vấp',
    order_line: [[0, 0, {
      product_id: variantId,
      product_uom_qty: QTY,
      price_unit: PRICE,
    }]],
  }]);
  console.log('SALE_ORDER_ID', saleOrderId);

  let confirmed = false;
  try {
    await call('sale.order', 'action_confirm', [[saleOrderId]]);
    confirmed = true;
    console.log('SALE ORDER CONFIRMED');
  } catch (e) {
    console.log('CONFIRM SKIPPED', e.message);
  }

  let pickings = [];
  try {
    pickings = await call('stock.picking', 'search_read', [], {
      domain: [['origin', '=', `SO${saleOrderId}`]],
      fields: ['id', 'name', 'state', 'location_id', 'location_dest_id'],
      limit: 10,
      order: 'id desc',
    });
    console.log('PICKINGS', JSON.stringify(pickings, null, 2));
    for (const pk of pickings) {
      if (pk.state !== 'done') {
        try {
          await call('stock.picking', 'button_validate', [[pk.id]]);
          console.log('PICKING VALIDATED', pk.id);
        } catch (e) {
          console.log('PICKING VALIDATE SKIPPED', pk.id, e.message);
        }
      }
    }
  } catch (e) {
    console.log('PICKING SEARCH SKIPPED', e.message);
  }

  let invoiceId = null;
  try {
    invoiceId = await call('account.move', 'create', [{
      move_type: 'out_invoice',
      partner_id: partnerId,
      invoice_origin: `SO${saleOrderId}`,
      invoice_line_ids: [[0, 0, {
        product_id: variantId,
        quantity: QTY,
        price_unit: PRICE,
        name: p.name,
      }]],
    }]);
    console.log('DRAFT INVOICE CREATED', invoiceId);
  } catch (e) {
    console.log('DRAFT INVOICE CREATE FAILED', e.message);
  }

  try {
    if (invoiceId) {
      await call('account.move', 'action_post', [[invoiceId]]);
      console.log('INVOICE POSTED', invoiceId);
    }
  } catch (e) {
    console.log('INVOICE POST SKIPPED', e.message);
  }

  let invoices = [];
  try {
    const res = await call('sale.order', '_create_invoices', [[saleOrderId]]);
    console.log('CREATE INVOICE RESULT', JSON.stringify(res));
  } catch (e) {
    console.log('CREATE INVOICE SKIPPED', e.message);
    try {
      const res2 = await call('sale.order', 'action_invoice_create', [[saleOrderId]]);
      console.log('ALT CREATE INVOICE RESULT', JSON.stringify(res2));
    } catch (e2) {
      console.log('ALT CREATE INVOICE SKIPPED', e2.message);
    }
  }

  invoices = await call('account.move', 'search_read', [], {
    domain: [['move_type', '=', 'out_invoice']],
    fields: ['id', 'name', 'partner_id', 'amount_total', 'payment_state', 'state'],
    limit: 10,
    order: 'id desc',
  });
  console.log('INVOICES', JSON.stringify(invoices.slice(0, 5), null, 2));

  console.log(JSON.stringify({ product: p.name, partnerId, saleOrderId, confirmed, pickings, invoiceId, invoiceCount: invoices.length }, null, 2));
}
main().catch(err => { console.error('ERR', err.message || err); process.exit(1); });
