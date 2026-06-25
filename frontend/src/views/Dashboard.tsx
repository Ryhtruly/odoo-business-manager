import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Play, Clipboard, Trash2 } from 'lucide-react';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';

// Script Actions metadata
const scriptActions = [
  {
    category: 'Đồng bộ & Chuẩn hóa dữ liệu',
    items: [
      { file: 'odoo_gsheet_bidirectional_sync.js', label: 'Đồng Bộ 2 Chiều Odoo <-> GSheet', variant: 'primary' },
      { file: 'fix_odoo_products_utf8.js', label: 'Import Sản Phẩm & Fix UTF-8', variant: 'secondary' },
      { file: 'fix_duplicates_and_combos.js', label: 'Dọn Trùng Sản Phẩm & Cấu Hình Combo', variant: 'secondary' },
      { file: 'odoo_process_stock_receipts.js', label: 'Xử Lý Duyệt Phiếu Nhận Kho Chờ Duyệt', variant: 'secondary' }
    ]
  },
  {
    category: 'Kiểm thử & Khởi tạo dữ liệu mẫu',
    items: [
      { file: 'odoo_e2e_workflow_test.js', label: 'Chạy Test Workflow E2E (Sản Xuất -> Bán)', variant: 'accent' },
      { file: 'odoo_create_sample_orders_test.js', label: 'Tạo Đơn Bán Hàng Mẫu (Sales Orders)', variant: 'secondary' },
      { file: 'odoo_create_sample_purchase_and_receipt_test.js', label: 'Tạo Đơn Mua Hàng & Nhận Kho Mẫu', variant: 'secondary' },
      { file: 'odoo_create_invoice_ab.js', label: 'Tạo Hóa Đơn Khách Hàng (Invoices) A/B', variant: 'secondary' },
      { file: 'odoo_sync_production.js', label: 'Chạy Quy Trình Khép Kín Sản Xuất Kho', variant: 'secondary' }
    ]
  }
];

const scriptNamesMapping: Record<string, string> = {
  'odoo_gsheet_bidirectional_sync.js': 'Đồng Bộ 2 Chiều Odoo <-> GSheet',
  'fix_odoo_products_utf8.js': 'Import Sản Phẩm & Fix UTF-8',
  'fix_duplicates_and_combos.js': 'Dọn Trùng Sản Phẩm & Cấu Hình Combo',
  'odoo_process_stock_receipts.js': 'Xử Lý Duyệt Phiếu Nhận Kho Chờ Duyệt',
  'odoo_e2e_workflow_test.js': 'Chạy Test Workflow E2E',
  'odoo_create_sample_orders_test.js': 'Tạo Đơn Bán Hàng Mẫu',
  'odoo_create_sample_purchase_and_receipt_test.js': 'Tạo Đơn Mua Hàng & Nhận Kho Mẫu',
  'odoo_create_invoice_ab.js': 'Tạo Hóa Đơn Khách Hàng A/B',
  'odoo_sync_production.js': 'Chạy Quy Trình Khép Kín Sản Xuất Kho'
};

const bgColors = [
  'rgba(99, 102, 241, 0.7)', 'rgba(56, 189, 248, 0.7)', 'rgba(16, 185, 129, 0.7)',
  'rgba(245, 158, 11, 0.7)', 'rgba(239, 68, 68, 0.7)', 'rgba(139, 92, 246, 0.7)',
  'rgba(236, 72, 153, 0.7)', 'rgba(20, 184, 166, 0.7)', 'rgba(249, 115, 22, 0.7)',
  'rgba(100, 116, 139, 0.7)'
];

type ChartType = 'bar' | 'line' | 'pie' | 'doughnut';

