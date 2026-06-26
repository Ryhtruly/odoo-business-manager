// client/src/views/Dashboard.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Clipboard, Trash2 } from 'lucide-react';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Chart from 'chart.js/auto';

// ===== CONSTANTS =====
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

// ===== AnalyticsChart Component =====
interface AnalyticsChartProps {
  type: ChartType;
  labels: string[];
  data: number[];
  datasetLabel?: string;
  showDataLabels?: boolean;
}

const AnalyticsChart: React.FC<AnalyticsChartProps> = ({
  type,
  labels,
  data,
  datasetLabel = 'Số lượng',
  showDataLabels = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // ✅ Destroy chart cũ trên cùng canvas TRƯỚC
    const existingChart = Chart.getChart(canvasRef.current);
    if (existingChart) {
      existingChart.destroy();
    }

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const isBarOrLine = type === 'bar' || type === 'line';
    const total = data.reduce((acc, val) => acc + Number(val), 0);

    const config: any = {
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
        animation: {
          duration: 400
        },
        plugins: {
          legend: {
            display: !isBarOrLine,
            position: 'right',
            labels: { boxWidth: 12, font: { size: 10 } }
          },
          tooltip: {
            enabled: true
          }
        },
        scales: isBarOrLine ? {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (value: any) {
                if (typeof value === 'number' && value >= 1000) {
                  return (value / 1000).toFixed(1) + 'k';
                }
                return value;
              }
            }
          }
        } : {
          x: { display: false },
          y: { display: false }
        }
      }
    };

    chartInstanceRef.current = new Chart(ctx, config);

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [type, labels, data, datasetLabel, showDataLabels]);

  return <canvas ref={canvasRef}></canvas>;
};

// ===== MetricCard Component =====
interface MetricCardProps {
  id: string;
  title: string;
  icon: string;
  value: number;
  loading: boolean;
  footer: React.ReactNode;
}

const MetricCard: React.FC<MetricCardProps> = ({ id, title, icon, value, loading, footer }) => (
  <div className="metric-card glass-panel" id={id}>
    <div className="metric-header">
      <span className="text-muted">{title}</span>
      <span className="metric-icon">{icon}</span>
    </div>
    <div className="metric-value">{loading ? '--' : value}</div>
    <div className="metric-footer">{footer}</div>
  </div>
);

// ===== ChartPanel Component =====
interface ChartPanelProps {
  title: string;
  chartType: ChartType;
  onChartTypeChange: (type: ChartType) => void;
  children: React.ReactNode;
}

const ChartPanel: React.FC<ChartPanelProps> = ({ title, chartType, onChartTypeChange, children }) => (
  <div className="analytics-panel glass-panel">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      <select
        value={chartType}
        onChange={(e) => onChartTypeChange(e.target.value as ChartType)}
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
      {children}
    </div>
  </div>
);

// ===== TerminalView Component =====
interface TerminalViewProps {
  logs: Array<{ id: string | number; time: string; text: string; type?: string }>;
  onCopy: () => void;
  onClear: () => void;
  endRef: React.RefObject<HTMLDivElement | null>;
}

