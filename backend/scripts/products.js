const { loadConfig } = require('../config/config');
const { odooCall, odooAuth } = require('../services/odooService');

const products = [
  ['QA001','Quần áo','consu',80000,150000,'Cái','Hàng may mặc'],
  ['ASM001','Áo sơ mi','consu',120000,250000,'Cái','Hàng may mặc'],
  ['QJ001','Quần jean','consu',180000,350000,'Cái','Hàng may mặc'],
  ['GT001','Giày thể thao','consu',250000,500000,'Đôi','Hàng tiêu dùng'],
  ['MLT001','Mũ lưỡi trai','consu',30000,80000,'Cái','Hàng tiêu dùng'],
  ['TX001','Túi xách','consu',200000,450000,'Cái','Hàng tiêu dùng'],
  ['DN001','Dây nịt','consu',70000,120000,'Cái','Hàng tiêu dùng'],
  ['VT001','Vớ/Tất','consu',15000,30000,'Đôi','Hàng tiêu dùng'],
  ['KQ001','Khăn quàng','consu',40000,90000,'Cái','Hàng tiêu dùng'],
  ['AK001','Áo khoác','consu',350000,650000,'Cái','Hàng may mặc'],
  ['PHO001','Phở','consu',15000,30000,'Tô','Hàng ăn uống'],
  ['BM001','Bánh mì','consu',10000,25000,'Cái','Hàng ăn uống'],
  ['TRASU001','Trà sữa','consu',20000,40000,'Ly','Hàng ăn uống'],
  ['SUC001','Sữa chua','consu',8000,20000,'Hũ','Hàng ăn uống'],
  ['CAF001','Cà phê','consu',30000,50000,'Ly','Hàng ăn uống'],
  ['SHIP001','Phí vận chuyển','service',0,30000,'Lần','Dịch vụ'],
  ['CONS001','Tư vấn thời trang','service',0,200000,'Lần','Dịch vụ'],
  ['CBO001','Combo Bữa sáng','combo',20000,50000,'Set','Combo sản phẩm'],
  ['CBO002','Set Thời trang Nam','combo',400000,700000,'Set','Combo sản phẩm'],
  ['ST001','Nước suối','consu',3000,7000,'Chai','Đồ uống'],
  ['ST002','Nước ngọt cola','consu',7000,12000,'Chai','Đồ uống'],
  ['ST003','Nước ngọt cam','consu',7000,12000,'Chai','Đồ uống'],
  ['ST004','Nước tăng lực','consu',9000,15000,'Lon','Đồ uống'],
  ['ST005','Sữa tươi','consu',12000,18000,'Hộp','Đồ uống'],
  ['ST006','Sữa chua uống','consu',8000,14000,'Lốc','Đồ uống'],
  ['ST007','Cà phê lon','consu',10000,16000,'Lon','Đồ uống'],
  ['ST008','Trà xanh chai','consu',7000,13000,'Chai','Đồ uống'],
  ['ST009','Bia lon','consu',12000,18000,'Lon','Đồ uống'],
  ['ST010','Bánh quy','consu',10000,18000,'Gói','Đồ ăn vặt'],
  ['ST011','Kẹo dẻo','consu',5000,10000,'Gói','Đồ ăn vặt'],
  ['ST012','Sô cô la','consu',12000,22000,'Thanh','Đồ ăn vặt'],
  ['ST013','Mì tôm','consu',4000,7000,'Gói','Thực phẩm khô'],
  ['ST014','Phở gói','consu',5000,9000,'Gói','Thực phẩm khô'],
  ['ST015','Bún gói','consu',5000,9000,'Gói','Thực phẩm khô'],
  ['ST016','Gạo thơm','consu',18000,28000,'Kg','Thực phẩm khô'],
  ['ST017','Muối ăn','consu',3000,5000,'Gói','Gia vị'],
  ['ST018','Đường cát','consu',10000,16000,'Gói','Gia vị'],
  ['ST019','Bột ngọt','consu',12000,19000,'Gói','Gia vị'],
  ['ST020','Nước mắm','consu',15000,25000,'Chai','Gia vị'],
  ['ST021','Dầu ăn','consu',22000,32000,'Chai','Gia vị'],
  ['ST022','Xà phòng giặt','consu',18000,28000,'Gói','Giặt tẩy'],
  ['ST023','Nước rửa chén','consu',14000,22000,'Chai','Giặt tẩy'],
  ['ST024','Bột giặt','consu',20000,30000,'Gói','Giặt tẩy'],
  ['ST025','Nước lau sàn','consu',16000,26000,'Chai','Giặt tẩy'],
  ['ST026','Khăn giấy','consu',8000,14000,'Lốc','Tiêu dùng nhanh'],
  ['ST027','Giấy vệ sinh','consu',12000,20000,'Lốc','Tiêu dùng nhanh'],
  ['ST028','Bàn chải đánh răng','consu',7000,12000,'Cái','Chăm sóc cá nhân'],
  ['ST029','Kem đánh răng','consu',15000,25000,'Tuýp','Chăm sóc cá nhân'],
  ['ST030','Dầu gội đầu','consu',25000,40000,'Chai','Chăm sóc cá nhân'],
  ['ST031','Sữa tắm','consu',22000,38000,'Chai','Chăm sóc cá nhân'],
  ['ST032','Lược chải tóc','consu',5000,10000,'Cái','Chăm sóc cá nhân'],
  ['ST033','Khẩu trang','consu',2000,5000,'Cái','Chăm sóc cá nhân'],
  ['ST034','Găng tay nilon','consu',3000,7000,'Bộ','Nhà bếp'],
  ['ST035','Rau xanh','consu',6000,10000,'Mớ','Thực phẩm tươi'],
  ['ST036','Cà chua','consu',7000,12000,'Kg','Thực phẩm tươi'],
  ['ST037','Dưa leo','consu',6000,10000,'Kg','Thực phẩm tươi'],
  ['ST038','Hành tím','consu',10000,16000,'Kg','Thực phẩm tươi'],
  ['ST039','Tỏi','consu',12000,18000,'Kg','Thực phẩm tươi'],
  ['ST040','Trứng gà','consu',20000,30000,'Vỉ','Thực phẩm tươi'],
  ['ST041','Thịt heo','consu',90000,120000,'Kg','Thực phẩm tươi'],
  ['ST042','Cá hồi','consu',180000,230000,'Kg','Thực phẩm tươi'],
  ['ST043','Tôm đông lạnh','consu',150000,200000,'Kg','Thực phẩm đông lạnh'],
  ['ST044','Thịt bò','consu',140000,190000,'Kg','Thực phẩm tươi'],
  ['ST045','Bánh mì sandwich','consu',12000,20000,'Gói','Đồ ăn nhanh'],
  ['ST046','Snack khoai tây','consu',8000,14000,'Gói','Đồ ăn vặt'],
  ['ST047','Cháo gói','consu',5000,9000,'Gói','Thực phẩm khô'],
  ['ST048','Sữa đặc','consu',18000,28000,'Lon','Đồ uống'],
  ['ST049','Cá hộp','consu',14000,22000,'Lon','Đồ hộp'],
  ['ST050','Nước rửa tay','consu',12000,20000,'Chai','Vệ sinh cá nhân'],
];

