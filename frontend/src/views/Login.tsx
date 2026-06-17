import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';

export const Login: React.FC = () => {
  const { login, showToast } = useApp();

  // Login Form States
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [isLogginIn, setIsLoggingIn] = useState<boolean>(false);

  // Register Modal States
  const [isRegisterOpen, setIsRegisterOpen] = useState<boolean>(false);
  const [regUsername, setRegUsername] = useState<string>('');
  const [regName, setRegName] = useState<string>('');
  const [regRole, setRegRole] = useState<string>('ke_toan_kho');
  const [regPassword, setRegPassword] = useState<string>('');
  const [regError, setRegError] = useState<string>('');
  const [isRegistering, setIsRegistering] = useState<boolean>(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!loginUsername.trim() || !loginPassword) {
      showToast('Vui lòng nhập tên đăng nhập và mật khẩu', 'warning');
      return;
    }

    setIsLoggingIn(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword
        })
      });

      const data = await response.json();
      if (data.success && data.user && data.token) {
        login({ ...data.user, token: data.token });
        showToast(`Đăng nhập thành công: ${data.user.name}`, 'success');
      } else {
        setLoginError(data.error || 'Mật khẩu truy cập không chính xác.');
      }
    } catch (err: any) {
      setLoginError('Lỗi kết nối máy chủ.');
      showToast('Không thể kết nối đến máy chủ', 'danger');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');

    if (!regUsername.trim() || !regName.trim() || !regPassword) {
      showToast('Vui lòng điền đầy đủ thông tin đăng ký', 'warning');
      return;
    }

    setIsRegistering(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername.trim(),
          name: regName.trim(),
          role: regRole,
          password: regPassword
        })
      });
      const data = await response.json();

      if (data.success) {
        setIsRegisterOpen(false);
        showToast(data.message || 'Đăng ký tài khoản thành công! Vui lòng đợi Admin phê duyệt.', 'success');
        // Reset fields
        setRegUsername('');
        setRegName('');
        setRegRole('ke_toan_kho');
        setRegPassword('');
      } else {
        setRegError(data.error || 'Đăng ký thất bại.');
      }
    } catch (err: any) {
      setRegError('Lỗi kết nối máy chủ.');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="login-overlay" id="loginOverlay" style={{ display: 'flex' }}>
      <div className="login-card glass-panel" style={{ maxWidth: '420px', width: '90%' }}>
        <div className="login-header">
          <div className="login-brand" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <svg
              className="brand-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ width: '48px', height: '48px' }}
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <span
              style={{
                fontSize: '1.4rem',
                fontWeight: 700,
                background: 'var(--accent-gradient)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textAlign: 'center',
                lineHeight: 1.3
              }}
            >
              Theo dõi hoạt động sản xuất tại các xưởng
            </span>
          </div>
          <p className="text-muted" style={{ fontSize: '0.85rem', textAlign: 'center', marginTop: '12px' }}>
            Hệ thống quản lý đồng bộ & phân quyền tác vụ
          </p>
        </div>

        <form onSubmit={handleLoginSubmit} className="settings-form" style={{ marginTop: '20px' }}>
          <div className="form-group">
            <label htmlFor="loginUsername">Tên Đăng Nhập (Username):</label>
            <input
              type="text"
              id="loginUsername"
              className="form-input"
              required
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              placeholder="Nhập tên tài khoản..."
              style={{ padding: '10px', fontSize: '0.95rem', width: '100%' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="loginPassword">Mật Khẩu Truy Cập:</label>
            <input
              type="password"
              id="loginPassword"
              className="form-input"
              required
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              style={{ padding: '10px', fontSize: '0.95rem', width: '100%' }}
            />
          </div>

          {loginError && (
            <div className="text-danger" style={{ fontSize: '0.85rem', fontWeight: 500, marginTop: '8px', textAlign: 'center' }}>
              {loginError}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={isLogginIn}
            style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 600, marginTop: '16px', borderRadius: 'var(--border-radius-md)' }}
          >
            {isLogginIn ? 'Đang đăng nhập...' : 'Đăng Nhập Hệ Thống'}
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsRegisterOpen(true)}
            style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 600, marginTop: '8px', borderRadius: 'var(--border-radius-md)' }}
          >
            Đăng Ký Tài Khoản Mới
          </Button>
        </form>
      </div>

      {/* Register Modal */}
      <Modal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        title="Đăng Ký Tài Khoản Nhân Viên"
        maxWidth="480px"
      >
        <form onSubmit={handleRegisterSubmit} className="dialog-content">
          <div className="form-group">
            <label htmlFor="regUsername">Tên Đăng Nhập (Username):</label>
            <input
              type="text"
              id="regUsername"
              className="form-input"
              required
              value={regUsername}
              onChange={(e) => setRegUsername(e.target.value)}
              placeholder="Viết liền không dấu..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="regName">Họ Tên Đầy Đủ:</label>
            <input
              type="text"
              id="regName"
              className="form-input"
              required
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder="Nhập họ và tên..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="regRole">Bộ Phận (Quyền hạn):</label>
            <select
              id="regRole"
              className="form-input"
              required
              value={regRole}
              onChange={(e) => setRegRole(e.target.value)}
              style={{ padding: '8px' }}
            >
              <option value="ke_toan_kho">Kế toán kho</option>
              <option value="san_xuat">Bộ phận sản xuất</option>
              <option value="kinh_doanh">Bộ phận kinh doanh</option>
              <option value="ke_toan_ban_hang">Kế toán bán hàng</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="regPassword">Mật Khẩu:</label>
            <input
              type="password"
              id="regPassword"
              className="form-input"
              required
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
            />
          </div>

          {regError && (
            <div className="text-danger" style={{ fontSize: '0.85rem', fontWeight: 500, marginTop: '8px' }}>
              {regError}
            </div>
          )}

          <div className="dialog-buttons" style={{ marginTop: '20px' }}>
            <Button type="button" variant="secondary" onClick={() => setIsRegisterOpen(false)}>
              Hủy Bỏ
            </Button>
            <Button type="submit" variant="primary" disabled={isRegistering}>
              {isRegistering ? 'Đang đăng ký...' : 'Đăng Ký'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Login;
