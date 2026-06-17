import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';

export const Customers: React.FC = () => {
  const {
    session,
    cache,
    loading,
    showToast,
    fetchCustomers,
    removeVietnameseTones
  } = useApp();

  // Local state to track optimistic updates for active status
  const [localActiveOverrides, setLocalActiveOverrides] = useState<Record<number, boolean>>({});

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortOption, setSortOption] = useState<string>('name_asc');

  // Modal states
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formStreet, setFormStreet] = useState<string>('');
  const [formPhone, setFormPhone] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const role = session?.role || '';
  const isAllowedToManage = role === 'admin' || role === 'kinh_doanh';

  useEffect(() => {
    if (cache.customers.length === 0) {
      fetchCustomers();
    }
  }, []);

  const handleOpenCreate = () => {
    setSelectedId(null);
    setFormName('');
    setFormStreet('');
    setFormPhone('');
    setIsOpen(true);
  };

  const handleOpenEdit = (c: any) => {
    setSelectedId(c.id);
    setFormName(c.name || '');
    setFormStreet(c.street || '');
    setFormPhone(c.phone || '');
    setIsOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Vui lòng điền tên khách hàng', 'warning');
      return;
    }

    setIsSubmitting(true);
    const payload = {
      name: formName.trim(),
      street: formStreet.trim(),
      phone: formPhone.trim(),
      type: 'customer'
    };

    try {
      showToast(selectedId ? 'Đang cập nhật khách hàng...' : 'Đang tạo khách hàng mới...', 'info');
      const url = selectedId ? `/api/odoo/partners/${selectedId}` : '/api/odoo/partners';
      const method = selectedId ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data.success) {
        showToast(selectedId ? 'Cập nhật đối tác thành công' : 'Thêm khách hàng thành công', 'success');
        setIsOpen(false);
        fetchCustomers();
      } else {
        showToast(`Lỗi: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteOrArchive = async (c: any) => {
    const actionText = c.has_transactions ? 'lưu trữ' : 'xóa';
    if (!confirm(`Bạn có chắc chắn muốn ${actionText} khách hàng "${c.name}" không?`)) {
      return;
    }

    try {
      showToast(`Đang thực hiện ${actionText}...`, 'info');
      const response = await fetch(`/api/odoo/partners/${c.id}`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (response.ok && data.success) {
        showToast(data.message || `${c.has_transactions ? 'Lưu trữ' : 'Xóa'} thành công`, 'success');
        fetchCustomers();
      } else {
        showToast(`Lỗi: ${data.error || 'Không thể thực hiện'}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    }
  };

  const handleRestoreCooperation = async (c: any) => {
    if (!confirm(`Bạn có chắc chắn muốn mở hợp tác lại với khách hàng "${c.name}" không?`)) {
      return;
    }

    // Optimistic update: immediately show as active in UI
    setLocalActiveOverrides(prev => ({ ...prev, [c.id]: true }));

    try {
      showToast('Đang khôi phục hợp tác...', 'info');
      const response = await fetch(`/api/odoo/partners/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: c.name,
          street: c.street || '',
          phone: c.phone || '',
          type: 'customer',
          active: true
        })
      });
      const data = await response.json();

      if (response.ok && data.success) {
        showToast('Mở hợp tác lại thành công', 'success');
        // Fire-and-forget: sync background, override stays to prevent flicker
        fetchCustomers();
      } else {
        // Revert optimistic update on failure
        setLocalActiveOverrides(prev => {
          const updated = { ...prev };
          delete updated[c.id];
          return updated;
        });
        showToast(`Lỗi: ${data.error || 'Không thể thực hiện'}`, 'danger');
      }
    } catch (err: any) {
      // Revert optimistic update on error
      setLocalActiveOverrides(prev => {
        const updated = { ...prev };
        delete updated[c.id];
        return updated;
      });
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    }
  };

  // Merge cache with local optimistic overrides
  const customersWithOverrides = cache.customers.map(c =>
    localActiveOverrides[c.id] !== undefined
      ? { ...c, active: localActiveOverrides[c.id] }
      : c
  );

  const filteredCustomers = customersWithOverrides
    .filter(c => {
      const query = removeVietnameseTones(searchTerm.toLowerCase().trim());
      const nameMatch = removeVietnameseTones(c.name || '').toLowerCase().includes(query);
      const streetMatch = c.street ? removeVietnameseTones(c.street).toLowerCase().includes(query) : false;
      const phoneMatch = c.phone ? c.phone.includes(query) : false;
      return nameMatch || streetMatch || phoneMatch;
    })
    .sort((a, b) => {
      const nameA = a.name || '';
      const nameB = b.name || '';
      const idA = a.id || 0;
      const idB = b.id || 0;

      switch (sortOption) {
        case 'name_asc':
          return nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
        case 'name_desc':
          return nameB.localeCompare(nameA, 'vi', { sensitivity: 'base' });
        case 'id_asc':
          return idA - idB;
        case 'id_desc':
          return idB - idA;
        default:
          return 0;
      }
    });

  return (
    <div className="tab-panel active" id="panelCustomers">
      <div className="glass-panel datatable-container">
        <div className="table-header">
          <h2>Danh Sách Khách Hàng </h2>
          <div className="table-actions" style={{ flex: 1 }}>
            <input
              type="text"
              className="form-input search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm khách hàng..."
            />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="form-input"
              style={{ padding: '8px' }}
            >
              <option value="name_asc">Sắp xếp: Tên (A-Z)</option>
              <option value="name_desc">Sắp xếp: Tên (Z-A)</option>
              <option value="id_asc">Sắp xếp: Cũ nhất</option>
              <option value="id_desc">Sắp xếp: Mới nhất</option>
            </select>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              {isAllowedToManage && (
                <Button variant="primary" onClick={handleOpenCreate}>
                  Thêm Khách Hàng
                </Button>
              )}
              <Button variant="secondary" onClick={fetchCustomers}>
                Tải Lại
              </Button>
            </div>
          </div>
        </div>
        
        <div className="responsive-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Tên khách hàng</th>
                <th>Địa chỉ</th>
                <th>Số điện thoại</th>
                <th>Công nợ (đ)</th>
                <th>Trạng thái</th>
                {isAllowedToManage && <th style={{ width: '150px', textAlign: 'center' }}>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {(loading.customers && cache.customers.length === 0) ? (
                <tr>
                  <td colSpan={6} className="text-center">Đang tải dữ liệu...</td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center">Không tìm thấy khách hàng nào.</td>
                </tr>
              ) : (
                filteredCustomers.map((c) => {
                  const statusBadge = c.active ? (
                    <span style={{ background: 'rgba(46, 204, 113, 0.1)', color: '#2ecc71', border: '1px solid rgba(46, 204, 113, 0.2)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500, display: 'inline-block' }}>
                      Đang hợp tác
                    </span>
                  ) : (
                    <span style={{ background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', border: '1px solid rgba(231, 76, 60, 0.2)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500, display: 'inline-block' }}>
                      Ngừng hợp tác
                    </span>
                  );

                  const debtColor = c.debit > 0 ? 'var(--accent-danger)' : 'var(--text-muted)';
                  const debtWeight = c.debit > 0 ? '600' : 'normal';

                  return (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong></td>
                      <td>{c.street || '-'}</td>
                      <td>{c.phone || '-'}</td>
                      <td>
                        <span style={{ fontWeight: debtWeight, color: debtColor }}>
                          {Number(c.debit || 0).toLocaleString()} đ
                        </span>
                      </td>
                      <td>{statusBadge}</td>
                      {isAllowedToManage && (
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleOpenEdit(c)}
                              style={{ padding: '4px 8px', fontSize: '0.8rem', margin: 0, minHeight: 'unset', lineHeight: 1 }}
                            >
                              Sửa
                            </Button>
                            {c.active ? (
                              <Button
                                size="sm"
                                variant={c.has_transactions ? 'secondary' : 'danger'}
                                onClick={() => handleDeleteOrArchive(c)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '0.8rem',
                                  margin: 0,
                                  minHeight: 'unset',
                                  lineHeight: 1,
                                  ...(c.has_transactions ? { background: 'rgba(230, 126, 34, 0.1)', color: '#e67e22', borderColor: 'rgba(230,126,34,0.2)' } : {})
                                }}
                              >
                                {c.has_transactions ? 'Lưu trữ' : 'Xóa'}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleRestoreCooperation(c)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '0.8rem',
                                  margin: 0,
                                  minHeight: 'unset',
                                  lineHeight: 1,
                                  background: 'rgba(46, 204, 113, 0.1)',
                                  color: '#2ecc71',
                                  borderColor: 'rgba(46, 204, 113, 0.2)'
                                }}
                              >
                                Hợp tác lại
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Create/Edit Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={selectedId ? 'Chỉnh Sửa Khách Hàng' : 'Thêm Khách Hàng Mới'}
        maxWidth="550px"
      >
        <form onSubmit={handleFormSubmit} className="dialog-content">
          <div className="form-group">
            <label htmlFor="partnerName">Tên Khách Hàng:</label>
            <input
              type="text"
              id="partnerName"
              className="form-input"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Nhập tên khách hàng..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="partnerStreet">Địa Chỉ (Đường/Phố):</label>
            <input
              type="text"
              id="partnerStreet"
              className="form-input"
              value={formStreet}
              onChange={(e) => setFormStreet(e.target.value)}
              placeholder="Nhập địa chỉ..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="partnerPhone">Số Điện Thoại:</label>
            <input
              type="tel"
              id="partnerPhone"
              className="form-input"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              placeholder="Nhập số điện thoại..."
            />
          </div>

          <div className="dialog-buttons" style={{ marginTop: '20px' }}>
            <Button type="button" variant="secondary" onClick={() => setIsOpen(false)}>
              Hủy Bỏ
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              Lưu Lại
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Customers;
