// Process assigned stock pickings to 'done' state
const axios = require('axios');
const fs = require('fs');

const ODOO_URL = 'https://quanly-san-xuat.odoo.com';
const DB_NAME = 'quanly-san-xuat';
const USERNAME = 'vanquyen607@gmail.com';

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

async function main() {
  console.log('Auth...');
  await rpc('/web/session/authenticate', { jsonrpc: '2.0', method: 'call', params: { db: DB_NAME, login: USERNAME, password: getPassword() } });
  console.log('✅ authenticated');

  const pickings = await call('stock.picking', 'search_read', [], {
    domain: [['picking_type_code', '=', 'incoming'], ['state', '=', 'assigned']],
    fields: ['id', 'name', 'state', 'origin'],
    limit: 10,
  });

  console.log(`Found ${pickings.length} assigned incoming pickings.`);

  for (const picking of pickings) {
    console.log(`Validating picking ${picking.name} (ID: ${picking.id})...`);
    try {
      await call('stock.picking', 'button_validate', [[picking.id]], { context: { skip_immediate: true, skip_backorder: true } });
      console.log(`  ✅ Picking ${picking.name} validated to 'done'.`);
    } catch (e) {
      console.log(`  ❌ Failed to validate picking ${picking.name}: ${e.message}`);
    }
  }

  console.log('Processing complete.');
}

main().catch(err => {
  console.error('❌ SCRIPT FAILED:', err.message || err);
  process.exit(1);
});
