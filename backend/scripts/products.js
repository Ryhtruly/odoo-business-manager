const { loadConfig } = require('../config/config');
const { odooCall, odooAuth } = require('../services/odooService');

// Construction industry products mapping strictly to 3 categories:
// - raw_material: purchase_ok = true, sale_ok = false (Nguyên vật liệu)
// - manufactured: purchase_ok = false, sale_ok = true (Thành phẩm)
// - trading: purchase_ok = true, sale_ok = true (Hàng hóa thương mại)
// Column 8 maps the product to its default vendor name (null for manufactured/finished products)
const products = [
  // 1. Nguyên vật liệu (Raw Materials)
  ['XD-XM-001', 'Xi măng Nghi Sơn PCB40', 'raw_material', 78000, 95000, 'Bao', 'Vật liệu xây dựng cơ bản', 'Công ty Xi măng Vicem Hà Tiên'],
  ['XD-XM-002', 'Xi măng Hà Tiên Đa Dụng', 'raw_material', 82000, 99000, 'Bao', 'Vật liệu xây dựng cơ bản', 'Công ty Xi măng Vicem Hà Tiên'],
  ['XD-CAT-001', 'Cát xây tô', 'raw_material', 180000, 240000, 'Khối', 'Cát mịn phục vụ xây tô tường', 'Tổng Kho Cát Đá Xây Dựng Bình Dương'],
  ['XD-CAT-002', 'Cát bê tông', 'raw_material', 220000, 280000, 'Khối', 'Cát hạt lớn đổ bê tông chịu lực', 'Tổng Kho Cát Đá Xây Dựng Bình Dương'],
  ['XD-DA-001', 'Đá xây dựng 1x2', 'raw_material', 280000, 350000, 'Khối', 'Đá cốt liệu đổ bê tông', 'Tổng Kho Cát Đá Xây Dựng Bình Dương'],
  ['XD-DA-002', 'Đá dăm 4x6', 'raw_material', 240000, 310000, 'Khối', 'Đá làm móng đường, móng nhà', 'Tổng Kho Cát Đá Xây Dựng Bình Dương'],
  ['XD-THEP-001', 'Thép cuộn Phi 6 Hòa Phát', 'raw_material', 12000, 15000, 'Kg', 'Thép cuộn xây dựng Hòa Phát', 'Công ty Cổ phần Tập đoàn Hòa Phát'],
  ['XD-THEP-002', 'Thép cây Phi 10 Hòa Phát', 'raw_material', 75000, 92000, 'Cây', 'Thép thanh vằn D10 Hòa Phát', 'Công ty Cổ phần Tập đoàn Hòa Phát'],
  ['XD-THEP-003', 'Thép cây Phi 12 Hòa Phát', 'raw_material', 115000, 138000, 'Cây', 'Thép thanh vằn D12 Hòa Phát', 'Công ty Cổ phần Tập đoàn Hòa Phát'],
  ['XD-THEP-004', 'Thép cây Phi 16 Hòa Phát', 'raw_material', 185000, 218000, 'Cây', 'Thép thanh vằn D16 Hòa Phát', 'Công ty Cổ phần Tập đoàn Hòa Phát'],
  ['XD-GACH-001', 'Gạch ống 4 lỗ 8x8x18', 'raw_material', 1100, 1500, 'Viên', 'Gạch ống Tuynel xây tường bao', 'Tổng Kho Cát Đá Xây Dựng Bình Dương'],
  ['XD-GACH-002', 'Gạch đinh đặc 4x8x18', 'raw_material', 1300, 1800, 'Viên', 'Gạch đinh chịu lực móng và đai cột', 'Tổng Kho Cát Đá Xây Dựng Bình Dương'],
  ['XD-SON-001', 'Bột trét tường Dulux', 'raw_material', 280000, 350000, 'Bao', 'Bột trét tường hoàn thiện nội ngoại thất', 'Đại Lý Gạch Men & Thiết Bị Vệ Sinh Thanh Phát'],
  ['XD-SON-002', 'Sơn lót chống kiềm Dulux 18L', 'raw_material', 1250000, 1580000, 'Thùng', 'Sơn lót kháng kiềm cao cấp', 'Đại Lý Gạch Men & Thiết Bị Vệ Sinh Thanh Phát'],
  ['XD-SON-003', 'Sơn ngoại thất Dulux WeatherShield 18L', 'raw_material', 2450000, 2980000, 'Thùng', 'Sơn phủ ngoại thất siêu bền bỉ', 'Đại Lý Gạch Men & Thiết Bị Vệ Sinh Thanh Phát'],
  ['XD-NUOC-001', 'Ống nhựa Bình Minh Phi 90', 'raw_material', 85000, 110000, 'Cây', 'Ống nhựa PVC cấp thoát nước', 'Công ty TNHH Thiết Bị Điện Nước Hoàng Nam'],
  ['XD-NUOC-002', 'Keo dán ống nhựa Bình Minh', 'raw_material', 18000, 25000, 'Tuýp', 'Keo dán chuyên dụng ống PVC', 'Công ty TNHH Thiết Bị Điện Nước Hoàng Nam'],
  ['XD-DIEN-001', 'Dây cáp điện Cadivi 2.5 mm2', 'raw_material', 8000, 11000, 'Mét', 'Dây điện đơn lõi đồng đi ngầm', 'Công ty TNHH Thiết Bị Điện Nước Hoàng Nam'],
  ['XD-DIEN-002', 'Dây cáp điện Cadivi 1.5 mm2', 'raw_material', 5500, 7800, 'Mét', 'Dây điện đơn lõi đồng đi đèn chiếu sáng', 'Công ty TNHH Thiết Bị Điện Nước Hoàng Nam'],
  ['XD-DIEN-003', 'Ống luồn dây điện Phi 20', 'raw_material', 12000, 18000, 'Cây', 'Ống luồn dây điện chống cháy', 'Công ty TNHH Thiết Bị Điện Nước Hoàng Nam'],

  // 2. Thành phẩm (Manufactured Goods)
  ['XD-TP-BTONG-001', 'Trụ bê tông đúc sẵn 150x150x3000', 'manufactured', 450000, 650000, 'Trụ', 'Trụ bê tông rào cốt thép', null],
  ['XD-TP-BTONG-002', 'Dầm bê tông chịu lực đúc sẵn', 'manufactured', 620000, 880000, 'Dầm', 'Cấu kiện dầm ngang bê tông đúc sẵn', null],
  ['XD-TP-GEL-001', 'Hộp gel kỹ thuật đúc sẵn', 'manufactured', 350000, 520000, 'Khối', 'Cột kỹ thuật đúc sẵn bảo vệ đường dây', null],
  ['XD-TP-CUA-001', 'Khung cửa sắt mạ kẽm gia công 1.2x2.2m', 'manufactured', 850000, 1250000, 'Bộ', 'Cửa sắt bảo vệ gia công tại xưởng', null],
  ['XD-TP-RAO-001', 'Hàng rào lưới thép hàn mạ kẽm', 'manufactured', 150000, 230000, 'Mét', 'Hàng rào bảo vệ lưới hàn', null],
  ['XD-TP-COFA-001', 'Tấm cốp pha sắt gia công 1.0x0.5m', 'manufactured', 180000, 260000, 'Tấm', 'Cốp pha định hình bê tông', null],

  // 3. Hàng hóa thương mại (Trading Goods)
  ['XD-TM-VS-001', 'Bồn cầu một khối TOTO MS885DT8', 'trading', 5200000, 6800000, 'Bộ', 'Thiết bị vệ sinh cao cấp TOTO', 'Đại Lý Gạch Men & Thiết Bị Vệ Sinh Thanh Phát'],
  ['XD-TM-VS-002', 'Chậu rửa mặt lavabo TOTO L762', 'trading', 1800000, 2400000, 'Bộ', 'Thiết bị vệ sinh cao cấp TOTO', 'Đại Lý Gạch Men & Thiết Bị Vệ Sinh Thanh Phát'],
  ['XD-TM-SEN-001', 'Vòi sen tắm nóng lạnh INAX LFV-1112S', 'trading', 1250000, 1750000, 'Bộ', 'Vòi sen tắm INAX Nhật Bản', 'Đại Lý Gạch Men & Thiết Bị Vệ Sinh Thanh Phát'],
  ['XD-TM-GACH-001', 'Gạch men lát nền Prime 60x60', 'trading', 135000, 185000, 'Hộp', 'Gạch granite chống trầy xước', 'Đại Lý Gạch Men & Thiết Bị Vệ Sinh Thanh Phát'],
  ['XD-TM-DEN-001', 'Đèn LED âm trần Philips 9W', 'trading', 95000, 135000, 'Cái', 'Đèn LED Downlight tiết kiệm điện', 'Công ty TNHH Thiết Bị Điện Nước Hoàng Nam'],
  ['XD-TM-DEN-002', 'Đèn tuýp LED Philips 1.2m 18W', 'trading', 110000, 160000, 'Cái', 'Đèn tuýp LED Philips sáng trắng', 'Công ty TNHH Thiết Bị Điện Nước Hoàng Nam'],
  ['XD-TM-DIEN-001', 'Ổ cắm điện đơn Panasonic', 'trading', 25000, 38000, 'Cái', 'Ổ cắm điện Panasonic nhập khẩu', 'Công ty TNHH Thiết Bị Điện Nước Hoàng Nam'],
  ['XD-TM-DIEN-002', 'Công tắc điện Panasonic', 'trading', 18000, 28000, 'Cái', 'Công tắc điện Panasonic nhập khẩu', 'Công ty TNHH Thiết Bị Điện Nước Hoàng Nam'],
  ['XD-TM-KHOA-001', 'Khóa tay gạt inox Huy Hoàng SS8510', 'trading', 350000, 480000, 'Bộ', 'Khóa tay gạt Huy Hoàng chính hãng', 'Đại Lý Gạch Men & Thiết Bị Vệ Sinh Thanh Phát'],
];