export const Dashboard: React.FC = () => {
  const {
    session,
    cache,
    loading,
    terminalLogs,
    isRunningScript,
    runScript,
    clearTerminal,
    copyTerminal,
    fetchProducts,
    fetchStock,
    fetchInvoices,
    fetchPOs,
    fetchReceipts,
    fetchSO
  } = useApp();

  const [confirmScript, setConfirmScript] = useState<string | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Chart Type States
  const [stockChartType, setStockChartType] = useState<ChartType>('bar');
  const [invoiceChartType, setInvoiceChartType] = useState<ChartType>('pie');
  const [purchaseChartType, setPurchaseChartType] = useState<ChartType>('bar');
  const [salesChartType, setSalesChartType] = useState<ChartType>('bar');
  const [salesFlowChartType, setSalesFlowChartType] = useState<ChartType>('doughnut');

  // Canvas chart refs
  const stockChartRef = useRef<HTMLCanvasElement | null>(null);
  const invoiceChartRef = useRef<HTMLCanvasElement | null>(null);
  const purchaseChartRef = useRef<HTMLCanvasElement | null>(null);
  const salesChartRef = useRef<HTMLCanvasElement | null>(null);
  const salesFlowChartRef = useRef<HTMLCanvasElement | null>(null);

  // Chart instances tracking
  const chartInstances = useRef<Record<string, any>>({});

  const role = session?.role || '';
  const isAdmin = role === 'admin';

  // Load metrics initially (optimized to only fetch if user has permission and cache is empty)
  useEffect(() => {
    if (!role) return;
    const hasProductsAccess = isAdmin || ['ke_toan_kho', 'san_xuat', 'kinh_doanh'].includes(role);
    const hasStockAccess = isAdmin || ['ke_toan_kho', 'san_xuat', 'kinh_doanh'].includes(role);
    const hasInvoicesAccess = isAdmin || ['ke_toan_ban_hang'].includes(role);
    const hasPOsAccess = isAdmin || ['ke_toan_kho'].includes(role);
    const hasReceiptsAccess = isAdmin || ['ke_toan_kho'].includes(role);
    const hasSOAccess = isAdmin || ['kinh_doanh'].includes(role);

    if (hasProductsAccess && cache.products.length === 0) fetchProducts();
    if (hasStockAccess && cache.stock.length === 0) fetchStock();
    if (hasInvoicesAccess && cache.invoices.length === 0) fetchInvoices();
    if (hasPOsAccess && cache.pos.length === 0) fetchPOs();
    if (hasReceiptsAccess && cache.receipts.length === 0) fetchReceipts();
    if (hasSOAccess && cache.so.length === 0) fetchSO();
  }, [role, isAdmin]);

  // Auto scroll terminal to bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs]);

  // Compute metrics values
  const totalProductsCount = cache.products.length;
  
  const internalStock = cache.stock.filter(s => s.usage === 'internal');
  const stockLocations = new Set(internalStock.map(s => s.location));
  const totalLocationsCount = stockLocations.size;
  const totalStockQty = internalStock.reduce((acc, curr) => acc + (curr.quantity || 0), 0);

  const totalInvoicesCount = cache.invoices.filter(i => i.state !== 'cancel').length;
  const unpaidInvoicesCount = cache.invoices.filter(i => i.state === 'posted' && i.payment_state !== 'paid' && i.payment_state !== 'in_payment').length;

  const totalPOsCount = cache.pos.filter(po => po.state === 'purchase' || po.state === 'done').length;
  const pendingReceiptsCount = cache.receipts.filter(r => r.state === 'assigned').length;

  // Render Chart helper
  const drawChart = (
    canvasEl: HTMLCanvasElement | null,
    chartKey: string,
    type: ChartType,
    labels: string[],
    data: number[],
    datasetLabel = 'Số lượng'
  ) => {
    if (!canvasEl || !window.Chart) return;

    if (chartInstances.current[chartKey]) {
      chartInstances.current[chartKey].destroy();
    }

    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    // Register DataLabels if loaded
    try {
      if (typeof window.Chart.register === 'function' && typeof (window as any).ChartDataLabels !== 'undefined') {
        window.Chart.register((window as any).ChartDataLabels);
      }
    } catch (e) {
      console.warn('ChartDataLabels already registered or registration failed:', e);
    }

    const isBarOrLine = type === 'bar' || type === 'line';

    chartInstances.current[chartKey] = new window.Chart(ctx, {
      type,
      data: {
        labels,
        datasets: [{
          label: datasetLabel,
          data,
          backgroundColor: bgColors.slice(0, data.length),
          borderColor: type === 'line' ? 'rgba(99, 102, 241, 1)' : undefined,
          borderWidth: 1,
          fill: type === 'line' ? false : undefined,
          tension: type === 'line' ? 0.2 : undefined
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: !isBarOrLine,
            position: 'right',
            labels: { boxWidth: 12, font: { size: 10 } }
          },
          datalabels: {
            display: !isBarOrLine,
            color: '#fff',
            font: { weight: 'bold', size: 11 },
            formatter: (value: number, context: any) => {
              const dataset = context.chart.data.datasets[0];
              const total = dataset.data.reduce((acc: number, curr: number) => acc + Number(curr), 0);
              if (total === 0) return '0%';
              const percentage = ((value / total) * 100).toFixed(1);
              return Number(percentage) > 3 ? percentage + '%' : '';
            }
          }
        },
        scales: isBarOrLine ? { y: { beginAtZero: true } } : { x: { display: false }, y: { display: false } }
      }
    });
  };

  // 1. Stock Chart Effect
  useEffect(() => {
    if (!window.Chart) return;
    const stockByProd: Record<string, number> = {};
    cache.stock.forEach(s => {
      if (s.usage === 'internal' && s.quantity > 0 && s.product_name) {
        stockByProd[s.product_name] = (stockByProd[s.product_name] || 0) + s.quantity;
      }
    });
    const sortedStockData = Object.entries(stockByProd)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    drawChart(
      stockChartRef.current,
      'stock',
      stockChartType,
      sortedStockData.map(d => d.label),
      sortedStockData.map(d => d.value)
    );

    return () => {
      if (chartInstances.current['stock']) {
        chartInstances.current['stock'].destroy();
        delete chartInstances.current['stock'];
      }
    };
  }, [cache.stock, stockChartType]);

  // 2. Invoice Chart Effect
  useEffect(() => {
    if (!window.Chart) return;
    const activeInvoices = cache.invoices.filter(i => i.state !== 'cancel');
    const invByStatus = {
      'Đã thanh toán': activeInvoices.filter(i => i.state === 'posted' && i.payment_state === 'paid').length,
      'Chưa thanh toán': activeInvoices.filter(i => i.state === 'posted' && (!i.payment_state || i.payment_state === 'not_paid')).length,
      'Đang thanh toán': activeInvoices.filter(i => i.state === 'posted' && (i.payment_state === 'partial' || i.payment_state === 'in_payment')).length,
      'Bản nháp': activeInvoices.filter(i => i.state === 'draft').length
    };
    drawChart(
      invoiceChartRef.current,
      'invoice',
      invoiceChartType,
      Object.keys(invByStatus),
      Object.values(invByStatus)
    );

    return () => {
      if (chartInstances.current['invoice']) {
        chartInstances.current['invoice'].destroy();
        delete chartInstances.current['invoice'];
      }
    };
  }, [cache.invoices, invoiceChartType]);

  // 3. Purchase Flow Chart Effect
  useEffect(() => {
    if (!window.Chart) return;
    const purchaseFlow = {
      'Đơn mua hàng': cache.pos.filter(po => po.state === 'purchase' || po.state === 'done').length,
      'Đang chờ nhập': cache.receipts.filter(r => r.state === 'assigned').length,
      'Đã nhận kho': cache.receipts.filter(r => r.state === 'done').length
    };
    drawChart(
      purchaseChartRef.current,
      'purchase',
      purchaseChartType,
      Object.keys(purchaseFlow),
      Object.values(purchaseFlow)
    );

    return () => {
      if (chartInstances.current['purchase']) {
        chartInstances.current['purchase'].destroy();
        delete chartInstances.current['purchase'];
      }
    };
  }, [cache.pos, cache.receipts, purchaseChartType]);

  // 4. Sales Chart Effect
  useEffect(() => {
    if (!window.Chart) return;
    const salesByCustomer: Record<string, number> = {};
    cache.so.forEach(so => {
      if ((so.state === 'sale' || so.state === 'done') && so.amount_total > 0 && so.partner) {
        salesByCustomer[so.partner] = (salesByCustomer[so.partner] || 0) + so.amount_total;
      }
    });
    const sortedSalesData = Object.entries(salesByCustomer)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    drawChart(
      salesChartRef.current,
      'sales',
      salesChartType,
      sortedSalesData.map(d => d.label),
      sortedSalesData.map(d => d.value),
      'Giá trị (đ)'
    );

    return () => {
      if (chartInstances.current['sales']) {
        chartInstances.current['sales'].destroy();
        delete chartInstances.current['sales'];
      }
    };
  }, [cache.so, salesChartType]);

  // 5. Sales Flow Chart Effect
  useEffect(() => {
    if (!window.Chart) return;
    const flowCounts = {
      'Đã chốt': cache.so.filter(so => so.state === 'sale' || so.state === 'done').length,
      'Báo giá (Draft/Sent)': cache.so.filter(so => so.state === 'draft' || so.state === 'sent').length,
      'Đã hủy': cache.so.filter(so => so.state === 'cancel').length
    };
    drawChart(
      salesFlowChartRef.current,
      'salesFlow',
      salesFlowChartType,
      Object.keys(flowCounts),
      Object.values(flowCounts)
    );

    return () => {
      if (chartInstances.current['salesFlow']) {
        chartInstances.current['salesFlow'].destroy();
        delete chartInstances.current['salesFlow'];
      }
    };
  }, [cache.so, salesFlowChartType]);

  const handleScriptRun = (scriptFile: string) => {
    setConfirmScript(scriptFile);
  };

  const executeConfirmScript = () => {
    if (confirmScript) {
      runScript(confirmScript);
      setConfirmScript(null);
    }
  };

  return (
    <div className="tab-panel active" id="panelDashboard">
      {/* Metrics Grid */}
      <div className="metrics-grid">
        {(isAdmin || role === 'ke_toan_kho' || role === 'san_xuat' || role === 'kinh_doanh') && (
          <div className="metric-card glass-panel" id="metricProducts">
            <div className="metric-header">
              <span className="text-muted">Tổng Sản Phẩm</span>
              <span className="metric-icon products">🛒</span>
            </div>
            <div className="metric-value">{loading.products ? '--' : totalProductsCount}</div>
            <div className="metric-footer">
              <span className="text-success">↑ Cập nhật tự động</span>
            </div>
          </div>
        )}

        {(isAdmin || role === 'ke_toan_kho' || role === 'san_xuat' || role === 'kinh_doanh') && (
          <div className="metric-card glass-panel" id="metricStock">
            <div className="metric-header">
              <span className="text-muted">Vị Trí Tồn Kho</span>
              <span className="metric-icon stock">📦</span>
            </div>
            <div className="metric-value">{loading.stock ? '--' : totalLocationsCount}</div>
            <div className="metric-footer">
              <span className="text-muted">
                Tổng số lượng: {loading.stock ? '--' : totalStockQty.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {(isAdmin || role === 'ke_toan_ban_hang') && (
          <div className="metric-card glass-panel" id="metricInvoices">
            <div className="metric-header">
              <span className="text-muted">Tổng Hóa Đơn</span>
              <span className="metric-icon invoices">💸</span>
            </div>
            <div className="metric-value">{loading.invoices ? '--' : totalInvoicesCount}</div>
            <div className="metric-footer">
              <span className="text-warning">Chưa thanh toán: {loading.invoices ? '--' : unpaidInvoicesCount}</span>
            </div>
          </div>
        )}

        {(isAdmin || role === 'ke_toan_kho') && (
          <div className="metric-card glass-panel" id="metricOrders">
            <div className="metric-header">
              <span className="text-muted">Đơn Mua Hàng</span>
              <span className="metric-icon po">📋</span>
            </div>
            <div className="metric-value">{loading.pos ? '--' : totalPOsCount}</div>
            <div className="metric-footer">
              <span className="text-muted">Nhận kho chờ duyệt: {loading.receipts ? '--' : pendingReceiptsCount}</span>
            </div>
          </div>
        )}
      </div>

      {/* Analytics Charts Grid */}
      <div className="dashboard-grid analytics-grid">
        {(isAdmin || role === 'ke_toan_kho' || role === 'san_xuat' || role === 'kinh_doanh') && (
          <div className="analytics-panel glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ margin: 0 }}>Tồn Kho Theo Sản Phẩm</h2>
              <select
                value={stockChartType}
                onChange={(e) => setStockChartType(e.target.value as ChartType)}
                className="form-input"
                style={{ width: '120px', padding: '6px', fontSize: '0.85rem' }}
              >
                <option value="bar">Cột (Bar)</option>
                <option value="line">Đường (Line)</option>
                <option value="pie">Tròn (Pie)</option>
                <option value="doughnut">Bánh (Doughnut)</option>
              </select>
            </div>
            <div className="chart-container" style={{ position: 'relative', height: '260px', width: '100%' }}>
              <canvas ref={stockChartRef}></canvas>
            </div>
          </div>
        )}

        {(isAdmin || role === 'ke_toan_ban_hang') && (
          <div className="analytics-panel glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ margin: 0 }}>Trạng Thái Hóa Đơn</h2>
              <select
                value={invoiceChartType}
                onChange={(e) => setInvoiceChartType(e.target.value as ChartType)}
                className="form-input"
                style={{ width: '120px', padding: '6px', fontSize: '0.85rem' }}
              >
                <option value="pie">Tròn (Pie)</option>
                <option value="doughnut">Bánh (Doughnut)</option>
                <option value="bar">Cột (Bar)</option>
                <option value="line">Đường (Line)</option>
              </select>
            </div>
            <div className="chart-container" style={{ position: 'relative', height: '260px', width: '100%' }}>
              <canvas ref={invoiceChartRef}></canvas>
            </div>
          </div>
        )}

        {(isAdmin || role === 'ke_toan_kho') && (
          <div className="analytics-panel glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ margin: 0 }}>Mua Hàng & Nhập Kho</h2>
              <select
                value={purchaseChartType}
                onChange={(e) => setPurchaseChartType(e.target.value as ChartType)}
                className="form-input"
                style={{ width: '120px', padding: '6px', fontSize: '0.85rem' }}
              >
                <option value="bar">Cột (Bar)</option>
                <option value="line">Đường (Line)</option>
                <option value="pie">Tròn (Pie)</option>
                <option value="doughnut">Bánh (Doughnut)</option>
              </select>
            </div>
            <div className="chart-container" style={{ position: 'relative', height: '260px', width: '100%' }}>
              <canvas ref={purchaseChartRef}></canvas>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="analytics-panel glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ margin: 0 }}>Khách Hàng Theo Doanh Số</h2>
              <select
                value={salesChartType}
                onChange={(e) => setSalesChartType(e.target.value as ChartType)}
                className="form-input"
                style={{ width: '120px', padding: '6px', fontSize: '0.85rem' }}
              >
                <option value="bar">Cột (Bar)</option>
                <option value="line">Đường (Line)</option>
                <option value="pie">Tròn (Pie)</option>
                <option value="doughnut">Bánh (Doughnut)</option>
              </select>
            </div>
            <div className="chart-container" style={{ position: 'relative', height: '260px', width: '100%' }}>
              <canvas ref={salesChartRef}></canvas>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="analytics-panel glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ margin: 0 }}>Đơn Bán Hàng Theo Trạng Thái</h2>
              <select
                value={salesFlowChartType}
                onChange={(e) => setSalesFlowChartType(e.target.value as ChartType)}
                className="form-input"
                style={{ width: '120px', padding: '6px', fontSize: '0.85rem' }}
              >
                <option value="doughnut">Bánh (Doughnut)</option>
                <option value="pie">Tròn (Pie)</option>
                <option value="bar">Cột (Bar)</option>
                <option value="line">Đường (Line)</option>
              </select>
            </div>
            <div className="chart-container" style={{ position: 'relative', height: '260px', width: '100%' }}>
              <canvas ref={salesFlowChartRef}></canvas>
            </div>
          </div>
        )}
      </div>

      {/* Admin Quick Script Runner and Logging Terminal */}
      {isAdmin && (
        <div className="dashboard-grid">
          <div className="action-card glass-panel">
            <h2>Các Tác Vụ Đồng Bộ & Xử Lý Dữ Liệu</h2>
            <p className="text-muted">Chọn một tác vụ bên dưới để chạy script và kiểm tra quá trình xử lý thời gian thực.</p>

            <div className="actions-group">
              {scriptActions.map((group, gIdx) => (
                <React.Fragment key={gIdx}>
                  <h3>{group.category}</h3>
                  <div className="buttons-grid">
                    {group.items.map((item, iIdx) => (
                      <Button
                        key={iIdx}
                        variant={item.variant as any}
                        disabled={isRunningScript}
                        onClick={() => handleScriptRun(item.file)}
                      >
                        <span>{item.label}</span>
                      </Button>
                    ))}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="terminal-card glass-panel">
            <div className="terminal-header">
              <h3>Bảng Điều Khiển Terminal (Thời gian thực)</h3>
              <div className="terminal-actions">
                <Button size="sm" variant="secondary" onClick={copyTerminal} title="Sao chép Logs">
                  <Clipboard className="w-3.5 h-3.5 mr-1" /> Sao chép
                </Button>
                <Button size="sm" variant="secondary" onClick={clearTerminal} title="Xóa Logs">
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Xóa
                </Button>
              </div>
            </div>
            <div className="terminal-body" id="terminalOutput">
              {terminalLogs.map((log) => (
                <div key={log.id} className={`terminal-line ${log.type === 'error' ? 'error' : ''} ${log.type === 'system' ? 'system' : ''} ${log.type === 'success' ? 'success' : ''}`}>
                  [{log.time}] {log.text}
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Script Runner Dialog */}
      <Modal
        isOpen={confirmScript !== null}
        onClose={() => setConfirmScript(null)}
        title="Xác Nhận Hành Động"
      >
        <div className="dialog-content">
          <p>
            Bạn có chắc chắn muốn chạy tác vụ{' '}
            <strong>
              "{confirmScript ? scriptNamesMapping[confirmScript] || confirmScript : ''}"
            </strong>{' '}
            không?
            <br />
            <small className="text-muted">
              Tiến trình này sẽ thực thi script Node.js tương ứng trên server và trả về log trực tiếp.
            </small>
          </p>
          <div className="dialog-buttons" style={{ marginTop: '20px' }}>
            <Button variant="secondary" onClick={() => setConfirmScript(null)}>
              Hủy Bỏ
            </Button>
            <Button variant="primary" onClick={executeConfirmScript}>
              Tiếp Tục
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Dashboard;
