import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import Button from '../components/common/Button';

export const Stock: React.FC = () => {
  const {
    cache,
    loading,
    fetchStock,
    fetchProducts,
    removeVietnameseTones
  } = useApp();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [sortOption, setSortOption] = useState<string>('name_asc');

  useEffect(() => {
    if (cache.stock.length === 0) {
      fetchStock();
    }
    if (cache.products.length === 0) {
      fetchProducts();
    }
  }, []);

  const getProductInfo = (productCode: string, productName: string) => {
    return cache.products.find(p => 
      (p.default_code && p.default_code === productCode) || 
      (p.name && p.name === productName)
    );
  };

  const getCustomProductType = (p: any): string => {
    if (!p) return 'consu';
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
        return <span style={{ background: 'rgba(52, 152, 219, 0.15)', color: '#3498db', border: '1px solid rgba(52, 152, 219, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontSize: '0.8rem' }}>Nguyên liệu</span>;
      case 'manufactured':
        return <span style={{ background: 'rgba(46, 204, 113, 0.15)', color: '#2ecc71', border: '1px solid rgba(46, 204, 113, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontSize: '0.8rem' }}>Tự làm</span>;
      case 'trading':
        return <span style={{ background: 'rgba(155, 89, 182, 0.15)', color: '#9b59b6', border: '1px solid rgba(155, 89, 182, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontSize: '0.8rem' }}>Thương mại</span>;
      case 'service':
        return <span style={{ background: 'rgba(241, 196, 15, 0.15)', color: '#f1c40f', border: '1px solid rgba(241, 196, 15, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontSize: '0.8rem' }}>Dịch vụ</span>;
      case 'combo':
        return <span style={{ background: 'rgba(230, 126, 34, 0.15)', color: '#e67e22', border: '1px solid rgba(230, 126, 34, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontSize: '0.8rem' }}>Combo</span>;
      default:
        return <span style={{ background: 'rgba(149, 165, 166, 0.15)', color: '#95a5a6', border: '1px solid rgba(149, 165, 166, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontSize: '0.8rem' }}>Lưu kho</span>;
    }
  };

  const filteredStock = cache.stock
    .filter(s => {
      const query = removeVietnameseTones(searchTerm.toLowerCase().trim());
      const nameMatch = removeVietnameseTones(s.product_name || '').toLowerCase().includes(query);
      const codeMatch = s.product_code ? removeVietnameseTones(s.product_code).toLowerCase().includes(query) : false;
      const matchesSearch = nameMatch || codeMatch;

      let matchesType = true;
      if (filterType !== 'all') {
        const prod = getProductInfo(s.product_code, s.product_name);
        if (filterType === 'product') {
          const type = prod ? prod.type : 'consu';
          matchesType = type === 'product' || type === 'consu';
        } else {
          matchesType = getCustomProductType(prod) === filterType;
        }
      }
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      const nameA = a.product_name || '';
      const nameB = b.product_name || '';
      const qtyA = Number(a.quantity || 0);
      const qtyB = Number(b.quantity || 0);

      switch (sortOption) {
        case 'name_asc':
          return nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
        case 'name_desc':
          return nameB.localeCompare(nameA, 'vi', { sensitivity: 'base' });
        case 'stock_desc':
          return qtyB - qtyA;
        case 'stock_asc':
          return qtyA - qtyB;
        default:
          return 0;
      }
    });

  return (
    <div className="tab-panel active" id="panelStock">
      <div className="glass-panel datatable-container">
        <div className="table-header">
          <h2>Chi Tiết Số Lượng Tồn Kho</h2>
          <div className="table-actions" style={{ flex: 1 }}>
            <input
              type="text"
              className="form-input search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm sản phẩm..."
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
              <option value="name_asc">Sắp xếp: Tên (A-Z)</option>
              <option value="name_desc">Sắp xếp: Tên (Z-A)</option>
              <option value="stock_desc">Sắp xếp: Tồn kho (Nhiều - Ít)</option>
              <option value="stock_asc">Sắp xếp: Tồn kho (Ít - Nhiều)</option>
            </select>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <Button variant="secondary" onClick={() => { fetchStock(); fetchProducts(); }}>Tải Lại</Button>
            </div>
          </div>
        </div>
        
        <div className="responsive-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Mã sản phẩm</th>
                <th>Tên sản phẩm</th>
                <th>Phân loại</th>
                <th>Số lượng</th>
                <th>Ngày ghi nhận</th>
              </tr>
            </thead>
            <tbody>
              {(loading.stock && cache.stock.length === 0) ? (
                <tr>
                  <td colSpan={5} className="text-center">Đang tải dữ liệu...</td>
                </tr>
              ) : filteredStock.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center">Không tìm thấy thông tin tồn kho nào.</td>
                </tr>
              ) : (
                filteredStock.map((s, idx) => {
                  const writeDateStr = s.write_date ? new Date(s.write_date).toLocaleDateString('vi-VN') : 'N/A';
                  const prod = getProductInfo(s.product_code, s.product_name);
                  const customType = getCustomProductType(prod);
                  return (
                    <tr key={idx}>
                      <td><strong>{s.product_code || '-'}</strong></td>
                      <td>{s.product_name || 'N/A'}</td>
                      <td>{getProductTypeBadge(customType)}</td>
                      <td><strong className="text-success">{s.quantity}</strong></td>
                      <td className="text-muted">{writeDateStr}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Stock;
