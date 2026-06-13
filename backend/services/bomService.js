const { odooCall } = require('./odooService');
const { loadProductionBomConfig } = require('./fileService');

function findLocalBomRule(product) {
  const bomConfig = loadProductionBomConfig();
  const productCode = product.default_code || '';
  const rules = Array.isArray(bomConfig.rules) ? bomConfig.rules : [];

  return rules.find(rule => {
    const match = rule.match || {};
    if (match.product_code && match.product_code === productCode) return true;
    if (match.product_code_prefix && productCode.startsWith(match.product_code_prefix)) return true;
    return false;
  });
}

async function getOdooBomLines(config, cookie, product, variantId) {
  try {
    const boms = await odooCall(config, 'mrp.bom', 'search_read', [], {
      domain: ['|', ['product_id', '=', variantId], ['product_tmpl_id', '=', product.id]],
      fields: ['id', 'product_qty'],
      limit: 1
    }, cookie);
    if (!boms || !boms.length) return null;

    const bom = boms[0];
    const bomQty = Number(bom.product_qty || 1) || 1;
    const bomLines = await odooCall(config, 'mrp.bom.line', 'search_read', [], {
      domain: [['bom_id', '=', bom.id]],
      fields: ['product_id', 'product_qty'],
      limit: 200
    }, cookie);
    if (!bomLines || !bomLines.length) return null;

    const variantIds = bomLines
      .map(line => Array.isArray(line.product_id) ? line.product_id[0] : line.product_id)
      .filter(Boolean);

    const rawProducts = await odooCall(config, 'product.product', 'search_read', [], {
      domain: [['id', 'in', variantIds]],
      fields: ['id', 'name', 'default_code'],
      limit: 200
    }, cookie);
    const rawMap = new Map(rawProducts.map(raw => [raw.id, raw]));

    return {
      source: 'odoo_mrp_bom',
      lines: bomLines.map(line => {
        const rawVariantId = Array.isArray(line.product_id) ? line.product_id[0] : line.product_id;
        const raw = rawMap.get(rawVariantId) || {};
        return {
          variantId: rawVariantId,
          name: raw.name || (Array.isArray(line.product_id) ? line.product_id[1] : ''),
          code: raw.default_code || '',
          qtyPerUnit: Number(line.product_qty || 0) / bomQty
        };
      }).filter(line => line.variantId && line.qtyPerUnit > 0)
    };
  } catch (e) {
    console.warn('Could not load Odoo MRP BOM, falling back to local BOM config:', e.message);
    return null;
  }
}

async function getLocalBomLines(config, cookie, product) {
  const rule = findLocalBomRule(product);
  const lines = rule && Array.isArray(rule.lines) ? rule.lines : [];
  if (!lines.length) return { source: 'missing_bom', lines: [] };

  const codes = lines.map(line => line.code).filter(Boolean);
  const rawTemplates = await odooCall(config, 'product.template', 'search_read', [], {
    domain: [['default_code', 'in', codes]],
    fields: ['id', 'name', 'default_code', 'product_variant_id'],
    limit: 200
  }, cookie);
  const rawMap = new Map(rawTemplates.map(raw => [raw.default_code, raw]));

  return {
    source: 'local_bom_config',
    lines: lines.map(line => {
      const raw = rawMap.get(line.code) || {};
      const variantId = Array.isArray(raw.product_variant_id) ? raw.product_variant_id[0] : raw.product_variant_id;
      return {
        variantId,
        name: raw.name || line.code,
        code: line.code,
        qtyPerUnit: Number(line.qty_per_unit || 0)
      };
    }).filter(line => line.variantId && line.qtyPerUnit > 0)
  };
}

async function resolveProductionBom(config, cookie, product, variantId) {
  const odooBom = await getOdooBomLines(config, cookie, product, variantId);
  if (odooBom && odooBom.lines.length) return odooBom;
  return getLocalBomLines(config, cookie, product);
}

module.exports = { resolveProductionBom };
