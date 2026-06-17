import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Modal from './components/common/Modal';
import Button from './components/common/Button';

// Views
import Login from './views/Login';
import Dashboard from './views/Dashboard';
import Products from './views/Products';
import Customers from './views/Customers';
import Vendors from './views/Vendors';
import Stock from './views/Stock';
import Orders from './views/Orders';
import Production from './views/Production';
import Sales from './views/Sales';
import Invoices from './views/Invoices';
import Terminal from './views/Terminal';
import Settings from './views/Settings';

const AppContent: React.FC = () => {
  const { session, activeTab, toasts, removeToast, showToast } = useApp();

  const [isOpenMobile, setIsOpenMobile] = useState<boolean>(false);
  
  // Change password modal states
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState<boolean>(false);
  const [oldPassword, setOldPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [cpwError, setCpwError] = useState<string>('');
  const [isSubmittingCpw, setIsSubmittingCpw] = useState<boolean>(false);

  const handleToggleSidebar = () => {
    setIsOpenMobile(!isOpenMobile);
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCpwError('');
    if (!oldPassword || !newPassword) {
      showToast('Vui lòng nhập mật khẩu cũ và mật khẩu mới', 'warning');
      return;
    }

    setIsSubmittingCpw(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = await response.json();

      if (data.success) {
        setIsChangePasswordOpen(false);
        showToast(data.message || 'Đổi mật khẩu thành công!', 'success');
        setOldPassword('');
        setNewPassword('');
      } else {
        setCpwError(data.error || 'Đổi mật khẩu thất bại.');
      }
    } catch (err: any) {
      setCpwError('Lỗi kết nối máy chủ.');
    } finally {
      setIsSubmittingCpw(false);
    }
  };

  // If not logged in, render the Login screen overlay
  if (!session) {
    return (
      <div className="app-container">
        <Login />
        {/* Toast notifications */}
        <div className="toast-container" id="toastContainer">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`toast ${toast.type}`}
              onClick={() => removeToast(toast.id)}
              style={{ cursor: 'pointer' }}
            >
              <span className="toast-message">{toast.message}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Active Panel View Routing
  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'products':
        return <Products />;
      case 'customers':
        return <Customers />;
      case 'vendors':
        return <Vendors />;
      case 'stock':
        return <Stock />;
      case 'orders':
        return <Orders />;
      case 'production':
        return <Production />;
      case 'sales':
        return <Sales />;
      case 'invoices':
        return <Invoices />;
      case 'terminal':
        return <Terminal />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container" id="appContainer">
      {/* Mobile overlay */}
      {isOpenMobile && (
        <div 
          className="sidebar-overlay show" 
          id="sidebarOverlay" 
          onClick={() => setIsOpenMobile(false)} 
        />
      )}

      {/* Sidebar */}
      <Sidebar 
        onShowChangePassword={() => setIsChangePasswordOpen(true)} 
        isOpenMobile={isOpenMobile}
        setIsOpenMobile={setIsOpenMobile}
      />

      {/* Main panel layout */}
      <main className="main-content" id="appMain">
        <Header onToggleSidebar={handleToggleSidebar} />
        <div className="content-container">
          {renderActiveView()}
        </div>
      </main>

      {/* Global Toast notifications */}
      <div className="toast-container" id="toastContainer">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast ${toast.type}`}
            onClick={() => removeToast(toast.id)}
            style={{ cursor: 'pointer' }}
          >
            <span className="toast-message">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Change password modal dialog */}
      <Modal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        title="Đổi Mật Khẩu"
        maxWidth="450px"
      >
        <form onSubmit={handleChangePasswordSubmit} className="dialog-content">
          <div className="form-group">
            <label htmlFor="cpwOldPassword">Mật Khẩu Cũ:</label>
            <input
              type="password"
              id="cpwOldPassword"
              className="form-input"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Nhập mật khẩu hiện tại..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="cpwNewPassword">Mật Khẩu Mới:</label>
            <input
              type="password"
              id="cpwNewPassword"
              className="form-input"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nhập mật khẩu mới..."
            />
          </div>

          {cpwError && (
            <div className="text-danger" style={{ fontSize: '0.85rem', fontWeight: 500, marginTop: '8px' }}>
              {cpwError}
            </div>
          )}

          <div className="dialog-buttons" style={{ marginTop: '20px' }}>
            <Button type="button" variant="secondary" onClick={() => setIsChangePasswordOpen(false)}>
              Hủy Bỏ
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmittingCpw}>
              {isSubmittingCpw ? 'Đang đổi...' : 'Đổi Mật Khẩu'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

export default App;
