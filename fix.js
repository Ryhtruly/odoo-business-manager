const fs = require('fs');
let lines = fs.readFileSync('frontend/js/app.js', 'utf8').split('\n');
const replacement = `  // Bind Add PO line button click
  const btnAddPOLine = document.getElementById('btnAddPOLine');
  if (btnAddPOLine) {
    btnAddPOLine.addEventListener('click', () => {
      const prodSelect = document.getElementById('poProduct');
      const qtyInput = document.getElementById('poQty');
      const priceInput = document.getElementById('poPrice');
      
      const productId = prodSelect.value;
      const qty = Number(qtyInput.value);
      
      if (!productId || qty <= 0) {
        showToast('Vui lòng chọn sản phẩm và nhập số lượng hợp lệ', 'warning');
        return;
      }
      
      const selectedOption = prodSelect.options[prodSelect.selectedIndex];
      const productName = selectedOption.textContent;
      
      // Look up unit price directly from standard_price of product template
      const lookupId = String(productId).startsWith('temp_') ? productId : Number(productId);
      const product = findDraftPOProduct(lookupId) || cache.products.find(p => p.id === lookupId);
      const price = product ? (product.standard_price || 0) : 0;
      
      const existing = currentPOLines.find(line => line.product_id === lookupId);
      if (existing) {
        existing.product_qty += qty;
      } else {
        currentPOLines.push({
          product_id: lookupId,
          product_name: product ? product.name : productName,
          product_qty: qty,
          price_unit: price
        });
      }
      
      qtyInput.value = 100;
      if (priceInput) priceInput.value = 0;
      prodSelect.value = '';
      
      renderPOLines();
      showToast('Đã thêm dòng sản phẩm', 'success');
    });
  }

  let cachedRawProducts = [];

  function populatePOProducts(products, suggestedIds = []) {
    const poProductSelect = document.getElementById('poProduct');
    if (!poProductSelect) return;
    
    poProductSelect.innerHTML = '<option value="">-- Chọn Nguyên Liệu --</option>';
    
    const vendorId = document.getElementById('poVendor').value;

    if (vendorId) {
      // Filter products that can be purchased
      const purchasableProducts = products.filter(p => p.purchase_ok || String(p.id).startsWith('temp_'));
      
      const sortedProducts = [...purchasableProducts].sort((a, b) => {
        const aSuggested = suggestedIds.includes(a.id) || String(a.id).startsWith('temp_');
        const bSuggested = suggestedIds.includes(b.id) || String(b.id).startsWith('temp_');
        if (aSuggested !== bSuggested) return aSuggested ? -1 : 1;
        return String(a.name || '').localeCompare(String(b.name || ''), 'vi', { sensitivity: 'base' });
      });

      sortedProducts.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        const isTempBadge = String(p.id).startsWith('temp_') ? ' [Tạm thời]' : '';
        const suggestedBadge = suggestedIds.includes(p.id) ? ' [Đã từng mua]' : '';
        opt.textContent = \\\`[\\\${p.default_code || 'Không SKU'}] \\\${p.name}\\\${isTempBadge}\\\${suggestedBadge}\\\`;
        poProductSelect.appendChild(opt);
      });
    } else {
      poProductSelect.innerHTML = '<option value="">-- Vui lòng chọn nhà cung cấp trước --</option>';
    }
  }`.split('\n');

lines.splice(2266, 2334 - 2266, ...replacement);
fs.writeFileSync('frontend/js/app.js', lines.join('\n'), 'utf8');
console.log('Fixed using Node!');
