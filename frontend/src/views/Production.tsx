import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import Button from '../components/common/Button';

interface BomLine {
  productId: number;
  variantId: number;
  code: string;
  name: string;
  qtyPerUnit: number;
  actualQty: number;
  isManual?: boolean;
}

interface ProductionEntry {
  id: string;                  // uuid tạm
  productId: number | null;
  productName: string;
  productCode: string;
  qty: number;
  bomLines: BomLine[];
  loadingBom: boolean;
  totalQtyAvailable: number;   // tồn kho hiện tại (để gợi ý)
}

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
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Multi-entry states
  const [entries, setEntries] = useState<ProductionEntry[]>([]);

  // Manual raw materials dropdown states per entry card
  const [addingRawSelect, setAddingRawSelect] = useState<Record<string, string>>({});
  const [addingRawQty, setAddingRawQty] = useState<Record<string, string>>({});

  // Helper to create empty entry
  const createEmptyEntry = (): ProductionEntry => ({
    id: Math.random().toString(36).substring(2, 9),
    productId: null,
    productName: '',
    productCode: '',
    qty: 10,
    bomLines: [],
    loadingBom: false,
    totalQtyAvailable: 0
  });

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
    if (entries.length === 0) {
      setEntries([createEmptyEntry()]);
    }
  }, []);

  // Handle product dropdown change
  const handleProductChange = async (entryId: string, selectedVal: string) => {
    const productId = selectedVal ? Number(selectedVal) : null;
    const selectedProd = cache.products.find(p => p.id === productId);

    setEntries(prev => prev.map(entry => {
      if (entry.id !== entryId) return entry;
      return {
        ...entry,
        productId,
        productName: selectedProd ? selectedProd.name : '',
        productCode: selectedProd ? (selectedProd.default_code || '') : '',
        totalQtyAvailable: selectedProd ? (selectedProd.qty_available || 0) : 0,
        bomLines: [],
        loadingBom: !!productId
      };
    }));

    if (!productId) return;

    try {
      const response = await fetch(`/api/odoo/production-bom/${productId}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Could not load BOM');
      }

      setEntries(prev => prev.map(entry => {
        if (entry.id !== entryId) return entry;
        const currentQty = entry.qty;
        const lines: BomLine[] = (data.lines || []).map((l: any) => ({
          productId: l.productId,
          variantId: l.variantId,
          code: l.code,
          name: l.name,
          qtyPerUnit: l.qtyPerUnit,
          actualQty: l.qtyPerUnit * currentQty
        }));
        return {
          ...entry,
          bomLines: lines,
          loadingBom: false
        };
      }));
    } catch (err: any) {
      showToast(err.message, 'danger');
      setEntries(prev => prev.map(entry => {
        if (entry.id !== entryId) return entry;
        return {
          ...entry,
          loadingBom: false
        };
      }));
    }
  };

  // Handle entry yield quantity change
  const handleQtyChange = (entryId: string, qtyVal: number) => {
    setEntries(prev => prev.map(entry => {
      if (entry.id !== entryId) return entry;
      const updatedBomLines = entry.bomLines.map(line => {
        if (line.isManual) return line;
        return {
          ...line,
          actualQty: line.qtyPerUnit * qtyVal
        };
      });
      return {
        ...entry,
        qty: qtyVal,
        bomLines: updatedBomLines
      };
    }));
  };

  // Handle actual quantity change in BOM table
  const handleActualQtyChange = (entryId: string, lineIdx: number, val: number) => {
    setEntries(prev => prev.map(entry => {
      if (entry.id !== entryId) return entry;
      const updatedBomLines = [...entry.bomLines];
      updatedBomLines[lineIdx] = {
        ...updatedBomLines[lineIdx],
        actualQty: val
      };
      return {
        ...entry,
        bomLines: updatedBomLines
      };
    }));
  };

  // Handle adding manual raw material
  const handleAddRawMaterial = (entryId: string) => {
    const rawMaterialIdStr = addingRawSelect[entryId];
    const qtyStr = addingRawQty[entryId] || '1';
    if (!rawMaterialIdStr) return;

    const rawProd = cache.products.find(p => p.id === Number(rawMaterialIdStr));
    if (!rawProd) return;

    // Check if duplicate in the same entry
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    if (entry.bomLines.some(l => l.productId === rawProd.id)) {
      showToast('Nguyên liệu này đã có trong danh sách', 'warning');
      return;
    }

    const newLine: BomLine = {
      productId: rawProd.id,
      variantId: rawProd.id,
      name: rawProd.name,
      code: rawProd.default_code || '',
      qtyPerUnit: 0,
      actualQty: Number(qtyStr) || 1,
      isManual: true
    };

    setEntries(prev => prev.map(e => {
      if (e.id !== entryId) return e;
      return {
        ...e,
        bomLines: [...e.bomLines, newLine]
      };
    }));

    setAddingRawSelect(prev => ({ ...prev, [entryId]: '' }));
    setAddingRawQty(prev => ({ ...prev, [entryId]: '1' }));
    showToast(`Đã thêm ${rawProd.name} vào phiếu`, 'success');
  };

  // Remove manual material
  const handleRemoveRawMaterial = (entryId: string, lineIdx: number) => {
    setEntries(prev => prev.map(entry => {
      if (entry.id !== entryId) return entry;
      return {
        ...entry,
        bomLines: entry.bomLines.filter((_, i) => i !== lineIdx)
      };
    }));
  };

  // Add new entry card
  const handleAddEntry = () => {
    setEntries(prev => [...prev, createEmptyEntry()]);
  };

  // Remove entry card
  const handleRemoveEntry = (entryId: string) => {
    if (entries.length <= 1) return;
    setEntries(prev => prev.filter(e => e.id !== entryId));
  };

  // Submit all entries
  const handleProductionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (entries.length === 0) {
      showToast('Vui lòng thêm ít nhất 1 thành phẩm', 'warning');
      return;
    }

    for (const entry of entries) {
      if (!entry.productId) {
        showToast('Vui lòng chọn thành phẩm cho tất cả các dòng', 'warning');
        return;
      }
      if (!entry.qty || entry.qty <= 0) {
        showToast('Vui lòng nhập số lượng sản xuất hợp lệ cho tất cả các dòng', 'warning');
        return;
      }
    }

    setIsSubmitting(true);
    const payload = {
      shift_code: prodShiftCode,
      production_date: prodDate,
      shift: prodShift,
      entries: entries.map(entry => ({
        product_id: entry.productId,
        yield_qty: entry.qty,
        actual_bom_lines: entry.bomLines.map(line => ({
          product_id: line.productId,
          qty: line.actualQty
        }))
      }))
    };

    try {
      showToast('Đang ghi nhận sản lượng...', 'info');
      const response = await fetch('/api/odoo/production-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.success) {
        showToast('Ghi nhận sản xuất hàng loạt thành công!', 'success');
        // Reset to one empty entry
        setEntries([createEmptyEntry()]);
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

  const handleCancelProduction = async (index: number) => {
    if (!confirm('Bạn có chắc muốn hủy phiếu sản xuất này? Tồn kho thành phẩm sẽ bị trừ đi và nguyên liệu sẽ được cộng lại.')) return;
    try {
      showToast('Đang hủy phiếu sản xuất...', 'info');
      const res = await fetch(`/api/odoo/production/${index}`, { method: 'DELETE' });
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

  // Get total finished goods and total distinct NVL in current session
  const totalFinishedGoodsCount = entries.filter(e => e.productId).length;
  
  const allUniqueNVLSet = new Set<number>();
  entries.forEach(e => {
    e.bomLines.forEach(line => {
      allUniqueNVLSet.add(line.productId);
    });
  });
  const totalNVLCount = allUniqueNVLSet.size;

  const yieldProducts = cache.products.filter(p => p.sale_ok);

  return (
    <div className="tab-panel active" id="panelProduction">
      <div className="glass-panel settings-container" style={{ marginBottom: '24px' }}>
        <h2>Ghi Nhận Sản Lượng Sản Xuất Hàng Ngày</h2>
        <p className="text-muted">Nhập sản lượng sản xuất thành phẩm của xưởng. Hệ thống sẽ tự động trừ đi nguyên liệu tồn kho theo định mức.</p>

        <form onSubmit={handleProductionSubmit} className="settings-form">
          {/* Header section (Date, Shift, Code) */}
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
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

          {/* List of Entry Cards */}
          <div className="entries-list">
            {entries.map((entry, idx) => (
              <div
                key={entry.id}
                className="entry-card"
                style={{
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '20px',
                  borderRadius: '12px',
                  marginBottom: '20px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  position: 'relative'
                }}
              >
                {/* Header of the Card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--accent-primary)' }}>
                    #{idx + 1} Thành phẩm
                  </h3>
                  {entries.length > 1 && (
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => handleRemoveEntry(entry.id)}
                      style={{
                        margin: 0,
                        padding: '4px 10px',
                        fontSize: '0.8rem',
                        minHeight: 'unset',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: 'var(--accent-danger)',
                        borderColor: 'rgba(239, 68, 68, 0.2)'
                      }}
                    >
                      Xóa
                    </Button>
                  )}
                </div>

                {/* Row 1: Dropdown + Qty + Current Stock */}
                <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Thành Phẩm Sản Xuất:</label>
                    <select
                      className="form-input"
                      required
                      style={{ padding: '8px', width: '100%' }}
                      value={entry.productId || ''}
                      onChange={(e) => handleProductChange(entry.id, e.target.value)}
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
                    <label>Số Lượng Sản Xuất:</label>
                    <input
                      type="number"
                      className="form-input"
                      min="1"
                      required
                      value={entry.qty}
                      onChange={(e) => handleQtyChange(entry.id, Number(e.target.value))}
                      style={{ fontSize: '1.25rem', height: '42px', fontWeight: 'bold', textAlign: 'center', color: 'var(--accent-primary)' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Tồn kho hiện tại:</label>
                    <input
                      type="text"
                      className="form-input"
                      readOnly
                      value={entry.productId ? entry.totalQtyAvailable : '-'}
                      style={{ height: '42px', textAlign: 'center', background: 'rgba(255, 255, 255, 0.05)', fontWeight: 'bold' }}
                    />
                  </div>
                </div>

                {/* Row 2: BOM Materials Table */}
                {entry.productId && (
                  <div style={{ marginTop: '16px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem' }}>Định mức nguyên vật liệu theo BOM:</h4>
                    <div className="responsive-table-wrapper" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                      <table style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th>Mã NVL</th>
                            <th>Tên Nguyên Liệu</th>
                            <th style={{ textAlign: 'right' }}>SL Lý Thuyết</th>
                            <th style={{ textAlign: 'right' }}>SL Thực Tế</th>
                            <th>Cảnh Báo</th>
                            <th style={{ textAlign: 'center' }}>Thao tác</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.loadingBom ? (
                            <tr>
                              <td colSpan={6} className="text-center text-muted">Đang tải định mức BOM...</td>
                            </tr>
                          ) : entry.bomLines.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="text-center text-muted">
                                Sản phẩm này chưa có BOM/định mức nguyên liệu. Bạn có thể tự chọn và thêm nguyên liệu hao hụt ở dưới.
                              </td>
                            </tr>
                          ) : (
                            entry.bomLines.map((line, lineIdx) => {
                              const theoreticalQty = line.qtyPerUnit * entry.qty;
                              const actualQty = line.actualQty;

                              let badgeHtml;
                              let warningText = '';

                              if (line.isManual) {
                                badgeHtml = (
                                  <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}>
                                    ℹ️ Có NVL ngoài BOM
                                  </span>
                                );
                              } else {
                                const diff = Math.abs(actualQty - theoreticalQty);
                                const isWarn = diff > (theoreticalQty * 0.05);

                                // Check stock shortage
                                const rawProd = cache.products.find(p => p.id === line.productId);
                                const currentStock = rawProd ? (rawProd.qty_available || 0) : 0;
                                if (actualQty > currentStock) {
                                  const shortage = (actualQty - currentStock).toFixed(1);
                                  warningText = `⚠️ Không đủ NVL: thiếu ${shortage} ${line.code || ''}`;
                                }

                                badgeHtml = isWarn ? (
                                  <span className="badge text-warning" style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#ca8a04' }}>
                                    Lệch &gt; 5%
                                  </span>
                                ) : (
                                  <span className="badge text-success" style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#16a34a' }}>
                                    Hợp lệ
                                  </span>
                                );
                              }

                              return (
                                <tr key={lineIdx}>
                                  <td>{line.code || ''}</td>
                                  <td>{line.name || ''}</td>
                                  <td style={{ textAlign: 'right' }}>
                                    <strong>{line.isManual ? '-' : theoreticalQty.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong>
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <input
                                      type="number"
                                      className="form-input"
                                      min="0"
                                      step="any"
                                      value={actualQty}
                                      onChange={(e) => handleActualQtyChange(entry.id, lineIdx, Number(e.target.value))}
                                      style={{
                                        width: '100px',
                                        padding: '6px 10px',
                                        textAlign: 'right',
                                        fontSize: '1.1rem',
                                        fontWeight: 'bold',
                                        margin: 0,
                                        display: 'inline-block'
                                      }}
                                    />
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      {badgeHtml}
                                      {warningText && (
                                        <span className="text-danger" style={{ fontSize: '0.8rem', display: 'block' }}>
                                          {warningText}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    {line.isManual ? (
                                      <Button
                                        size="sm"
                                        variant="danger"
                                        onClick={() => handleRemoveRawMaterial(entry.id, lineIdx)}
                                        style={{ margin: 0, padding: '2px 6px', fontSize: '0.75rem', minHeight: 'unset', color: 'var(--accent-danger)', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                      >
                                        Xóa
                                      </Button>
                                    ) : (
                                      <span className="text-muted">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Add out-of-BOM materials */}
                    <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr auto', gap: '12px', marginTop: '12px', alignItems: 'flex-end', background: 'rgba(255, 255, 255, 0.05)', padding: '12px', borderRadius: '8px' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Thêm nguyên liệu tiêu hao / hao hụt khác:</label>
                        <select
                          className="form-input"
                          value={addingRawSelect[entry.id] || ''}
                          onChange={(e) => setAddingRawSelect(prev => ({ ...prev, [entry.id]: e.target.value }))}
                          style={{ padding: '8px', width: '100%' }}
                        >
                          <option value="">-- Chọn Nguyên Liệu --</option>
                          {cache.products
                            .filter(p => p.id !== entry.productId)
                            .map(p => (
                              <option key={p.id} value={p.id}>
                                [{p.default_code || 'Không SKU'}] {p.name}
                              </option>
                            ))
                          }
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Số lượng tiêu hao:</label>
                        <input
                          type="number"
                          className="form-input"
                          min="0.001"
                          step="any"
                          value={addingRawQty[entry.id] || '1'}
                          onChange={(e) => setAddingRawQty(prev => ({ ...prev, [entry.id]: e.target.value }))}
                          style={{ height: '38px' }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleAddRawMaterial(entry.id)}
                        style={{ margin: 0, height: '38px', whiteSpace: 'nowrap' }}
                      >
                        [+ Thêm NVL ngoài BOM]
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add more entry button */}
          <div style={{ marginBottom: '24px' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={handleAddEntry}
              style={{ width: '100%', borderStyle: 'dashed', borderWidth: '2px', background: 'rgba(255,255,255,0.02)' }}
            >
              [+ Thêm thành phẩm khác]
            </Button>
          </div>

          {/* Form Footer Summaries & Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '16px' }}>
            <div style={{ fontWeight: '500' }}>
              Tổng cộng: <span style={{ color: 'var(--accent-primary)' }}>{totalFinishedGoodsCount}</span> thành phẩm, <span style={{ color: 'var(--accent-primary)' }}>{totalNVLCount}</span> NVL khác nhau
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => showToast('Đã lưu nháp (mô phỏng)', 'info')}
                disabled={isSubmitting}
                style={{ margin: 0 }}
              >
                Lưu nháp
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting} style={{ margin: 0 }}>
                Ghi nhận & Trừ kho
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* Production History section */}
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

                  // Handle batch render vs legacy render
                  const isBatch = h.entries && Array.isArray(h.entries);

                  return (
                    <tr key={idx} className={isCanceled ? 'opacity-50' : ''}>
                      <td><strong>{h.shift_code || '-'}</strong></td>
                      <td>{dateShiftDisplay}</td>
                      <td>
                        {isBatch ? (
                          h.entries.map((ent: any, eIdx: number) => (
                            <div key={eIdx} style={{ margin: '2px 0' }}>
                              [{ent.productCode || 'Không SKU'}] <strong>{ent.productName}</strong>
                            </div>
                          ))
                        ) : (
                          <strong>{h.productName}</strong>
                        )}
                      </td>
                      <td>
                        {isBatch ? (
                          h.entries.map((ent: any, eIdx: number) => (
                            <div key={eIdx} style={{ margin: '2px 0' }}>
                              <strong className={isCanceled ? 'text-muted text-decoration-line-through' : 'text-success'}>
                                +{ent.qty}
                              </strong>
                            </div>
                          ))
                        ) : (
                          <strong className={isCanceled ? 'text-muted text-decoration-line-through' : 'text-success'}>
                            +{h.qty}
                          </strong>
                        )}
                      </td>
                      <td>
                        {isBatch ? (
                          h.entries.map((ent: any, eIdx: number) => (
                            <div key={eIdx} style={{ marginBottom: '8px', borderBottom: eIdx < h.entries.length - 1 ? '1px dashed rgba(255,255,255,0.05)' : 'none', paddingBottom: '4px' }}>
                              <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>Bán thành phẩm cho: <strong>{ent.productName}</strong></div>
                              {ent.deducted && ent.deducted.length ? (
                                ent.deducted.map((d: any, dIdx: number) => (
                                  <div key={dIdx} style={{ fontSize: '0.8rem', paddingLeft: '6px' }}>
                                    • {d.name} (-{d.deducted} chiếc, còn {d.remaining})
                                  </div>
                                ))
                              ) : (
                                <div style={{ fontSize: '0.8rem', paddingLeft: '6px', color: 'var(--text-muted)' }}>Không khấu hao</div>
                              )}
                            </div>
                          ))
                        ) : (
                          <small>
                            {h.deducted && h.deducted.length ? (
                              h.deducted.map((d: any, dIdx: number) => (
                                <div key={dIdx}>
                                  {d.name} (-{d.deducted} chiếc, còn {d.remaining})
                                </div>
                              ))
                            ) : (
                              'Không khấu hao'
                            )}
                          </small>
                        )}
                      </td>
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
