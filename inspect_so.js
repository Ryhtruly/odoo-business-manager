const { loadConfig } = require('./backend/config/config');
const { odooCall, odooAuth } = require('./backend/services/odooService');

async function checkModelSupport(config, model, cookie) {
  try {
    await odooCall(config, model, 'search_read', [], { limit: 1 }, cookie);
    return true;
  } catch (e) {
    return false;
  }
}

async function main() {
  try {
    const config = loadConfig();
    const cookie = await odooAuth(config);
    
    const supportsSO = await checkModelSupport(config, 'sale.order', cookie);
    console.log('SUPPORTS SO:', supportsSO);

    if (supportsSO) {
      const orders = await odooCall(config, 'sale.order', 'search_read', [], {
        domain: [],
        limit: 5,
        fields: ['id', 'name', 'date_order', 'write_date']
      }, cookie);
      console.log('ORDERS:', JSON.stringify(orders, null, 2));
    } else {
      const pickings = await odooCall(config, 'stock.picking', 'search_read', [], {
        domain: [['picking_type_code', '=', 'outgoing']],
        limit: 5,
        fields: ['id', 'name', 'scheduled_date', 'date_done', 'write_date']
      }, cookie);
      console.log('PICKINGS:', JSON.stringify(pickings, null, 2));
    }
  } catch (e) {
    console.error('ERROR:', e.message);
  }
}

main();
