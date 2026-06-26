import React from 'react';
import { useApp } from '../../context/AppContext';

const tabMeta: Record<string, { title: string; desc: string }> = {
  dashboard: { title: 'Tổng Quan Hệ Thống', desc: 'Giám sát và kiểm soát dữ liệu Odoo - Google Sheets' },
  products: { title: 'Quản Lý Sản Phẩm (Mã & Giá)', desc: 'Danh sách sản phẩm được đồng bộ từ Odoo ERP' },
  stock: { title: 'Chi Tiết Tồn Kho', desc: 'Số lượng vật lý và vị trí lưu kho của các hàng hóa' },
  orders: { title: 'Kế Toán Kho: Mua Hàng & Nhập Kho', desc: 'Quản lý mua nguyên vật liệu và duyệt nhập kho hàng hóa' },
  production: { title: 'Bộ Phận Sản Xuất: Báo Cáo Sản Lượng', desc: 'Nhập sản lượng sản xuất hàng ngày và khấu hao nguyên vật liệu' },
  sales: { title: 'Bộ Phận Kinh Doanh: Bán Hàng', desc: 'Tạo đơn hàng bán (Sales Orders) cho khách hàng' },
  invoices: { title: 'Kế Toán Bán Hàng: Hóa Đơn & Thanh Toán', desc: 'Quản lý hóa đơn xuất bán, ghi sổ và thanh toán' },
  customers: { title: 'Quản Lý Khách Hàng', desc: 'Danh sách và thông tin liên hệ của khách hàng đồng bộ từ Odoo' },
  vendors: { title: 'Quản Lý Nhà Cung Cấp', desc: 'Danh sách và thông tin liên hệ của các đối tác nhà cung cấp đồng bộ từ Odoo' },
  terminal: { title: 'Màn Hình Logs Hệ Thống', desc: 'Xem lại toàn bộ lịch sử console logs đã chạy' },
  settings: { title: 'Cài Đặt Kết Nối', desc: 'Thiết lập thông tin đăng nhập Odoo và khóa bảo mật Google' }
};

interface HeaderProps {
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const { activeTab, odooConnected, gsheetConnected, checkSystemStatus, fetchProducts, fetchStock, fetchInvoices, fetchCustomers, fetchVendors, fetchPOs, fetchReceipts, fetchSO, fetchProductionHistory } = useApp();

  const meta = tabMeta[activeTab] || { title: 'Hệ Thống', desc: '' };

  const handleRefresh = async () => {
    await checkSystemStatus();
    // Reload active tab data
    if (activeTab === 'products') fetchProducts();
    else if (activeTab === 'stock') fetchStock();
    else if (activeTab === 'invoices') fetchInvoices();
    else if (activeTab === 'customers') fetchCustomers();
    else if (activeTab === 'vendors') fetchVendors();
    else if (activeTab === 'orders') {
      fetchPOs();
      fetchReceipts();
    } else if (activeTab === 'production') {
      fetchProductionHistory();
    } else if (activeTab === 'sales') {
      fetchSO();
    }
  };

  return (
    <header className="app-header">
      <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          id="btnToggleSidebar"
          onClick={onToggleSidebar}
          title="Menu"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <div className="mobile-brand" style={{ display: 'none', alignItems: 'center', gap: '8px' }}>
          <svg
            className="brand-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ width: '20px', height: '20px' }}
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          <span
            style={{
              fontWeight: 700,
              fontSize: '0.95rem',
              background: 'var(--accent-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Theo dõi SX tại các xưởng
          </span>
        </div>
        <div>
          <h1 id="pageTitle">{meta.title}</h1>
          <p id="pageDescription" className="text-muted">
            {meta.desc}
          </p>
        </div>
      </div>

      <div className="header-right">
        <div className="status-indicator-container">
          <div className="status-item" id="odooStatusBadge">
            <span className={`status-dot ${odooConnected ? 'success' : 'danger'}`}></span>
            <span>Odoo: {odooConnected ? 'Đang hoạt động' : 'Lỗi kết nối'}</span>
          </div>
          <div className="status-item" id="gsheetStatusBadge">
            <span className={`status-dot ${gsheetConnected ? 'success' : 'danger'}`}></span>
            <span>GSheet: {gsheetConnected ? 'Đang hoạt động' : 'Lỗi kết nối'}</span>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-icon"
          id="btnRefreshStatus"
          title="Tải lại trạng thái"
          onClick={handleRefresh}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M23 4v6h-6" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>
    </header>
  );
};

export default Header;
