// Process assigned stock pickings to 'done' state
const { loadConfig } = require('../config/config');
const { odooCall, odooAuth } = require('../services/odooService');

let config;
let cookie = '';

async function call(model, method, args = [], kwargs = {}) {
  return odooCall(config, model, method, args, kwargs, cookie);
}

async function main() {
  config = loadConfig();
  console.log('Auth...');
  cookie = await odooAuth(config);
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
