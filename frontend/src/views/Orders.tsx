// client/src/views/Orders.tsx
import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';

interface POLine {
  product_id: string | number;
  product_name: string;
  product_qty: number;
  price_unit: number;
  isTemp?: boolean;
}

export const Orders: React.FC = () => {
  const {
    session,
    cache,
    loading,
    showToast,
    // fetchPOs, // DISABLED: Tab PO đã bỏ, dùng cho Odoo Online
    fetchReceipts,
    fetchVendors,
    fetchProducts,
    generateSKUFromName
  } = useApp();

  // ✅ Đã bỏ 'poList' khỏi type - chỉ còn 3 tab
  const [activeSubTab, setActiveSubTab] = useState<'poForm' | 'receiptsList' | 'historyList'>('poForm');

  // PO Form states
  const [poVendor, setPoVendor] = useState<string>('');
  const [poDate, setPoDate] = useState<string>('');
  const [poProduct, setPoProduct] = useState<string>('');
  const [poQty, setPoQty] = useState<number>(100);
  const [poPrice, setPoPrice] = useState<number>(0);
  const [currentPOLines, setCurrentPOLines] = useState<POLine[]>([]);
  const [suggestedProductIds, setSuggestedProductIds] = useState<number[]>([]);
  const [isSubmittingPO, setIsSubmittingPO] = useState<boolean>(false);

  // Draft local temp products
  const [draftPOProducts, setDraftPOProducts] = useState<any[]>([]);

  // Modals state
  const [isVendorModalOpen, setIsVendorModalOpen] = useState<boolean>(false);
  const [vendorName, setVendorName] = useState<string>('');
  const [vendorStreet, setVendorStreet] = useState<string>('');
  const [vendorPhone, setVendorPhone] = useState<string>('');
  const [isSubmittingVendor, setIsSubmittingVendor] = useState<boolean>(false);

  // History detail modal states
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  // ✅ Đã bỏ 'po' khỏi type - chỉ còn 'receipt'
  const [detailType, setDetailType] = useState<'receipt' | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false);

  // Return dialog states
  const [isReturnModalOpen, setIsReturnModalOpen] = useState<boolean>(false);
  const [returnPickingId, setReturnPickingId] = useState<number | string>('');
  const [returnReceiptInfo, setReturnReceiptInfo] = useState<string>('');
  const [returnLines, setReturnLines] = useState<any[]>([]);
  const [isSubmittingReturn, setIsSubmittingReturn] = useState<boolean>(false);

  const role = session?.role || '';
  const isWarehouseStaff = role === 'admin' || role === 'ke_toan_kho';

  // ✅ Helper: Lấy số đơn nháp (chưa duyệt) - dùng cho badge
  const draftReceiptsCount = cache.receipts.filter(
    r => r.state === 'draft' || r.state === 'assigned' || r.state === 'confirmed' || r.state === 'waiting'
  ).length;

  // Load baseline data
  useEffect(() => {
    // if (cache.pos.length === 0) fetchPOs(); // DISABLED
    if (cache.receipts.length === 0) fetchReceipts();
    if (cache.vendors.length === 0) fetchVendors();
    if (cache.products.length === 0) fetchProducts();
    // Default poDate to current time
    const now = new Date();
    const tzoffset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - tzoffset).toISOString().slice(0, 16);
    setPoDate(localISOTime);
  }, []);

  // Fetch vendor's past purchased products for sorting/recommending
  useEffect(() => {
    let cancelled = false;
    if (poVendor) {
      fetch(`/api/odoo/partners/${poVendor}/purchased-products`)
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          if (!cancelled) setSuggestedProductIds(data);
        })
        .catch(err => {
          console.error(err);
          if (!cancelled) setSuggestedProductIds([]);
        });
    } else {
      setSuggestedProductIds([]);
    }
    return () => { cancelled = true; };
  }, [poVendor]);

  // Sync default price when product selection changes
  useEffect(() => {
    if (poProduct) {
      const lookupId = String(poProduct).startsWith('temp_') ? poProduct : Number(poProduct);
      const product = draftPOProducts.find(p => p.id === lookupId) || cache.products.find(p => p.id === lookupId);
      if (product) {
        setPoPrice(product.standard_price || 0);
      }
    } else {
      setPoPrice(0);
    }
  }, [poProduct, draftPOProducts, cache.products]);

  // Handle line addition
  const handleAddPOLine = () => {
    if (!poProduct) {
      showToast('Vui lòng chọn sản phẩm nguyên liệu', 'warning');
      return;
    }
    if (poQty <= 0) {
      showToast('Vui lòng nhập số lượng > 0', 'warning');
      return;
    }

    const lookupId = String(poProduct).startsWith('temp_') ? poProduct : Number(poProduct);
    const product = draftPOProducts.find(p => p.id === lookupId) || cache.products.find(p => p.id === lookupId);
    const productName = product ? product.name : `Sản phẩm #${lookupId}`;

    const existingIndex = currentPOLines.findIndex(line => line.product_id === lookupId);
    if (existingIndex > -1) {
      const updated = [...currentPOLines];
      updated[existingIndex].product_qty += poQty;
      updated[existingIndex].price_unit = poPrice;
      setCurrentPOLines(updated);
    } else {
      setCurrentPOLines([...currentPOLines, {
        product_id: lookupId,
        product_name: productName,
        product_qty: poQty,
        price_unit: poPrice,
        isTemp: String(lookupId).startsWith('temp_')
      }]);
    }

    setPoQty(100);
    setPoProduct('');
    setPoPrice(0);
    showToast('Đã thêm dòng sản phẩm', 'success');
  };

  // Remove PO Line
  const handleRemovePOLine = (index: number) => {
    const line = currentPOLines[index];
    const updated = currentPOLines.filter((_, idx) => idx !== index);
    setCurrentPOLines(updated);

    // Clean up temporary draft product if it's no longer used in any line
    if (String(line.product_id).startsWith('temp_')) {
      const isStillUsed = updated.some(l => l.product_id === line.product_id);
      if (!isStillUsed) {
        setDraftPOProducts(prev => prev.filter(p => p.id !== line.product_id));
      }
    }
    showToast('Đã xóa dòng sản phẩm', 'info');
  };

  // Change PO Line quantity inline
  const handleLineQtyChange = (index: number, qty: number) => {
    if (qty > 0) {
      const updated = [...currentPOLines];
      updated[index].product_qty = qty;
      setCurrentPOLines(updated);
    }
  };

  // Rollback logic for temporary Odoo products on PO creation failure
  const rollbackCreatedProducts = async (createdProductMap: Array<{ tempId: string; odooId: number }>) => {
    if (createdProductMap.length === 0) return;
    showToast(`Đang dọn dẹp ${createdProductMap.length} nguyên liệu đã sinh ra từ database...`, 'warning');
    for (const item of createdProductMap) {
      try {
        await fetch(`/api/odoo/products/${item.odooId}`, { method: 'DELETE' });
      } catch (err) {
        console.error(err);
      }
    }
    fetchProducts();
  };

  // Submit purchase order / receipt
  const handlePOSubmit = async (isDraft: boolean) => {
    if (!poVendor) {
      showToast('Vui lòng chọn Nhà cung cấp', 'warning');
      return;
    }
    if (currentPOLines.length === 0) {
      showToast('Vui lòng thêm ít nhất một dòng nguyên liệu sản phẩm', 'warning');
      return;
    }

    // Check if there are draft temporary products
    const tempLines = currentPOLines.filter(line => String(line.product_id).startsWith('temp_'));
    if (tempLines.length > 0) {
      const tempNames = tempLines.map(line => `- ${line.product_name}`).join('\n');
      const confirmCreate = confirm(`Đơn hàng của bạn có chứa các nguyên liệu mới chưa được xác nhận tạo trong hệ thống:\n\n${tempNames}\n\nBạn có chắc chắn muốn tạo các nguyên liệu mới này trong database Odoo không?`);
      if (!confirmCreate) {
        showToast('Hủy tạo đơn hàng do không xác nhận tạo nguyên liệu mới.', 'warning');
        return;
      }
    }

    setIsSubmittingPO(true);
    const createdProductMap: Array<{ tempId: string; odooId: number }> = [];

    try {
      // 1. Create temporary products in Odoo first
      const finalLines = [...currentPOLines];
      for (let i = 0; i < finalLines.length; i++) {
        const line = finalLines[i];
        if (String(line.product_id).startsWith('temp_')) {
          const tempProduct = draftPOProducts.find(p => p.id === line.product_id);
          if (tempProduct) {
            showToast(`Đang lưu nguyên liệu "${tempProduct.name}" vào Odoo...`, 'info');
            const res = await fetch('/api/odoo/products', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: tempProduct.name,
                default_code: tempProduct.default_code,
                type: tempProduct.type,
                list_price: tempProduct.list_price,
                standard_price: tempProduct.standard_price,
                description: tempProduct.description
              })
            });
            const pData = await res.json();
            if (pData.success) {
              createdProductMap.push({ tempId: String(line.product_id), odooId: Number(pData.id) });
              finalLines[i] = {
                ...line,
                product_id: Number(pData.id)
              };
            } else {
              showToast(`Không thể tạo nguyên liệu "${tempProduct.name}" trên Odoo: ${pData.error}`, 'danger');
              await rollbackCreatedProducts(createdProductMap);
              setIsSubmittingPO(false);
              return;
            }
          }
        }
      }

      // 2. Submit the Receipt (PO functionality removed, dùng stock.picking trực tiếp)
      const dateOrderStr = poDate ? new Date(poDate).toISOString().replace('T', ' ').substring(0, 19) : undefined;
      const payload = {
        partner_id: Number(poVendor),
        draft: isDraft,
        date_order: dateOrderStr,
        order_line: finalLines.map(line => ({
          product_id: line.product_id,
          product_qty: line.product_qty,
          price_unit: line.price_unit
        }))
      };

      showToast(isDraft ? 'Đang tạo phiếu nhập kho nháp...' : 'Đang nhập kho...', 'info');
      const response = await fetch('/api/odoo/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data.success) {
        showToast(
          isDraft
            ? 'Đã tạo phiếu nhập kho nháp! Vui lòng vào tab "Phiếu Nhận Kho" để duyệt.'
            : 'Đã nhập kho thành công!',
          'success'
        );
        if (data.warning) {
          showToast(data.warning, 'warning');
        }

        // ✅ FIX: Ở lại form (không chuyển tab) - reset form sạch
        resetPOForm();

        fetchProducts();
        // fetchPOs(); // DISABLED
        fetchReceipts();

        // ✅ FIX: Luôn chuyển sang tab "Phiếu Nhận Kho" để user thấy đơn vừa tạo
        setActiveSubTab('receiptsList');
      } else {
        showToast(`Lỗi tạo phiếu nhập: ${data.error}`, 'danger');
        await rollbackCreatedProducts(createdProductMap);
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
      await rollbackCreatedProducts(createdProductMap);
    } finally {
      setIsSubmittingPO(false);
    }
  };

  // ✅ Helper: Reset form về trạng thái ban đầu
  const resetPOForm = () => {
    setPoVendor('');
    setCurrentPOLines([]);
    setDraftPOProducts([]);
    setPoProduct('');
    setPoQty(100);
    setPoPrice(0);

    // Reset date về hiện tại
    const now = new Date();
    const tzoffset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - tzoffset).toISOString().slice(0, 16);
    setPoDate(localISOTime);

    // Reset suggested products
    setSuggestedProductIds([]);
  };

  // Submit Partner Vendor form
  const handleVendorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim()) {
      showToast('Vui lòng điền tên nhà cung cấp', 'warning');
      return;
    }

    setIsSubmittingVendor(true);
    try {
      showToast('Đang tạo nhà cung cấp...', 'info');
      const response = await fetch('/api/odoo/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: vendorName.trim(),
          street: vendorStreet.trim(),
          phone: vendorPhone.trim(),
          type: 'vendor'
        })
      });
      const data = await response.json();
      if (data.success) {
        showToast('Tạo nhà cung cấp mới thành công', 'success');
        setIsVendorModalOpen(false);
        setVendorName('');
        setVendorStreet('');
        setVendorPhone('');
        await fetchVendors();
        setPoVendor(String(data.id));
      } else {
        showToast(`Lỗi: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    } finally {
      setIsSubmittingVendor(false);
    }
  };

  // DISABLED: Tab PO đã bỏ - không cần hàm này
  // const handleConfirmPO = async (id: number) => {
  //   if (!confirm('Bạn có chắc chắn muốn xác nhận đơn mua hàng này và tiến hành nhập kho không?')) return;
  //   try {
  //     showToast('Đang xác nhận đơn mua hàng...', 'info');
  //     const res = await fetch(`/api/odoo/purchase-orders/${id}/confirm`, {
  //       method: 'POST'
  //     });
  //     const resData = await res.json();
  //     if (resData.success) {
  //       showToast('Xác nhận PO và nhập kho thành công!', 'success');
  //       if (resData.warning) {
  //         showToast(resData.warning, 'warning');
  //       }
  //       fetchPOs();
  //       fetchReceipts();
  //       fetchProducts();
  //       setActiveSubTab('historyList');
  //     } else {
  //       showToast(`Lỗi: ${resData.error}`, 'danger');
  //     }
  //   } catch (err: any) {
  //     showToast(`Lỗi kết nối: ${err.message}`, 'danger');
  //   }
  // };

  // Validate incoming warehouse receipt
  const handleValidateReceipt = async (id: number) => {
    try {
      showToast('Đang duyệt nhập kho...', 'info');
      const response = await fetch(`/api/odoo/receipts/${id}/validate`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        showToast('Duyệt nhập kho thành công', 'success');
        fetchReceipts();
        fetchProducts();
        // ✅ Giữ nguyên tab hiện tại (receiptsList) để user thấy kết quả
      } else {
        showToast(`Lỗi duyệt: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    }
  };

  // ✅ Open details viewer (chỉ dùng cho receipt, không cho PO)
  // ✅ Sửa thành:
  const handleOpenDetail = async (type: 'receipt', id: number) => {
    setDetailType(type);
    setIsDetailLoading(true);
    setIsDetailModalOpen(true);
    setDetailData(null);

    try {
      const response = await fetch(`/api/odoo/receipts/${id}`);
      // ✅ Hardcode 'receipts' vì type chỉ có 1 giá trị
      if (!response.ok) throw new Error('Không thể tải chi tiết');
      const data = await response.json();
      setDetailData(data);
    } catch (err: any) {
      showToast(err.message, 'danger');
      setIsDetailModalOpen(false);
    } finally {
      setIsDetailLoading(false);
    }
  };


  // Open return Dialog
  const handleOpenReturn = (data: any) => {
    setReturnPickingId(data.receipt.id);
    setReturnReceiptInfo(`Trả hàng cho phiếu nhập: ${data.receipt.name} (${data.receipt.origin || ''})`);

    const initialLines = data.lines
      .filter((l: any) => (l.quantity_done || 0) > 0)
      .map((l: any) => {
        const prodName = l.product_id ? l.product_id[1] : l.name;
        const variantId = l.product_id ? l.product_id[0] : null;

        // Default return price unit to product standard price
        let defaultCost = 0;
        if (prodName) {
          const cachedProd = cache.products.find(p => p.name === prodName);
          if (cachedProd) {
            defaultCost = cachedProd.standard_price || 0;
          }
        }

        return {
          variant_id: variantId,
          product_name: prodName,
          quantity_done: l.quantity_done,
          price_unit: defaultCost,
          qty_to_return: l.quantity_done
        };
      });

    setReturnLines(initialLines);
    setIsDetailModalOpen(false);
    setIsReturnModalOpen(true);
  };

  const handleReturnLineQtyChange = (index: number, val: number) => {
    const updated = [...returnLines];
    const maxQty = updated[index].quantity_done;
    if (val >= 0 && val <= maxQty) {
      updated[index].qty_to_return = val;
      setReturnLines(updated);
    }
  };

  const handleReturnLinePriceChange = (index: number, val: number) => {
    if (val >= 0) {
      const updated = [...returnLines];
      updated[index].price_unit = val;
      setReturnLines(updated);
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = returnLines
      .filter(line => line.qty_to_return > 0)
      .map(line => ({
        variant_id: line.variant_id,
        qty: line.qty_to_return,
        price_unit: line.price_unit
      }));

    if (items.length === 0) {
      showToast('Vui lòng chọn ít nhất một sản phẩm với số lượng trả > 0', 'warning');
      return;
    }

    setIsSubmittingReturn(true);
    try {
      showToast('Đang thực hiện trả hàng...', 'info');
      const response = await fetch(`/api/odoo/receipts/${returnPickingId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const resData = await response.json();

      if (resData.success) {
        showToast('Trả hàng thành công! Tồn kho đã được cập nhật.', 'success');
        if (resData.warning) {
          showToast(resData.warning, 'warning');
        }
        setIsReturnModalOpen(false);
        fetchReceipts();
        fetchProducts();
      } else {
        showToast(`Lỗi: ${resData.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  // ✅ Compile history - chỉ từ Receipts (PO đã bỏ)
  const compileHistoryList = () => {
    let history: any[] = [];
    if (cache.receipts) {
      history = cache.receipts
        .filter(r => r.state === 'done')
        .map(r => ({
          id: r.id,
          rawType: 'receipt',
          type: 'Phiếu Nhận Kho',
          ref: r.receipt_number || '-',
          partner: r.vendor || 'N/A',
          detail: r.origin || '-',
          date: r.write_date ? new Date(r.write_date).toLocaleString('vi-VN') : 'N/A',
          timestamp: r.write_date ? new Date(r.write_date).getTime() : 0
        }));
    }
    return history.sort((a, b) => b.timestamp - a.timestamp);
  };

  // Sort and filter raw material products for PO select box
  const getPOFormProducts = () => {
    const baseline = [...draftPOProducts, ...cache.products.filter(p => p.purchase_ok)];
    return baseline.sort((a, b) => {
      const aSuggested = suggestedProductIds.includes(a.id) || String(a.id).startsWith('temp_');
      const bSuggested = suggestedProductIds.includes(b.id) || String(b.id).startsWith('temp_');
      if (aSuggested !== bSuggested) return aSuggested ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''), 'vi', { sensitivity: 'base' });
    });
  };

  // Open temporary product creation modal inside PO view
  const openTempProductModal = () => {
    const name = prompt('Nhập tên nguyên liệu/sản phẩm mới:');
    if (!name || !name.trim()) return;

    const sku = prompt('Nhập SKU (hoặc để trống để tự động sinh):', generateSKUFromName(name));
    const priceStr = prompt('Nhập giá bán ước lượng (đ):', '0');
    const costStr = prompt('Nhập giá vốn/giá mua ước lượng (đ):', '0');

    const tempId = `temp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const tempProduct = {
      id: tempId,
      name: name.trim(),
      default_code: sku ? sku.trim() : generateSKUFromName(name),
      type: 'product',
      list_price: Number(priceStr) || 0,
      standard_price: Number(costStr) || 0,
      description: 'Nguyên liệu thêm trực tiếp từ form mua hàng',
      isTemp: true,
      write_date: new Date().toISOString()
    };

    setDraftPOProducts(prev => [tempProduct, ...prev]);
    setPoProduct(tempId);
    showToast(`Đã tạo tạm nguyên liệu "${name}". Bấm "Thêm" để đưa vào phiếu.`, 'info');
  };

  const currentPoTotal = currentPOLines.reduce((acc, curr) => acc + (curr.product_qty * curr.price_unit), 0);
  const historyList = compileHistoryList();
  const formProducts = getPOFormProducts();

  return (
    <div className="tab-panel active" id="panelOrders">
      {/* ✅ Sub-tabs navigation bar - chỉ còn 3 tab */}
      <div
        className="sub-tabs-container"
        style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '12px' }}
      >
        <button
          type="button"
          onClick={() => setActiveSubTab('poForm')}
          className={`sub-tab ${activeSubTab === 'poForm' ? 'active' : ''}`}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 16px',
            fontWeight: activeSubTab === 'poForm' ? 600 : 500,
            cursor: 'pointer',
            color: activeSubTab === 'poForm' ? 'var(--accent-primary)' : 'var(--text-muted)',
            borderBottom: activeSubTab === 'poForm' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            transition: 'all 0.3s'
          }}
        >
          Nhập Nguyên Liệu Đầu Vào
        </button>

        {/* ✅ Tab Phiếu Nhận Kho - có badge số đơn chờ duyệt */}
        <button
          type="button"
          onClick={() => setActiveSubTab('receiptsList')}
          className={`sub-tab ${activeSubTab === 'receiptsList' ? 'active' : ''}`}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 16px',
            fontWeight: activeSubTab === 'receiptsList' ? 600 : 500,
            cursor: 'pointer',
            color: activeSubTab === 'receiptsList' ? 'var(--accent-primary)' : 'var(--text-muted)',
            borderBottom: activeSubTab === 'receiptsList' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            transition: 'all 0.3s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          Phiếu Nhận Kho
          {draftReceiptsCount > 0 && (
            <span style={{
              background: 'var(--accent-primary)',
              color: 'white',
              borderRadius: '10px',
              padding: '2px 8px',
              fontSize: '0.7rem',
              fontWeight: 'bold',
              minWidth: '20px',
              textAlign: 'center'
            }}>
              {draftReceiptsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('historyList')}
          className={`sub-tab ${activeSubTab === 'historyList' ? 'active' : ''}`}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 16px',
            fontWeight: activeSubTab === 'historyList' ? 600 : 500,
            cursor: 'pointer',
            color: activeSubTab === 'historyList' ? 'var(--accent-primary)' : 'var(--text-muted)',
            borderBottom: activeSubTab === 'historyList' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            transition: 'all 0.3s'
          }}
        >
          Lịch Sử (Đã Hoàn Tất)
        </button>
      </div>

      {/* 1. PO Input Form Subtab - đổi tên thành Phiếu Nhập Kho */}
      {activeSubTab === 'poForm' && (
        <div className="sub-tab-panel active" id="subPanelPoForm">
          <div className="glass-panel settings-container" style={{ marginBottom: '24px' }}>
            <h2>Nhập Nguyên Liệu Đầu Vào (Tạo Phiếu Nhập Kho)</h2>
            <p className="text-muted">Bộ phận kế toán kho: Tạo phiếu nhập kho nguyên vật liệu từ nhà cung cấp.</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handlePOSubmit(false);
              }}
              className="settings-form"
            >
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="poVendor">Nhà Cung Cấp:</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                    <select
                      id="poVendor"
                      className="form-input"
                      required
                      style={{ padding: '8px', flex: 1 }}
                      value={poVendor}
                      onChange={(e) => setPoVendor(e.target.value)}
                    >
                      <option value="">-- Chọn Nhà Cung Cấp --</option>
                      {cache.vendors.map((v) => {
                        let text = v.name;
                        if (v.street) text += ` - ${v.street}`;
                        if (v.phone) text += ` - ${v.phone}`;
                        return <option key={v.id} value={v.id}>{text}</option>;
                      })}
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary btn-icon"
                      id="btnCreateVendorPO"
                      title="Thêm Nhà Cung Cấp Mới"
                      onClick={() => setIsVendorModalOpen(true)}
                      style={{ padding: '8px', fontSize: '1rem', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '38px', width: '38px', margin: 0 }}
                    >
                      ➕
                    </button>
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="poDate">Ngày nhập kho:</label>
                  <input
                    type="datetime-local"
                    id="poDate"
                    className="form-input"
                    required
                    value={poDate}
                    onChange={(e) => setPoDate(e.target.value)}
                  />
                </div>
              </div>

              <div
                className="glass-panel"
                style={{ padding: '12px', marginBottom: '12px', border: '1px dashed rgba(0, 0, 0, 0.1)', background: 'rgba(0, 0, 0, 0.02)', borderRadius: '8px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Thêm Sản Phẩm Nhập Kho</h4>
                  {poVendor && (
                    <button
                      type="button"
                      onClick={openTempProductModal}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '2px 8px', fontSize: '0.75rem', height: 'unset', minHeight: 'unset', margin: 0 }}
                    >
                      + Tạo Nguyên Liệu Mới
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', marginBottom: 0, width: '100%' }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: 3, minWidth: '200px' }}>
                    <label htmlFor="poProduct">Sản Phẩm Nguyên Liệu:</label>
                    <select
                      id="poProduct"
                      className="form-input"
                      style={{ padding: '8px', width: '100%' }}
                      value={poProduct}
                      disabled={!poVendor}
                      onChange={(e) => setPoProduct(e.target.value)}
                    >
                      {!poVendor ? (
                        <option value="">-- Vui lòng chọn nhà cung cấp trước --</option>
                      ) : (
                        <>
                          <option value="">-- Chọn Nguyên Liệu --</option>
                          {formProducts.map((p) => {
                            const isTempBadge = String(p.id).startsWith('temp_') ? ' [Tạm thời]' : '';
                            const suggestedBadge = suggestedProductIds.includes(p.id) ? ' [Đã từng mua]' : '';
                            return (
                              <option key={p.id} value={p.id}>
                                {p.name}{suggestedBadge}{isTempBadge}
                              </option>
                            );
                          })}
                        </>
                      )}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1, maxWidth: '120px', minWidth: '80px' }}>
                    <label htmlFor="poQty">Số Lượng:</label>
                    <input
                      type="number"
                      id="poQty"
                      className="form-input"
                      min="1"
                      style={{ padding: '8px' }}
                      value={poQty}
                      onChange={(e) => setPoQty(Number(e.target.value))}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '120px' }}>
                    <label htmlFor="poPrice">Đơn Giá Mua (đ):</label>
                    <input
                      type="number"
                      id="poPrice"
                      className="form-input"
                      min="0"
                      style={{ padding: '8px' }}
                      value={poPrice}
                      onChange={(e) => setPoPrice(Number(e.target.value))}
                    />
                  </div>
                  <div style={{ marginBottom: 0, flex: '0 0 auto' }}>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleAddPOLine}
                      style={{ padding: '8px 16px', height: '38px' }}
                    >
                      Thêm
                    </Button>
                  </div>
                </div>
              </div>

              {/* Table of current PO lines */}
              <div className="responsive-table-wrapper" style={{ marginBottom: '12px', maxHeight: '200px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.1)' }}>
                      <th style={{ textAlign: 'left', padding: '6px' }}>Sản phẩm</th>
                      <th style={{ textAlign: 'right', padding: '6px', width: '110px' }}>Số lượng</th>
                      <th style={{ textAlign: 'right', padding: '6px' }}>Đơn giá vốn</th>
                      <th style={{ textAlign: 'right', padding: '6px' }}>Thành tiền</th>
                      <th style={{ textAlign: 'center', padding: '6px', width: '60px' }}>Xóa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentPOLines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center text-muted" style={{ padding: '12px', textAlign: 'center' }}>
                          Chưa có dòng nào được thêm. Vui lòng chọn sản phẩm ở trên rồi nhấn "Thêm".
                        </td>
                      </tr>
                    ) : (
                      currentPOLines.map((line, idx) => {
                        const lineTotal = line.product_qty * line.price_unit;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.05)' }}>
                            <td style={{ padding: '8px 6px' }}><strong>{line.product_name}</strong></td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', width: '100px' }}>
                              <input
                                type="number"
                                className="form-input"
                                min="1"
                                value={line.product_qty}
                                onChange={(e) => handleLineQtyChange(idx, Number(e.target.value))}
                                style={{ padding: '4px 8px', fontSize: '0.85rem', width: '80px', textAlign: 'right', margin: 0, display: 'inline-block' }}
                              />
                            </td>
                            <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                              {Number(line.price_unit).toLocaleString()} đ
                            </td>
                            <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                              <strong>{lineTotal.toLocaleString()} đ</strong>
                            </td>
                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                              <button
                                type="button"
                                className="btn btn-sm btn-accent"
                                onClick={() => handleRemovePOLine(idx)}
                                style={{ padding: '2px 6px', fontSize: '0.75rem', color: 'var(--accent-danger)', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)', margin: 0 }}
                              >
                                Xóa
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px', marginTop: '16px', width: '100%' }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent-danger)' }}>
                  Tổng giá trị phiếu nhập:{' '}
                  <span style={{ fontSize: '22px', fontWeight: 800, color: 'var(--accent-danger)' }}>
                    {currentPoTotal.toLocaleString()} đ
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'flex-end' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSubmittingPO}
                    onClick={() => handlePOSubmit(true)}
                    style={{ margin: 0, padding: '10px 24px', fontSize: '1rem' }}
                  >
                    Lưu Phiếu Nháp
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSubmittingPO}
                    style={{ margin: 0, padding: '10px 24px', fontSize: '1rem' }}
                  >
                    {isSubmittingPO ? 'Đang xử lý...' : 'Duyệt Nhập Kho'}
                  </Button>
                </div>
              </div>
            </form>

            <div style={{ fontWeight: 600, opacity: 0.8, fontSize: '0.95rem', marginBottom: '6px', color: '#333', marginTop: '20px' }}>
              💡 Hướng dẫn quy trình:
            </div>
            <div style={{ opacity: 0.6, fontSize: '0.85rem', lineHeight: '1.6', color: '#555' }}>
              Bấm <strong>Lưu Phiếu Nháp</strong> để tạo phiếu nhập ở trạng thái chờ — chưa cập nhật tồn kho, có thể duyệt sau trong tab "Phiếu Nhận Kho".
              <br />
              Bấm <strong>Duyệt Nhập Kho</strong> để nhập kho ngay lập tức — tồn kho sẽ được cập nhật ngay. Sau khi duyệt, có thể tạo phiếu trả hàng nếu cần.
            </div>
          </div>
        </div>
      )}

      {/* ❌ ĐÃ XÓA: Tab "Đơn Mua Hàng (POs)" - không dùng cho Odoo Online */}

      {/* 2. Incoming Receipts Subtab - ✅ Giữ nguyên */}
      {activeSubTab === 'receiptsList' && (
        <div className="sub-tab-panel">
          <div className="glass-panel datatable-container">
            <div className="table-header">
              <h2>Phiếu Nhận Kho (Incoming Receipts)</h2>
              <Button variant="secondary" onClick={fetchReceipts}>Tải Lại</Button>
            </div>
            <div className="responsive-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Mã phiếu nhận kho</th>
                    <th>Tài liệu gốc</th>
                    <th>Đối tác</th>
                    <th>Trạng thái nhận kho</th>
                    <th style={{ textAlign: 'right', paddingRight: '15px' }}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {(loading.receipts && cache.receipts.length === 0) ? (
                    <tr>
                      <td colSpan={5} className="text-center">Đang tải phiếu nhận kho...</td>
                    </tr>
                  ) : cache.receipts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center">Không tìm thấy phiếu nhận kho nào.</td>
                    </tr>
                  ) : (
                    cache.receipts.map((r) => {
                      let stateLabel = r.state || 'N/A';
                      let stateClass = 'text-warning';

                      if (r.state === 'done') {
                        stateLabel = 'Đã hoàn tất';
                        stateClass = 'text-success';
                      } else if (r.state === 'assigned' || r.state === 'confirmed' || r.state === 'waiting') {
                        stateLabel = 'Đang chờ nhập';
                        stateClass = 'text-warning';
                      } else if (r.state === 'draft') {
                        stateLabel = 'Nháp';
                        stateClass = 'text-muted';
                      } else if (r.state === 'cancel') {
                        stateLabel = 'Đã hủy';
                        stateClass = 'text-danger';
                      }

                      return (
                        <tr key={r.id}>
                          <td><strong>{r.receipt_number || '-'}</strong></td>
                          <td>{r.origin || '-'}</td>
                          <td>{r.vendor || 'N/A'}</td>
                          <td><span className={stateClass}>{stateLabel}</span></td>
                          <td style={{ textAlign: 'right', paddingRight: '15px', whiteSpace: 'nowrap' }}>
                            {(r.state === 'assigned' || r.state === 'draft') && isWarehouseStaff && (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleValidateReceipt(r.id)}
                                style={{ padding: '4px 8px', fontSize: '0.75rem', marginRight: '8px', minHeight: 'unset' }}
                              >
                                Duyệt Nhập Kho
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleOpenDetail('receipt', r.id)}
                              style={{ padding: '4px 8px', fontSize: '0.75rem', minHeight: 'unset' }}
                            >
                              Chi tiết
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. Unified transactional history Subtab - ✅ Giữ nguyên (chỉ từ Receipts) */}
      {activeSubTab === 'historyList' && (
        <div className="sub-tab-panel">
          <div className="glass-panel datatable-container">
            <div className="table-header">
              <h2>Lịch Sử Phiếu Nhận Kho Đã Hoàn Tất</h2>
              <Button variant="secondary" onClick={() => { fetchReceipts(); }}>Tải Lại</Button>
            </div>
            <div className="responsive-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Mã phiếu</th>
                    <th>Đối tác</th>
                    <th>Tham chiếu</th>
                    <th>Ngày cập nhật</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {historyList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center">Chưa có lịch sử giao dịch hoàn tất.</td>
                    </tr>
                  ) : (
                    historyList.map((item, index) => (
                      <tr key={index}>
                        <td><strong>{item.ref}</strong></td>
                        <td>{item.partner}</td>
                        <td>{item.detail}</td>
                        <td className="text-muted">{item.date}</td>
                        <td>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenDetail('receipt', item.id)}
                            style={{ margin: 0, padding: '4px 8px', fontSize: '0.75rem', minHeight: 'unset' }}
                          >
                            Xem chi tiết
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Create Modal - ✅ Giữ nguyên */}
      <Modal
        isOpen={isVendorModalOpen}
        onClose={() => setIsVendorModalOpen(false)}
        title="Thêm Nhà Cung Cấp Mới"
        maxWidth="550px"
      >
        <form onSubmit={handleVendorSubmit} className="dialog-content">
          <div className="form-group">
            <label htmlFor="partnerName">Tên Nhà Cung Cấp:</label>
            <input
              type="text"
              id="partnerName"
              className="form-input"
              required
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="Nhập tên nhà cung cấp..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="partnerStreet">Địa Chỉ (Đường/Phố):</label>
            <input
              type="text"
              id="partnerStreet"
              className="form-input"
              value={vendorStreet}
              onChange={(e) => setVendorStreet(e.target.value)}
              placeholder="Nhập địa chỉ..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="partnerPhone">Số Điện Thoại:</label>
            <input
              type="tel"
              id="partnerPhone"
              className="form-input"
              value={vendorPhone}
              onChange={(e) => setVendorPhone(e.target.value)}
              placeholder="Nhập số điện thoại..."
            />
          </div>

          <div className="dialog-buttons" style={{ marginTop: '20px' }}>
            <Button type="button" variant="secondary" onClick={() => setIsVendorModalOpen(false)}>
              Hủy Bỏ
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmittingVendor}>
              {isSubmittingVendor ? 'Đang tạo...' : 'Lưu Lại'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ✅ History Detail Modal - chỉ dùng cho receipt */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="Chi Tiết Phiếu Nhận Kho"
        maxWidth="800px"
      >
        {isDetailLoading ? (
          <div className="text-center" style={{ padding: '24px 0' }}>Đang tải thông tin chi tiết...</div>
        ) : detailData ? (
          <div className="dialog-content">
            <div id="historyDetailInfo" style={{ marginBottom: '16px', fontSize: '0.95rem', lineHeight: '1.6' }}>
              <strong>Mã phiếu:</strong> {detailData.receipt.name} <br />
              <strong>Tham chiếu:</strong> {detailData.receipt.origin || 'N/A'} <br />
              <strong>Đối tác:</strong> {detailData.receipt.partner_id ? detailData.receipt.partner_id[1] : 'N/A'} <br />
              <strong>Trạng thái:</strong> {detailData.receipt.state === 'done' ? (
                <span className="text-success" style={{ fontWeight: 600 }}>Đã hoàn tất (DONE)</span>
              ) : detailData.receipt.state}
            </div>

            <div className="responsive-table-wrapper" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Sản Phẩm</th>
                    <th>Yêu Cầu (Demand)</th>
                    <th>Đã Nhận (Done)</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {!detailData.lines || detailData.lines.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center">Không có sản phẩm nào.</td>
                    </tr>
                  ) : (
                    detailData.lines.map((l: any, idx: number) => {
                      let stateTxt = l.state;
                      if (l.state === 'draft') stateTxt = 'Nháp';
                      else if (l.state === 'waiting') stateTxt = 'Chờ dòng khác';
                      else if (l.state === 'confirmed') stateTxt = 'Chờ nhập';
                      else if (l.state === 'assigned') stateTxt = 'Khả dụng';
                      else if (l.state === 'done') stateTxt = 'Đã nhận';
                      else if (l.state === 'cancel') stateTxt = 'Hủy';

                      return (
                        <tr key={idx}>
                          <td>{l.product_id ? l.product_id[1] : l.name}</td>
                          <td>{l.product_uom_qty}</td>
                          <td><strong>{l.quantity_done || 0}</strong></td>
                          <td>{stateTxt || '-'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="dialog-buttons" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              {detailData.receipt.state === 'done' && (
                <Button
                  variant="danger"
                  onClick={() => handleOpenReturn(detailData)}
                  style={{ marginRight: 'auto' }}
                >
                  Trả Hàng (Return)
                </Button>
              )}
              <a
                href={`/api/odoo/receipts/${detailData.receipt.id}/pdf?access_token=${encodeURIComponent(session?.token || '')}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <Button variant="primary">
                  Tải Phiếu Nhập Kho (PDF)
                </Button>
              </a>
              <a
                href={`/api/odoo/receipts/${detailData.receipt.id}/invoice-pdf?access_token=${encodeURIComponent(session?.token || '')}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <Button variant="secondary">
                  Tải Hóa Đơn Mua Hàng (PDF)
                </Button>
              </a>
              <Button variant="secondary" onClick={() => setIsDetailModalOpen(false)}>
                Đóng
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Return dialog - ✅ Giữ nguyên */}
      <Modal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        title="Yêu Cầu Trả Hàng (Return Products)"
        maxWidth="650px"
      >
        <form onSubmit={handleReturnSubmit} className="dialog-content">
          <p style={{ fontSize: '0.9rem', marginBottom: '12px', fontWeight: 600, color: 'var(--accent-danger)' }}>
            {returnReceiptInfo}
          </p>

          <div className="responsive-table-wrapper" style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '12px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '6px' }}>
            <table style={{ fontSize: '0.85rem', width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.02)' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Sản Phẩm</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Đã Nhận</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Đơn Giá Vốn</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '130px' }}>Số Lượng Trả</th>
                </tr>
              </thead>
              <tbody>
                {returnLines.map((line, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ padding: '8px' }}>
                      <strong>{line.product_name}</strong>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{line.quantity_done}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      <input
                        type="number"
                        className="form-input"
                        value={line.price_unit}
                        onChange={(e) => handleReturnLinePriceChange(index, Number(e.target.value))}
                        style={{ width: '110px', textAlign: 'right', padding: '4px', display: 'inline-block', margin: 0 }}
                        min="0"
                      />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <input
                        type="number"
                        className="form-input"
                        value={line.qty_to_return}
                        onChange={(e) => handleReturnLineQtyChange(index, Number(e.target.value))}
                        max={line.quantity_done}
                        min="0"
                        style={{ width: '80px', textAlign: 'center', padding: '4px', display: 'inline-block', margin: 0 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="dialog-buttons" style={{ marginTop: '20px' }}>
            <Button type="button" variant="secondary" onClick={() => setIsReturnModalOpen(false)}>
              Hủy Bỏ
            </Button>
            <Button type="submit" variant="danger" disabled={isSubmittingReturn}>
              {isSubmittingReturn ? 'Đang xử lý...' : 'Xác Nhận Trả Hàng'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Orders;