// Construction industry partners
const partners = [
  // Khách hàng (customer_rank = 1)
  {
    name: 'Công ty Cổ phần Tập đoàn Xây dựng Hòa Bình',
    street: 'Tòa nhà Pax Sky, 123 Nguyễn Đình Chiểu, Q.3, TP.HCM',
    phone: '02839325030',
    email: 'contact@hoabinh.vn',
    type: 'customer'
  },
  {
    name: 'Tổng Công ty Xây dựng Coteccons',
    street: 'Tòa nhà Coteccons, 236/6 Điện Biên Phủ, Q.Bình Thạnh, TP.HCM',
    phone: '02835142255',
    email: 'info@coteccons.vn',
    type: 'customer'
  },
  {
    name: 'Công ty TNHH Đầu tư & Phát triển Đô thị An Hưng',
    street: 'Khu đô thị mới An Hưng, Hà Đông, Hà Nội',
    phone: '02433513366',
    email: 'anhung@anhung.com.vn',
    type: 'customer'
  },
  {
    name: 'Nhà thầu Tư nhân Nguyễn Văn Hùng',
    street: '45 Đường số 8, KDC Trung Sơn, Bình Chánh, TP.HCM',
    phone: '0908123456',
    email: 'hungnguyen@gmail.com',
    type: 'customer'
  },
  {
    name: 'Ban Quản lý Dự án Đường cao tốc Bắc Nam',
    street: '80 Trần Hưng Đạo, Q.Hoàn Kiếm, Hà Nội',
    phone: '02439423555',
    email: 'pmu.bacnam@mt.gov.vn',
    type: 'customer'
  },
  // Nhà cung cấp (supplier_rank = 1)
  {
    name: 'Công ty Cổ phần Tập đoàn Hòa Phát',
    street: 'Khu công nghiệp Phố Nối A, Yên Mỹ, Hưng Yên',
    phone: '02462815191',
    email: 'thep@hoaphat.com.vn',
    type: 'vendor'
  },
  {
    name: 'Công ty Xi măng Vicem Hà Tiên',
    street: '360 Bến Chương Dương, Quận 1, TP.HCM',
    phone: '02838368363',
    email: 'hatien@vicem.vn',
    type: 'vendor'
  },
  {
    name: 'Tổng Kho Cát Đá Xây Dựng Bình Dương',
    street: 'Đường ĐT743, KCN Sóng Thần, Dĩ An, Bình Dương',
    phone: '0912345678',
    email: 'catdabinhduong@gmail.com',
    type: 'vendor'
  },
  {
    name: 'Công ty TNHH Thiết Bị Điện Nước Hoàng Nam',
    street: '230 Tô Hiến Thành, Quận 10, TP.HCM',
    phone: '02838634567',
    email: 'hoangnamelectric@gmail.com',
    type: 'vendor'
  },
  {
    name: 'Đại Lý Gạch Men & Thiết Bị Vệ Sinh Thanh Phát',
    street: '412 Lý Thường Kiệt, Quận Tân Bình, TP.HCM',
    phone: '02838641234',
    email: 'thanhphatceramic@gmail.com',
    type: 'vendor'
  }
];