const TerminalView: React.FC<TerminalViewProps> = ({ logs, onCopy, onClear, endRef }) => {
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, endRef]);

  return (
    <div className="terminal-card glass-panel">
      <div className="terminal-header">
        <h3>Bảng Điều Khiển Terminal (Thời gian thực)</h3>
        <div className="terminal-actions">
          <Button size="sm" variant="secondary" onClick={onCopy} title="Sao chép Logs">
            <Clipboard className="w-3.5 h-3.5 mr-1" /> Sao chép
          </Button>
          <Button size="sm" variant="secondary" onClick={onClear} title="Xóa Logs">
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Xóa
          </Button>
        </div>
      </div>
      <div className="terminal-body" id="terminalOutput">
        {logs.map((log) => (
          <div
            key={log.id}
            className={`terminal-line ${log.type === 'error' ? 'error' :
                log.type === 'system' ? 'system' :
                  log.type === 'success' ? 'success' : ''
              }`}
          >
            [{log.time}] {log.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};

// ===== Main Dashboard Component =====
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

  const role = session?.role || '';
  const isAdmin = role === 'admin';

  const canView = (allowedRoles: string[]): boolean => {
    return isAdmin || allowedRoles.includes(role);
  };

  // Load data on mount
  useEffect(() => {
    if (!role) return;

    const tasks: Promise<any>[] = [];

    if (canView(['ke_toan_kho', 'san_xuat', 'kinh_doanh']) && cache.products.length === 0) {
      tasks.push(fetchProducts());
    }
    if (canView(['ke_toan_kho', 'san_xuat', 'kinh_doanh']) && cache.stock.length === 0) {
      tasks.push(fetchStock());
    }
    if (canView(['ke_toan_ban_hang']) && cache.invoices.length === 0) {
      tasks.push(fetchInvoices());
    }
    if (canView(['ke_toan_kho']) && cache.pos.length === 0) {
      tasks.push(fetchPOs());
    }
    if (canView(['ke_toan_kho']) && cache.receipts.length === 0) {
      tasks.push(fetchReceipts());
    }
    if (canView(['kinh_doanh']) && cache.so.length === 0) {
      tasks.push(fetchSO());
    }

    Promise.allSettled(tasks).catch(err => {
      console.error('Dashboard fetch error:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // Metrics với useMemo
  const metrics = React.useMemo(() => {
    const internalStock = cache.stock.filter(s => s.usage === 'internal');
    const stockLocations = new Set(internalStock.map(s => s.location));
    const totalStockQty = internalStock.reduce((acc, curr) => acc + (curr.quantity || 0), 0);

    const activeInvoices = cache.invoices.filter(i => i.state !== 'cancel');
    const totalInvoicesCount = activeInvoices.length;
    const unpaidInvoicesCount = cache.invoices.filter(
      i => i.state === 'posted' && i.payment_state !== 'paid' && i.payment_state !== 'in_payment'
    ).length;

    const totalPOsCount = cache.pos.filter(
      po => po.state === 'purchase' || po.state === 'done'
    ).length;
    const pendingReceiptsCount = cache.receipts.filter(r => r.state === 'assigned').length;

    return {
      totalProductsCount: cache.products.length,
      totalLocationsCount: stockLocations.size,
      totalStockQty,
      totalInvoicesCount,
      unpaidInvoicesCount,
      totalPOsCount,
      pendingReceiptsCount
    };
  }, [cache.products, cache.stock, cache.invoices, cache.pos, cache.receipts]);

  // Chart data với useMemo
  const stockChartData = React.useMemo(() => {
    const stockByProd: Record<string, number> = {};
    cache.stock.forEach(s => {
      if (s.usage === 'internal' && s.quantity > 0 && s.product_name) {
        stockByProd[s.product_name] = (stockByProd[s.product_name] || 0) + s.quantity;
      }
    });
    return Object.entries(stockByProd)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [cache.stock]);

  const invoiceChartData = React.useMemo(() => {
    const activeInvoices = cache.invoices.filter(i => i.state !== 'cancel');
    return {
      labels: ['Đã thanh toán', 'Chưa thanh toán', 'Đang thanh toán', 'Bản nháp'],
      values: [
        activeInvoices.filter(i => i.state === 'posted' && i.payment_state === 'paid').length,
        activeInvoices.filter(i => i.state === 'posted' && (!i.payment_state || i.payment_state === 'not_paid')).length,
        activeInvoices.filter(i => i.state === 'posted' && (i.payment_state === 'partial' || i.payment_state === 'in_payment')).length,
        activeInvoices.filter(i => i.state === 'draft').length
      ]
    };
  }, [cache.invoices]);

  const purchaseChartData = React.useMemo(() => ({
    labels: ['Đơn mua hàng', 'Đang chờ nhập', 'Đã nhận kho'],
    values: [
      cache.pos.filter(po => po.state === 'purchase' || po.state === 'done').length,
      cache.receipts.filter(r => r.state === 'assigned').length,
      cache.receipts.filter(r => r.state === 'done').length
    ]
  }), [cache.pos, cache.receipts]);

  const salesChartData = React.useMemo(() => {
    const salesByCustomer: Record<string, number> = {};
    cache.so.forEach(so => {
      if ((so.state === 'sale' || so.state === 'done') && so.amount_total > 0 && so.partner) {
        salesByCustomer[so.partner] = (salesByCustomer[so.partner] || 0) + so.amount_total;
      }
    });
    return Object.entries(salesByCustomer)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [cache.so]);

  const salesFlowChartData = React.useMemo(() => ({
    labels: ['Đã chốt', 'Báo giá (Draft/Sent)', 'Đã hủy'],
    values: [
      cache.so.filter(so => so.state === 'sale' || so.state === 'done').length,
      cache.so.filter(so => so.state === 'draft' || so.state === 'sent').length,
      cache.so.filter(so => so.state === 'cancel').length
    ]
  }), [cache.so]);

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
        {canView(['ke_toan_kho', 'san_xuat', 'kinh_doanh']) && (
          <MetricCard
            id="metricProducts"
            title="Tổng Sản Phẩm"
            icon="🛒"
            value={metrics.totalProductsCount}
            loading={loading.products}
            footer={<span className="text-success">↑ Cập nhật tự động</span>}
          />
        )}

        {canView(['ke_toan_kho', 'san_xuat', 'kinh_doanh']) && (
          <MetricCard
            id="metricStock"
            title="Vị Trí Tồn Kho"
            icon="📦"
            value={metrics.totalLocationsCount}
            loading={loading.stock}
            footer={
              <span className="text-muted">
                Tổng số lượng: {loading.stock ? '--' : metrics.totalStockQty.toLocaleString()}
              </span>
            }
          />
        )}

        {canView(['ke_toan_ban_hang']) && (
          <MetricCard
            id="metricInvoices"
            title="Tổng Hóa Đơn"
            icon="💸"
            value={metrics.totalInvoicesCount}
            loading={loading.invoices}
            footer={
              <span className="text-warning">
                Chưa thanh toán: {loading.invoices ? '--' : metrics.unpaidInvoicesCount}
              </span>
            }
          />
        )}

        {canView(['ke_toan_kho']) && (
          <MetricCard
            id="metricOrders"
            title="Đơn Mua Hàng"
            icon="📋"
            value={metrics.totalPOsCount}
            loading={loading.pos}
            footer={
              <span className="text-muted">
                Nhận kho chờ duyệt: {loading.receipts ? '--' : metrics.pendingReceiptsCount}
              </span>
            }
          />
        )}
      </div>

      {/* Analytics Charts Grid - KHÔNG có ErrorBoundary */}
      <div className="dashboard-grid analytics-grid">
        {canView(['ke_toan_kho', 'san_xuat', 'kinh_doanh']) && (
          <ChartPanel
            title="Tồn Kho Theo Sản Phẩm"
            chartType={stockChartType}
            onChartTypeChange={setStockChartType}
          >
            <AnalyticsChart
              type={stockChartType}
              labels={stockChartData.map(d => d.label)}
              data={stockChartData.map(d => d.value)}
            />
          </ChartPanel>
        )}

        {canView(['ke_toan_ban_hang']) && (
          <ChartPanel
            title="Trạng Thái Hóa Đơn"
            chartType={invoiceChartType}
            onChartTypeChange={setInvoiceChartType}
          >
            <AnalyticsChart
              type={invoiceChartType}
              labels={invoiceChartData.labels}
              data={invoiceChartData.values}
              showDataLabels
            />
          </ChartPanel>
        )}

        {canView(['ke_toan_kho']) && (
          <ChartPanel
            title="Mua Hàng & Nhập Kho"
            chartType={purchaseChartType}
            onChartTypeChange={setPurchaseChartType}
          >
            <AnalyticsChart
              type={purchaseChartType}
              labels={purchaseChartData.labels}
              data={purchaseChartData.values}
            />
          </ChartPanel>
        )}

        {isAdmin && (
          <ChartPanel
            title="Khách Hàng Theo Doanh Số"
            chartType={salesChartType}
            onChartTypeChange={setSalesChartType}
          >
            <AnalyticsChart
              type={salesChartType}
              labels={salesChartData.map(d => d.label)}
              data={salesChartData.map(d => d.value)}
              datasetLabel="Giá trị (đ)"
            />
          </ChartPanel>
        )}

        {isAdmin && (
          <ChartPanel
            title="Đơn Bán Hàng Theo Trạng Thái"
            chartType={salesFlowChartType}
            onChartTypeChange={setSalesFlowChartType}
          >
            <AnalyticsChart
              type={salesFlowChartType}
              labels={salesFlowChartData.labels}
              data={salesFlowChartData.values}
              showDataLabels
            />
          </ChartPanel>
        )}
      </div>

      {/* Admin Quick Script Runner and Logging Terminal */}
      {isAdmin && (
        <div className="dashboard-grid">
          <div className="action-card glass-panel">
            <h2>Các Tác Vụ Đồng Bộ & Xử Lý Dữ Liệu</h2>
            <p className="text-muted">
              Chọn một tác vụ bên dưới để chạy script và kiểm tra quá trình xử lý thời gian thực.
            </p>

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

          <TerminalView
            logs={terminalLogs}
            onCopy={copyTerminal}
            onClear={clearTerminal}
            endRef={terminalEndRef}
          />
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