async function main() {
  const config = loadConfig();
  console.log('Authenticating...');
  const cookie = await odooAuth(config);
  console.log('Authentication successful.');

  const locs = await odooCall(config, 'stock.location', 'search_read', [], {
    domain: [['usage', '=', 'internal']],
    fields: ['id', 'name'],
    limit: 1
  }, cookie);
  const locationId = locs[0]?.id;

  let updated = 0, created = 0, stockOk = 0, stockFail = 0;
  const failed = [];

  // Step 1: Create or update non-combo products
  console.log('Processing non-combo products...');
  for (const [code, name, type, cost, price, uom, note] of products) {
    if (type === 'combo') continue;
    try {
      const vals = { name, default_code: code, type, list_price: price, standard_price: cost, description: note };
      if (type === 'consu') vals.is_storable = true;
      const existing = await odooCall(config, 'product.template', 'search_read', [], {
        domain: [['default_code', '=', code]],
        fields: ['id', 'name', 'default_code', 'product_variant_id'],
        limit: 20
      }, cookie);
      
      let tmplId;
      if (existing.length) {
        const ids = existing.map(x => x.id);
        await odooCall(config, 'product.template', 'write', [ids, vals], {}, cookie);
        tmplId = existing[0].id;
        updated += existing.length;
      } else {
        tmplId = await odooCall(config, 'product.template', 'create', [vals], {}, cookie);
        created++;
      }

      // Step 2: Adjust Stock levels for consu
      if (type === 'consu' && locationId) {
        const prod = (await odooCall(config, 'product.template', 'read', [[tmplId], ['product_variant_id']], {}, cookie))[0];
        const variantId = Array.isArray(prod.product_variant_id) ? prod.product_variant_id[0] : prod.product_variant_id;
        if (variantId) {
          try {
            const quants = await odooCall(config, 'stock.quant', 'search_read', [], {
              domain: [['product_id', '=', variantId], ['location_id', '=', locationId]],
              fields: ['id', 'quantity'],
              limit: 1
            }, cookie);
            if (quants.length) {
              await odooCall(config, 'stock.quant', 'write', [[quants[0].id], { quantity: 100, inventory_quantity_set: true }], {}, cookie);
            } else {
              await odooCall(config, 'stock.quant', 'create', [{ product_id: variantId, location_id: locationId, quantity: 100, inventory_quantity_set: true }], {}, cookie);
            }
            stockOk++;
          } catch (e) {
            stockFail++;
          }
        }
      }
    } catch (e) {
      failed.push({ code, name, error: e.message });
    }
  }

  // Step 3: Find and clean duplicates
  console.log('Cleaning duplicates...');
  const allTemplates = await odooCall(config, 'product.template', 'search_read', [], {
    domain: [['default_code', '!=', false]],
    fields: ['id', 'default_code', 'qty_available'],
    limit: 1000,
    order: 'id asc'
  }, cookie);

  const byCode = {};
  for (const p of allTemplates) {
    if (!byCode[p.default_code]) byCode[p.default_code] = [];
    byCode[p.default_code].push(p);
  }

  let deletedCount = 0;
  const deleteIds = [];
  for (const [code, arr] of Object.entries(byCode)) {
    if (code === 'false' || arr.length < 2) continue;
    arr.sort((a, b) => (b.qty_available || 0) - (a.qty_available || 0));
    const toDel = arr.slice(1).map(x => x.id);
    if (toDel.length) {
      try {
        await odooCall(config, 'product.template', 'unlink', [toDel], {}, cookie);
        deletedCount += toDel.length;
        deleteIds.push(...toDel);
      } catch (e) {
        console.error('Failed to delete duplicate for', code, e.message);
      }
    }
  }

  // Step 4: Handle combo products
  console.log('Processing combo products...');
  const comboResults = [];
  
  // Find storable products and get their variant IDs
  const storableGoods = await odooCall(config, 'product.template', 'search_read', [], {
    domain: [['type', '=', 'consu']],
    fields: ['id', 'name', 'product_variant_id'],
    limit: 3
  }, cookie);

  const resolvedGoods = [];
  for (const g of storableGoods) {
    const varId = Array.isArray(g.product_variant_id) ? g.product_variant_id[0] : g.product_variant_id;
    if (varId) resolvedGoods.push(varId);
  }

  for (const [code, name, type, cost, price, uom, note] of products) {
    if (type !== 'combo') continue;
    try {
      const existing = await odooCall(config, 'product.template', 'search_read', [], {
        domain: [['default_code', '=', code]],
        fields: ['id', 'name', 'combo_ids'],
        limit: 1
      }, cookie);

      let tmplId;
      if (existing.length) {
        tmplId = existing[0].id;
        const c = existing[0];
        const existingCombos = Array.isArray(c.combo_ids) ? c.combo_ids.filter(x => typeof x === 'number') : [];
        
        // Update template fields
        await odooCall(config, 'product.template', 'write', [[tmplId], { name, list_price: price, standard_price: cost, description: note }], {}, cookie);
        
        if (existingCombos.length > 0) {
          comboResults.push({ name, id: tmplId, ok: true, note: 'already linked to ' + existingCombos.length + ' combo(s)' });
        } else {
          // No combo items exist, create them
          if (resolvedGoods.length < 2) {
            comboResults.push({ name, id: tmplId, ok: false, error: 'Need >=2 consu products' });
            continue;
          }
          const comboId = await odooCall(config, 'product.combo', 'create', [{ name }], {}, cookie);
          for (let i = 0; i < 2; i++) {
            await odooCall(config, 'product.combo.item', 'create', [{ combo_id: comboId, product_id: resolvedGoods[i] }], {}, cookie);
          }
          await odooCall(config, 'product.template', 'write', [[tmplId], { combo_ids: [[6, false, [comboId]]] }], {}, cookie);
          comboResults.push({ name, id: tmplId, ok: true, note: 'created and linked new combo items' });
        }
      } else {
        // Create new combo flow
        if (resolvedGoods.length < 2) {
          comboResults.push({ name, code, ok: false, error: 'Need >=2 consu products to form a combo' });
          continue;
        }
        const comboId = await odooCall(config, 'product.combo', 'create', [{ name }], {}, cookie);
        for (let i = 0; i < 2; i++) {
          await odooCall(config, 'product.combo.item', 'create', [{ combo_id: comboId, product_id: resolvedGoods[i] }], {}, cookie);
        }
        tmplId = await odooCall(config, 'product.template', 'create', [{
          name,
          default_code: code,
          type: 'combo',
          list_price: price,
          standard_price: cost,
          description: note,
          combo_ids: [[6, false, [comboId]]]
        }], {}, cookie);
        comboResults.push({ name, id: tmplId, ok: true, note: 'created new combo template' });
      }
    } catch (e) {
      comboResults.push({ name, code, ok: false, error: e.message });
    }
  }

  // Step 5: Verification
  const check = await odooCall(config, 'product.template', 'search_read', [], {
    domain: [['default_code', 'in', products.map(p => p[0])]],
    fields: ['id', 'name', 'default_code', 'type', 'is_storable', 'qty_available'],
    limit: 100,
    order: 'default_code asc'
  }, cookie);

  const totalCount = await odooCall(config, 'product.template', 'search_count', [], {
    domain: [['default_code', '!=', false]]
  }, cookie);

  console.log(JSON.stringify({
    summary: {
      nonCombo: { created, updated, stockOk, stockFail },
      duplicatesDeleted: deletedCount,
      duplicatesDeletedIds: deleteIds.slice(0, 30),
      combos: comboResults,
      totalCount,
      failedList: failed
    },
    sample: check.slice(0, 15)
  }, null, 2));
}

main().catch(e => {
  console.error(e.stack || e.message);
  process.exit(1);
});
