import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import Button from '../components/common/Button';
import TableToolbar from '../components/common/TableToolbar';

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
    if (!p) return 'trading';
    if (p.purchase_ok && !p.sale_ok) return 'raw_material';
    if (!p.purchase_ok && p.sale_ok) return 'manufactured';
    return 'trading';
  };

  const getProductTypeBadge = (customType: string) => {
    switch (customType) {
      case 'raw_material':
        return <span style={{ background: 'rgba(52, 152, 219, 0.15)', color: '#3498db', border: '1px solid rgba(52, 152, 219, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontSize: '0.8rem' }}>Nguyên vật liệu</span>;
      case 'manufactured':
        return <span style={{ background: 'rgba(46, 204, 113, 0.15)', color: '#2ecc71', border: '1px solid rgba(46, 204, 113, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontSize: '0.8rem' }}>Thành phẩm</span>;
      case 'trading':
      default:
        return <span style={{ background: 'rgba(155, 89, 182, 0.15)', color: '#9b59b6', border: '1px solid rgba(155, 89, 182, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontSize: '0.8rem' }}>Hàng hóa thương mại</span>;
    }
  };

  const filteredStock = cache.stock
    .filter(s => {
      const query = removeVietnameseTones(searchTerm.toLowerCase().trim());
      const nameMatch = removeVietnameseTones(s.product_name || '').toLowerCase().includes(query);
      const codeMatch = s.product_code ? removeVietnameseTones(s.product_code).toLowerCase().includes(query) : false;
      const matchesSearch = nameMatch || codeMatch;

      const prod = getProductInfo(s.product_code, s.product_name);
      if (!prod) return false;

      let matchesType = true;
      if (filterType !== 'all') {
        matchesType = getCustomProductType(prod) === filterType;
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
          <TableToolbar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Tìm sản phẩm..."
            filterValue={filterType}
            onFilterChange={setFilterType}
            filterOptions={[
              { value: 'all', label: 'Tất cả phân loại' },
              { value: 'raw_material', label: 'Nguyên vật liệu' },
              { value: 'trading', label: 'Hàng hóa thương mại' },
              { value: 'manufactured', label: 'Thành phẩm' }
            ]}
            sortOption={sortOption}
            onSortChange={setSortOption}
            sortOptions={[
              { value: 'name_asc', label: 'Sắp xếp: Tên (A-Z)' },
              { value: 'name_desc', label: 'Sắp xếp: Tên (Z-A)' },
              { value: 'stock_desc', label: 'Sắp xếp: Tồn kho (Nhiều - Ít)' },
              { value: 'stock_asc', label: 'Sắp xếp: Tồn kho (Ít - Nhiều)' }
            ]}
          >
            <Button variant="secondary" onClick={() => { fetchStock(); fetchProducts(); }}>
              Tải Lại
            </Button>
          </TableToolbar>
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
