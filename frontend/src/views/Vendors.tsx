import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import TableToolbar from '../components/common/TableToolbar';
import PartnerTable from '../components/common/PartnerTable';

export const Vendors: React.FC = () => {
  const {
    session,
    cache,
    loading,
    showToast,
    fetchVendors,
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
  const isAllowedToManage = role === 'admin' || role === 'ke_toan_kho';

  useEffect(() => {
    if (cache.vendors.length === 0) {
      fetchVendors();
    }
  }, []);

  const handleOpenCreate = () => {
    setSelectedId(null);
    setFormName('');
    setFormStreet('');
    setFormPhone('');
    setIsOpen(true);
  };

  const handleOpenEdit = (v: any) => {
    setSelectedId(v.id);
    setFormName(v.name || '');
    setFormStreet(v.street || '');
    setFormPhone(v.phone || '');
    setIsOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Vui lòng điền tên nhà cung cấp', 'warning');
      return;
    }

    setIsSubmitting(true);
    const payload = {
      name: formName.trim(),
      street: formStreet.trim(),
      phone: formPhone.trim(),
      type: 'vendor'
    };

    try {
      showToast(selectedId ? 'Đang cập nhật nhà cung cấp...' : 'Đang tạo nhà cung cấp mới...', 'info');
      const url = selectedId ? `/api/odoo/partners/${selectedId}` : '/api/odoo/partners';
      const method = selectedId ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data.success) {
        showToast(selectedId ? 'Cập nhật đối tác thành công' : 'Thêm nhà cung cấp thành công', 'success');
        setIsOpen(false);
        fetchVendors();
      } else {
        showToast(`Lỗi: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteOrArchive = async (v: any) => {
    const actionText = v.has_transactions ? 'lưu trữ' : 'xóa';
    if (!confirm(`Bạn có chắc chắn muốn ${actionText} nhà cung cấp "${v.name}" không?`)) {
      return;
    }

    try {
      showToast(`Đang thực hiện ${actionText}...`, 'info');
      const response = await fetch(`/api/odoo/partners/${v.id}`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (response.ok && data.success) {
        showToast(data.message || `${v.has_transactions ? 'Lưu trữ' : 'Xóa'} thành công`, 'success');
        fetchVendors();
      } else {
        showToast(`Lỗi: ${data.error || 'Không thể thực hiện'}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    }
  };

  const handleRestoreCooperation = async (v: any) => {
    if (!confirm(`Bạn có chắc chắn muốn mở hợp tác lại với nhà cung cấp "${v.name}" không?`)) {
      return;
    }

    // Optimistic update: immediately show as active in UI
    setLocalActiveOverrides(prev => ({ ...prev, [v.id]: true }));

    try {
      showToast('Đang khôi phục hợp tác...', 'info');
      const response = await fetch(`/api/odoo/partners/${v.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: v.name,
          street: v.street || '',
          phone: v.phone || '',
          type: 'vendor',
          active: true
        })
      });
      const data = await response.json();

      if (response.ok && data.success) {
        showToast('Mở hợp tác lại thành công', 'success');
        // Fire-and-forget: sync background, override stays to prevent flicker
        fetchVendors();
      } else {
        // Revert optimistic update on failure
        setLocalActiveOverrides(prev => {
          const updated = { ...prev };
          delete updated[v.id];
          return updated;
        });
        showToast(`Lỗi: ${data.error || 'Không thể thực hiện'}`, 'danger');
      }
    } catch (err: any) {
      // Revert optimistic update on error
      setLocalActiveOverrides(prev => {
        const updated = { ...prev };
        delete updated[v.id];
        return updated;
      });
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    }
  };

  // Merge cache with local optimistic overrides
  const vendorsWithOverrides = cache.vendors.map(v =>
    localActiveOverrides[v.id] !== undefined
      ? { ...v, active: localActiveOverrides[v.id] }
      : v
  );

  const filteredVendors = vendorsWithOverrides
    .filter(v => {
      const query = removeVietnameseTones(searchTerm.toLowerCase().trim());
      const nameMatch = removeVietnameseTones(v.name || '').toLowerCase().includes(query);
      const streetMatch = v.street ? removeVietnameseTones(v.street).toLowerCase().includes(query) : false;
      const phoneMatch = v.phone ? v.phone.includes(query) : false;
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
    <div className="tab-panel active" id="panelVendors">
      <div className="glass-panel datatable-container">
        <div className="table-header">
          <h2>Danh Sách Nhà Cung Cấp </h2>
          <TableToolbar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Tìm kiếm nhà cung cấp..."
            sortOption={sortOption}
            onSortChange={setSortOption}
            sortOptions={[
              { value: 'name_asc', label: 'Sắp xếp: Tên (A-Z)' },
              { value: 'name_desc', label: 'Sắp xếp: Tên (Z-A)' },
              { value: 'id_asc', label: 'Sắp xếp: Cũ nhất' },
              { value: 'id_desc', label: 'Sắp xếp: Mới nhất' }
            ]}
          >
            {isAllowedToManage && (
              <Button variant="primary" onClick={handleOpenCreate}>
                Thêm Nhà Cung Cấp
              </Button>
            )}
            <Button variant="secondary" onClick={fetchVendors}>
              Tải Lại
            </Button>
          </TableToolbar>
        </div>
        
        <PartnerTable
          data={filteredVendors}
          isLoading={loading.vendors}
          isAllowedToManage={isAllowedToManage}
          nameHeader="Tên nhà cung cấp"
          emptyMessage="Không tìm thấy nhà cung cấp nào."
          debitOrCreditField="credit"
          onEdit={handleOpenEdit}
          onDeleteOrArchive={handleDeleteOrArchive}
          onRestore={handleRestoreCooperation}
        />
      </div>

      {/* Vendor Create/Edit Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={selectedId ? 'Chỉnh Sửa Nhà Cung Cấp' : 'Thêm Nhà Cung Cấp Mới'}
        maxWidth="550px"
      >
        <form onSubmit={handleFormSubmit} className="dialog-content">
          <div className="form-group">
            <label htmlFor="partnerName">Tên Nhà Cung Cấp:</label>
            <input
              type="text"
              id="partnerName"
              className="form-input"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Nhập tên nhà cung cấp..."
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

export default Vendors;