async function main() {
  const config = loadConfig();
  console.log('Authenticating Odoo...');
  const cookie = await odooAuth(config);
  console.log('Authentication successful.');

  const locs = await odooCall(config, 'stock.location', 'search_read', [], {
    domain: [['usage', '=', 'internal']],
    fields: ['id', 'name'],
    limit: 1
  }, cookie);
  const locationId = locs[0]?.id;

  // Step 1: Process Customers and Vendors first so they exist when we link products to them
  console.log('Processing construction partners (customers & vendors)...');
  let createdPartners = 0, updatedPartners = 0;
  const failedPartners = [];

  let supportsRank = false;
  try {
    const fields = await odooCall(config, 'res.partner', 'fields_get', [['customer_rank']], { attributes: ['type'] }, cookie);
    supportsRank = (fields && fields.customer_rank !== undefined);
  } catch (e) {
    supportsRank = false;
  }
  console.log(`Database support for customer_rank/supplier_rank: ${supportsRank}`);

  // Create a map to cache partner IDs by name
  const partnerMap = new Map();

  for (const partner of partners) {
    try {
      const payload = {
        name: partner.name,
        street: partner.street,
        phone: partner.phone,
        email: partner.email,
        is_company: true
      };

      if (partner.type === 'vendor') {
        if (supportsRank) {
          payload.supplier_rank = 1;
        } else {
          payload.comment = 'Nhà cung cấp';
        }
      } else {
        if (supportsRank) {
          payload.customer_rank = 1;
        } else {
          payload.comment = 'Khách hàng';
        }
      }

      const existing = await odooCall(config, 'res.partner', 'search_read', [], {
        domain: [['name', '=', partner.name]],
        fields: ['id', 'name'],
        limit: 1
      }, cookie);

      let partnerId;
      if (existing.length) {
        partnerId = existing[0].id;
        await odooCall(config, 'res.partner', 'write', [[partnerId], payload], {}, cookie);
        updatedPartners++;
      } else {
        partnerId = await odooCall(config, 'res.partner', 'create', [payload], {}, cookie);
        createdPartners++;
      }
      partnerMap.set(partner.name, partnerId);
    } catch (e) {
      failedPartners.push({ name: partner.name, error: e.message });
    }
  }

  // Step 2: Process Construction Products and Link to Vendors
  console.log('Processing construction products & vendor links...');
  let updatedProds = 0, createdProds = 0, stockOk = 0, stockFail = 0;
  const failedProds = [];

  for (const [code, name, typeVal, cost, price, uom, note, supplierName] of products) {
    try {
      let purchase_ok = true;
      let sale_ok = true;

      if (typeVal === 'raw_material') {
        purchase_ok = true;
        sale_ok = false;
      } else if (typeVal === 'manufactured') {
        purchase_ok = false;
        sale_ok = true;
      }

      const vals = {
        name,
        default_code: code,
        type: 'consu',
        is_storable: true,
        list_price: price,
        standard_price: cost,
        description: note,
        purchase_ok,
        sale_ok
      };

      const existing = await odooCall(config, 'product.template', 'search_read', [], {
        domain: [['default_code', '=', code]],
        fields: ['id', 'name', 'default_code', 'product_variant_id'],
        limit: 1
      }, cookie);
      
      let tmplId;
      if (existing.length) {
        tmplId = existing[0].id;
        await odooCall(config, 'product.template', 'write', [[tmplId], vals], {}, cookie);
        updatedProds++;
      } else {
        tmplId = await odooCall(config, 'product.template', 'create', [vals], {}, cookie);
        createdProds++;
      }

      // Link to vendor using product.supplierinfo
      if (supplierName) {
        let vendorId = partnerMap.get(supplierName);
        if (!vendorId) {
          // Fallback fetch if map doesn't have it
          const vendorRes = await odooCall(config, 'res.partner', 'search_read', [], {
            domain: [['name', '=', supplierName]],
            fields: ['id'],
            limit: 1
          }, cookie);
          if (vendorRes.length) vendorId = vendorRes[0].id;
        }

        if (vendorId) {
          // Check if link already exists
          const existingInfo = await odooCall(config, 'product.supplierinfo', 'search_read', [], {
            domain: [
              ['product_tmpl_id', '=', tmplId],
              ['partner_id', '=', vendorId]
            ],
            fields: ['id'],
            limit: 1
          }, cookie);

          if (!existingInfo.length) {
            console.log(`Linking product ${code} to supplier ${supplierName}...`);
            await odooCall(config, 'product.supplierinfo', 'create', [{
              product_tmpl_id: tmplId,
              partner_id: vendorId,
              price: cost,
              min_qty: 1
            }], {}, cookie);
          }
        }
      }

      // Adjust Stock levels to 100 for all products so they are immediately usable
      if (locationId) {
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
      failedProds.push({ code, name, error: e.message });
    }
  }

  // Step 3: Archive invalid/old products that are not part of the construction product list
  console.log('Archiving old products not in the construction catalog...');
  const activeTemplates = await odooCall(config, 'product.template', 'search_read', [], {
    domain: [['active', '=', true]],
    fields: ['id', 'name', 'default_code'],
    limit: 1000
  }, cookie);

  const constructionCodes = products.map(p => p[0]);
  let archivedProdsCount = 0;

  for (const t of activeTemplates) {
    const code = t.default_code || '';
    if (!code) continue;

    if (!constructionCodes.includes(code)) {
      console.log(`Archiving old product: [${code}] ${t.name}`);
      try {
        await odooCall(config, 'product.template', 'write', [[t.id], { active: false }], {}, cookie);
        archivedProdsCount++;
      } catch (err) {
        console.error(`Failed to archive old product ${t.name}:`, err.message);
      }
    }
  }

  // Step 4: Archive old partners not in the construction partner list
  console.log('Archiving old partners not in the construction list...');
  const activePartners = await odooCall(config, 'res.partner', 'search_read', [], {
    domain: [['active', '=', true], ['is_company', '=', true]],
    fields: ['id', 'name', 'email'],
    limit: 1000
  }, cookie);

  const constructionPartnerNames = partners.map(p => p.name);
  let archivedPartnersCount = 0;

  for (const p of activePartners) {
    if (['YourCompany', 'Administrator', 'Deco Addict', 'Marc Demo', 'Gemini'].includes(p.name)) continue;

    if (!constructionPartnerNames.includes(p.name)) {
      console.log(`Archiving old partner: ${p.name}`);
      try {
        await odooCall(config, 'res.partner', 'write', [[p.id], { active: false }], {}, cookie);
        archivedPartnersCount++;
      } catch (err) {
        console.error(`Failed to archive old partner ${p.name}:`, err.message);
      }
    }
  }

  console.log('\n--- DATA UPDATE SETUP COMPLETE ---');
  console.log(JSON.stringify({
    products: {
      created: createdProds,
      updated: updatedProds,
      archived: archivedProdsCount,
      stockAdjusted: stockOk,
      stockFailures: stockFail,
      failedList: failedProds
    },
    partners: {
      created: createdPartners,
      updated: updatedPartners,
      archived: archivedPartnersCount,
      failedList: failedPartners
    }
  }, null, 2));
}

main().catch(e => {
  console.error(e.stack || e.message);
  process.exit(1);
});
