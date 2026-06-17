const axios = require('axios');

// In-memory Odoo Session Cache
let cachedCookie = null;
let cachedCookieKey = null;
let cachedCookieTime = 0;
const SESSION_TTL = 20 * 60 * 1000; // 20 minutes

function clearOdooSessionCache() {
  cachedCookie = null;
  cachedCookieKey = null;
  cachedCookieTime = 0;
  console.log('Odoo session cache cleared.');
}

async function odooRpc(config, path, payload, sessionCookie = '') {
  const url = config.odooUrl + path;
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (sessionCookie) {
    headers['Cookie'] = sessionCookie;
  }
  
  const res = await axios.post(url, payload, {
    headers,
    timeout: 15000,
    validateStatus: () => true
  });
  
  let cookie = '';
  const sc = res.headers['set-cookie'];
  if (sc && sc.length) {
    cookie = sc.map(x => x.split(';')[0]).join('; ');
  }
  
  if (res.data && res.data.error) {
    throw new Error(res.data.error.data?.message || res.data.error.message || JSON.stringify(res.data.error));
  }
  
  return { result: res.data.result, cookie };
}

async function odooAuth(config) {
  const now = Date.now();
  const cacheKey = `${config.odooUrl}-${config.db}-${config.login}-${config.password}`;
  if (cachedCookie && cachedCookieKey === cacheKey && (now - cachedCookieTime < SESSION_TTL)) {
    return cachedCookie;
  }

  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: { db: config.db, login: config.login, password: config.password }
  };
  try {
    console.log(`Authenticating Odoo session for db: ${config.db}...`);
    const { cookie } = await odooRpc(config, '/web/session/authenticate', payload);
    if (!cookie) throw new Error('Failed to obtain session cookie from Odoo');
    
    cachedCookie = cookie;
    cachedCookieKey = cacheKey;
    cachedCookieTime = now;
    
    return cookie;
  } catch (error) {
    console.error('Odoo authentication failed for database:', config.db, 'URL:', config.odooUrl, 'login:', config.login, 'error:', error.message);
    throw error;
  }
}

async function odooCall(config, model, method, args = [], kwargs = {}, sessionCookie = '') {
  const cookie = sessionCookie || await odooAuth(config);
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: { model, method, args, kwargs }
  };
  try {
    const { result } = await odooRpc(config, '/web/dataset/call_kw', payload, cookie);
    return result;
  } catch (error) {
    // If it is a session expired error and we used a cached cookie, retry once with a fresh login
    const isExpired = error.message.includes('Session Expired') || 
                      error.message.includes('expired') || 
                      error.message.includes('UID') ||
                      error.message.includes('not logged in');
    if (isExpired && !sessionCookie) {
      console.warn('Odoo session expired/invalid. Retrying with fresh login...');
      clearOdooSessionCache();
      const newCookie = await odooAuth(config);
      const { result } = await odooRpc(config, '/web/dataset/call_kw', payload, newCookie);
      return result;
    }
    throw error;
  }
}

async function resolveProductVariant(config, templateId, cookie) {
  const prods = await odooCall(config, 'product.template', 'search_read', [], {
    domain: [['id', '=', Number(templateId)]],
    fields: ['id', 'product_variant_id'],
    limit: 1
  }, cookie);
  if (!prods || !prods.length) {
    throw new Error(`Product template ID ${templateId} not found`);
  }
  const product = prods[0];
  const variantId = Array.isArray(product.product_variant_id) ? product.product_variant_id[0] : product.product_variant_id;
  if (!variantId) {
    throw new Error(`Product variant not found for template ID ${templateId}`);
  }
  return variantId;
}

module.exports = {
  odooRpc,
  odooCall,
  odooAuth,
  resolveProductVariant,
  clearOdooSessionCache
};
