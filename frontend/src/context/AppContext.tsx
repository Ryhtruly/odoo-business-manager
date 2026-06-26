import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

// Intercept window.fetch to automatically append Authorization Bearer Token
const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
  const stored = localStorage.getItem('auth_session');
  if (stored) {
    try {
      const session = JSON.parse(stored);
      if (session && session.token) {
        const headers = new Headers(options.headers || {});
        headers.set('Authorization', `Bearer ${session.token}`);
        options.headers = headers;
      }
    } catch (e) {
      console.error('Error parsing auth_session', e);
    }
  }
  return originalFetch(url, options);
};

export const roleNames: Record<string, string> = {
  admin: 'Quản trị viên',
  ke_toan_kho: 'Kế toán kho',
  san_xuat: 'Sản xuất',
  kinh_doanh: 'Kinh doanh',
  ke_toan_ban_hang: 'Kế toán bán hàng'
};

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'danger';
}

export interface TerminalLine {
  id: string;
  time: string;
  text: string;
  type: 'info' | 'error' | 'system' | 'success';
}

interface AppContextType {
  session: any;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  odooConnected: boolean;
  gsheetConnected: boolean;
  toasts: Toast[];
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'danger') => void;
  removeToast: (id: string) => void;
  cache: {
    products: any[];
    stock: any[];
    invoices: any[];
    customers: any[];
    vendors: any[];
    pos: any[];
    receipts: any[];
    so: any[];
    productionHistory: any[];
  };
  loading: Record<string, boolean>;
  terminalLogs: TerminalLine[];
  isRunningScript: boolean;
  runScript: (scriptName: string) => void;
  clearTerminal: () => void;
  copyTerminal: () => void;
  login: (sessionData: { token: string; username: string; role: string; name: string }) => void;
  logout: () => void;
  checkSystemStatus: () => Promise<void>;
  fetchProducts: () => Promise<void>;
  fetchStock: () => Promise<void>;
  fetchInvoices: () => Promise<void>;
  fetchCustomers: () => Promise<void>;
  fetchVendors: () => Promise<void>;
  fetchPOs: () => Promise<void>;
  fetchReceipts: () => Promise<void>;
  fetchSO: () => Promise<void>;
  fetchProductionHistory: () => Promise<void>;
  removeVietnameseTones: (str: string) => string;
  generateSKUFromName: (name: string) => string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [odooConnected, setOdooConnected] = useState<boolean>(false);
  const [gsheetConnected, setGsheetConnected] = useState<boolean>(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [terminalLogs, setTerminalLogs] = useState<TerminalLine[]>([
    {
      id: 'init',
      time: new Date().toLocaleTimeString(),
      text: '[SYSTEM] Hệ thống sẵn sàng. Vui lòng chọn một tác vụ để thực hiện.',
      type: 'system'
    }
  ]);
  const [isRunningScript, setIsRunningScript] = useState<boolean>(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [cache, setCache] = useState<AppContextType['cache']>({
    products: [],
    stock: [],
    invoices: [],
    customers: [],
    vendors: [],
    pos: [],
    receipts: [],
    so: [],
    productionHistory: []
  });

  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // Initialize Session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('auth_session');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setSession(data);
      } catch (e) {
        localStorage.removeItem('auth_session');
      }
    }
  }, []);

  const login = (sessionData: { token: string; username: string; role: string; name: string }) => {
    localStorage.setItem('auth_session', JSON.stringify(sessionData));
    setSession(sessionData);
  };

  const logout = () => {
    localStorage.removeItem('auth_session');
    setSession(null);
    setActiveTab('dashboard');
  };

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);

    // Auto dismiss
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, [removeToast]);

  const checkSystemStatus = async () => {
    try {
      const response = await fetch('/api/odoo/status');
      const data = await response.json();
      setOdooConnected(!!data.odoo.connected);
      setGsheetConnected(!!data.gsheet.connected);
      showToast('Cập nhật trạng thái kết nối hoàn tất', 'success');
    } catch (e) {
      setOdooConnected(false);
      setGsheetConnected(false);
      showToast('Không thể kết nối đến máy chủ Express API', 'danger');
    }
  };

  // Fetch helpers
  const fetchProducts = async () => {
    setLoading(prev => ({ ...prev, products: true }));
    try {
      const res = await fetch('/api/odoo/products');
      if (res.ok) {
        const data = await res.json();
        setCache(prev => ({ ...prev, products: data }));
      }
    } catch (e) {
      showToast('Lỗi khi tải dữ liệu sản phẩm', 'danger');
    } finally {
      setLoading(prev => ({ ...prev, products: false }));
    }
  };

  const fetchStock = async () => {
    setLoading(prev => ({ ...prev, stock: true }));
    try {
      const res = await fetch('/api/odoo/stock');
      if (res.ok) {
        const data = await res.json();
        setCache(prev => ({ ...prev, stock: data }));
      }
    } catch (e) {
      showToast('Lỗi khi tải dữ liệu tồn kho', 'danger');
    } finally {
      setLoading(prev => ({ ...prev, stock: false }));
    }
  };

  const fetchInvoices = async () => {
    setLoading(prev => ({ ...prev, invoices: true }));
    try {
      const res = await fetch('/api/odoo/invoices');
      if (res.ok) {
        const data = await res.json();
        setCache(prev => ({ ...prev, invoices: data }));
      }
    } catch (e) {
      showToast('Lỗi khi tải dữ liệu hóa đơn', 'danger');
    } finally {
      setLoading(prev => ({ ...prev, invoices: false }));
    }
  };

  const fetchCustomers = async () => {
    setLoading(prev => ({ ...prev, customers: true }));
    try {
      const res = await fetch('/api/odoo/partners?type=customer');
      if (res.ok) {
        const data = await res.json();
        setCache(prev => ({ ...prev, customers: data }));
      }
    } catch (e) {
      showToast('Lỗi khi tải dữ liệu khách hàng', 'danger');
    } finally {
      setLoading(prev => ({ ...prev, customers: false }));
    }
  };

  const fetchVendors = async () => {
    setLoading(prev => ({ ...prev, vendors: true }));
    try {
      const res = await fetch('/api/odoo/partners?type=vendor');
      if (res.ok) {
        const data = await res.json();
        setCache(prev => ({ ...prev, vendors: data }));
      }
    } catch (e) {
      showToast('Lỗi khi tải dữ liệu nhà cung cấp', 'danger');
    } finally {
      setLoading(prev => ({ ...prev, vendors: false }));
    }
  };

  const fetchPOs = async () => {
    setLoading(prev => ({ ...prev, pos: true }));
    try {
      const res = await fetch('/api/odoo/po');
      if (res.ok) {
        const data = await res.json();
        setCache(prev => ({ ...prev, pos: data }));
      }
    } catch (e) {
      showToast('Lỗi khi tải đơn mua hàng', 'danger');
    } finally {
      setLoading(prev => ({ ...prev, pos: false }));
    }
  };

  const fetchReceipts = async () => {
    setLoading(prev => ({ ...prev, receipts: true }));
    try {
      const res = await fetch('/api/odoo/receipts');
      if (res.ok) {
        const data = await res.json();
        setCache(prev => ({ ...prev, receipts: data }));
      }
    } catch (e) {
      showToast('Lỗi khi tải phiếu nhận kho', 'danger');
    } finally {
      setLoading(prev => ({ ...prev, receipts: false }));
    }
  };

  const fetchSO = async () => {
    setLoading(prev => ({ ...prev, so: true }));
    try {
      const res = await fetch('/api/odoo/so');
      if (res.ok) {
        const data = await res.json();
        setCache(prev => ({ ...prev, so: data }));
      }
    } catch (e) {
      showToast('Lỗi khi tải đơn bán hàng', 'danger');
    } finally {
      setLoading(prev => ({ ...prev, so: false }));
    }
  };

  const fetchProductionHistory = async () => {
    setLoading(prev => ({ ...prev, productionHistory: true }));
    try {
      const res = await fetch('/api/odoo/production-log');
      if (res.ok) {
        const data = await res.json();
        setCache(prev => ({ ...prev, productionHistory: data }));
      }
    } catch (e) {
      showToast('Lỗi khi tải lịch sử sản xuất', 'danger');
    } finally {
      setLoading(prev => ({ ...prev, productionHistory: false }));
    }
  };

  // Helper utility functions
  const removeVietnameseTones = (str: string): string => {
    if (!str) return '';
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|B|Ĩ/g, "I"); // keep exactly as original app.js typo fallback
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    str = str.replace(/\u0300|\u0301|\u0309|\u0303|\u0323/g, "");
    str = str.replace(/\u02C6|\u0306|\u031B/g, "");
    return str;
  };

  const generateSKUFromName = (name: string): string => {
    if (!name) return '';
    const cleanName = removeVietnameseTones(name).toUpperCase();
    const words = cleanName.split(/\s+/).filter(w => w.length > 0);
    const code = words.map(w => {
      if (/[0-9]/.test(w)) return w;
      return w.charAt(0);
    }).join('');
    return code.replace(/[^A-Z0-9]/g, '');
  };

  // SSE Stream runner
  const appendTerminalLine = useCallback((text: string, isError = false, isSystem = false) => {
    const time = new Date().toLocaleTimeString();
    const id = Math.random().toString(36).substring(2, 9);
    let type: TerminalLine['type'] = 'info';
    if (isError) type = 'error';
    else if (isSystem) type = 'system';
    else if (text.includes('✅') || text.includes('success') || text.includes('OK') || text.includes('SYNC SUCCESSFUL') || text.includes('exited with code 0')) {
      type = 'success';
    }

    setTerminalLogs(prev => [...prev, { id, time, text, type }]);
  }, []);

  const runScript = (scriptName: string) => {
    if (isRunningScript) {
      showToast('Có tiến trình đang chạy. Vui lòng đợi kết thúc.', 'warning');
      return;
    }

    setIsRunningScript(true);
    appendTerminalLine(`Bắt đầu chạy tiến trình "${scriptName}"`, false, true);

    const sseUrl = `/api/run-script/stream?script=${encodeURIComponent(scriptName)}&access_token=${encodeURIComponent(session?.token || '')}`;
    const source = new EventSource(sseUrl);
    eventSourceRef.current = source;

    source.onmessage = (event) => {
      let data = event.data;
      let isErr = false;
      let isSys = false;

      if (data.startsWith('[STDERR]')) {
        data = data.replace('[STDERR]', '').trim();
        isErr = true;
      }
      if (data.startsWith('[SYSTEM ERROR]')) {
        isErr = true;
        isSys = true;
      }
      if (data.startsWith('[SYSTEM]')) {
        isSys = true;
      }

      appendTerminalLine(data, isErr, isSys);

      if (data.includes('Process exited with code')) {
        source.close();
        cleanupScriptRun();
      }
    };

    source.onerror = () => {
      appendTerminalLine('Mất kết nối SSE tới máy chủ.', true, true);
      source.close();
      cleanupScriptRun();
    };
  };

  const cleanupScriptRun = () => {
    setIsRunningScript(false);
    eventSourceRef.current = null;
    showToast('Tiến trình thực hiện kết thúc. Hãy kiểm tra logs.', 'info');
    // Reload dashboard metrics
    fetchProducts();
    fetchStock();
    fetchInvoices();
    fetchPOs();
    fetchReceipts();
    fetchSO();
  };

  const clearTerminal = () => {
    setTerminalLogs([
      {
        id: 'clear',
        time: new Date().toLocaleTimeString(),
        text: '[SYSTEM] Bảng console logs đã được xóa sạch.',
        type: 'system'
      }
    ]);
  };

  const copyTerminal = () => {
    const text = terminalLogs.map(l => `[${l.time}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(text)
      .then(() => showToast('Đã sao chép toàn bộ logs vào Clipboard', 'success'))
      .catch(() => showToast('Không thể sao chép logs', 'danger'));
  };

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        session,
        activeTab,
        setActiveTab,
        odooConnected,
        gsheetConnected,
        toasts,
        showToast,
        removeToast,
        cache,
        loading,
        terminalLogs,
        isRunningScript,
        runScript,
        clearTerminal,
        copyTerminal,
        login,
        logout,
        checkSystemStatus,
        fetchProducts,
        fetchStock,
        fetchInvoices,
        fetchCustomers,
        fetchVendors,
        fetchPOs,
        fetchReceipts,
        fetchSO,
        fetchProductionHistory,
        removeVietnameseTones,
        generateSKUFromName
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
