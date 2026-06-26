import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';

export const Invoices: React.FC = () => {
  const {
    session,
    cache,
    loading,
    showToast,
    fetchInvoices,
    fetchCustomers,
    fetchSO
  } = useApp();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Dropdown tracking
  const [activeDropdownId, setActiveDropdownId] = useState<number | null>(null);

  // Payment Modal States
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  // Payment Form Fields
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payInvoiceGTGT, setPayInvoiceGTGT] = useState<string>('');
  const [payInvoiceState, setPayInvoiceState] = useState<string>('draft');
  const [payRef, setPayRef] = useState<string>('');
  const [payMethod, setPayMethod] = useState<string>('bank');
  const [payDate, setPayDate] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);

  const role = session?.role || '';
  const isAllowed = role === 'admin' || role === 'ke_toan_ban_hang';

  useEffect(() => {
    if (cache.invoices.length === 0) fetchInvoices();
    if (cache.customers.length === 0) fetchCustomers();
    if (cache.so.length === 0) fetchSO();

    // Close dropdowns on document click
    const handleDocumentClick = () => {
      setActiveDropdownId(null);
    };
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, []);

  const handlePostInvoice = async (id: number) => {
    try {
      showToast('Đang ghi sổ hóa đơn...', 'info');
      const response = await fetch(`/api/odoo/invoices/${id}/post`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        showToast('Ghi sổ hóa đơn thành công', 'success');
        fetchInvoices();
        fetchSO();
      } else {
        showToast(`Lỗi ghi sổ: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    }
  };

  const handleRefundInvoice = async (id: number) => {
    if (!confirm('Bạn có chắc chắn muốn tạo hóa đơn giảm trừ (Credit Note) cho hóa đơn này không? Trạng thái công nợ sẽ được giảm trừ tương ứng.')) {
      return;
    }

    try {
      showToast('Đang tạo hóa đơn giảm trừ...', 'info');
      const response = await fetch(`/api/odoo/invoices/${id}/credit-note`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        showToast(`Tạo Credit Note thành công (ID: ${data.creditNoteId})`, 'success');
        fetchInvoices();
        fetchSO();
      } else {
        showToast(`Lỗi: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    }
  };

  const handleDeleteInvoice = async (id: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa hóa đơn này không? Trạng thái hóa đơn sẽ bị hủy và xóa khỏi hệ thống.')) {
      return;
    }

    try {
      showToast('Đang xóa hóa đơn...', 'info');
      const response = await fetch(`/api/odoo/invoices/${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        showToast('Xóa hóa đơn thành công', 'success');
        fetchInvoices();
        fetchSO();
      } else {
        showToast(`Lỗi xóa hóa đơn: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    }
  };

  const openPaymentModal = (invoice: any) => {
    setSelectedInvoice(invoice);
    setPayInvoiceGTGT(invoice.ref || '');
    setPayInvoiceState(invoice.state || 'draft');
    setPayRef(invoice.payment_ref || '');
    setPayAmount(0); // Default to 0 as in original
    setPayMethod('bank');
    setPayDate(new Date().toISOString().substring(0, 10));
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    const alreadyPaid = selectedInvoice.amount_total - selectedInvoice.amount_residual;
    if (payAmount < 0 || payAmount + alreadyPaid > selectedInvoice.amount_total) {
      showToast('Số tiền thanh toán vượt quá tổng tiền hóa đơn gốc', 'warning');
      return;
    }

    setIsSubmittingPayment(true);
    try {
      showToast('Đang cập nhật hóa đơn & thanh toán...', 'info');
      const response = await fetch(`/api/odoo/invoices/${selectedInvoice.id}/register-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_amount: payAmount,
          payment_ref: payRef,
          ref: payInvoiceGTGT,
          invoice_state: payInvoiceState,
          payment_method: payMethod,
          payment_date: payDate
        })
      });
      const data = await response.json();
      if (data.success) {
        showToast('Cập nhật hóa đơn và thanh toán thành công', 'success');
        setIsPaymentModalOpen(false);
        fetchInvoices();
        fetchSO();
      } else {
        showToast(`Lỗi cập nhật: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Date Clear handler
  const handleClearDateFilters = () => {
    setFromDate('');
    setToDate('');
  };

  // Filter Invoices
  const filteredInvoices = cache.invoices.filter(i => {
    const invoiceNum = (i.invoice_number || '').toLowerCase();
    const partnerName = (i.partner || '').toLowerCase();
    const matchesTerm = invoiceNum.includes(searchTerm.toLowerCase().trim()) || partnerName.includes(searchTerm.toLowerCase().trim());

    let matchesDate = true;
    if (fromDate || toDate) {
      if (i.invoice_date) {
        const invDateObj = new Date(i.invoice_date);
        invDateObj.setHours(0, 0, 0, 0);

        if (fromDate) {
          const fromDateObj = new Date(fromDate);
          fromDateObj.setHours(0, 0, 0, 0);
          if (invDateObj < fromDateObj) matchesDate = false;
        }
        if (toDate) {
          const toDateObj = new Date(toDate);
          toDateObj.setHours(0, 0, 0, 0);
          if (invDateObj > toDateObj) matchesDate = false;
        }
      } else {
        matchesDate = false;
      }
    }

    return matchesTerm && matchesDate;
  });

  // Get payment display properties
  const getPaymentBadge = (paymentState: string) => {
    const state = paymentState || 'not_paid';
    switch (state) {
      case 'paid':
        return <span className="text-success" style={{ fontWeight: 600 }}>Đã thanh toán</span>;
      case 'not_paid':
        return <span className="text-danger" style={{ fontWeight: 600 }}>Chưa thanh toán</span>;
      case 'partial':
      case 'in_payment':
        return <span className="text-warning" style={{ fontWeight: 600 }}>Đang thanh toán</span>;
      case 'reversed':
        return <span className="text-muted" style={{ fontWeight: 600 }}>Hoàn tiền</span>;
      default:
        return <span className="text-muted" style={{ fontWeight: 600 }}>{state}</span>;
    }
  };

  // Find customer details for modal
  const getCustomerDetailsText = () => {
    if (!selectedInvoice) return '';
    const customer = cache.customers?.find(c => c.id === selectedInvoice.partner_id);
    if (customer) {
      return `Khách hàng: ${customer.name || ''}\nSĐT: ${customer.phone || 'N/A'}\nĐịa chỉ: ${customer.street || 'N/A'}`;
    }
    return `Khách hàng: ${selectedInvoice.partner || ''}`;
  };

  const isAmountWarning = selectedInvoice
    ? payAmount < 0 || payAmount + (selectedInvoice.amount_total - selectedInvoice.amount_residual) > selectedInvoice.amount_total
    : false;

  return (
    <div className="tab-panel active" id="panelInvoices">
      <div className="glass-panel datatable-container">
        <div className="table-header">
          <h2>Danh Sách Hóa Đơn Khách Hàng (Customer Invoices)</h2>
          <div
            className="table-actions"
            style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}
          >
            <input
              type="text"
              className="form-input search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm số hóa đơn hoặc khách hàng..."
              style={{ width: '220px' }}
            />
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Từ ngày:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="form-input"
                style={{ padding: '6px', width: '125px' }}
              />
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Đến ngày:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="form-input"
                style={{ padding: '6px', width: '125px' }}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleClearDateFilters}
                style={{ padding: '6px 10px', fontSize: '0.8rem', height: '32px', display: 'inline-flex', alignItems: 'center' }}
              >
                Xóa lọc
              </Button>
            </div>
            <Button variant="secondary" onClick={fetchInvoices}>Tải Lại</Button>
          </div>
        </div>

        <div className="responsive-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Số hóa đơn</th>
                <th>Khách hàng</th>
                <th>Tổng số tiền</th>
                <th>Trạng thái t.toán</th>
                <th>Số HĐ GTGT</th>
                <th>Trạng thái</th>
                <th>Ngày hóa đơn</th>
                <th style={{ width: '50px', textAlign: 'right', paddingRight: '15px' }}></th>
              </tr>
            </thead>
            <tbody>
              {(loading.invoices && cache.invoices.length === 0) ? (
                <tr>
                  <td colSpan={8} className="text-center">Đang tải dữ liệu hóa đơn...</td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center">Không tìm thấy hóa đơn nào.</td>
                </tr>
              ) : (
                filteredInvoices.map((i) => {
                  const total = i.amount_total ? Number(i.amount_total).toLocaleString() + ' đ' : '0 đ';
                  const stateLabel = i.state === 'posted' ? 'Đã vào sổ' : i.state === 'draft' ? 'Nháp' : i.state || 'N/A';
                  const invDate = i.invoice_date ? new Date(i.invoice_date).toLocaleDateString('vi-VN') : 'N/A';

                  return (
                    <tr key={i.id}>
                      <td><strong>{i.invoice_number || 'Nháp'}</strong></td>
                      <td>{i.partner || ''}</td>
                      <td>
                        <strong>{total}</strong>
                        {i.amount_residual > 0 && i.amount_residual < i.amount_total && (
                          <div className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 'normal', marginTop: '2px' }}>
                            Còn lại: {Number(i.amount_residual).toLocaleString()} đ
                          </div>
                        )}
                      </td>
                      <td>{getPaymentBadge(i.payment_state)}</td>
                      <td style={{ fontSize: '0.85rem', fontWeight: 600 }}>{i.ref || ''}</td>
                      <td>
                        <span className={`badge ${i.state === 'posted' ? 'text-success' : 'text-warning'}`}>
                          {stateLabel}
                        </span>
                      </td>
                      <td>{invDate}</td>
                      <td style={{ textAlign: 'right', paddingRight: '15px' }}>
                        {isAllowed && (
                          <div className="action-dropdown" style={{ display: 'inline-block', position: 'relative' }}>
                            <button
                              type="button"
                              className="action-dropdown-btn"
                              title="Thao tác"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDropdownId(activeDropdownId === i.id ? null : i.id);
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '4px' }}
                            >
                              &#8226;&#8226;&#8226;
                            </button>
                            {activeDropdownId === i.id && (
                              <div className="action-dropdown-menu show" style={{ position: 'absolute', right: 0, zIndex: 10, background: '#ffff', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', borderRadius: '4px', minWidth: '150px' }}>
                                {i.state === 'draft' && (
                                  <>
                                    <button
                                      type="button"
                                      className="action-dropdown-item btn-post-invoice"
                                      onClick={() => handlePostInvoice(i.id)}
                                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer' }}
                                    >
                                      📝 Ghi sổ (Post)
                                    </button>
                                    <button
                                      type="button"
                                      className="action-dropdown-item danger btn-delete-invoice"
                                      onClick={() => handleDeleteInvoice(i.id)}
                                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', color: 'red' }}
                                    >
                                      🗑️ Xóa
                                    </button>
                                  </>
                                )}
                                {i.state === 'posted' && (
                                  <>
                                    <button
                                      type="button"
                                      className="action-dropdown-item btn-pay-invoice"
                                      onClick={() => openPaymentModal(i)}
                                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer' }}
                                    >
                                      💳 Cập nhật
                                    </button>
                                    <button
                                      type="button"
                                      className="action-dropdown-item btn-refund-invoice"
                                      onClick={() => handleRefundInvoice(i.id)}
                                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent-primary)' }}
                                    >
                                      🔄 Tạo giảm trừ (Credit Note)
                                    </button>
                                  </>
                                )}
                                <a
                                  href={`/api/odoo/invoices/${i.id}/pdf?access_token=${encodeURIComponent(session?.token || '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="action-dropdown-item"
                                  style={{ display: 'block', padding: '8px 12px', textDecoration: 'none', color: 'inherit' }}
                                >
                                  📄 Tải PDF
                                </a>
                              </div>
                            )}
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

      {/* Workflow explanation note */}
      <div style={{
        margin: '16px 0 0 0',
        padding: '12px 16px',
        borderRadius: '10px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px dashed rgba(255,255,255,0.1)',
        color: 'var(--text-muted)',
        fontSize: '0.8rem',
        lineHeight: '1.7'
      }}>
      </div>

      {/* Invoice Payment Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Cập Nhật Thanh Toán & Số Hóa Đơn GTGT"
        maxWidth="550px"
      >
        {selectedInvoice && (
          <form onSubmit={handlePaymentSubmit} className="dialog-content">
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Mã Đơn Bán Hàng (SO):</label>
                <input
                  type="text"
                  className="form-input"
                  readOnly
                  value={selectedInvoice.invoice_origin || ''}
                  style={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', cursor: 'not-allowed', fontWeight: 'bold' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Tổng Tiền Phải Thu:</label>
                <input
                  type="text"
                  className="form-input"
                  readOnly
                  value={selectedInvoice.amount_total.toLocaleString() + ' đ'}
                  style={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', cursor: 'not-allowed', fontWeight: 'bold', color: 'var(--primary-color)' }}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Thông Tin Khách Hàng:</label>
              <textarea
                className="form-input"
                readOnly
                rows={2}
                value={getCustomerDetailsText()}
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', cursor: 'not-allowed', resize: 'none' }}
              />
            </div>

            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="payInvoiceGTGT">Số Hóa Đơn GTGT (Hóa đơn đỏ):</label>
                <input
                  type="text"
                  id="payInvoiceGTGT"
                  className="form-input"
                  value={payInvoiceGTGT}
                  onChange={(e) => setPayInvoiceGTGT(e.target.value)}
                  placeholder="Gõ sau khi xuất HĐĐT thành công..."
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="payInvoiceState">Trạng Thái Hóa Đơn:</label>
                <select
                  id="payInvoiceState"
                  className="form-input"
                  style={{ padding: '8px' }}
                  required
                  value={payInvoiceState}
                  onChange={(e) => setPayInvoiceState(e.target.value)}
                >
                  <option value="draft">Chưa xuất (Draft)</option>
                  <option value="posted">Đã xuất (Posted)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="payAmount">Số Tiền Thực Thu Đợt Này (đ):</label>
              <input
                type="number"
                id="payAmount"
                className="form-input"
                min="0"

                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
              />

              {isAmountWarning && (
                <span className="text-danger" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginTop: '4px' }}>
                  ⚠️ Vượt quá tổng tiền đơn hàng gốc!
                </span>
              )}
              <span className="text-muted" style={{ fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                Đã trả: <span style={{ fontWeight: 600 }}>{(selectedInvoice.amount_total - selectedInvoice.amount_residual).toLocaleString()}</span> đ | Còn lại cần thu: <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{selectedInvoice.amount_residual.toLocaleString()}</span> đ
              </span>
            </div>

            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="payMethod">Phương Thức:</label>
                <select
                  id="payMethod"
                  className="form-input"
                  style={{ padding: '8px' }}
                  required
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  <option value="bank">Chuyển khoản Ngân hàng</option>
                  <option value="cash">Tiền mặt</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="payDate">Ngày Thanh Toán:</label>
                <input
                  type="date"
                  id="payDate"
                  className="form-input"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="payRef">Nội Dung Thanh Toán (Ghi chú):</label>
              <input
                type="text"
                id="payRef"
                className="form-input"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Nhập ghi chú chuyển khoản, ngân hàng..."
              />
            </div>

            <div className="dialog-buttons" style={{ marginTop: '20px' }}>
              <Button type="button" variant="secondary" onClick={() => setIsPaymentModalOpen(false)}>
                Hủy Bỏ
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmittingPayment || isAmountWarning}>
                {isSubmittingPayment ? 'Đang xử lý...' : 'Xác Nhận Cập Nhật'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default Invoices;
