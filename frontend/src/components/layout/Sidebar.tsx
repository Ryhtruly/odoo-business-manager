import React, { useEffect, useState } from 'react';
import { useApp, roleNames } from '../../context/AppContext';

// Role tab access map
const roleTabMap: Record<string, string[]> = {
  admin: ['dashboard', 'products', 'customers', 'vendors', 'stock', 'orders', 'production', 'sales', 'invoices', 'terminal', 'settings'],
  ke_toan_kho: ['dashboard', 'products', 'stock', 'orders', 'vendors'],
  san_xuat: ['dashboard', 'production', 'stock'],
  kinh_doanh: ['dashboard', 'sales', 'customers', 'stock'],
  ke_toan_ban_hang: ['dashboard', 'invoices', 'customers']
};

interface SidebarProps {
  onShowChangePassword: () => void;
  isOpenMobile: boolean;
  setIsOpenMobile: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onShowChangePassword, isOpenMobile, setIsOpenMobile }) => {
  const { session, activeTab, setActiveTab, logout } = useApp();
  const [isDark, setIsDark] = useState<boolean>(false);

  const role = session?.role || '';
  const allowedTabs = roleTabMap[role] || ['dashboard'];

  // Initialize Theme from localStorage
  useEffect(() => {
    const cachedTheme = localStorage.getItem('theme');
    const isDarkTheme = cachedTheme === 'dark';
    setIsDark(isDarkTheme);
    
    // Older browser support fallback
    const appContainer = document.getElementById('appContainer');
    if (appContainer && !CSS.supports('selector(:has(*))')) {
      appContainer.classList.toggle('dark-theme', isDarkTheme);
    }
  }, []);

  const handleThemeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setIsDark(checked);
    localStorage.setItem('theme', checked ? 'dark' : 'light');
    
    // Older browser support fallback
    const appContainer = document.getElementById('appContainer');
    if (appContainer && !CSS.supports('selector(:has(*))')) {
      appContainer.classList.toggle('dark-theme', checked);
    }
  };

  const tabsMeta = [
    {
      id: 'dashboard',
      label: 'Tổng Quan',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      )
    },
    {
      id: 'products',
      label: 'Sản Phẩm (Mã & Giá)',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      )
    },
    {
      id: 'customers',
      label: 'Quản Lý Khách Hàng',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    },
    {
      id: 'vendors',
      label: 'Quản Lý Nhà Cung Cấp',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      )
    },
    {
      id: 'stock',
      label: 'Tồn Kho (Theo dõi)',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
        </svg>
      )
    },
    {
      id: 'orders',
      label: 'Mua Hàng & Nhập Kho',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      )
    },
    {
      id: 'production',
      label: 'Ghi Nhận Sản Xuất',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 10v6M2 10v6M12 2v20M12 10H2M22 10H12M12 14H2M22 14H12" />
        </svg>
      )
    },
    {
      id: 'sales',
      label: 'Kinh Doanh (Bán Hàng)',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    },
    {
      id: 'invoices',
      label: 'Hóa Đơn & Thanh Toán',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <line x1="12" y1="4" x2="12" y2="20" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      )
    },
    {
      id: 'terminal',
      label: 'Terminal Logs',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      )
    },
    {
      id: 'settings',
      label: 'Cài Đặt',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )
    }
  ];

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    setIsOpenMobile(false);
  };

  return (
    <aside className={`sidebar ${isOpenMobile ? 'show' : ''}`} id="appSidebar">
      <div className="sidebar-brand">
        <svg className="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
        <span>Theo dõi hoạt động sản xuất tại các xưởng</span>
      </div>

      <nav className="sidebar-nav">
        {tabsMeta.map((tab) => {
          if (!allowedTabs.includes(tab.id)) return null;
          return (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => handleTabClick(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {session && (
          <div className="sidebar-user-card" id="sidebarUserProfile" style={{ display: 'flex' }}>
            <div className="user-avatar" id="userAvatar">
              {session.name ? session.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="user-details">
              <div className="user-name" id="userNameLabel">
                {session.name}
              </div>
              <span className="user-role-badge" id="userRoleLabel">
                {roleNames[session.role] || session.role}
              </span>
            </div>
            <button className="btn-logout" id="btnLogout" title="Đăng xuất" onClick={logout}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        )}

        <div className="theme-switch-wrapper">
          <span>Giao diện Tối</span>
          <label className="theme-toggle-label" htmlFor="themeCheckbox">
            <input
              type="checkbox"
              id="themeCheckbox"
              className="theme-toggle"
              checked={isDark}
              onChange={handleThemeChange}
            />
            <span className="theme-toggle-slider"></span>
          </label>
        </div>

        <button
          className="btn btn-secondary btn-sm"
          id="btnShowChangePassword"
          style={{ width: 100, marginTop: 16 }}
          onClick={onShowChangePassword}
        >
          Đổi Mật Khẩu
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
