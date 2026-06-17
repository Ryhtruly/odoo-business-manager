import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';

interface SOLine {
  product_id: number;
  product_name: string;
  product_qty: number;
  price_unit: number;
}

export const Sales: React.FC = () => {
  const {
    session,
    cache,
    loading,
    showToast,
    fetchSO,
    fetchCustomers,
    fetchProducts
  } = useApp();

  // Active loaded SO ID
  const [currentSOId, setCurrentSOId] = useState<number | null>(null);
  const [currentSOCode, setCurrentSOCode] = useState<string>('SO-2026-XXXX');

  // Form Fields
  const [salesCustomer, setSalesCustomer] = useState<string>('');
  const [salesOrderDate, setSalesOrderDate] = useState<string>('');
  const [salesProduct, setSalesProduct] = useState<string>('');
  const [salesQty, setSalesQty] = useState<number>(5);
  const [salesPrice, setSalesPrice] = useState<number>(0);
  const [currentSOLines, setCurrentSOLines] = useState<SOLine[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCanceling, setIsCanceling] = useState<boolean>(false);

  // Customer modal
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState<boolean>(false);
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustStreet, setNewCustStreet] = useState<string>('');
  const [newCustPhone, setNewCustPhone] = useState<string>('');
  const [isSubmittingCustomer, setIsSubmittingCustomer] = useState<boolean>(false);

  // Initialize
  useEffect(() => {
    if (cache.so.length === 0) fetchSO();
    if (cache.customers.length === 0) fetchCustomers();
    if (cache.products.length === 0) fetchProducts();
    resetForm();
  }, []);

  // Sync price when product changes
  useEffect(() => {
    if (salesProduct) {
      const product = cache.products.find(p => p.id === Number(salesProduct));
      if (product) {
        setSalesPrice(product.list_price || 0);
      }
    } else {
      setSalesPrice(0);
    }
  }, [salesProduct, cache.products]);

  const resetForm = () => {
    setCurrentSOId(null);
    setCurrentSOCode('SO-2026-XXXX');
    setSalesCustomer('');
    const now = new Date();
    const tzoffset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - tzoffset).toISOString().slice(0, 16);
    setSalesOrderDate(localISOTime);
    setSalesProduct('');
    setSalesQty(5);
    setSalesPrice(0);
    setCurrentSOLines([]);
  };

  const handleOpenSO = async (id: number) => {
    try {
      showToast('Đang tải thông tin đơn bán hàng...', 'info');
      const response = await fetch(`/api/odoo/so/${id}`);
      if (!response.ok) throw new Error('Không thể tải chi tiết đơn hàng');
      const order = await response.json();

      setCurrentSOId(order.id);
      setCurrentSOCode(order.name || `SO-${order.id}`);
      setSalesCustomer(order.partner_id || '');
      if (order.date_order) {
        const dateVal = new Date(order.date_order);
        const localISO = new Date(dateVal.getTime() - dateVal.getTimezoneOffset() * 60000).toISOString().substring(0, 16);
        setSalesOrderDate(localISO);
      }

      setCurrentSOLines(order.order_line.map((l: any) => ({
        product_id: l.product_id,
        product_name: l.product_name,
        product_qty: l.product_qty,
        price_unit: l.price_unit
      })));

      showToast('Đã tải thông tin đơn hàng', 'success');
    } catch (err: any) {
      showToast(`Lỗi: ${err.message}`, 'danger');
    }
  };

  const handleAddLine = () => {
    if (!salesProduct || salesQty <= 0) {
      showToast('Vui lòng chọn sản phẩm và nhập số lượng hợp lệ', 'warning');
      return;
    }
    if (salesPrice < 0) {
      showToast('Đơn giá bán phải lớn hơn hoặc bằng 0', 'warning');
      return;
    }

    const prodId = Number(salesProduct);
    const product = cache.products.find(p => p.id === prodId);
    const productName = product ? product.name : `Sản phẩm #${prodId}`;

    const existingIndex = currentSOLines.findIndex(l => l.product_id === prodId);
    if (existingIndex > -1) {
      const updated = [...currentSOLines];
      updated[existingIndex].product_qty += salesQty;
      updated[existingIndex].price_unit = salesPrice;
      setCurrentSOLines(updated);
    } else {
      setCurrentSOLines([...currentSOLines, {
        product_id: prodId,
        product_name: productName,
        product_qty: salesQty,
        price_unit: salesPrice
      }]);
    }

    setSalesProduct('');
    setSalesQty(5);
    setSalesPrice(0);
    showToast('Đã thêm sản phẩm đặt hàng', 'success');
  };

  const handleRemoveLine = (idx: number) => {
    setCurrentSOLines(currentSOLines.filter((_, index) => index !== idx));
  };

  const handleLineQtyChange = (idx: number, qty: number) => {
    if (qty > 0) {
      const updated = [...currentSOLines];
      updated[idx].product_qty = qty;
      setCurrentSOLines(updated);
    }
  };

  const handleLinePriceChange = (idx: number, price: number) => {
    if (price >= 0) {
      const updated = [...currentSOLines];
      updated[idx].price_unit = price;
      setCurrentSOLines(updated);
    }
  };

  const handleSalesSubmit = async (isDraft: boolean) => {
    if (!salesCustomer) {
      showToast('Vui lòng chọn Khách Hàng', 'warning');
      return;
    }
    if (currentSOLines.length === 0) {
      showToast('Vui lòng thêm ít nhất một dòng sản phẩm đặt hàng', 'warning');
      return;
    }

    // Stock check for confirmation
    if (!isDraft) {
      let isSufficient = true;
      for (const line of currentSOLines) {
        const cachedProduct = cache.products.find(p => p.id === line.product_id);
        const stockQty = cachedProduct ? (cachedProduct.qty_available ?? 0) : 0;
        if (line.product_qty > stockQty) {
          isSufficient = false;
          break;
        }
      }
      if (!isSufficient) {
        if (!confirm('Kho không đủ hàng giao, đơn hàng sẽ chuyển sang trạng thái Chờ sản xuất. Bạn có chắc chắn muốn tiếp tục?')) {
          return;
        }
      }
    }

    setIsSubmitting(true);
    const payload = {
      partner_id: Number(salesCustomer),
      date_order: salesOrderDate,
      draft: isDraft,
      order_line: currentSOLines.map(line => ({
        product_id: line.product_id,
        product_qty: line.product_qty,
        price_unit: line.price_unit
      }))
    };

    try {
      showToast(isDraft ? 'Đang lưu nháp...' : 'Đang xác nhận đơn hàng...', 'info');
      const response = await fetch('/api/odoo/sale-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.success) {
        if (data.warning) {
          showToast(data.warning, 'warning');
        } else {
          showToast(isDraft ? `Đã lưu nháp đơn hàng thành công (SO: ${data.id})` : `Đã xác nhận đơn hàng thành công (SO: ${data.id})`, 'success');
        }
        resetForm();
        fetchSO();
      } else {
        showToast(`Lỗi: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSO = async () => {
    if (!currentSOId) return;
    if (!confirm('Bạn có chắc chắn muốn hủy đơn hàng này và trả lại sản phẩm vào kho?')) {
      return;
    }

    setIsCanceling(true);
    try {
      showToast('Đang xử lý hủy đơn & trả hàng...', 'info');
      const response = await fetch(`/api/odoo/so/${currentSOId}/cancel`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        if (data.warning) {
          showToast(data.warning, 'warning');
        } else {
          showToast('Đã hủy đơn bán hàng, hoàn trả sản phẩm vào kho và sinh Credit Note nháp', 'success');
        }
        resetForm();
        fetchSO();
      } else {
        showToast(`Lỗi: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    } finally {
      setIsCanceling(false);
    }
  };

  const handleCustomerModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    setIsSubmittingCustomer(true);
    try {
      showToast('Đang tạo khách hàng...', 'info');
      const response = await fetch('/api/odoo/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustName.trim(),
          street: newCustStreet.trim(),
          phone: newCustPhone.trim(),
          type: 'customer'
        })
      });
      const data = await response.json();
      if (data.success) {
        showToast('Thêm khách hàng thành công', 'success');
        setIsCustomerModalOpen(false);
        setNewCustName('');
        setNewCustStreet('');
        setNewCustPhone('');
        await fetchCustomers();
        setSalesCustomer(String(data.id));
      } else {
        showToast(`Lỗi: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    } finally {
      setIsSubmittingCustomer(false);
    }
  };

  // Check locked state (locked if not in draft state)
  const matchingOrder = cache.so?.find(o => o.id === currentSOId);
  const isLocked = currentSOId ? matchingOrder?.state !== 'draft' : false;
  const orderState = matchingOrder?.state;

  const totalAmount = currentSOLines.reduce((acc, curr) => acc + (curr.product_qty * curr.price_unit), 0);
  const saleProducts = cache.products.filter(p => p.sale_ok);

  return (
    <div className="tab-panel active" id="panelSales">
      <div className="glass-panel settings-container" style={{ marginBottom: '24px' }}>
        <h2>Nhập Thông Tin Bán Hàng (Tạo Đơn Bán Hàng SO)</h2>
        <p className="text-muted">Bộ phận kinh doanh: Nhập đơn đặt hàng của khách hàng. Hệ thống tự động tạo báo giá, xác nhận giao hàng và tạo hóa đơn nháp tương ứng.</p>

        <form onSubmit={(e) => e.preventDefault()} className="settings-form">
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1.5fr 1.2fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Mã Đơn Hàng:</label>
              <input
                type="text"
                className="form-input"
                readOnly
                value={currentSOCode}
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', cursor: 'not-allowed', fontWeight: 'bold' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="salesCustomer">Khách Hàng:</label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <select
                  id="salesCustomer"
                  className="form-input"
                  required
                  style={{ padding: '8px', flex: 1 }}
                  value={salesCustomer}
                  disabled={isLocked}
                  onChange={(e) => setSalesCustomer(e.target.value)}
                >
                  <option value="">-- Chọn Khách Hàng --</option>
                  {cache.customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary btn-icon"
                  id="btnCreateCustomerSales"
                  title="Thêm Khách Hàng Mới"
                  disabled={isLocked}
                  onClick={() => setIsCustomerModalOpen(true)}
                  style={{ padding: '8px', fontSize: '1rem', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '38px', width: '38px', margin: 0 }}
                >
                  ➕
                </button>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="salesOrderDate">Ngày Lên Đơn:</label>
              <input
                type="datetime-local"
                id="salesOrderDate"
                className="form-input"
                required
                disabled={isLocked}
                value={salesOrderDate}
                onChange={(e) => setSalesOrderDate(e.target.value)}
              />
            </div>
          </div>

          <div
            className="glass-panel"
            style={{ padding: '12px', marginBottom: '12px', border: '1px dashed rgba(0, 0, 0, 0.1)', background: 'rgba(0, 0, 0, 0.02)', borderRadius: '8px' }}
          >
            <h4 style={{ marginTop: 0, marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Thêm Dòng Sản Phẩm Đặt Hàng</h4>
            <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr 1.2fr auto', gap: '12px', marginBottom: 0, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="salesProduct">Sản Phẩm Đặt Hàng:</label>
                <select
                  id="salesProduct"
                  className="form-input"
                  style={{ padding: '8px', width: '100%' }}
                  value={salesProduct}
                  disabled={isLocked}
                  onChange={(e) => setSalesProduct(e.target.value)}
                >
                  <option value="">-- Chọn Sản Phẩm --</option>
                  {saleProducts.map(p => (
                    <option key={p.id} value={p.id}>[{p.default_code || 'Không SKU'}] {p.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="salesQty">Số Lượng:</label>
                <input
                  type="number"
                  id="salesQty"
                  className="form-input"
                  min="1"
                  disabled={isLocked}
                  value={salesQty}
                  onChange={(e) => setSalesQty(Number(e.target.value))}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="salesPrice">Đơn Giá Bán:</label>
                <input
                  type="number"
                  id="salesPrice"
                  className="form-input"
                  min="0"
                  disabled={isLocked}
                  value={salesPrice}
                  onChange={(e) => setSalesPrice(Number(e.target.value))}
                />
              </div>
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isLocked}
                  onClick={handleAddLine}
                  style={{ padding: '8px 16px' }}
                >
                  Thêm
                </Button>
              </div>
            </div>
          </div>

          {/* List of added SO lines */}
          <div className="responsive-table-wrapper" style={{ marginBottom: '12px', maxHeight: '200px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Sản phẩm</th>
                  <th style={{ textAlign: 'right', padding: '6px', width: '110px' }}>Số lượng</th>
                  <th style={{ textAlign: 'right', padding: '6px', width: '130px' }}>Đơn giá bán</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>Thành tiền</th>
                  <th style={{ textAlign: 'center', padding: '6px', width: '60px' }}>Xóa</th>
                </tr>
              </thead>
              <tbody>
                {currentSOLines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-muted" style={{ padding: '12px' }}>
                      Chưa có dòng nào được thêm. Vui lòng chọn sản phẩm ở trên rồi nhấn "Thêm Dòng".
                    </td>
                  </tr>
                ) : (
                  currentSOLines.map((line, idx) => {
                    const lineTotal = line.product_qty * line.price_unit;
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.05)' }}>
                        <td style={{ padding: '8px 6px' }}><strong>{line.product_name}</strong></td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', width: '110px' }}>
                          <input
                            type="number"
                            className="form-input"
                            min="1"
                            value={line.product_qty}
                            readOnly={isLocked}
                            onChange={(e) => handleLineQtyChange(idx, Number(e.target.value))}
                            style={{
                              padding: '4px 8px',
                              fontSize: '0.85rem',
                              width: '80px',
                              textAlign: 'right',
                              margin: 0,
                              display: 'inline-block',
                              ...(isLocked ? { background: 'transparent', border: 'none' } : {})
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', width: '130px' }}>
                          <input
                            type="number"
                            className="form-input"
                            min="0"
                            value={line.price_unit}
                            readOnly={isLocked}
                            onChange={(e) => handleLinePriceChange(idx, Number(e.target.value))}
                            style={{
                              padding: '4px 8px',
                              fontSize: '0.85rem',
                              width: '100px',
                              textAlign: 'right',
                              margin: 0,
                              display: 'inline-block',
                              ...(isLocked ? { background: 'transparent', border: 'none' } : {})
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                          <strong>{lineTotal.toLocaleString()} đ</strong>
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                          {isLocked ? (
                            '-'
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-accent"
                              onClick={() => handleRemoveLine(idx)}
                              style={{ padding: '2px 6px', fontSize: '0.75rem', color: 'var(--accent-danger)', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)', margin: 0 }}
                            >
                              Xóa
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
              Tổng cộng đơn hàng:{' '}
              <strong style={{ color: 'var(--primary-color)', fontWeight: 700, fontSize: '1.1rem' }}>
                {totalAmount.toLocaleString()} đ
              </strong>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {currentSOId && (
                <Button variant="secondary" onClick={resetForm} style={{ padding: '8px 16px' }}>
                  Đơn Hàng Mới
                </Button>
              )}
              {currentSOId && (orderState === 'sale' || orderState === 'done') && (
                <Button
                  variant="secondary"
                  disabled={isCanceling}
                  onClick={handleCancelSO}
                  style={{ padding: '8px 16px', color: 'var(--accent-danger)', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                >
                  {isCanceling ? 'Đang hủy...' : 'HỦY ĐƠN / TRẢ HÀNG'}
                </Button>
              )}
              {!isLocked && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', width: '100%' }}>
                  <Button
                    variant="secondary"
                    disabled={isSubmitting}
                    onClick={() => handleSalesSubmit(true)}
                    style={{ padding: '8px 16px' }}
                  >
                    Lưu Nháp
                  </Button>
                  <Button
                    variant="primary"
                    disabled={isSubmitting}
                    onClick={() => handleSalesSubmit(false)}
                    style={{ padding: '8px 16px' }}
                  >
                    {isSubmitting ? 'Đang gửi...' : 'Xác Nhận'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </form>
      </div>

      <div className="glass-panel datatable-container">
        <div className="table-header">
          <h2>Lịch Sử Đơn Bán Hàng (Sales Orders)</h2>
          <Button variant="secondary" size="sm" onClick={fetchSO}>Tải Lại</Button>
        </div>
        <div className="responsive-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Số SO</th>
                <th>Khách hàng</th>
                <th>Tổng tiền đơn hàng</th>
                <th>Trạng thái Odoo</th>
                <th>Hóa đơn liên kết</th>
              </tr>
            </thead>
            <tbody>
              {(loading.so && cache.so.length === 0) ? (
                <tr>
                  <td colSpan={5} className="text-center">Đang tải danh sách đơn hàng...</td>
                </tr>
              ) : cache.so.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center">Không tìm thấy đơn bán hàng nào.</td>
                </tr>
              ) : (
                cache.so.map((o) => {
                  const total = o.amount_total ? Number(o.amount_total).toLocaleString() + ' đ' : '0 đ';
                  let stateLabel = '';
                  let badgeClass = 'text-warning';

                  if (o.state === 'draft') {
                    stateLabel = 'Nháp (Draft)';
                    badgeClass = 'text-warning';
                  } else if (o.state === 'cancel') {
                    stateLabel = 'Đã hủy';
                    badgeClass = 'text-muted';
                  } else if (o.state === 'sale' || o.state === 'done') {
                    if (o.delivery_state === 'done') {
                      stateLabel = 'Hoàn thành (Done)';
                      badgeClass = 'text-success';
                    } else if (o.delivery_state === 'assigned') {
                      stateLabel = 'Sẵn sàng giao (Ready)';
                      badgeClass = 'text-info';
                    } else if (o.delivery_state === 'confirmed' || o.delivery_state === 'waiting') {
                      stateLabel = 'Chờ sản xuất (Waiting)';
                      badgeClass = 'text-accent';
                    } else {
                      stateLabel = 'Đơn bán hàng';
                      badgeClass = 'text-success';
                    }
                  } else {
                    stateLabel = o.state || 'N/A';
                  }

                  return (
                    <tr
                      key={o.id}
                      onClick={() => handleOpenSO(o.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <strong style={{ color: 'var(--primary-color)' }}>
                          {o.name || '-'}
                        </strong>
                      </td>
                      <td>{o.partner || 'N/A'}</td>
                      <td><strong>{total}</strong></td>
                      <td><span className={`badge ${badgeClass}`}>{stateLabel}</span></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {o.invoice_ids && o.invoice_ids.length > 0 ? (
                          o.invoice_ids.map((invoiceId: number) => (
                            <a
                              key={invoiceId}
                              href={`/api/odoo/invoices/${invoiceId}/pdf?access_token=${encodeURIComponent(session?.token || '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="pdf-link"
                              style={{ color: 'var(--accent-secondary)', textDecoration: 'underline', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '8px' }}
                            >
                              📄 Tải PDF (#{invoiceId})
                            </a>
                          ))
                        ) : (
                          <a
                            href={`/api/odoo/so/${o.id}/invoice-pdf?access_token=${encodeURIComponent(session?.token || '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="pdf-link btn-create-invoice-pdf"
                            style={{ color: 'var(--accent-secondary)', textDecoration: 'underline', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            ➕ Tạo & Tải PDF
                          </a>
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

      {/* Customer Create Modal */}
      <Modal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        title="Thêm Khách Hàng Mới"
        maxWidth="550px"
      >
        <form onSubmit={handleCustomerModalSubmit} className="dialog-content">
          <div className="form-group">
            <label htmlFor="cName">Tên Khách Hàng:</label>
            <input
              type="text"
              id="cName"
              className="form-input"
              required
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              placeholder="Nhập tên khách hàng..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="cStreet">Địa Chỉ (Đường/Phố):</label>
            <input
              type="text"
              id="cStreet"
              className="form-input"
              value={newCustStreet}
              onChange={(e) => setNewCustStreet(e.target.value)}
              placeholder="Nhập địa chỉ..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="cPhone">Số Điện Thoại:</label>
            <input
              type="tel"
              id="cPhone"
              className="form-input"
              value={newCustPhone}
              onChange={(e) => setNewCustPhone(e.target.value)}
              placeholder="Nhập số điện thoại..."
            />
          </div>

          <div className="dialog-buttons" style={{ marginTop: '20px' }}>
            <Button type="button" variant="secondary" onClick={() => setIsCustomerModalOpen(false)}>
              Hủy Bỏ
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmittingCustomer}>
              {isSubmittingCustomer ? 'Đang tạo...' : 'Lưu Lại'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Sales;
