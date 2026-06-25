const { odooCall } = require('../services/odooService');

/**
 * Query Odoo model stock.picking.type with domain [['code', '=', code]]
 * Lấy fields: id, name, default_location_src_id, default_location_dest_id
 * Nếu không tìm thấy → throw error với message hướng dẫn user vào Inventory > Configuration > Operation Types
 * Return object picking type đầu tiên
 */
async function getPickingType(config, cookie, code) {
  const results = await odooCall(config, 'stock.picking.type', 'search_read', [], {
    domain: [['code', '=', code]],
    fields: ['id', 'name', 'default_location_src_id', 'default_location_dest_id'],
    limit: 1
  }, cookie);

  if (!results || !results.length) {
    throw new Error(`Không tìm thấy Operation Type cho mã "${code}". Vui lòng kiểm tra và cấu hình trong Odoo tại Inventory > Configuration > Operation Types.`);
  }

  return results[0];
}

/**
 * Query Odoo model stock.location với domain [['usage', '=', 'internal']]
 * Nếu không tìm thấy → throw error yêu cầu tạo Warehouse trước
 * Return ID của location đầu tiên
 */
async function getInternalLocation(config, cookie) {
  const locs = await odooCall(config, 'stock.location', 'search_read', [], {
    domain: [['usage', '=', 'internal']],
    fields: ['id'],
    limit: 1
  }, cookie);

  if (!locs || !locs.length) {
    throw new Error('Không tìm thấy địa điểm kho nội bộ (internal location) nào. Vui lòng tạo Warehouse trước trong Odoo.');
  }

  return locs[0].id;
}

/**
 * Query Odoo model stock.picking.fields_get để check field tồn tại
 * Return 'move_ids' nếu Odoo version mới, 'move_lines' nếu Odoo cũ
 */
async function getMoveField(config, cookie) {
  const fields = await odooCall(config, 'stock.picking', 'fields_get', [[]], { attributes: ['type'] }, cookie);
  if (fields && fields.move_ids !== undefined) {
    return 'move_ids';
  }
  return 'move_lines';
}

module.exports = {
  getPickingType,
  getInternalLocation,
  getMoveField
};
