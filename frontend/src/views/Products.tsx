import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';

export const Products: React.FC = () => {
  const {
    session,
    cache,
    loading,
    fetchProducts,
    showToast,
    removeVietnameseTones,
    generateSKUFromName
  } = useApp();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [sortOption, setSortOption] = useState<string>('name_asc');

  // Modal control states
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editProdId, setEditProdId] = useState<string | number | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formCode, setFormCode] = useState<string>('');
  const [formType, setFormType] = useState<string>('product');
  const [formPrice, setFormPrice] = useState<number>(0);
  const [formCost, setFormCost] = useState<number>(0);
  const [formQty, setFormQty] = useState<number>(0);
  const [formDesc, setFormDesc] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const role = session?.role || '';
  const isAllowedToManage = role === 'admin' || role === 'ke_toan_kho';
  // Debug: log session info
  console.log('[Products] session role:', role, '| isAllowedToManage:', isAllowedToManage);

  // Load products initially
  useEffect(() => {
    if (cache.products.length === 0) {
      fetchProducts();
    }
  }, []);

  const getCustomProductType = (p: any): string => {
    if (p.type === 'service') return 'service';
    if (p.type === 'combo') return 'combo';
    if (p.purchase_ok && !p.sale_ok) return 'raw_material';
    if (!p.purchase_ok && p.sale_ok) return 'manufactured';
    if (p.purchase_ok && p.sale_ok) return 'trading';
    return p.type || 'consu';
  };

  const getProductTypeBadge = (customType: string) => {
    switch (customType) {
      case 'raw_material':
        return <span className="badge badge-raw" style={{ background: 'rgba(52, 152, 219, 0.15)', color: '#3498db', border: '1px solid rgba(52, 152, 219, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontSize: '0.8rem' }}>Nguyên liệu</span>;
      case 'manufactured':
        return <span className="badge badge-manufactured" style={{ background: 'rgba(46, 204, 113, 0.15)', color: '#2ecc71', border: '1px solid rgba(46, 204, 113, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontSize: '0.8rem' }}>Tự làm</span>;
      case 'trading':
        return <span className="badge badge-trading" style={{ background: 'rgba(155, 89, 182, 0.15)', color: '#9b59b6', border: '1px solid rgba(155, 89, 182, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontSize: '0.8rem' }}>Thương mại</span>;
      case 'service':
        return <span className="badge badge-service" style={{ background: 'rgba(241, 196, 15, 0.15)', color: '#f1c40f', border: '1px solid rgba(241, 196, 15, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontSize: '0.8rem' }}>Dịch vụ</span>;
      case 'combo':
        return <span className="badge badge-combo" style={{ background: 'rgba(230, 126, 34, 0.15)', color: '#e67e22', border: '1px solid rgba(230, 126, 34, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontSize: '0.8rem' }}>Combo</span>;
      default:
        return <span className="badge badge-secondary" style={{ background: 'rgba(149, 165, 166, 0.15)', color: '#95a5a6', border: '1px solid rgba(149, 165, 166, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontSize: '0.8rem' }}>Lưu kho</span>;
    }
  };

  const getStockBadge = (p: any) => {
    const isStockable = ['product', 'consu', 'raw_material', 'manufactured', 'trading'].includes(p.type) || ['product', 'consu', 'raw_material', 'manufactured', 'trading'].includes(getCustomProductType(p));
    const qty = isStockable ? (p.qty_available ?? 0) : null;
    
    if (qty === null) {
      return <span className="text-muted">-</span>;
    } else if (qty <= 0) {
      return <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-danger)', border: '1px solid rgba(239, 68, 68, 0.3)', fontWeight: 700 }}>Hết hàng (0)</span>;
    } else if (qty <= 5) {
      return <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-danger)', border: '1px solid rgba(239, 68, 68, 0.3)', fontWeight: 700 }}>Dưới tối thiểu ({qty})</span>;
    } else {
      return <strong className="text-success">{qty}</strong>;
    }
  };

  const handleNameChange = (val: string) => {
    setFormName(val);
    if (!editProdId) {
      setFormCode(generateSKUFromName(val));
    }
  };

  const openCreateModal = () => {
    setEditProdId(null);
    setFormName('');
    setFormCode('');
    setFormType('product');
    setFormPrice(0);
    setFormCost(0);
    setFormQty(0);
    setFormDesc('');
    setIsEditModalOpen(true);
  };

  const openEditModal = (p: any) => {
    console.log('[Products] openEditModal called for:', p.name, p.id);
    setEditProdId(p.id);
    setFormName(p.name || '');
    setFormCode(p.default_code || '');
    setFormType(getCustomProductType(p));
    setFormPrice(p.list_price || 0);
    setFormCost(p.standard_price || 0);
    setFormQty(p.qty_available || 0);
    setFormDesc(p.description || '');
    setIsEditModalOpen(true);
    console.log('[Products] isEditModalOpen set to true');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Vui lòng nhập tên sản phẩm', 'warning');
      return;
    }

    setIsSubmitting(true);
    const payload = {
      name: formName.trim(),
      default_code: formCode.trim(),
      type: formType,
      list_price: Number(formPrice),
      standard_price: Number(formCost),
      description: formDesc.trim()
    };

    try {
      showToast(editProdId ? 'Đang cập nhật sản phẩm...' : 'Đang tạo sản phẩm mới...', 'info');
      const url = editProdId ? `/api/odoo/products/${editProdId}` : '/api/odoo/products';
      const method = editProdId ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data.success) {
        const targetId = editProdId || data.id;
        if (formType !== 'service' && formType !== 'combo') {
          const originalQty = editProdId ? (cache.products.find(p => p.id === editProdId)?.qty_available ?? 0) : 0;
          if (!editProdId || Number(formQty) !== originalQty) {
            try {
              await fetch(`/api/odoo/products/${targetId}/adjust-stock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newQty: Number(formQty) })
              });
            } catch (stockErr) {
              console.error('Failed to adjust stock', stockErr);
              showToast('Lưu sản phẩm thành công nhưng không thể điều chỉnh tồn kho', 'warning');
            }
          }
        }

        showToast(editProdId ? 'Cập nhật sản phẩm thành công' : 'Thêm sản phẩm thành công', 'success');
        setIsEditModalOpen(false);
        fetchProducts();
      } else {
        showToast(`Lỗi: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };



  const handleDeleteProduct = async (p: any) => {
    if (!confirm(`Bạn có chắc chắn muốn ngừng kinh doanh sản phẩm "${p.name}" (${p.default_code || 'Không có SKU'}) khỏi Odoo không?`)) {
      return;
    }

    try {
      showToast('Đang thực hiện ngừng kinh doanh...', 'info');
      const response = await fetch(`/api/odoo/products/${p.id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        showToast('Đã lưu trữ sản phẩm thành công', 'success');
        fetchProducts();
      } else {
        showToast(`Lỗi khi ngừng kinh doanh: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    }
  };

  // Filter and sort products
  const filteredProducts = cache.products
    .filter(p => {
      const term = removeVietnameseTones(searchTerm.toLowerCase().trim());
      const matchesSearch =
        removeVietnameseTones(p.name || '').toLowerCase().includes(term) ||
        removeVietnameseTones(p.default_code || '').toLowerCase().includes(term);

      let matchesType = true;
      if (filterType !== 'all') {
        if (filterType === 'product') {
          matchesType = p.type === 'product' || p.type === 'consu';
        } else {
          matchesType = getCustomProductType(p) === filterType;
        }
      }
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      const nameA = a.name || '';
      const nameB = b.name || '';
      const priceA = Number(a.list_price || 0);
      const priceB = Number(b.list_price || 0);
      const stockA = Number(a.qty_available || 0);
      const stockB = Number(b.qty_available || 0);

      switch (sortOption) {
        case 'name_asc':
          return nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
        case 'name_desc':
          return nameB.localeCompare(nameA, 'vi', { sensitivity: 'base' });
        case 'price_asc':
          return priceA - priceB;
        case 'price_desc':
          return priceB - priceA;
        case 'stock_asc':
          return stockA - stockB;
        case 'stock_desc':
          return stockB - stockA;
        default:
          return 0;
      }
    });

  return (
    <div className="tab-panel active" id="panelProducts">
      <div className="glass-panel datatable-container">
        <div className="table-header">
          <h2>Danh Sách Sản Phẩm (Odoo)</h2>
          <div className="table-actions">
            <input
              type="text"
              className="form-input search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm tên hoặc mã sản phẩm..."
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="form-input"
              style={{ padding: '8px' }}
            >
              <option value="all">Tất cả phân loại</option>
              <option value="product">Lưu kho</option>
              <option value="service">Dịch vụ</option>
              <option value="combo">Combo</option>
              <option value="raw_material">Nguyên liệu</option>
              <option value="manufactured">Tự làm</option>
              <option value="trading">Thương mại</option>
            </select>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="form-input"
              style={{ padding: '8px' }}
            >
              <option value="name_asc">Tên (A-Z)</option>
              <option value="name_desc">Tên (Z-A)</option>
              <option value="price_asc">Giá bán (Thấp - Cao)</option>
              <option value="price_desc">Giá bán (Cao - Thấp)</option>
              <option value="stock_desc">Tồn kho (Nhiều - Ít)</option>
              <option value="stock_asc">Tồn kho (Ít - Nhiều)</option>
            </select>
            {isAllowedToManage && (
              <Button variant="primary" onClick={openCreateModal}>
                Thêm Sản Phẩm
              </Button>
            )}
            <Button variant="secondary" onClick={fetchProducts}>
              Tải Lại
            </Button>
          </div>
        </div>
        
        <div className="responsive-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Mã sản phẩm</th>
                <th>Tên sản phẩm</th>
                <th>Loại</th>
                <th style={{ textAlign: 'right' }}>Giá bán</th>
                <th style={{ textAlign: 'right' }}>Giá vốn</th>
                <th style={{ textAlign: 'right' }}>Tồn kho</th>
                <th>Cập nhật cuối</th>
                <th style={{ width: '120px', textAlign: 'right', paddingRight: '15px' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {(loading.products && cache.products.length === 0) ? (
                <tr>
                  <td colSpan={8} className="text-center">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center">
                    Không tìm thấy sản phẩm nào.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const customType = getCustomProductType(p);
                  const updateDate = p.write_date ? new Date(p.write_date).toLocaleDateString('vi-VN') : 'N/A';
                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.default_code || '-'}</strong>
                      </td>
                      <td>{p.name}</td>
                      <td>{getProductTypeBadge(customType)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {p.list_price ? Number(p.list_price).toLocaleString() + ' đ' : '0 đ'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {p.standard_price ? Number(p.standard_price).toLocaleString() + ' đ' : '0 đ'}
                      </td>
                      <td style={{ textAlign: 'right' }}>{getStockBadge(p)}</td>
                      <td className="text-muted">{updateDate}</td>
                        <td style={{ textAlign: 'right', paddingRight: '15px' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <Button size="sm" variant="secondary" onClick={() => openEditModal(p)} style={{ margin: 0, padding: '4px 8px', fontSize: '0.8rem', minHeight: 'unset' }}>
                              Sửa
                            </Button>
                            {isAllowedToManage && (
                              <Button size="sm" variant="danger" onClick={() => handleDeleteProduct(p)} style={{ margin: 0, padding: '4px 8px', fontSize: '0.8rem', minHeight: 'unset' }}>
                                Ẩn
                              </Button>
                            )}
                          </div>
                        </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Edit/Create Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={editProdId ? '✏️ Cập Nhật Sản Phẩm' : '➕ Thêm Sản Phẩm Mới'}
        maxWidth="600px"
      >
        <form onSubmit={handleFormSubmit}>
          {/* Tên sản phẩm */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Tên Sản Phẩm <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              id="prodName"
              className="form-input"
              required
              value={formName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Nhập tên sản phẩm..."
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* Loại sản phẩm - full width */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Loại Sản Phẩm <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              id="prodType"
              className="form-input"
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', height: '44px' }}
            >
              <option value="raw_material">🔩 Nguyên vật liệu</option>
              <option value="manufactured">🏭 Thành phẩm tự làm</option>
              <option value="trading">🔄 Hàng mua - bán lại</option>
              <option value="service">🛠️ Dịch vụ</option>
              <option value="combo">📦 Combo</option>
            </select>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #f3f4f6', margin: '4px 0 16px' }} />

          {/* Giá bán + Giá vốn + Tồn kho - 3 cột */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            {/* Giá bán */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                💰 Giá Bán (đ)
              </label>
              <input
                type="number"
                id="prodPrice"
                className="form-input"
                required
                min="0"
                value={formPrice}
                onChange={(e) => setFormPrice(Number(e.target.value))}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            {/* Giá vốn */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                🏷️ Giá Vốn (đ)
              </label>
              <input
                type="number"
                id="prodCost"
                className="form-input"
                required
                min="0"
                value={formCost}
                onChange={(e) => setFormCost(Number(e.target.value))}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            {/* Tồn kho */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: formType === 'service' || formType === 'combo' ? '#d1d5db' : '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                📦 Tồn Kho
              </label>
              <input
                type="number"
                id="prodQty"
                className="form-input"
                min="0"
                disabled={formType === 'service' || formType === 'combo'}
                value={formQty}
                onChange={(e) => setFormQty(Number(e.target.value))}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  ...(formType === 'service' || formType === 'combo'
                    ? { backgroundColor: '#f9fafb', color: '#9ca3af', cursor: 'not-allowed', border: '1px solid #e5e7eb' }
                    : {})
                }}
              />
              {(formType === 'service' || formType === 'combo') && (
                <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '4px' }}>Không áp dụng</p>
              )}
            </div>
          </div>

          {/* Ghi chú */}
          <div style={{ marginBottom: '4px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              📝 Ghi Chú / Mô Tả
            </label>
            <textarea
              id="prodDesc"
              className="form-input"
              rows={3}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="Nhập ghi chú hoặc thông tin bổ sung..."
              style={{ width: '100%', boxSizing: 'border-box', height: 'auto', resize: 'vertical', minHeight: '80px' }}
            />
          </div>

          {/* Buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid #f3f4f6',
          }}>
            <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)}>
              Hủy Bỏ
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? '⏳ Đang lưu...' : '💾 Lưu Lại'}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default Products;
