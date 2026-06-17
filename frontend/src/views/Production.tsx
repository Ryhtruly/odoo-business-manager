import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import Button from '../components/common/Button';

export const Production: React.FC = () => {
  const {
    cache,
    loading,
    showToast,
    fetchProducts,
    fetchProductionHistory
  } = useApp();

  const [prodDate, setProdDate] = useState<string>('');
  const [prodShift, setProdShift] = useState<string>('ca1');
  const [prodShiftCode, setProdShiftCode] = useState<string>('');
  const [prodSelectYield, setProdSelectYield] = useState<string>('');
  const [prodQtyYield, setProdQtyYield] = useState<number>(10);

  // BOM states
  const [bomData, setBomData] = useState<any>(null);
  const [isBomLoading, setIsBomLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Compute shift code SX-YYYYMMDD-CAX
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    setProdDate(todayStr);
  }, []);

  useEffect(() => {
    if (prodDate && prodShift) {
      const dateVal = prodDate.replace(/-/g, '');
      const shiftVal = prodShift.toUpperCase();
      setProdShiftCode(`SX-${dateVal}-${shiftVal}`);
    }
  }, [prodDate, prodShift]);

  // Load products & history initially
  useEffect(() => {
    if (cache.products.length === 0) fetchProducts();
    if (cache.productionHistory.length === 0) fetchProductionHistory();
  }, []);

  // Load BOM when product yields changes
  useEffect(() => {
    if (!prodSelectYield) {
      setBomData(null);
      return;
    }

    const loadBOM = async () => {
      setIsBomLoading(true);
      try {
        const response = await fetch(`/api/odoo/production-bom/${prodSelectYield}`);
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Could not load BOM');
        }
        setBomData(data);
      } catch (err: any) {
        showToast(err.message, 'danger');
        setBomData(null);
      } finally {
        setIsBomLoading(false);
      }
    };
    loadBOM();
  }, [prodSelectYield]);

  // Handle actual qty change on a BOM line
  const handleActualQtyChange = (idx: number, val: number) => {
    if (bomData && bomData.lines) {
      const updatedLines = [...bomData.lines];
      updatedLines[idx] = {
        ...updatedLines[idx],
        actualQty: val
      };
      setBomData({
        ...bomData,
        lines: updatedLines
      });
    }
  };

  const handleProductionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodSelectYield || !prodQtyYield) {
      showToast('Vui lòng chọn sản phẩm và sản lượng', 'warning');
      return;
    }

    setIsSubmitting(true);
    const payload = {
      product_id: Number(prodSelectYield),
      yield_qty: Number(prodQtyYield),
      shift_code: prodShiftCode,
      production_date: prodDate,
      shift: prodShift,
      actual_bom_lines: bomData && Array.isArray(bomData.lines)
        ? bomData.lines.map((l: any) => {
            const theoretical = l.qtyPerUnit * prodQtyYield;
            const actual = l.actualQty !== undefined ? l.actualQty : theoretical;
            return {
              product_id: l.productId,
              qty: Number(actual)
            };
          })
        : []
    };

    try {
      showToast('Đang ghi nhận sản lượng...', 'info');
      const response = await fetch('/api/odoo/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.success) {
        showToast(`Ghi nhận sản xuất thành công: ${data.productName}`, 'success');
        // Reset form
        setProdSelectYield('');
        setProdQtyYield(10);
        setBomData(null);
        fetchProductionHistory();
      } else {
        showToast(`Lỗi: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelProduction = async (id: number) => {
    if (!confirm('Bạn có chắc muốn hủy phiếu sản xuất này? Tồn kho thành phẩm sẽ bị trừ đi và nguyên liệu sẽ được cộng lại.')) return;
    try {
      showToast('Đang hủy phiếu sản xuất...', 'info');
      const res = await fetch(`/api/odoo/production/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Đã hủy phiếu sản xuất thành công!', 'success');
        fetchProductionHistory();
      } else {
        showToast(`Lỗi hủy phiếu: ${data.error}`, 'danger');
      }
    } catch (err: any) {
      showToast(`Lỗi hệ thống: ${err.message}`, 'danger');
    }
  };

  const yieldProducts = cache.products.filter(p => p.sale_ok);

  return (
    <div className="tab-panel active" id="panelProduction">
      <div className="glass-panel settings-container" style={{ marginBottom: '24px' }}>
        <h2>Ghi Nhận Sản Lượng Sản Xuất Hàng Ngày</h2>
        <p className="text-muted">Nhập sản lượng sản xuất thành phẩm của xưởng. Hệ thống sẽ tự động trừ đi nguyên liệu tồn kho theo định mức.</p>

        <form onSubmit={handleProductionSubmit} className="settings-form">
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="prodDate">Ngày Sản Xuất:</label>
              <input
                type="date"
                id="prodDate"
                className="form-input"
                required
                value={prodDate}
                onChange={(e) => setProdDate(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="prodShift">Ca Làm Việc:</label>
              <select
                id="prodShift"
                className="form-input"
                required
                value={prodShift}
                onChange={(e) => setProdShift(e.target.value)}
              >
                <option value="ca1">Ca 1</option>
                <option value="ca2">Ca 2</option>
                <option value="ca3">Ca 3</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="prodShiftCode">Mã Ca (Khóa):</label>
              <input
                type="text"
                id="prodShiftCode"
                className="form-input"
                readOnly
                value={prodShiftCode}
                style={{ opacity: 0.85, fontFamily: 'monospace', fontWeight: 600 }}
              />
            </div>
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="prodSelectYield">Thành Phẩm Sản Xuất:</label>
              <select
                id="prodSelectYield"
                className="form-input"
                required
                style={{ padding: '8px', width: '100%' }}
                value={prodSelectYield}
                onChange={(e) => setProdSelectYield(e.target.value)}
              >
                <option value="">-- Chọn Thành Phẩm --</option>
                {yieldProducts.map(p => (
                  <option key={p.id} value={p.id}>
                    [{p.default_code || 'Không SKU'}] {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="prodQtyYield">Số Lượng Sản Xuất:</label>
              <input
                type="number"
                id="prodQtyYield"
                className="form-input"
                min="1"
                required
                value={prodQtyYield}
                onChange={(e) => setProdQtyYield(Number(e.target.value))}
                style={{ fontSize: '1.5rem', height: '50px', fontWeight: 'bold', textAlign: 'center', color: 'var(--accent-primary)' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <Button type="submit" variant="primary" disabled={isSubmitting} style={{ margin: 0 }}>
              Ghi Nhận Sản Xuất & Trừ Kho
            </Button>
          </div>
        </form>

        <div className="responsive-table-wrapper" style={{ marginTop: '16px' }}>
          <table>
            <thead>
              <tr>
                <th>Mã NVL</th>
                <th>Tên Nguyên Liệu</th>
                <th style={{ textAlign: 'right' }}>SL Lý Thuyết</th>
                <th style={{ textAlign: 'right' }}>SL Thực Tế</th>
                <th>Cảnh Báo</th>
              </tr>
            </thead>
            <tbody>
              {isBomLoading ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted">Đang tải định mức BOM...</td>
                </tr>
              ) : !bomData || !bomData.lines || bomData.lines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted">
                    {bomData && bomData.source === 'missing_bom'
                      ? 'Sản phẩm này chưa có BOM/định mức nguyên liệu.'
                      : 'Chọn thành phẩm để xem định mức nguyên liệu.'}
                  </td>
                </tr>
              ) : (
                bomData.lines.map((line: any, idx: number) => {
                  const theoreticalQty = line.qtyPerUnit * prodQtyYield;
                  const actualQty = line.actualQty !== undefined ? line.actualQty : theoreticalQty;

                  const diff = Math.abs(actualQty - theoreticalQty);
                  const isWarn = diff > (theoreticalQty * 0.05);
                  const badgeHtml = isWarn ? (
                    <span className="badge text-warning" style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#ca8a04' }}>
                      Lệch &gt; 5%
                    </span>
                  ) : (
                    <span className="badge text-success" style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#16a34a' }}>
                      Hợp lệ
                    </span>
                  );

                  return (
                    <tr key={idx}>
                      <td>{line.code || ''}</td>
                      <td>{line.name || ''}</td>
                      <td style={{ textAlign: 'right' }}>
                        <strong>{theoreticalQty.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <input
                          type="number"
                          className="form-input"
                          min="0"
                          step="any"
                          value={actualQty}
                          onChange={(e) => handleActualQtyChange(idx, Number(e.target.value))}
                          style={{ width: '100px', padding: '4px 8px', textAlign: 'right', fontSize: '0.85rem', margin: 0, display: 'inline-block' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>{badgeHtml}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-panel datatable-container">
        <div className="table-header">
          <h2>Lịch Sử Báo Cáo Sản Xuất</h2>
        </div>
        <div className="responsive-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Mã Ca</th>
                <th>Thời gian / Ca</th>
                <th>Thành phẩm</th>
                <th>Sản lượng</th>
                <th>Nguyên liệu đã khấu hao</th>
                <th>Trạng thái kho</th>
              </tr>
            </thead>
            <tbody>
              {(loading.productionHistory && cache.productionHistory.length === 0) ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted">Đang tải lịch sử sản xuất...</td>
                </tr>
              ) : cache.productionHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted">Chưa có lịch sử sản xuất.</td>
                </tr>
              ) : (
                cache.productionHistory.map((h, idx) => {
                  const deductedText = h.deducted && h.deducted.length ? (
                    h.deducted.map((d: any, dIdx: number) => (
                      <div key={dIdx}>
                        {d.name} (-{d.deducted} chiếc, còn {d.remaining})
                      </div>
                    ))
                  ) : (
                    'Không khấu hao'
                  );

                  const isCanceled = h.status === 'canceled';
                  const statusBadgeClass = isCanceled ? 'text-danger' : 'text-success';
                  const statusTextVi = isCanceled ? 'Đã hủy' : 'Hoàn thành';

                  let shiftDisplay = h.shift || '';
                  if (shiftDisplay === 'ca1') shiftDisplay = 'Ca 1';
                  else if (shiftDisplay === 'ca2') shiftDisplay = 'Ca 2';
                  else if (shiftDisplay === 'ca3') shiftDisplay = 'Ca 3';

                  const dateShiftDisplay = (h.production_date && shiftDisplay)
                    ? `${new Date(h.production_date).toLocaleDateString('vi-VN')} / ${shiftDisplay}`
                    : h.timestamp || 'N/A';

                  return (
                    <tr key={idx} className={isCanceled ? 'opacity-50' : ''}>
                      <td><strong>{h.shift_code || '-'}</strong></td>
                      <td>{dateShiftDisplay}</td>
                      <td><strong>{h.productName}</strong></td>
                      <td>
                        <strong className={isCanceled ? 'text-muted text-decoration-line-through' : 'text-success'}>
                          +{h.qty}
                        </strong>
                      </td>
                      <td><small>{deductedText}</small></td>
                      <td>
                        <span className={`badge ${statusBadgeClass}`}>{statusTextVi}</span>
                        {!isCanceled && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleCancelProduction(idx)}
                            style={{ marginLeft: '8px', padding: '2px 6px', fontSize: '0.75rem', color: 'var(--accent-danger)', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)', minHeight: 'unset' }}
                          >
                            Hủy
                          </Button>
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
    </div>
  );
};

export default Production;
