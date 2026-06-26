import React, { useEffect, useState } from 'react';
import { useApp, roleNames } from '../context/AppContext';
import Button from '../components/common/Button';

export const Settings: React.FC = () => {
  const {
    session,
    showToast,
    checkSystemStatus
  } = useApp();

  // Config fields
  const [odooUrl, setOdooUrl] = useState<string>('');
  const [odooDb, setOdooDb] = useState<string>('');
  const [odooLogin, setOdooLogin] = useState<string>('');
  const [odooPassword, setOdooPassword] = useState<string>('');
  const [sheetId, setSheetId] = useState<string>('');
  const [credsContent, setCredsContent] = useState<string>('');
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);

  // User management states
  const [users, setUsers] = useState<any[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState<boolean>(false);

  const role = session?.role || '';
  const isAdmin = role === 'admin';

  useEffect(() => {
    loadConfig();
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      setOdooUrl(data.odooUrl || '');
      setOdooDb(data.db || '');
      setOdooLogin(data.login || '');
      setOdooPassword(data.password || '');
      setSheetId(data.sheetId || '');
      setCredsContent(data.credsContent || '');
    } catch (err) {
      showToast('Lỗi khi tải thông số cấu hình', 'danger');
    }
  };

  const handleConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate JSON if credentials content is provided
    if (credsContent.trim()) {
      try {
        JSON.parse(credsContent.trim());
      } catch (err) {
        showToast('Nội dung Google Credentials JSON không hợp lệ!', 'danger');
        return;
      }
    }

    setIsSavingConfig(true);
    const payload = {
      odooUrl: odooUrl.trim(),
      db: odooDb.trim(),
      login: odooLogin.trim(),
      password: odooPassword,
      sheetId: sheetId.trim(),
      credsContent: credsContent.trim()
    };

    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data.success) {
        showToast('Cấu hình đã được lưu thành công', 'success');
        checkSystemStatus();
      } else {
        showToast('Không thể lưu cấu hình', 'danger');
      }
    } catch (err) {
      showToast('Lỗi gửi dữ liệu cài đặt', 'danger');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleReset = () => {
    if (confirm('Bạn có chắc chắn muốn điền lại thông số mặc định không?')) {
      loadConfig();
    }
  };

  const loadUsers = async () => {
    setIsUsersLoading(true);
    try {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Not authorized');
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
      showToast('Lỗi tải danh sách người dùng', 'danger');
    } finally {
      setIsUsersLoading(false);
    }
  };

  const handleApproveUser = async (username: string) => {
    if (!confirm(`Bạn có chắc chắn muốn duyệt tài khoản ${username}?`)) return;
    try {
      const res = await fetch(`/api/users/${username}/approve`, {
        method: 'PUT'
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        loadUsers();
      } else {
        showToast(data.error, 'danger');
      }
    } catch (err) {
      showToast('Lỗi kết nối', 'danger');
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa/từ chối tài khoản ${username}?`)) return;
    try {
      const res = await fetch(`/api/users/${username}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        loadUsers();
      } else {
        showToast(data.error, 'danger');
      }
    } catch (err) {
      showToast('Lỗi kết nối', 'danger');
    }
  };

  return (
    <div className="tab-panel active" id="panelSettings">
      <div className="glass-panel settings-container">
        <h2>Cấu Hình Kết Nối API Hệ Thống</h2>
        <p className="text-muted">Thay đổi thông tin kết nối API Odoo ERP và Google Sheets tại đây. Dữ liệu được lưu trữ trực tiếp vào cấu hình server.</p>

        <form onSubmit={handleConfigSubmit} className="settings-form">
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="odooUrl">URL Instance Odoo:</label>
              <input
                type="url"
                id="odooUrl"
                className="form-input"
                required
                value={odooUrl}
                onChange={(e) => setOdooUrl(e.target.value)}
                placeholder="https://instance-name.odoo.com"
              />
            </div>

            <div className="form-group">
              <label htmlFor="odooDb">Tên Database Odoo:</label>
              <input
                type="text"
                id="odooDb"
                className="form-input"
                required
                value={odooDb}
                onChange={(e) => setOdooDb(e.target.value)}
                placeholder="db-name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="odooLogin">Email Đăng Nhập:</label>
              <input
                type="email"
                id="odooLogin"
                className="form-input"
                required
                value={odooLogin}
                onChange={(e) => setOdooLogin(e.target.value)}
                placeholder="email@example.com"
              />
            </div>

            <div className="form-group">
              <label htmlFor="odooPassword">Mật khẩu:</label>
              <input
                type="password"
                id="odooPassword"
                className="form-input"
                required
                value={odooPassword}
                onChange={(e) => setOdooPassword(e.target.value)}
                placeholder="password"
              />
            </div>

            <div className="form-group full-width">
              <label htmlFor="sheetId">Google Sheets ID (Spreadsheet ID):</label>
              <input
                type="text"
                id="sheetId"
                className="form-input"
                required
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                placeholder="e.g. 1Jzw_V9e4Gfw1QKr11YIa9SVLqaLwvD8cH7dZ7HgWGYE"
              />
            </div>

            <div className="form-group full-width">
              <label htmlFor="credsContent">Nội Dung Google Credentials JSON (Service Account):</label>
              <textarea
                id="credsContent"
                className="form-input code-input"
                rows={8}
                value={credsContent}
                onChange={(e) => setCredsContent(e.target.value)}
                placeholder='{"type": "service_account", "project_id": ...}'
              />
            </div>
          </div>

          <div className="form-actions" style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <Button type="submit" variant="primary" disabled={isSavingConfig}>
              {isSavingConfig ? 'Đang lưu...' : 'Lưu Cấu Hình'}
            </Button>
            <Button type="button" variant="secondary" onClick={handleReset}>
              Khôi Phục Mặc Định
            </Button>
          </div>
        </form>
      </div>

      {isAdmin && (
        <div className="glass-panel datatable-container" style={{ marginTop: '32px' }} id="adminUserManagement">
          <div className="table-header">
            <h2>Quản Lý Phê Duyệt Tài Khoản (Admin)</h2>
            <Button variant="secondary" size="sm" onClick={loadUsers}>Tải Lại Danh Sách</Button>
          </div>
          <p className="text-muted" style={{ marginBottom: '16px' }}>Phê duyệt hoặc xóa tài khoản đăng ký của nhân viên. Hệ thống giới hạn tối đa 2 Admin.</p>
          <div className="responsive-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Họ Tên</th>
                  <th>Bộ Phận (Role)</th>
                  <th>Trạng Thái</th>
                  <th>Hành Động</th>
                </tr>
              </thead>
              <tbody>
                {isUsersLoading ? (
                  <tr>
                    <td colSpan={5} className="text-center">Đang tải danh sách người dùng...</td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center">Không có dữ liệu</td>
                  </tr>
                ) : (
                  users.map((u, idx) => {
                    const statusBadge = u.approved ? (
                      <span className="status-badge success">Đã Duyệt</span>
                    ) : (
                      <span className="status-badge warning">Chờ Duyệt</span>
                    );

                    const canManage = u.role !== 'admin' || u.approved === false;

                    return (
                      <tr key={idx}>
                        <td><strong>{u.username}</strong></td>
                        <td>{u.name}</td>
                        <td>{roleNames[u.role] || u.role}</td>
                        <td>{statusBadge}</td>
                        <td>
                          {canManage && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {!u.approved && (
                                <Button size="sm" variant="primary" onClick={() => handleApproveUser(u.username)}>
                                  Duyệt
                                </Button>
                              )}
                              <Button size="sm" variant="secondary" onClick={() => handleDeleteUser(u.username)}>
                                Xóa
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
