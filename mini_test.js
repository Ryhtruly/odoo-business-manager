// public/js/app.js

// Intercept API fetch calls to inject the signed session token
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
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

document.addEventListener('DOMContentLoaded', () => {
  const initDateInputs = () => {
    const poDateInput = document.getElementById('poDate');
    if (poDateInput) {
      const now = new Date();
      const nowString = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,16);
      poDateInput.value = nowString;
      poDateInput.max = nowString;
    }
  };
  initDateInputs();

  // --- UI Elements ---
  const appContainer = document.getElementById('appContainer');
  const themeCheckbox = document.getElementById('themeCheckbox');
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const pageTitle = document.getElementById('pageTitle');
  const pageDescription = document.getElementById('pageDescription');
  
  // Badges
  const odooStatusBadge = document.getElementById('odooStatusBadge');
  const gsheetStatusBadge = document.getElementById('gsheetStatusBadge');
  const btnRefreshStatus = document.getElementById('btnRefreshStatus');
  
  // Dashboard Metrics
  const valTotalProducts = document.getElementById('valTotalProducts');
  const valTotalLocations = document.getElementById('valTotalLocations');
  const valTotalStockQty = document.getElementById('valTotalStockQty');
  const valTotalInvoices = document.getElementById('valTotalInvoices');
  const valResidualInvoices = document.getElementById('valResidualInvoices');
  const valTotalPOs = document.getElementById('valTotalPOs');
  const valPendingReceipts = document.getElementById('valPendingReceipts');
  
  // Terminals
  const terminalOutput = document.getElementById('terminalOutput');
  const terminalOutputFull = document.getElementById('terminalOutputFull');
  const btnCopyTerminal = document.getElementById('btnCopyTerminal');
  const btnClearTerminal = document.getElementById('btnClearTerminal');
  const btnCopyTerminalFull = document.getElementById('btnCopyTerminalFull');
  const btnClearTerminalFull = document.getElementById('btnClearTerminalFull');
  
  // Settings Form
  const formSettings = document.getElementById('formSettings');
  const odooUrlInput = document.getElementById('odooUrl');
  const odooDbInput = document.getElementById('odooDb');
  const odooLoginInput = document.getElementById('odooLogin');
  const odooPasswordInput = document.getElementById('odooPassword');
  const sheetIdInput = document.getElementById('sheetId');
  const credsContentInput = document.getElementById('credsContent');
  const btnResetSettings = document.getElementById('btnResetSettings');
  
  // Modal Dialog
  const confirmDialog = document.getElementById('confirmDialog');
  const btnCancelDialog = document.getElementById('btnCancelDialog');
  const btnConfirmDialog = document.getElementById('btnConfirmDialog');
  const dialogMessage = document.getElementById('dialogMessage');
  
  // Search Inputs
  const searchProducts = document.getElementById('searchProducts');
  const searchStock = document.getElementById('searchStock');
  const searchInvoices = document.getElementById('searchInvoices');
  
  // Refresh Buttons
  const btnRefreshProducts = document.getElementById('btnRefreshProducts');
  const btnRefreshStock = document.getElementById('btnRefreshStock');
  const btnRefreshInvoices = document.getElementById('btnRefreshInvoices');
  const btnRefreshPOs = document.getElementById('btnRefreshPOs');
  const btnRefreshReceipts = document.getElementById('btnRefreshReceipts');

  // Tables
  const tbodyProducts = document.getElementById('tbodyProducts');
  const tbodyStock = document.getElementById('tbodyStock');
  const tbodyInvoices = document.getElementById('tbodyInvoices');
  const tbodyPOs = document.getElementById('tbodyPOs');
  const tbodyReceipts = document.getElementById('tbodyReceipts');

  // Product CRUD elements
  const btnCreateProduct = document.getElementById('btnCreateProduct');
  const productDialog = document.getElementById('productDialog');
  const formProduct = document.getElementById('formProduct');
  const productDialogTitle = document.getElementById('productDialogTitle');
  const prodIdInput = document.getElementById('prodId');
  const prodNameInput = document.getElementById('prodName');
  const prodCodeInput = document.getElementById('prodCode');
  const prodTypeInput = document.getElementById('prodType');
  const prodPriceInput = document.getElementById('prodPrice');
  const prodCostInput = document.getElementById('prodCost');
  const prodDescInput = document.getElementById('prodDesc');
  const btnCancelProduct = document.getElementById('btnCancelProduct');

  // --- State Variables ---
  let isRunningScript = false;
  let activeEventSource = null;
  let targetScriptToRun = null;
  let cache = {
    products: [],
    tempProducts: [],
    stock: [],
    invoices: []
  };

  // --- Authentication & Role Settings ---
  const loginOverlay = document.getElementById('loginOverlay');
  const formLogin = document.getElementById('formLogin');
  const loginUsername = document.getElementById('loginUsername');
  const loginPassword = document.getElementById('loginPassword');
  const loginErrorMsg = document.getElementById('loginErrorMsg');
  const sidebarUserProfile = document.getElementById('sidebarUserProfile');
  const userNameLabel = document.getElementById('userNameLabel');
  const userRoleLabel = document.getElementById('userRoleLabel');
  const userAvatar = document.getElementById('userAvatar');
  const btnLogout = document.getElementById('btnLogout');

  // Register Elements
  const btnShowRegister = document.getElementById('btnShowRegister');
  const registerDialog = document.getElementById('registerDialog');
  const formRegister = document.getElementById('formRegister');
  const btnCancelRegister = document.getElementById('btnCancelRegister');
  const regErrorMsg = document.getElementById('regErrorMsg');

  // Change Password Elements
  const btnShowChangePassword = document.getElementById('btnShowChangePassword');
  const changePasswordDialog = document.getElementById('changePasswordDialog');
  const formChangePassword = document.getElementById('formChangePassword');
  const btnCancelChangePassword = document.getElementById('btnCancelChangePassword');
  const cpwErrorMsg = document.getElementById('cpwErrorMsg');

  // Admin User Management
  const adminUserManagement = document.getElementById('adminUserManagement');
  const tbodyUsers = document.getElementById('tbodyUsers');
  const btnRefreshUsers = document.getElementById('btnRefreshUsers');

  // Role names mapping for Vietnamese labels
  const roleNames = {
    admin: 'Quản trị viên',
    ke_toan_kho: 'Kế toán kho',
    san_xuat: 'Sản xuất',
    kinh_doanh: 'Kinh doanh',
    ke_toan_ban_hang: 'Kế toán bán hàng'
  };

  function getCurrentRole() {
    try {
      const stored = localStorage.getItem('auth_session');
      if (stored) {
        const session = JSON.parse(stored);
        return session.role || '';
      }
    } catch(e){}
    return '';
  }

  function getAuthToken() {
    try {
      const stored = localStorage.getItem('auth_session');
      if (stored) {
        const session = JSON.parse(stored);
        return session.token || '';
      }
    } catch(e){}
    return '';
  }

  function canManageProducts() {
    const role = getCurrentRole();
    return role === 'ke_toan_kho';
  }

  function normalizeProductTypeForOdoo(type) {
    if (['raw_material', 'manufactured', 'trading', 'service', 'combo'].includes(type)) return type;
    return type === 'product' ? 'consu' : (type || 'consu');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  let dashboardChartsData = {};
  let dashboardChartInstances = {};

  function renderDashboardChart(containerId, items) {
    dashboardChartsData[containerId] = items;
    
    const canvas = document.getElementById(containerId);
    if (!canvas) return;

    const sortSelect = document.querySelector(`.chart-sort[data-chart="${containerId}"]`);
    const typeSelect = document.querySelector(`.chart-type[data-chart="${containerId}"]`);
    
    let sortType = sortSelect ? sortSelect.value : 'desc';
    let chartType = typeSelect ? typeSelect.value : 'bar';

    let displayItems = [...items];
    if (sortType === 'desc') {
      displayItems.sort((a, b) => b.value - a.value);
    } else if (sortType === 'asc') {
      displayItems.sort((a, b) => a.value - b.value);
    } else if (sortType === 'az') {
      displayItems.sort((a, b) => a.label.localeCompare(b.label));
    }
    
    // limit to top 10 to avoid overcrowding
    if (displayItems.length > 10) {
      displayItems = displayItems.slice(0, 10);
    }

    const labels = displayItems.map(item => item.label);
    const data = displayItems.map(item => item.value);
    
    const bgColors = [
      'rgba(99, 102, 241, 0.7)', 'rgba(56, 189, 248, 0.7)', 'rgba(16, 185, 129, 0.7)',
      'rgba(245, 158, 11, 0.7)', 'rgba(239, 68, 68, 0.7)', 'rgba(139, 92, 246, 0.7)',
      'rgba(236, 72, 153, 0.7)', 'rgba(20, 184, 166, 0.7)', 'rgba(249, 115, 22, 0.7)',
      'rgba(100, 116, 139, 0.7)'
    ];

    if (dashboardChartInstances[containerId]) {
      dashboardChartInstances[containerId].destroy();
    }

    const ctx = canvas.getContext('2d');
    
    // Register ChartDataLabels plugin if available
    if (typeof ChartDataLabels !== 'undefined') {
      Chart.register(ChartDataLabels);
    }

    dashboardChartInstances[containerId] = new Chart(ctx, {
      type: chartType,
      data: {
        labels: labels,
        datasets: [{
          label: 'Giá trị',
          data: data,
          backgroundColor: bgColors.slice(0, data.length),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: chartType !== 'bar',
            position: 'right',
            labels: { boxWidth: 12, font: { size: 10 } }
          },
          datalabels: {
            display: chartType !== 'bar',
            color: '#fff',
            font: { weight: 'bold', size: 11 },
            formatter: (value, context) => {
              const dataset = context.chart.data.datasets[0];
              const total = dataset.data.reduce((acc, curr) => acc + Number(curr), 0);
              if (total === 0) return '0%';
              const percentage = ((value / total) * 100).toFixed(1);
              return percentage > 3 ? percentage + '%' : '';
            }
          }
        },
        scales: chartType === 'bar' ? { y: { beginAtZero: true } } : { x: {display: false}, y: {display: false} }
      }
    });
  }

  // Bind change events to chart controls
  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('chart-sort') || e.target.classList.contains('chart-type')) {
      const containerId = e.target.getAttribute('data-chart');
      if (dashboardChartsData[containerId]) {
        renderDashboardChart(containerId, dashboardChartsData[containerId]);
      }
    }
  });

  function checkSession() {
    const stored = localStorage.getItem('auth_session');
    if (stored) {
      try {
        const session = JSON.parse(stored);
        if (session && session.role && session.username) {
          loginOverlay.style.display = 'none';
          sidebarUserProfile.style.display = 'flex';
          userNameLabel.textContent = session.name;
          userRoleLabel.textContent = roleNames[session.role] || session.role;
          userAvatar.textContent = session.name ? session.name.charAt(0).toUpperCase() : 'U';
          
          applyRolePermissions(session.role);
          return;
        }
      } catch (e) {
        console.error('Session parse failed', e);
      }
    }
    loginOverlay.style.display = 'flex';
    sidebarUserProfile.style.display = 'none';
  }

  const roleTabMap = {
    admin: ['dashboard', 'products', 'customers', 'stock', 'orders', 'production', 'sales', 'invoices', 'terminal', 'settings'],
    ke_toan_kho: ['dashboard', 'products', 'stock', 'orders'],
    san_xuat: ['dashboard', 'production', 'stock'],
    kinh_doanh: ['dashboard', 'sales', 'customers', 'stock'],
    ke_toan_ban_hang: ['dashboard', 'invoices', 'customers']
  };

  function applyRolePermissions(role) {
    const allowedTabs = roleTabMap[role] || ['dashboard'];
    
    // Hide/show sidebar items based on allowed tabs
    navItems.forEach(item => {
      const tabName = item.getAttribute('data-tab');
      if (allowedTabs.includes(tabName)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
    
    // If current active tab is not allowed, switch to Dashboard
    const activeTabItem = document.querySelector('.nav-item.active');
    const currentTabName = activeTabItem ? activeTabItem.getAttribute('data-tab') : '';
    if (!allowedTabs.includes(currentTabName)) {
      const btnDashboard = document.getElementById('btnTabDashboard');
      if (btnDashboard) {
        btnDashboard.click();
      }
    }

    // Hide or show dashboard cards based on role
    const metricProducts = document.getElementById('metricProducts');
    const metricStock = document.getElementById('metricStock');
    const metricInvoices = document.getElementById('metricInvoices');
    const metricOrders = document.getElementById('metricOrders');

    if (adminUserManagement) {
      adminUserManagement.style.display = (role === 'admin') ? 'block' : 'none';
      if (role === 'admin') {
        fetchAdminUsers();
      }
    }

    if (metricProducts) metricProducts.style.display = (role === 'admin' || role === 'ke_toan_kho' || role === 'san_xuat' || role === 'kinh_doanh') ? 'flex' : 'none';
    if (metricStock) metricStock.style.display = (role === 'admin' || role === 'ke_toan_kho' || role === 'san_xuat' || role === 'kinh_doanh') ? 'flex' : 'none';
    if (metricInvoices) metricInvoices.style.display = (role === 'admin' || role === 'ke_toan_ban_hang') ? 'flex' : 'none';
    if (metricOrders) metricOrders.style.display = (role === 'admin' || role === 'ke_toan_kho') ? 'flex' : 'none';

    // Restrict sync scripts or console cards on dashboard if not allowed (only admin)
    const actionCards = document.querySelectorAll('.action-card');
    actionCards.forEach(card => {
      card.style.display = (role === 'admin') ? 'block' : 'none';
    });

    const terminalCards = document.querySelectorAll('.terminal-card');
    terminalCards.forEach(card => {
      card.style.display = (role === 'admin') ? 'block' : 'none';
    });

    const btnCreateProduct = document.getElementById('btnCreateProduct');
    if (btnCreateProduct) {
      btnCreateProduct.style.display = (role === 'admin' || role === 'ke_toan_kho') ? 'inline-flex' : 'none';
    }

    ['btnCreateProductPO', 'btnCreateProductProd', 'btnCreateProductSales'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.style.display = canManageProducts() ? 'flex' : 'none';
    });
  }

  // Handle Login Submit
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginErrorMsg.style.display = 'none';
      
      const username = loginUsername.value;
      const password .token) {
          localStorage.setItem('auth_session', JSON.stringify({ ...data.user, token: data.token }));
          loginPassword.value = '';
          showToast(`Đăng nhập thành công: ${data.user.name}`, 'success');
          
          checkSession();
          checkSystemStatus();
          fetchSummaryMetrics();
        } else {
          loginErrorMsg.style.display = 'block';
          loginErrorMsg.textContent = data.error || 'Mật khẩu truy cập không chính xác.';
        }
      } catch (err) {
        loginErrorMsg.style.display = 'block';
        loginErrorMsg.textContent = 'Lỗi kết nối máy chủ.';
        showToast('Không thể kết nối đến máy chủ', 'danger');
      }
    });
  }

  // Handle Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('auth_session');
      showToast('Đã đăng xuất tài khoản', 'info');
      window.location.reload();
    });
  }

  // --- Registration Logic ---
  if (btnShowRegister && registerDialog) {
    btnShowRegister.addEventListener('click', () => {
      formRegister.reset();
      regErrorMsg.style.display = 'none';
      registerDialog.showModal();
    });

    btnCancelRegister.addEventListener('click', () => {
      registerDialog.close();
    });

    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      regErrorMsg.style.display = 'none';
      
      const username = document.getElementById('regUsername').value;
      const name = document.getElementById('regName').value;
      const role = document.getElementById('regRole').value;
      const password = document.getElementById('regPassword').value;
      
      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, name, role, password })
        });
        const data = await response.json();
        
        if (data.success) {
          registerDialog.close();
          showToast(data.message, 'success');
        } else {
          regErrorMsg.style.display = 'block';
          regErrorMsg.textContent = data.error || 'Đăng ký thất bại.';
        }
      } catch (err) {
        regErrorMsg.style.display = 'block';
        regErrorMsg.textContent = 'Lỗi kết nối máy chủ.';
      }
    });
  }

  // --- Change Password Logic ---
  if (btnShowChangePassword && changePasswordDialog) {
    btnShowChangePassword.addEventListener('click', () => {
      formChangePassword.reset();
      cpwErrorMsg.style.display = 'none';
      changePasswordDialog.showModal();
    });

    btnCancelChangePassword.addEventListener('click', () => {
      changePasswordDialog.close();
    });

    formChangePassword.addEventListener('submit', async (e) => {
      e.preventDefault();
      cpwErrorMsg.style.display = 'none';
      
      const session = JSON.parse(localStorage.getItem('auth_session'));
      if (!session) return;

      const oldPassword = document.getElementById('cpwOldPassword').value;
      const newPassword = document.getElementById('cpwNewPassword').value;
      
      try {
        const response = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPassword, newPassword })
        });
        const data = await response.json();
        
        if (data.success) {
          changePasswordDialog.close();
          showToast(data.message, 'success');
        } else {
          cpwErrorMsg.style.display = 'block';
          cpwErrorMsg.textContent = data.error || 'Đổi mật khẩu thất bại.';
        }
      } catch (err) {
        cpwErrorMsg.style.display = 'block';
        cpwErrorMsg.textContent = 'Lỗi kết nối máy chủ.';
      }
    });
  }

  // --- Admin User Management Logic ---
  async function fetchAdminUsers() {
    if (!tbodyUsers) return;
    try {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Not authorized');
      const data = await response.json();
      
      tbodyUsers.innerHTML = '';
      if (data.length === 0) {
        tbodyUsers.innerHTML = '<tr><td colspan="5" class="text-center">Không có dữ liệu</td></tr>';
        return;
      }

      const roleNames = {
        'admin': 'Quản trị viên',
        'ke_toan_kho': 'Kế toán kho',
        'san_xuat': 'Sản xuất',
        'kinh_doanh': 'Kinh doanh',
        'ke_toan_ban_hang': 'Kế toán bán hàng'
      };

      data.forEach(user => {
        const tr = document.createElement('tr');
        
        const statusBadge = user.approved 
          ? `<span class="status-badge success">Đã Duyệt</span>`
          : `<span class="status-badge warning">Chờ Duyệt</span>`;
          
        let actions = '';
        if (user.role !== 'admin' || user.approved === false) {
           if (!user.approved) {
             actions += `<button class="btn btn-sm btn-accent" onclick="approveUser('${user.username}')">Duyệt</button> `;
           }
           actions += `<button class="btn btn-sm btn-secondary" onclick="deleteUser('${user.username}')">Xóa</button>`;
        }

        tr.innerHTML = `
          <td><strong>${user.username}</strong></td>
          <td>${user.name}</td>
          <td>${roleNames[user.role] || user.role}</td>
          <td>${statusBadge}</td>
          <td>${actions}</td>
        `;
        tbodyUsers.appendChild(tr);
      });
    } catch (error) {
      console.error('Lỗi tải danh sách users:', error);
      tbodyUsers.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Lỗi kết nối đến máy chủ</td></tr>';
    }
  }

  window.approveUser = async function(username) {
    if (!confirm(`Bạn có chắc chắn muốn duyệt tài khoản ${username}?`)) return;
    try {
      const res = await fetch(`/api/users/${username}/approve`, { 
        method: 'PUT'
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        fetchAdminUsers();
      } else {
        showToast(data.error, 'danger');
      }
    } catch (err) {
      showToast('Lỗi kết nối', 'danger');
    }
  };

  window.deleteUser = async function(username) {
    if (!confirm(`Bạn có chắc chắn muốn xóa/từ chối tài khoản ${username}?`)) return;
    try {
      const res = await fetch(`/api/users/${username}`, { 
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        fetchAdminUsers();
      } else {
        showToast(data.error, 'danger');
      }
    } catch (err) {
      showToast('Lỗi kết nối', 'danger');
    }
  };

  if (btnRefreshUsers) {
    btnRefreshUsers.addEventListener('click', fetchAdminUsers);
  }


  // --- Toast Notification System ---
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'danger') icon = '❌';

    toast.innerHTML = `
      <span>${icon} ${message}</span>
      <button class="toast-close">&times;</button>
    `;
    
    container.appendChild(toast);
    
    // Close on click close button
    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    // Auto dismiss
    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) reverse forwards';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // --- Fallback theme toggle for older browsers without CSS :has() support ---
  if (!CSS.supports('selector(:has(*))')) {
    themeCheckbox.addEventListener('change', (e) => {
      appContainer.classList.toggle('dark-theme', e.target.checked);
    });
  }

  // Preserve theme setting local storage (default is light, checkbox checked is dark)
  if (localStorage.getItem('theme') === 'dark') {
    themeCheckbox.checked = true;
    if (!CSS.supports('selector(:has(*))')) {
      appContainer.classList.add('dark-theme');
    }
  }

  themeCheckbox.addEventListener('change', (e) => {
    localStorage.setItem('theme', e.target.checked ? 'dark' : 'light');
  });

  // --- Tab Navigation Logic ---
  const tabMeta = {
    dashboard: { title: 'Tổng Quan Hệ Thống', desc: 'Giám sát và kiểm soát dữ liệu Odoo - Google Sheets' },
    products: { title: 'Quản Lý Sản Phẩm (Mã & Giá)', desc: 'Danh sách sản phẩm được đồng bộ từ Odoo ERP' },
    stock: { title: 'Chi Tiết Tồn Kho', desc: 'Số lượng vật lý và vị trí lưu kho của các hàng hóa' },
    orders: { title: 'Kế Toán Kho: Mua Hàng & Nhập Kho', desc: 'Quản lý mua nguyên vật liệu và duyệt nhập kho hàng hóa' },
    production: { title: 'Bộ Phận Sản Xuất: Báo Cáo Sản Lượng', desc: 'Nhập sản lượng sản xuất hàng ngày và khấu hao nguyên vật liệu' },
    sales: { title: 'Bộ Phận Kinh Doanh: Bán Hàng', desc: 'Tạo đơn hàng bán (Sales Orders) cho khách hàng' },
    invoices: { title: 'Kế Toán Bán Hàng: Hóa Đơn & Thanh Toán', desc: 'Quản lý hóa đơn xuất bán, ghi sổ và thanh toán' },
    customers: { title: 'Quản Lý Khách Hàng', desc: 'Danh sách và thông tin liên hệ của khách hàng đồng bộ từ Odoo' },
    terminal: { title: 'Màn Hình Logs Hệ Thống', desc: 'Xem lại toàn bộ lịch sử console logs đã chạy' },
    settings: { title: 'Cài Đặt Kết Nối', desc: 'Thiết lập thông tin đăng nhập Odoo và khóa bảo mật Google' }
  };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabName = item.getAttribute('data-tab');
      
      // Update nav active state
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Show tab panel
      tabPanels.forEach(panel => panel.classList.remove('active'));
      const activePanel = document.getElementById(`panel${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
      if (activePanel) activePanel.classList.add('active');
      
      // Update header titles
      pageTitle.textContent = tabMeta[tabName].title;
      pageDescription.textContent = tabMeta[tabName].desc;
      
      // Auto fetch data on tab selection
      if (tabName === 'products') fetchProductsData();
      if (tabName === 'stock') fetchStockData();
      if (tabName === 'invoices') fetchInvoicesData();
      if (tabName === 'customers') fetchCustomersData();
      if (tabName === 'orders') {
        fetchPOsData();
        fetchReceiptsData();
        fetchVendorsData();
        loadPOFormSelects();
      }
      if (tabName === 'production') {
        loadProductionFormSelects();
        renderProductionHistory();
      }
      if (tabName === 'sales') {
        fetchSOData();
        loadSalesFormSelects();
      }
    });
  });

  // --- Modal dialog closedby coordinates fallback for older/Safari engines ---
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    confirmDialog.addEventListener('click', (event) => {
      if (event.target !== confirmDialog) return;
      const rect = confirmDialog.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (!isDialogContent) {
        confirmDialog.close();
      }
    });
  }

  btnCancelDialog.addEventListener('click', () => {
    confirmDialog.close();
  });

  // --- Fetch System Status & Load Dashboard Summaries ---
  async function checkSystemStatus() {
    odooStatusBadge.innerHTML = '<span class="status-dot warning"></span><span>Odoo: Đang kết nối...</span>';
    gsheetStatusBadge.innerHTML = '<span class="status-dot warning"></span><span>GSheet: Đang kết nối...</span>';
    
    try {
      const response = await fetch('/api/odoo/status');
      const data = await response.json();
      
      // Update Odoo Badge
      if (data.odoo.connected) {
        odooStatusBadge.innerHTML = '<span class="status-dot success"></span><span>Odoo: Đang hoạt động</span>';
      } else {
        odooStatusBadge.innerHTML = '<span class="status-dot danger"></span><span>Odoo: Lỗi kết nối</span>';
        console.error('Odoo connection error:', data.odoo.error);
      }
      
      // Update GSheet Badge
      if (data.gsheet.connected) {
        gsheetStatusBadge.innerHTML = '<span class="status-dot success"></span><span>GSheet: Đang hoạt động</span>';
      } else {
        gsheetStatusBadge.innerHTML = '<span class="status-dot danger"></span><span>GSheet: Lỗi kết nối</span>';
        console.error('GSheet connection error:', data.gsheet.error);
      }
      
      showToast('Cập nhật trạng thái hệ thống hoàn tất', 'success');
    } catch (e) {
      odooStatusBadge.innerHTML = '<span class="status-dot danger"></span><span>Odoo: Lỗi máy chủ</span>';
      gsheetStatusBadge.innerHTML = '<span class="status-dot danger"></span><span>GSheet: Lỗi máy chủ</span>';
      showToast('Không thể kết nối tới máy chủ Express API', 'danger');
    }
  }

  async function fetchSummaryMetrics() {
    try {
      let stock = [];
      let invoices = [];
      let pos = [];
      let receipts = [];
      let salesOrders = [];

      // Fetch products summary
      const prodRes = await fetch('/api/odoo/products');
      if (prodRes.ok) {
        const prods = await prodRes.json();
        valTotalProducts.textContent = prods.length;
      }
      
      // Fetch stock summary
      const stockRes = await fetch('/api/odoo/stock');
      if (stockRes.ok) {
        stock = await stockRes.json();
        const locations = new Set(stock.map(s => s.location));
        valTotalLocations.textContent = locations.size;
        
        const totalQty = stock.reduce((acc, curr) => acc + curr.quantity, 0);
        valTotalStockQty.textContent = `Tổng số lượng: ${totalQty.toLocaleString()}`;

        // Render Stock Chart
        const stockByProd = {};
        stock.forEach(s => {
          if (s.quantity > 0) {
            stockByProd[s.product_name] = (stockByProd[s.product_name] || 0) + s.quantity;
          }
        });
        const stockChartData = Object.entries(stockByProd)
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value);
        renderDashboardChart('chartTopStock', stockChartData);
      }
      
      // Fetch invoices summary
      const invRes = await fetch('/api/odoo/invoices');
      if (invRes.ok) {
        invoices = await invRes.json();
        valTotalInvoices.textContent = invoices.length;
        
        const unpaidCount = invoices.filter(i => i.payment_state !== 'paid').length;
        valResidualInvoices.textContent = `Chưa thanh toán: ${unpaidCount}`;

        // Render Invoices Chart
        const invByStatus = {
          'Đã thanh toán': invoices.filter(i => i.payment_state === 'paid').length,
          'Chưa thanh toán': invoices.filter(i => i.payment_state === 'not_paid').length,
          'Đã đặt cọc': invoices.filter(i => i.payment_state === 'partial').length,
        };
        const invChartData = Object.entries(invByStatus)
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value);
        renderDashboardChart('chartInvoiceStatus', invChartData);
      }
      
      // Fetch POs summary
      const poRes = await fetch('/api/odoo/po');
      const rcRes = await fetch('/api/odoo/receipts');
      if (poRes.ok && rcRes.ok) {
        pos = await poRes.json();
        receipts = await rcRes.json();
        valTotalPOs.textContent = pos.length;
        
        const pending = receipts.filter(r => r.state === 'assigned').length;
        valPendingReceipts.textContent = `Nhận kho chờ duyệt: ${pending}`;

        // Render Purchase Flow Chart
        const purchaseFlow = {
          'Đơn mua hàng': pos.length,
          'Chờ nhận kho': pending,
          'Đã nhận kho': receipts.filter(r => r.state === 'done').length,
        };
        const poChartData = Object.entries(purchaseFlow)
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value);
        renderDashboardChart('chartPurchaseFlow', poChartData);
      }

      // Fetch Sales Orders
      const soRes = await fetch('/api/odoo/so');
      if (soRes.ok) {
        salesOrders = await soRes.json();
        
        // 1. Sales by Customer
        const salesByCustomer = {};
        salesOrders.forEach(so => {
          if (so.amount_total > 0 && so.partner) {
            salesByCustomer[so.partner] = (salesByCustomer[so.partner] || 0) + so.amount_total;
          }
        });
        const salesChartData = Object.entries(salesByCustomer)
          .map(([label, value]) => ({ label, value, display: value.toLocaleString() + ' đ' }))
          .sort((a, b) => b.value - a.value);
        renderDashboardChart('chartSalesCustomers', salesChartData);

        // 2. Sales by Flow (State)
        const flowCounts = {
          'Đã chốt': salesOrders.filter(so => so.state === 'sale' || so.state === 'done').length,
          'Chờ sản xuất / Báo giá': salesOrders.filter(so => so.state === 'draft' || so.state === 'sent').length,
          'Đã hủy': salesOrders.filter(so => so.state === 'cancel').length
        };
        const flowChartData = Object.entries(flowCounts)
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value);
        renderDashboardChart('chartSalesFlow', flowChartData);
      }
    } catch (e) {
      console.error('Failed to load metrics:', e);
    }
  }

  btnRefreshStatus.addEventListener('click', () => {
    checkSystemStatus();
    fetchSummaryMetrics();
  });

  // --- Fetch and Display Products Data ---
  async function fetchProductsData() {
    tbodyProducts.innerHTML = '<tr><td colspan="8" class="text-center">Đang tải dữ liệu sản phẩm...</td></tr>';
    try {
      const response = await fetch('/api/odoo/products');
      if (!response.ok) throw new Error('Failed to fetch products');
      const data = await response.json();
      cache.products = [...cache.tempProducts, ...data];
      if (typeof applyProductFilters === 'function') {
        applyProductFilters();
      } else {
        renderProducts(cache.products);
      }
    } catch (e) {
      tbodyProducts.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Lỗi: ${e.message}</td></tr>`;
    }
  }

  function renderProducts(products) {
    if (!products.length) {
      tbodyProducts.innerHTML = '<tr><td colspan="8" class="text-center">Không tìm thấy sản phẩm nào.</td></tr>';
      return;
    }
    
    tbodyProducts.innerHTML = products.map(p => {
      let typeLabel = p.type;
      if (p.type === 'raw_material') typeLabel = 'Nguyên vật liệu';
      else if (p.type === 'manufactured') typeLabel = 'Thành phẩm xưởng tự làm';
      else if (p.type === 'trading') typeLabel = 'Hàng mua đi bán lại';
      else if (p.type === 'product' || p.type === 'consu') typeLabel = 'Hàng hóa lưu kho';
      else if (p.type === 'service') typeLabel = 'Dịch vụ';
      else if (p.type === 'combo') typeLabel = 'Combo';
      else typeLabel = p.type || 'N/A';

      const qtyLabel = (p.type === 'product' || p.type === 'consu' || p.type === 'raw_material' || p.type === 'manufactured' || p.type === 'trading') ? (p.qty_available ?? 0) : '-';
      const formattedPrice = p.list_price ? Number(p.list_price).toLocaleString() + ' đ' : '0 đ';
      const formattedCost = p.standard_price ? Number(p.standard_price).toLocaleString() + ' đ' : '0 đ';
      const updateDate = p.write_date ? new Date(p.write_date).toLocaleString() : 'N/A';

      return `
        <tr>
          <td><strong>${p.default_code || '-'}</strong></td>
          <td>${p.name}</td>
          <td><span class="badge badge-type">${typeLabel}</span></td>
          <td>${formattedPrice}</td>
          <td>${formattedCost}</td>
          <td><strong class="${qtyLabel > 0 ? 'text-success' : ''}">${qtyLabel}</strong></td>
          <td class="text-muted">${updateDate}</td>
          <td>
            ${(getCurrentRole() === 'ke_toan_kho') ? `
              <button class="btn btn-sm btn-secondary btn-edit-prod" data-id="${p.id}" style="padding: 4px 8px; font-size: 0.75rem; margin-right: 4px;">Sửa</button>
              <button class="btn btn-sm btn-accent btn-delete-prod" data-id="${p.id}" style="padding: 4px 8px; font-size: 0.75rem; color: var(--accent-danger); background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2);">Xóa</button>
            ` : '-'}
          </td>
        </tr>
      `;
    }).join('');

    // Attach Event Listeners to individual buttons
    document.querySelectorAll('.btn-edit-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        const attrId = btn.getAttribute('data-id');
        const prodId = attrId.startsWith('temp_') ? attrId : Number(attrId);
        openEditProductModal(prodId);
      });
    });

    document.querySelectorAll('.btn-delete-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        const attrId = btn.getAttribute('data-id');
        const prodId = attrId.startsWith('temp_') ? attrId : Number(attrId);
        confirmDeleteProduct(prodId);
      });
    });
  }

  // --- Fetch and Display Stock Data ---
  async function fetchStockData() {
    tbodyStock.innerHTML = '<tr><td colspan="7" class="text-center">Đang tải dữ liệu tồn kho...</td></tr>';
    try {
      const response = await fetch('/api/odoo/stock');
      if (!response.ok) throw new Error('Failed to fetch stock');
      const data = await response.json();
      cache.stock = data;
      renderStock(data);
    } catch (e) {
      tbodyStock.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Lỗi: ${e.message}</td></tr>`;
    }
  }

  function renderStock(stock) {
    if (!stock.length) {
      tbodyStock.innerHTML = '<tr><td colspan="6" class="text-center">Không tìm thấy thông tin tồn kho nào.</td></tr>';
      return;
    }
    
    tbodyStock.innerHTML = stock.map(s => {
      const writeDateStr = s.write_date ? new Date(s.write_date).toLocaleString() : 'N/A';
      return `
        <tr>
          <td><strong>${s.product_code || '-'}</strong></td>
          <td>${s.product_name || 'N/A'}</td>
          <td>${s.location || 'N/A'}</td>
          <td><span class="badge text-muted">${s.usage || 'N/A'}</span></td>
          <td><strong class="text-success">${s.quantity}</strong></td>
          <td class="text-muted">${writeDateStr}</td>
        </tr>
      `;
    }).join('');
  }

  // --- Fetch and Display Customers Data ---
  async function fetchCustomersData() {
    const tbody = document.getElementById('tbodyCustomers');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" class="text-center">Đang tải dữ liệu khách hàng...</td></tr>';
    
    try {
      const response = await fetch('/api/odoo/partners?type=customer');
      if (!response.ok) throw new Error('Failed to fetch customers');
      const data = await response.json();
      cache.customers = data;
      renderCustomers(data);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Lỗi: ${e.message}</td></tr>`;
    }
  }

  function renderCustomers(customers) {
    const tbody = document.getElementById('tbodyCustomers');
    if (!tbody) return;
    
    if (!customers.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center">Không tìm thấy khách hàng nào.</td></tr>';
      return;
    }
    
    tbody.innerHTML = customers.map(c => {
      return `
        <tr>
          <td><strong>${c.name}</strong></td>
          <td>${c.street || '-'}</td>
          <td>${c.phone || '-'}</td>
        </tr>
      `;
    }).join('');
  }

  const searchCustomers = document.getElementById('searchCustomers');
  if (searchCustomers) {
    searchCustomers.addEventListener('input', (e) => {
      const query = removeVietnameseTones(e.target.value.toLowerCase().trim());
      if (!cache.customers) return;
      const filtered = cache.customers.filter(c => {
        const nameMatch = removeVietnameseTones(c.name.toLowerCase()).includes(query);
        const streetMatch = c.street ? removeVietnameseTones(c.street.toLowerCase()).includes(query) : false;
        const phoneMatch = c.phone ? c.phone.includes(query) : false;
        return nameMatch || streetMatch || phoneMatch;
      });
      renderCustomers(filtered);
    });
  }

  const btnCreateCustomerFromTab = document.getElementById('btnCreateCustomerFromTab');
  if (btnCreateCustomerFromTab) {
    btnCreateCustomerFromTab.addEventListener('click', () => {
      partnerNameInput.value = '';
      partnerStreetInput.value = '';
      partnerPhoneInput.value = '';
      partnerTypeInput.value = 'customer';
      
      document.getElementById('partnerDialogTitle').textContent = 'Thêm Khách Hàng Mới';
      partnerDialog.showModal();
    });
  }

  const btnRefreshCustomers = document.getElementById('btnRefreshCustomers');
  if (btnRefreshCustomers) {
    btnRefreshCustomers.addEventListener('click', fetchCustomersData);
  }

  // --- Fetch and Display Vendors Data ---
  async function fetchVendorsData() {
    const tbody = document.getElementById('tbodyVendors');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" class="text-center">Đang tải dữ liệu nhà cung cấp...</td></tr>';
    
    try {
      const response = await fetch('/api/odoo/partners?type=vendor');
      if (!response.ok) throw new Error('Failed to fetch vendors');
      const data = await response.json();
      cache.vendors = data;
      renderVendors(data);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Lỗi: ${e.message}</td></tr>`;
    }
  }

  function renderVendors(vendors) {
    const tbody = document.getElementById('tbodyVendors');
    if (!tbody) return;
    
    if (!vendors.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center">Không tìm thấy nhà cung cấp nào.</td></tr>';
      return;
    }
    
    tbody.innerHTML = vendors.map(v => {
      return `
        <tr>
          <td><strong>${v.name}</strong></td>
          <td>${v.street || '-'}</td>
          <td>${v.phone || '-'}</td>
        </tr>
      `;
    }).join('');
  }

  const searchVendors = document.getElementById('searchVendors');
  if (searchVendors) {
    searchVendors.addEventListener('input', (e) => {
      const query = removeVietnameseTones(e.target.value.toLowerCase().trim());
      if (!cache.vendors) return;
      const filtered = cache.vendors.filter(v => {
        const nameMatch = removeVietnameseTones(v.name.toLowerCase()).includes(query);
        const streetMatch = v.street ? removeVietnameseTones(v.street.toLowerCase()).includes(query) : false;
        const phoneMatch = v.phone ? v.phone.includes(query) : false;
        return nameMatch || streetMatch || phoneMatch;
      });
      renderVendors(filtered);
    });
  }

  const btnCreateVendorFromTab = document.getElementById('btnCreateVendorFromTab');
  if (btnCreateVendorFromTab) {
    btnCreateVendorFromTab.addEventListener('click', () => {
      partnerNameInput.value = '';
      partnerStreetInput.value = '';
      partnerPhoneInput.value = '';
      partnerTypeInput.value = 'vendor';
      
      document.getElementById('partnerDialogTitle').textContent = 'Thêm Nhà Cung Cấp Mới';
      partnerDialog.showModal();
    });
  }

  const btnRefreshVendors = document.getElementById('btnRefreshVendors');
  if (btnRefreshVendors) {
    btnRefreshVendors.addEventListener('click', fetchVendorsData);
  }

  // --- Fetch and Display Invoices Data ---
  async function fetchInvoicesData() {
    tbodyInvoices.innerHTML = '<tr><td colspan="9" class="text-center">Đang tải dữ liệu hóa đơn...</td></tr>';
    try {
      const response = await fetch('/api/odoo/invoices');
      if (!response.ok) throw new Error('Failed to fetch invoices');
      const data = await response.json();
      cache.invoices = data;
      renderInvoices(data);
    } catch (e) {
      tbodyInvoices.innerHTML = `<tr><td colspan="10" class="text-center text-danger">Lỗi: ${e.message}</td></tr>`;
    }
  }

  function renderInvoices(invoices) {
    if (!invoices.length) {
      tbodyInvoices.innerHTML = '<tr><td colspan="10" class="text-center">Không tìm thấy hóa đơn nào.</td></tr>';
      return;
    }
    
    tbodyInvoices.innerHTML = invoices.map(i => {
      const total = i.amount_total ? Number(i.amount_total).toLocaleString() + ' đ' : '0 đ';
      const residual = i.amount_residual ? Number(i.amount_residual).toLocaleString() + ' đ' : '0 đ';
      
      let payClass = 'text-warning';
      let payLabel = i.payment_state || 'N/A';
      if (i.payment_state === 'paid') {
        payClass = 'text-success';
        payLabel = 'Đã thanh toán';
      } else if (i.payment_state === 'not_paid') {
        payClass = 'text-danger';
        payLabel = 'Chưa thanh toán';
      } else if (i.payment_state === 'partial') {
        payClass = 'text-warning';
        payLabel = 'Đã đặt cọc';
      }
      
      const stateLabel = i.state === 'posted' ? 'Đã vào sổ' : i.state === 'draft' ? 'Nháp' : i.state || 'N/A';
      const invDate = i.invoice_date ? new Date(i.invoice_date).toLocaleDateString('vi-VN') : 'N/A';

      // Action buttons
      const role = getCurrentRole();
      const isAllowed = (role === 'admin' || role === 'ke_toan_ban_hang');
      
      let actionBtn = '';
      if (isAllowed) {
        if (i.state === 'draft') {
          actionBtn = `<button class="btn btn-sm btn-primary btn-post-invoice" data-id="${i.id}" style="padding: 4px 8px; font-size: 0.75rem;">Ghi Sổ</button>`;
        } else if (i.state === 'posted') {
          actionBtn = `<button class="btn btn-sm btn-accent btn-pay-invoice" data-id="${i.id}" style="padding: 4px 8px; font-size: 0.75rem;">Cập Nhật TT/GTGT</button>`;
        }
      }
      const pdfBtn = isAllowed ? `<a href="/api/odoo/invoices/${i.id}/pdf?access_token=${encodeURIComponent(getAuthToken())}" target="_blank" class="btn btn-sm btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px; text-decoration: none; margin-left: 4px;">📄 Tải PDF</a>` : '';
      const deleteBtn = isAllowed ? `<button class="btn btn-sm btn-accent btn-delete-invoice" data-id="${i.id}" style="padding: 4px 8px; font-size: 0.75rem; color: var(--accent-danger); background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); margin-left: 4px;">Xóa</button>` : '';

      return `
        <tr>
          <td><strong>${i.invoice_number || 'Nháp'}</strong></td>
          <td>${i.partner || 'N/A'}</td>
          <td><strong>${total}</strong></td>
          <td class="text-muted">${residual}</td>
          <td><span class="${payClass}">${payLabel}</span></td>
          <td style="font-size: 0.85rem; color: var(--text-secondary); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${i.payment_ref || ''}">${i.payment_ref || '-'}</td>
          <td style="font-size: 0.85rem; font-weight: 600;">${i.ref || '-'}</td>
          <td><span class="badge ${i.state === 'posted' ? 'text-success' : 'text-warning'}">${stateLabel}</span></td>
          <td>${invDate}</td>
          <td><div style="display: flex; gap: 4px; align-items: center;">${actionBtn}${pdfBtn}${deleteBtn}</div></td>
        </tr>
      `;
    }).join('');

    // Attach event listeners for invoices actions
    document.querySelectorAll('.btn-post-invoice').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await postInvoice(id);
      });
    });

    document.querySelectorAll('.btn-pay-invoice').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-id'));
        const inv = cache.invoices.find(invoice => invoice.id === id);
        if (!inv) return;
        
        document.getElementById('payInvoiceId').value = id;
        document.getElementById('payStatus').value = inv.payment_state === 'partial' ? 'partial' : (inv.payment_state === 'paid' ? 'paid' : 'not_paid');
        document.getElementById('payAmount').value = inv.amount_total - inv.amount_residual;
        document.getElementById('payRef').value = inv.payment_ref || '';
        document.getElementById('payInvoiceGTGT').value = inv.ref || '';
        document.getElementById('payTotalAmountVal').textContent = inv.amount_total.toLocaleString();
        
        // Toggle amount input visibility
        const amountGroup = document.getElementById('payAmountGroup');
        if (document.getElementById('payStatus').value === 'partial') {
          amountGroup.style.display = 'block';
        } else {
          amountGroup.style.display = 'none';
        }
        
        document.getElementById('paymentDialog').showModal();
      });
    });

    document.querySelectorAll('.btn-delete-invoice').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        await deleteInvoice(id);
      });
    });
  }

  // --- Fetch Purchase Orders Data ---
  async function fetchPOsData() {
    tbodyPOs.innerHTML = '<tr><td colspan="5" class="text-center">Đang tải đơn mua hàng...</td></tr>';
    try {
      const response = await fetch('/api/odoo/po');
      if (!response.ok) throw new Error('Failed to fetch POs');
      const data = await response.json();
      cache.pos = data;
      if (typeof renderHistory === 'function') renderHistory();
      
      if (!data.length) {
        tbodyPOs.innerHTML = '<tr><td colspan="5" class="text-center">Không tìm thấy đơn mua hàng nào.</td></tr>';
        return;
      }
      
      tbodyPOs.innerHTML = data.map(o => {
        const total = o.amount_total ? Number(o.amount_total).toLocaleString() + ' đ' : '0 đ';
        const poDate = o.date_order ? new Date(o.date_order).toLocaleDateString('vi-VN') : 'N/A';
        const stateLabel = o.state === 'purchase' ? 'Hợp đồng' : o.state === 'done' ? 'Hoàn tất' : o.state === 'draft' ? 'Yêu cầu báo giá' : o.state || 'N/A';
        
        return `
          <tr>
            <td><strong>${o.po_number || '-'}</strong></td>
            <td>${o.vendor || 'N/A'}</td>
            <td><strong>${total}</strong></td>
            <td><span class="text-success">${stateLabel}</span></td>
            <td>
              <span class="text-muted" style="display:inline-block; min-width:80px;">${poDate}</span>
              <button class="btn btn-sm btn-secondary btn-detail-po" data-id="${o.id}" style="padding: 2px 6px; font-size: 0.75rem; margin-left: 4px;">Chi tiết</button>
            </td>
          </tr>
        `;
      }).join('');
      
      // Bind Detail PO Buttons
      document.querySelectorAll('.btn-detail-po').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await openHistoryDetail('po', id);
        });
      });
    } catch (e) {
      tbodyPOs.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Lỗi: ${e.message}</td></tr>`;
    }
  }

  // --- Fetch Incoming Receipts Data ---
  async function fetchReceiptsData() {
    tbodyReceipts.innerHTML = '<tr><td colspan="5" class="text-center">Đang tải phiếu nhận kho...</td></tr>';
    try {
      const response = await fetch('/api/odoo/receipts');
      if (!response.ok) throw new Error('Failed to fetch receipts');
      const data = await response.json();
      cache.receipts = data;
      if (typeof renderHistory === 'function') renderHistory();
      
      if (!data.length) {
        tbodyReceipts.innerHTML = '<tr><td colspan="5" class="text-center">Không tìm thấy phiếu nhận kho nào.</td></tr>';
        return;
      }
      
      tbodyReceipts.innerHTML = data.map(r => {
        let stateLabel = r.state || 'N/A';
        let stateClass = 'text-warning';
        let actionBtn = '-';
        
        const role = getCurrentRole();
        const isWarehouseStaff = (role === 'admin' || role === 'ke_toan_kho');
        
        if (r.state === 'done') {
          stateLabel = 'Đã hoàn tất';
          stateClass = 'text-success';
        } else if (r.state === 'assigned') {
          stateLabel = 'Chờ nhận kho';
          stateClass = 'text-warning';
          if (isWarehouseStaff) {
            actionBtn = `<button class="btn btn-sm btn-primary btn-validate-receipt" data-id="${r.id}" style="padding: 4px 8px; font-size: 0.75rem;">Duyệt Nhập Kho</button>`;
          } else {
            actionBtn = '<span class="text-muted" style="font-size: 0.8rem;">Chờ duyệt</span>';
          }
        } else if (r.state === 'confirmed') {
          stateLabel = 'Đang chờ';
          stateClass = 'text-muted';
        }
        
        return `
          <tr>
            <td><strong>${r.receipt_number || '-'}</strong></td>
            <td>${r.origin || '-'}</td>
            <td>${r.vendor || 'N/A'}</td>
            <td><span class="${stateClass}">${stateLabel}</span></td>
            <td style="display: flex; gap: 4px; align-items: center; justify-content: flex-end;">
              ${actionBtn}
              <button class="btn btn-sm btn-secondary btn-detail-receipt" data-id="${r.id}" style="padding: 2px 6px; font-size: 0.75rem;">Chi tiết</button>
            </td>
          </tr>
        `;
      }).join('');

      // Bind Detail Receipt Buttons
      document.querySelectorAll('.btn-detail-receipt').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await openHistoryDetail('receipt', id);
        });
      });

      // Attach event listeners for receipts actions
      document.querySelectorAll('.btn-validate-receipt').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.getAttribute('data-id'));
          await validateReceipt(id);
        });
      });
    } catch (e) {
      tbodyReceipts.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Lỗi: ${e.message}</td></tr>`;
    }
  }

  // --- Setup Refresh Buttons ---
  btnRefreshProducts.addEventListener('click', fetchProductsData);
  btnRefreshStock.addEventListener('click', fetchStockData);
  btnRefreshInvoices.addEventListener('click', fetchInvoicesData);
  btnRefreshPOs.addEventListener('click', fetchPOsData);
  btnRefreshReceipts.addEventListener('click', fetchReceiptsData);
  const btnRefreshHistory = document.getElementById('btnRefreshHistory');
  if (btnRefreshHistory) btnRefreshHistory.addEventListener('click', () => { fetchPOsData(); fetchReceiptsData(); });



  function renderHistory() {
    const tbody = document.getElementById('tbodyHistoryOrders');
    if (!tbody) return;

    let history = [];
    
    if (cache.pos && Array.isArray(cache.pos)) {
      history = history.concat(cache.pos.filter(po => po.state === 'purchase' || po.state === 'done').map(po => ({
        id: po.id,
        rawType: 'po',
        type: 'Đơn Mua Hàng',
        ref: po.po_number || '-',
        partner: po.vendor || 'N/A',
        detail: po.amount_total ? Number(po.amount_total).toLocaleString() + ' đ' : '0 đ',
        date: po.write_date ? new Date(po.write_date).toLocaleString('vi-VN') : (po.date_order ? new Date(po.date_order).toLocaleString('vi-VN') : 'N/A'),
        timestamp: po.write_date ? new Date(po.write_date).getTime() : 0
      })));
    }
    
    if (cache.receipts && Array.isArray(cache.receipts)) {
      history = history.concat(cache.receipts.filter(r => r.state === 'done').map(r => ({
        id: r.id,
        rawType: 'receipt',
        type: 'Phiếu Nhận Kho',
        ref: r.receipt_number || '-',
        partner: r.vendor || 'N/A',
        detail: r.origin || '-',
        date: r.write_date ? new Date(r.write_date).toLocaleString('vi-VN') : 'N/A',
        timestamp: r.write_date ? new Date(r.write_date).getTime() : 0
      })));
    }

    history.sort((a, b) => b.timestamp - a.timestamp);

    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">Chưa có lịch sử giao dịch hoàn tất.</td></tr>';
      return;
    }

    tbody.innerHTML = history.map(item => `
      <tr>
        <td><span class="badge ${item.type === 'Đơn Mua Hàng' ? 'text-primary' : 'text-success'}">${item.type}</span></td>
        <td><strong>${item.ref}</strong></td>
        <td>${item.partner}</td>
        <td>${item.detail}</td>
        <td class="text-muted">${item.date}</td>
        <td><button class="btn btn-sm btn-secondary" onclick="window.openHistoryDetail('${item.rawType}', ${item.id})">Xem chi tiết</button></td>
      </tr>
    `).join('');
  }

  // --- Search Filtering & Sort Logic ---
  const sortProducts = document.getElementById('sortProducts');

  window.applyProductFilters = function() {
    const term = searchProducts.value.toLowerCase().trim();
    const sortVal = sortProducts ? sortProducts.value : 'name_asc';

    let filtered = cache.products.filter(p => 
      (p.name && p.name.toLowerCase().includes(term)) || 
      (p.default_code && p.default_code.toLowerCase().includes(term))
    );

    filtered.sort((a, b) => {
      const nameA = a.name || '';
      const nameB = b.name || '';
      const priceA = Number(a.list_price || 0);
      const priceB = Number(b.list_price || 0);
      const stockA = Number(a.qty_available || 0);
      const stockB = Number(b.qty_available || 0);

      switch (sortVal) {
        case 'name_asc': return nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
        case 'name_desc': return nameB.localeCompare(nameA, 'vi', { sensitivity: 'base' });
        case 'price_asc': return priceA - priceB;
        case 'price_desc': return priceB - priceA;
        case 'stock_asc': return stockA - stockB;
        case 'stock_desc': return stockB - stockA;
        default: return 0;
      }
    });

    renderProducts(filtered);
  };

  if (searchProducts) searchProducts.addEventListener('input', window.applyProductFilters);
  if (sortProducts) sortProducts.addEventListener('change', window.applyProductFilters);

  searchStock.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    const filtered = cache.stock.filter(s => 
      s.product_name.toLowerCase().includes(term) || 
      s.product_code.toLowerCase().includes(term) ||
      s.location.toLowerCase().includes(term)
    );
    renderStock(filtered);
  });

  searchInvoices.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    const filtered = cache.invoices.filter(i => 
      i.invoice_number.toLowerCase().includes(term) || 
      i.partner.toLowerCase().includes(term)
    );
    renderInvoices(filtered);
  });

  // --- Load and Save Config Settings ---
  async function loadConfigSettings() {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      
      odooUrlInput.value = data.odooUrl || '';
      odooDbInput.value = data.db || '';
      odooLoginInput.value = data.login || '';
      odooPasswordInput.value = data.password || '';
      sheetIdInput.value = data.sheetId || '';
      credsContentInput.value = data.credsContent || '';
    } catch (e) {
      showToast('Lỗi khi tải thông số cấu hình', 'danger');
    }
  }

  formSettings.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const config = {
      odooUrl: odooUrlInput.value.trim(),
      db: odooDbInput.value.trim(),
      login: odooLoginInput.value.trim(),
      password: odooPasswordInput.value,
      sheetId: sheetIdInput.value.trim(),
      credsContent: credsContentInput.value.trim()
    };
    
    // Validate credentials content if pasted
    if (config.credsContent) {
      try {
        JSON.parse(config.credsContent);
      } catch (err) {
        showToast('Nội dung Google Credentials JSON không hợp lệ!', 'danger');
        return;
      }
    }
    
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
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
    }
  });

  btnResetSettings.addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn điền lại thông số mặc định không?')) {
      loadConfigSettings();
    }
  });

  // --- SSE Real-time child process runner ---
  const terminalActionsMeta = {
    'odoo_gsheet_bidirectional_sync.js': 'Đồng Bộ 2 Chiều Odoo <-> GSheet',
    'fix_odoo_products_utf8.js': 'Import Sản Phẩm & Fix UTF-8',
    'fix_duplicates_and_combos.js': 'Dọn Trùng Sản Phẩm & Cấu Hình Combo',
    'odoo_process_stock_receipts.js': 'Duyệt Phiếu Nhận Kho Chờ Duyệt',
    'odoo_e2e_workflow_test.js': 'Chạy Test Workflow E2E',
    'odoo_create_sample_orders_test.js': 'Tạo Đơn Bán Hàng Mẫu',
    'odoo_create_sample_purchase_and_receipt_test.js': 'Tạo Đơn Mua Hàng & Nhận Kho Mẫu',
    'odoo_create_invoice_ab.js': 'Tạo Hóa Đơn Khách Hàng A/B',
    'odoo_sync_production.js': 'Chạy Quy Trình Khép Kín Sản Xuất Kho'
  };

  function appendTerminalLine(text, isError = false, isSystem = false) {
    const now = new Date().toLocaleTimeString();
    let classNames = 'terminal-line';
    if (isError) classNames += ' error';
    if (isSystem) classNames += ' system';
    
    // Add success formatting for key phrases
    if (text.includes('✅') || text.includes('success') || text.includes('OK') || text.includes('SYNC SUCCESSFUL') || text.includes('exited with code 0')) {
      classNames += ' success';
    }

    const logMsg = `[${now}] ${text}`;
    
    // Mini Dashboard Terminal
    const line1 = document.createElement('div');
    line1.className = classNames;
    line1.textContent = logMsg;
    terminalOutput.appendChild(line1);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
    
    // Full Logs Tab Terminal
    const line2 = document.createElement('div');
    line2.className = classNames;
    line2.textContent = logMsg;
    terminalOutputFull.appendChild(line2);
    terminalOutputFull.scrollTop = terminalOutputFull.scrollHeight;
  }

  function startScriptSyncStream(scriptName) {
    if (isRunningScript) {
      showToast('Có tiến trình đang chạy. Vui lòng đợi kết thúc.', 'warning');
      return;
    }
    
    isRunningScript = true;
    disableRunButtons(true);
    
    appendTerminalLine(`Bắt đầu chạy tiến trình "${terminalActionsMeta[scriptName]}"`, false, true);
    
    // Create SSE Connection
    const sseUrl = `/api/run-script/stream?script=${encodeURIComponent(scriptName)}&access_token=${encodeURIComponent(getAuthToken())}`;
    activeEventSource = new EventSource(sseUrl);
    
    activeEventSource.onmessage = (event) => {
      let data = event.data;
      
      // Check formatting types
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
      
      // Auto terminate when process exits
      if (data.includes('Process exited with code')) {
        activeEventSource.close();
        cleanupScriptRun();
      }
    };
    
    activeEventSource.onerror = (err) => {
      appendTerminalLine('Mất kết nối SSE tới máy chủ.', true, true);
      activeEventSource.close();
      cleanupScriptRun();
    };
  }

  function cleanupScriptRun() {
    isRunningScript = false;
    activeEventSource = null;
    disableRunButtons(false);
    showToast('Tiến trình thực hiện kết thúc. Hãy kiểm tra logs.', 'info');
    
    // Reload state after running script to refresh metrics and table data
    fetchSummaryMetrics();
  }

  function disableRunButtons(disabled) {
    const buttons = document.querySelectorAll('.btn-run-script');
    buttons.forEach(btn => {
      btn.disabled = disabled;
      if (disabled) {
        btn.classList.add('opacity-50');
      } else {
        btn.classList.remove('opacity-50');
      }
    });
  }

  // --- Action Button Triggers ---
  document.querySelectorAll('.btn-run-script').forEach(btn => {
    btn.addEventListener('click', () => {
      const scriptName = btn.getAttribute('data-script');
      targetScriptToRun = scriptName;
      
      // Configure Dialog Details
      dialogMessage.innerHTML = `Bạn có chắc chắn muốn chạy tác vụ <strong>"${terminalActionsMeta[scriptName]}"</strong> không?<br><small class="text-muted">Tiến trình này sẽ thực thi script Node.js tương ứng trên server và trả về log trực tiếp.</small>`;
      confirmDialog.showModal();
    });
  });

  btnConfirmDialog.addEventListener('click', (e) => {
    e.preventDefault();
    confirmDialog.close();
    if (targetScriptToRun) {
      startScriptSyncStream(targetScriptToRun);
    }
  });

  // --- Copy and Clear Terminal Commands ---
  function copyTerminalLogs(outputElement) {
    const lines = Array.from(outputElement.children).map(div => div.textContent).join('\n');
    navigator.clipboard.writeText(lines).then(() => {
      showToast('Đã sao chép toàn bộ logs vào Clipboard', 'success');
    }).catch(err => {
      showToast('Không thể sao chép logs', 'danger');
    });
  }

  btnCopyTerminal.addEventListener('click', () => copyTerminalLogs(terminalOutput));
  btnCopyTerminalFull.addEventListener('click', () => copyTerminalLogs(terminalOutputFull));

  btnClearTerminal.addEventListener('click', () => {
    terminalOutput.innerHTML = '<div class="terminal-line system">[SYSTEM] Bảng console logs đã được xóa sạch.</div>';
  });
  
  btnClearTerminalFull.addEventListener('click', () => {
    terminalOutputFull.innerHTML = '<div class="terminal-line system">[SYSTEM] Bảng console logs đã được xóa sạch.</div>';
  });

  // --- Product CRUD Actions ---
  
  if (prodNameInput && prodCodeInput) {
    prodNameInput.addEventListener('input', () => {
      // Only auto-generate SKU code when creating a new product
      if (!prodIdInput || !prodIdInput.value) {
        prodCodeInput.value = generateSKUFromName(prodNameInput.value);
      }
    });
  }

  // Helper to adjust dialog fields depending on whether it is a raw material or general product
  function adjustProductDialogUI(mode) {
    const prodPriceGroup = document.getElementById('prodPriceGroup');
    const prodPriceCostGrid = document.getElementById('prodPriceCostGrid');
    const lblProdCost = document.getElementById('lblProdCost');
    const prodQtyGroup = document.getElementById('prodQtyGroup');
    if (!prodPriceGroup || !prodPriceCostGrid || !lblProdCost) return;
    
    if (mode === 'po') {
      prodPriceGroup.style.display = 'none';
      prodPriceCostGrid.style.gridTemplateColumns = '1fr';
      lblProdCost.textContent = 'Đơn Giá (đ):';
      if (prodQtyGroup) {
        prodQtyGroup.style.display = 'block';
        const poQtyVal = Number(document.getElementById('poQty')?.value) || 100;
        const prodQtyInput = document.getElementById('prodQty');
        if (prodQtyInput) prodQtyInput.value = poQtyVal > 0 ? poQtyVal : 100;
      }
    } else {
      prodPriceGroup.style.display = 'block';
      prodPriceCostGrid.style.gridTemplateColumns = '1fr 1fr';
      lblProdCost.textContent = 'Giá Vốn (đ):';
      if (prodQtyGroup) prodQtyGroup.style.display = 'none';
    }
  }

  // 1. Open Modal for Create
  btnCreateProduct.addEventListener('click', () => {
    adjustProductDialogUI('general');
    productDialogTitle.textContent = 'Thêm Sản Phẩm Mới';
    prodIdInput.value = '';
    prodNameInput.value = '';
    prodCodeInput.value = '';
    prodTypeInput.value = 'product';
    prodPriceInput.value = 0;
    prodCostInput.value = 0;
    prodDescInput.value = '';
    productDialog.showModal();
  });

  const btnCreateProductPO = document.getElementById('btnCreateProductPO');
  if (btnCreateProductPO) {
    btnCreateProductPO.addEventListener('click', () => {
      adjustProductDialogUI('po');
      productDialogTitle.textContent = 'Thêm Sản Phẩm Mới (Mua hàng)';
      prodIdInput.value = '';
      prodNameInput.value = '';
      prodCodeInput.value = '';
      prodTypeInput.value = 'product';
      prodPriceInput.value = 0;
      prodCostInput.value = 0;
      prodDescInput.value = '';
      productDialog.showModal();
    });
  }

  const btnCreateProductProd = document.getElementById('btnCreateProductProd');
  if (btnCreateProductProd) {
    btnCreateProductProd.addEventListener('click', () => {
      adjustProductDialogUI('general');
      productDialogTitle.textContent = 'Thêm Sản Phẩm Mới (Sản xuất)';
      prodIdInput.value = '';
      prodNameInput.value = '';
      prodCodeInput.value = '';
      prodTypeInput.value = 'product';
      prodPriceInput.value = 0;
      prodCostInput.value = 0;
      prodDescInput.value = '';
      productDialog.showModal();
    });
  }

  const btnCreateProductSales = document.getElementById('btnCreateProductSales');
  if (btnCreateProductSales) {
    btnCreateProductSales.addEventListener('click', () => {
      adjustProductDialogUI('general');
      productDialogTitle.textContent = 'Thêm Sản Phẩm Mới (Bán hàng)';
      prodIdInput.value = '';
      prodNameInput.value = '';
      prodCodeInput.value = '';
      prodTypeInput.value = 'product';
      prodPriceInput.value = 0;
      prodCostInput.value = 0;
      prodDescInput.value = '';
      productDialog.showModal();
    });
  }

  // 2. Open Modal for Edit
  function openEditProductModal(id) {
    const prod = cache.products.find(p => p.id === id);
    if (!prod) {
      showToast('Không tìm thấy thông tin sản phẩm', 'danger');
      return;
    }
    
    adjustProductDialogUI('general');
    productDialogTitle.textContent = 'Cập Nhật Sản Phẩm';
    prodIdInput.value = prod.id;
    prodNameInput.value = prod.name || '';
    prodCodeInput.value = prod.default_code || '';
    prodTypeInput.value = prod.type === 'consu' ? 'product' : (prod.type || 'product');
    prodPriceInput.value = prod.list_price || 0;
    prodCostInput.value = prod.standard_price || 0;
    prodDescInput.value = prod.description || '';
    
    productDialog.showModal();
  }

  // 3. Confirm & Handle Delete Product
  async function confirmDeleteProduct(id) {
    const prod = cache.products.find(p => p.id === id);
    if (!prod) return;
    
    if (confirm(`Bạn có chắc chắn muốn xóa sản phẩm "${prod.name}" (${prod.default_code || 'Không có SKU'}) khỏi Odoo không?`)) {
      if (String(id).startsWith('temp_')) {
        // Remove locally
        cache.tempProducts = cache.tempProducts.filter(p => p.id !== id);
        cache.products = cache.products.filter(p => p.id !== id);
        if (typeof cachedRawProducts !== 'undefined' && Array.isArray(cachedRawProducts)) {
          cachedRawProducts = cachedRawProducts.filter(p => p.id !== id);
        }
        showToast('Đã xóa sản phẩm tạm thời', 'success');
        renderProducts(cache.products);
        return;
      }
      try {
        showToast('Đang thực hiện xóa sản phẩm...', 'info');
        const response = await fetch(`/api/odoo/products/${id}`, {
          method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
          showToast('Đã xóa sản phẩm thành công', 'success');
          fetchProductsData(); // Reload table
        } else {
          showToast(`Lỗi khi xóa: ${data.error}`, 'danger');
        }
      } catch (err) {
        showToast(`Lỗi kết nối: ${err.message}`, 'danger');
      }
    }
  }

  // 4. Save Product (Form Submit - handles both Create and Update)
  formProduct.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = prodIdInput.value;
    const isEdit = !!id;
    
    const payload = {
      name: prodNameInput.value.trim(),
      default_code: prodCodeInput.value.trim(),
      type: normalizeProductTypeForOdoo(prodTypeInput.value),
      list_price: Number(prodPriceInput.value),
      standard_price: Number(prodCostInput.value),
      description: prodDescInput.value.trim()
    };
    
    const prodQtyGroup = document.getElementById('prodQtyGroup');
    const isPOFlow = prodQtyGroup && prodQtyGroup.style.display !== 'none';
    
    const isTempEdit = isEdit && String(id).startsWith('temp_');
    
    if (isTempEdit) {
      // Find the temporary product and update fields
      const tempProduct = findDraftPOProduct(id) || cache.tempProducts.find(p => p.id === id);
      if (tempProduct) {
        tempProduct.name = payload.name;
        tempProduct.default_code = payload.default_code || generateSKUFromName(payload.name);
        tempProduct.type = payload.type || 'consu';
        tempProduct.list_price = payload.list_price || 0;
        tempProduct.standard_price = payload.standard_price || 0;
        tempProduct.description = payload.description;
      }
      
      // Update cache.products and cachedRawProducts
      const pIndex = cache.products.findIndex(p => p.id === id);
      if (pIndex !== -1) {
        cache.products[pIndex] = { ...cache.products[pIndex], ...payload };
      }
      
      if (typeof cachedRawProducts !== 'undefined' && Array.isArray(cachedRawProducts)) {
        const rawIndex = cachedRawProducts.findIndex(p => p.id === id);
        if (rawIndex !== -1) {
          cachedRawProducts[rawIndex] = { ...cachedRawProducts[rawIndex], ...payload };
        }
      }

      // Also update any matching item in currentPOLines if it exists
      currentPOLines.forEach(line => {
        if (line.product_id === id) {
          line.product_name = payload.name;
          line.price_unit = payload.standard_price || 0;
        }
      });
      renderPOLines();

      productDialog.close();
      showToast('Đã cập nhật thông tin sản phẩm tạm thời.', 'success');
      
      // Update product dropdown list if applicable
      const vendorId = document.getElementById('poVendor')?.value;
      if (vendorId) {
        try {
          const suggestedRes = await fetch(`/api/odoo/partners/${vendorId}/purchased-products`);
          if (suggestedRes.ok) {
            const suggestedIds = await suggestedRes.json();
            populatePOProducts(cachedRawProducts, suggestedIds);
          } else {
            populatePOProducts(cachedRawProducts, []);
          }
        } catch(e) {
          populatePOProducts(cachedRawProducts, []);
        }
      } else {
        populatePOProducts(cachedRawProducts, []);
      }
      
      if (!isPOFlow) renderProducts(cache.products);
      return;
    }
    
    if (!isEdit) {
      // Create new temporary product
      const tempId = `temp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const tempProduct = {
        id: tempId,
        name: payload.name,
        default_code: payload.default_code || generateSKUFromName(payload.name),
        type: payload.type || 'consu',
        list_price: payload.list_price || 0,
        standard_price: payload.standard_price || 0,
        description: payload.description,
        isTemp: true,
        write_date: new Date().toISOString()
      };

      // If in PO flow, automatically add to currentPOLines
      if (isPOFlow) {
        const qtyVal = Number(document.getElementById('prodQty')?.value) || 100;
        const priceVal = payload.standard_price || 0;
        draftPOProducts.unshift(tempProduct);
        if (typeof cachedRawProducts !== 'undefined' && Array.isArray(cachedRawProducts)) {
          cachedRawProducts.unshift(tempProduct);
        }
        
        const existing = currentPOLines.find(line => line.product_id === tempId);
        if (existing) {
          existing.product_qty += qtyVal;
        } else {
          currentPOLines.push({
            product_id: tempId,
            product_name: payload.name,
            product_qty: qtyVal,
            price_unit: priceVal,
            isTemp: true
          });
        }

        // Update dropdowns/selection
        const poProductSelect = document.getElementById('poProduct');
        if (poProductSelect) {
          const opt = new Option(payload.name, tempId);
          poProductSelect.add(opt);
          poProductSelect.value = tempId;
          poProductSelect.dispatchEvent(new Event('change'));
        }

        renderPOLines();
        productDialog.close();
        showToast('Đã thêm nguyên liệu tạm thời vào đơn hàng (chưa lưu Odoo).', 'info');
      } else {
        cache.tempProducts.unshift(tempProduct);
        cache.products.unshift(tempProduct);
        productDialog.close();
        showToast('Đã tạo sản phẩm tạm thời (sẽ lưu khi tạo đơn nhập hàng).', 'success');
      }
      
      if (!isPOFlow) renderProducts(cache.products);
      return;
    }

    // Otherwise, we are editing a real Odoo product
    try {
      showToast('Đang cập nhật sản phẩm...', 'info');
      const url = `/api/odoo/products/${id}`;
      const method = 'PUT';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      
      if (data.success) {
        showToast('Đã cập nhật sản phẩm thành công', 'success');
        productDialog.close();
        
        // Reload products list everywhere
        const prodRes = await fetch('/api/odoo/products');
        if (prodRes.ok) {
          const products = await prodRes.json();
          cache.products = [...cache.tempProducts, ...products];
          cachedRawProducts = [...cache.tempProducts, ...products];
          
          const tbodyProducts = document.getElementById('tbodyProducts');
          if (tbodyProducts) renderProducts(cache.products);
          
          const vendorId = document.getElementById('poVendor')?.value;
          if (vendorId) {
            try {
              const histRes = await fetch(`/api/odoo/partners/${vendorId}/purchased-products`);
              if (histRes.ok) {
                const suggestedIds = await histRes.json();
                populatePOProducts(cachedRawProducts, suggestedIds);
              }
            } catch (err) {
              populatePOProducts(cachedRawProducts, []);
            }
          } else {
            populatePOProducts(cachedRawProducts, []);
          }
        }
      } else {
        showToast(`Lỗi: ${data.error}`, 'danger');
      }
    } catch (err) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    }
  });

  // 5. Cancel button
  btnCancelProduct.addEventListener('click', () => {
    productDialog.close();
  });

  // 6. Coordinates click fallback for productDialog (Safari, older engines)
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    productDialog.addEventListener('click', (event) => {
      if (event.target !== productDialog) return;
      const rect = productDialog.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (!isDialogContent) {
        productDialog.close();
      }
    });
  }

  // --- Partner Dialog & Create Operations ---
  const partnerDialog = document.getElementById('partnerDialog');
  const formPartner = document.getElementById('formPartner');
  const partnerTypeInput = document.getElementById('partnerType');
  const partnerNameInput = document.getElementById('partnerName');
  const partnerStreetInput = document.getElementById('partnerStreet');
  const partnerPhoneInput = document.getElementById('partnerPhone');
  const btnCancelPartner = document.getElementById('btnCancelPartner');
  
  const btnCreateVendorPO = document.getElementById('btnCreateVendorPO');
  if (btnCreateVendorPO) {
    btnCreateVendorPO.addEventListener('click', () => {
      document.getElementById('partnerDialogTitle').textContent = 'Thêm Nhà Cung Cấp Mới';
      partnerTypeInput.value = 'vendor';
      partnerNameInput.value = '';
      partnerStreetInput.value = '';
      partnerPhoneInput.value = '';
      partnerDialog.showModal();
    });
  }

  const btnCreateCustomerSales = document.getElementById('btnCreateCustomerSales');
  if (btnCreateCustomerSales) {
    btnCreateCustomerSales.addEventListener('click', () => {
      document.getElementById('partnerDialogTitle').textContent = 'Thêm Khách Hàng Mới';
      partnerTypeInput.value = 'customer';
      partnerNameInput.value = '';
      partnerStreetInput.value = '';
      partnerPhoneInput.value = '';
      partnerDialog.showModal();
    });
  }

  if (btnCancelPartner) {
    btnCancelPartner.addEventListener('click', () => {
      partnerDialog.close();
    });
  }

  // Coordinates click fallback for partnerDialog (Safari, older engines)
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    partnerDialog.addEventListener('click', (event) => {
      if (event.target !== partnerDialog) return;
      const rect = partnerDialog.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (!isDialogContent) {
        partnerDialog.close();
      }
    });
  }

  if (formPartner) {
    formPartner.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const payload = {
        name: partnerNameInput.value.trim(),
        street: partnerStreetInput.value.trim(),
        phone: partnerPhoneInput.value.trim(),
        type: partnerTypeInput.value
      };
      
      try {
        showToast('Đang tạo đối tác mới...', 'info');
        const response = await fetch('/api/odoo/partners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        if (data.success) {
          showToast(payload.type === 'vendor' ? 'Thêm nhà cung cấp thành công' : 'Thêm khách hàng thành công', 'success');
          partnerDialog.close();
          
          if (payload.type === 'vendor') {
            // Re-populate vendor dropdown
            const vendorRes = await fetch('/api/odoo/partners?type=vendor');
            if (vendorRes.ok) {
              const vendors = await vendorRes.json();
              const poVendorSelect = document.getElementById('poVendor');
              if (poVendorSelect) {
                poVendorSelect.innerHTML = '<option value="">-- Chọn Nhà Cung Cấp --</option>';
                 vendors.forEach(v => {
                   const opt = document.createElement('option');
                   opt.value = v.id;
                   let text = v.name;
                   if (v.street) text += ` - ${v.street}`;
                   if (v.phone) text += ` - ${v.phone}`;
                   opt.textContent = text;
                   poVendorSelect.appendChild(opt);
                 });
                // Auto-select the newly created vendor
                poVendorSelect.value = data.id;
                // Trigger change event to load empty products list
                poVendorSelect.dispatchEvent(new Event('change'));
              }
            }
            // Update vendors list table if we are on the orders tab
            fetchVendorsData();
          } else if (payload.type === 'customer') {
            // Re-populate customer dropdown
            const custRes = await fetch('/api/odoo/partners?type=customer');
            if (custRes.ok) {
              const customers = await custRes.json();
              const salesCustomerSelect = document.getElementById('salesCustomer');
              if (salesCustomerSelect) {
                salesCustomerSelect.innerHTML = '<option value="">-- Chọn Khách Hàng --</option>';
                customers.forEach(c => {
                  const opt = document.createElement('option');
                  opt.value = c.id;
                  opt.textContent = c.name;
                  salesCustomerSelect.appendChild(opt);
                });
                // Auto-select the newly created customer
                salesCustomerSelect.value = data.id;
              }
            }
            // Update customer list table if we are on the customers tab
            fetchCustomersData();
          }
        } else {
          showToast(`Lỗi: ${data.error}`, 'danger');
        }
      } catch (err) {
        showToast(`Lỗi kết nối: ${err.message}`, 'danger');
      }
    });
  }

  // --- PO, Production, Sales and Invoices Workflow Helpers ---

  let currentPOLines = [];
  let draftPOProducts = [];

  function findDraftPOProduct(id) {
    return draftPOProducts.find(p => p.id === id);
  }

  function removeDraftPOProductIfUnused(id) {
    const stillUsed = currentPOLines.some(line => line.product_id === id);
    if (!stillUsed) {
      draftPOProducts = draftPOProducts.filter(p => p.id !== id);
      if (typeof cachedRawProducts !== 'undefined' && Array.isArray(cachedRawProducts)) {
        cachedRawProducts = cachedRawProducts.filter(p => p.id !== id);
      }
    }
  }

  function renderPOLines() {
    const tbody = document.getElementById('tbodyPOLines');
    const lblTotal = document.getElementById('lblPOTotal');
    if (!tbody || !lblTotal) return;

    if (currentPOLines.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding: 12px;">Chưa có dòng nào được thêm. Vui lòng chọn sản phẩm ở trên rồi nhấn "Thêm Dòng".</td></tr>';
      lblTotal.textContent = '0 đ';
      return;
    }

    let grandTotal = 0;
    tbody.innerHTML = currentPOLines.map((line, idx) => {
      const lineTotal = line.product_qty * line.price_unit;
      grandTotal += lineTotal;
      return `
        <tr style="border-bottom: 1px solid rgba(0, 0, 0, 0.05);">
          <td style="padding: 8px 6px;"><strong>${line.product_name}</strong></td>
          <td style="padding: 8px 6px; text-align: right; width: 100px;">
            <input type="number" class="form-input txt-po-line-qty" data-index="${idx}" min="1" value="${line.product_qty}" style="padding: 4px 8px; font-size: 0.85rem; width: 80px; text-align: right; margin: 0; display: inline-block;">
          </td>
          <td style="padding: 8px 6px; text-align: right;">${Number(line.price_unit).toLocaleString()} đ</td>
          <td style="padding: 8px 6px; text-align: right;"><strong>${lineTotal.toLocaleString()} đ</strong></td>
          <td style="padding: 8px 6px; text-align: center;">
            <button type="button" class="btn btn-sm btn-accent btn-remove-po-line" data-index="${idx}" style="padding: 2px 6px; font-size: 0.75rem; color: var(--accent-danger); background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); margin: 0;">Xóa</b    btnAddPOLine.addEventListener('click', () => {
      const prodSelect = document.getElementById('poProduct');
      const qtyInput = document.getElementById('poQty');
      const priceInput = document.getElementById('poPrice');
      
      const productId = prodSelect.value;
      const qty = Number(qtyInput.value);
      
      if (!productId || qty <= 0) {
        showToast('Vui lòng chọn sản phẩm và nhập số lượng hợp lệ', 'warning');
        return;
      }
      
      const selectedOption = prodSelect.options[prodSelect.selectedIndex];
      const productName = selectedOption.textContent;
      
      // Look up unit price directly from standard_price of product template
      const lookupId = String(productId).startsWith('temp_') ? productId : Number(productId);
      const product = findDraftPOProduct(lookupId) || cache.products.find(p => p.id === lookupId);
      const price = product ? (product.standard_price || 0) : 0;
      
      const existing = currentPOLines.find(line => line.product_id === lookupId);
      if (existing) {
        existing.product_qty += qty;
      } else {
        currentPOLines.push({
          product_id: lookupId,
          product_name: product ? product.name : productName,
          product_qty: qty,
          price_unit: price
        });
      }
      
      qtyInput.value = 100;
      if (priceInput) priceInput.value = 0;
      prodSelect.value = '';
      
      renderPOLines();
      showToast('Đã thêm dòng sản phẩm', 'success');
    });
  // Bind Add PO line button click
  const btnAddPOLine = document.getElementById('btnAddPOLine');
  if (btnAddPOLine) {
    btnAddPOLine.addEventListener('click', () => {
      const prodSelect = document.getElementById('poProduct');
      const qtyInput = document.getElementById('poQty');
      const priceInput = document.getElementById('poPrice');
      
      const productId = prodSelect.value;
      const qty = Number(qtyInput.value);
      
      if (!productId || qty <= 0) {
        showToast('Vui lòng chọn sản phẩm và nhập số lượng hợp lệ', 'warning');
        return;
      }
      
      const selectedOption = prodSelect.options[prodSelect.selectedIndex];
      const productName = selectedOption.textContent;
      
      // Look up unit price directly from standard_price of product template
      const lookupId = String(productId).startsWith('temp_') ? productId : Number(productId);
      const product = findDraftPOProduct(lookupId) || cache.products.find(p => p.id === lookupId);
      const price = product ? (product.standard_price || 0) : 0;
      
      const existing = currentPOLines.find(line => line.product_id === lookupId);
      if (existing) {
        existing.product_qty += qty;
      } else {
        currentPOLines.push({
          product_id: lookupId,
          product_name: product ? product.name : productName,
          product_qty: qty,
          price_unit: price
        });
      }
      
      qtyInput.value = 100;
      if (priceInput) priceInput.value = 0;
      prodSelect.value = '';
      
      renderPOLines();
      showToast('Đã thêm dòng sản phẩm', 'success');
    });
  }

  let cachedRawProducts = [];

  function populatePOProducts(products, suggestedIds = []) {
    const poProductSelect = document.getElementById('poProduct');
    if (!poProductSelect) return;
    
    poProductSelect.innerHTML = '<option value="">-- Chọn Nguyên Liệu --</option>';
    
    const vendorId = document.getElementById('poVendor').value;

    if (vendorId) {
      // Filter products that can be purchased
      const purchasableProducts = products.filter(p => p.purchase_ok || String(p.id).startsWith('temp_'));
      
      const sortedProducts = [...purchasableProducts].sort((a, b) => {
        const aSuggested = suggestedIds.includes(a.id) || String(a.id).startsWith('temp_');
        const bSuggested = suggestedIds.includes(b.id) || String(b.id).startsWith('temp_');
        if (aSuggested !== bSuggested) return aSuggested ? -1 : 1;
        return String(a.name || '').localeCompare(String(b.name || ''), 'vi', { sensitivity: 'base' });
      });

      sortedProducts.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        const isTempBadge = String(p.id).startsWith('temp_') ? ' [Tạm thời]' : '';
        const suggestedBadge = suggestedIds.includes(p.id) ? ' [Đã từng mua]' : '';
        // opt.textContent = ...
        poProductSelect.appendChild(opt);
      });
    } else {
      poProductSelect.innerHTML = '<option value="">-- Vui lòng chọn nhà cung cấp trước --</option>';
    }
  }

  // Bind poVendor change to dynamically re-populate products list based on purchase history
  const poVendorSelect = document.getElementById('poVendor');
  if (poVendorSelect) {
    poVendorSelect.addEventListener('change', async () => {
      const vendorId = poVendorSelect.value;
      const poProductSelect = document.getElementById('poProduct');
      if (!poProductSelect) return;
      
      poProductSelect.innerHTML = '<option value="">-- Đang tải gợi ý... --</option>';
      
      if (!vendorId) {
        populatePOProducts(cachedRawProducts, []);
        return;
      }
      
      try {
        const response = await fetch(`/api/odoo/partners/${vendorId}/purchased-products`);
        if (response.ok) {
          const suggestedIds = await response.json();
          populatePOProducts(cachedRawProducts, suggestedIds);
        } else {
          populatePOProducts(cachedRawProducts, []);
        }
      } catch (err) {
        console.error('Error fetching vendor purchase history:', err);
        populatePOProducts(cachedRawProducts, []);
      }
    });
  }

  // 1. Populate Dropdowns
  async function loadPOFormSelects() {
    currentPOLines = [];
    draftPOProducts = [];
    renderPOLines();
    
    const poVendorSelect = document.getElementById('poVendor');
    const poProductSelect = document.getElementById('poProduct');
    if (!poVendorSelect || !poProductSelect) return;

    poVendorSelect.innerHTML = '<option value="">-- Chọn Nhà Cung Cấp --</option>';
    poProductSelect.innerHTML = '<option value="">-- Chọn Nguyên Liệu --</option>';

    try {
      const vendorRes = await fetch('/api/odoo/partners?type=vendor');
      if (vendorRes.ok) {
        const vendors = await vendorRes.json();
        vendors.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v.id;
          let text = v.name;
          if (v.street) text += ` - ${v.street}`;
          if (v.phone) text += ` - ${v.phone}`;
          opt.textContent = text;
          poVendorSelect.appendChild(opt);
        });
      }

      const prodRes = await fetch('/api/odoo/products');
      if (prodRes.ok) {
        const products = await prodRes.json();
        cache.products = [...cache.tempProducts, ...products];
        cachedRawProducts = [...cache.tempProducts, ...products];
        populatePOProducts(cachedRawProducts, []);
      }
    } catch (e) {
      console.error('Error loading PO selects:', e);
      showToast('Lỗi khi tải dữ liệu cho form PO', 'danger');
    }
  }

  async function loadProductionFormSelects() {
    const prodSelectYield = document.getElementById('prodSelectYield');
    if (!prodSelectYield) return;

    prodSelectYield.innerHTML = '<option value="">-- Chọn Thành Phẩm --</option>';

    try {
      const prodRes = await fetch('/api/odoo/products');
      if (prodRes.ok) {
        const products = await prodRes.json();
        cache.products = [...cache.tempProducts, ...products];
        products.forEach(p => {
          // Lọc Thành phẩm tự làm hoặc Hàng mua đi bán lại (Có thể bán)
          if (!p.sale_ok) return;
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `[${p.default_code || 'Không SKU'}] ${p.name}`;
          prodSelectYield.appendChild(opt);
        });
      }
    } catch (e) {
      console.error('Error loading Production selects:', e);
      showToast('Lỗi khi tải danh sách thành phẩm', 'danger');
    }
  }

  let currentBomData = null;

  async function loadProductionBomPreview(productId) {
    const tbody = document.getElementById('tbodyProductionBomPreview');
    if (!tbody) return;
    
    currentBomData = null;

    if (!productId) {
      renderProductionBomPreview();
      return;
    }

    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Đang tải định mức BOM...</td></tr>';
    try {
      const response = await fetch(`/api/odoo/production-bom/${productId}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Could not load BOM');
      }
      currentBomData = data;
      renderProductionBomPreview();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">${e.message}</td></tr>`;
    }
  }

  function renderProductionBomPreview() {
    const tbody = document.getElementById('tbodyProductionBomPreview');
    const qtyInput = document.getElementById('prodQtyYield');
    if (!tbody || !qtyInput) return;
    
    const yieldQty = Number(qtyInput.value) || 1;
    const data = currentBomData;

    if (!data || !Array.isArray(data.lines) || !data.lines.length) {
      const message = data && data.source === 'missing_bom'
        ? 'Sản phẩm này chưa có BOM/định mức nguyên liệu.'
        : 'Chọn thành phẩm để xem định mức nguyên liệu.';
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">${message}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.lines.map((line, idx) => {
      const theoreticalQty = line.qtyPerUnit * yieldQty;
      if (line.actualQty === undefined) line.actualQty = theoreticalQty;
      
      const diff = Math.abs(line.actualQty - theoreticalQty);
      const isWarn = diff > (theoreticalQty * 0.05);
      const badgeHtml = isWarn 
        ? '<span class="badge text-warning" style="background: rgba(234, 179, 8, 0.2); color: #ca8a04;">Lệch > 5%</span>' 
        : '<span class="badge text-success" style="background: rgba(34, 197, 94, 0.2); color: #16a34a;">Hợp lệ</span>';
      
      return `
      <tr>
        <td>${line.code || ''}</td>
        <td>${line.name || ''}</td>
        <td style="text-align: right;"><strong>${theoreticalQty.toLocaleString('en-US', {maximumFractionDigits:2})}</strong></td>
        <td style="text-align: right;">
          <input type="number" class="form-input txt-bom-actual-qty" data-index="${idx}" min="0" step="any" value="${line.actualQty}" style="width: 100px; padding: 4px 8px; text-align: right; font-size: 0.85rem; margin: 0; display: inline-block;">
        </td>
        <td style="text-align: center;">${badgeHtml}</td>
      </tr>
      `;
    }).join('');

    document.querySelectorAll('.txt-bom-actual-qty').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = Number(e.target.getAttribute('data-index'));
        currentBomData.lines[idx].actualQty = Number(e.target.value);
        renderProductionBomPreview();
        // Set focus back
        const newInputs = document.querySelectorAll('.txt-bom-actual-qty');
        if (newInputs[idx]) {
           newInputs[idx].focus();
        }
      });
    });
  }

  async function loadSalesFormSelects() {
    currentSOLines = [];
    renderSOLines();
    
    const salesCustomerSelect = document.getElementById('salesCustomer');
    const salesProductSelect = document.getElementById('salesProduct');
    if (!salesCustomerSelect || !salesProductSelect) return;

    salesCustomerSelect.innerHTML = '<option value="">-- Chọn Khách Hàng --</option>';
    salesProductSelect.innerHTML = '<option value="">-- Chọn Sản Phẩm --</option>';

    try {
      const custRes = await fetch('/api/odoo/partners?type=customer');
      if (custRes.ok) {
        const customers = await custRes.json();
        customers.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.name;
          salesCustomerSelect.appendChild(opt);
        });
      }

      const prodRes = await fetch('/api/odoo/products');
      if (prodRes.ok) {
        const products = await prodRes.json();
        cache.products = [...cache.tempProducts, ...products];
        products.forEach(p => {
          if (!p.sale_ok) return;
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `[${p.default_code || 'Không SKU'}] ${p.name}`;
          salesProductSelect.appendChild(opt);
        });
      }
    } catch (e) {
      console.error('Error loading Sales selects:', e);
      showToast('Lỗi khi tải dữ liệu cho form bán hàng', 'danger');
    }
  }

  // 2. Transaction Helpers
  async function validateReceipt(id) {
    try {
      showToast('Đang duyệt nhập kho...', 'info');
      const response = await fetch(`/api/odoo/receipts/${id}/validate`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        showToast('Duyệt nhập kho thành công', 'success');
        fetchReceiptsData();
        fetchSummaryMetrics();
      } else {
        showToast(`Lỗi duyệt: ${data.error}`, 'danger');
      }
    } catch (err) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    }
  }

  async function postInvoice(id) {
    try {
      showToast('Đang ghi sổ hóa đơn...', 'info');
      const response = await fetch(`/api/odoo/invoices/${id}/post`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        showToast('Ghi sổ hóa đơn thành công', 'success');
        fetchInvoicesData();
        fetchSummaryMetrics();
      } else {
        showToast(`Lỗi ghi sổ: ${data.error}`, 'danger');
      }
    } catch (err) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    }
  }

  // --- Payment Dialog Logic ---
  const paymentDialog = document.getElementById('paymentDialog');
  const formPayment = document.getElementById('formPayment');
  const payStatusSelect = document.getElementById('payStatus');
  const payAmountGroup = document.getElementById('payAmountGroup');
  
  if (payStatusSelect && payAmountGroup) {
    payStatusSelect.addEventListener('change', (e) => {
      if (e.target.value === 'partial') {
        payAmountGroup.style.display = 'block';
      } else {
        payAmountGroup.style.display = 'none';
      }
    });
  }

  const btnCancelPayment = document.getElementById('btnCancelPayment');
  if (btnCancelPayment && paymentDialog) {
    btnCancelPayment.addEventListener('click', () => {
      paymentDialog.close();
    });
  }

  if (formPayment) {
    formPayment.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = Number(document.getElementById('payInvoiceId').value);
      const status = document.getElementById('payStatus').value;
      const amount = Number(document.getElementById('payAmount').value) || 0;
      const paymentRef = document.getElementById('payRef').value.trim();
      const ref = document.getElementById('payInvoiceGTGT').value.trim();
      
      try {
        showToast('Đang cập nhật thanh toán & HĐ GTGT...', 'info');
        const response = await fetch(`/api/odoo/invoices/${id}/register-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_state: status,
            payment_amount: amount,
            payment_ref: paymentRef,
            ref: ref
          })
        });
        const data = await response.json();
        if (data.success) {
          showToast('Cập nhật hóa đơn thành công', 'success');
          if (paymentDialog) paymentDialog.close();
          fetchInvoicesData();
          fetchSummaryMetrics();
        } else {
          showToast(`Lỗi cập nhật: ${data.error}`, 'danger');
        }
      } catch (err) {
        showToast(`Lỗi kết nối: ${err.message}`, 'danger');
      }
    });
  }

  async function deleteInvoice(id) {
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
        fetchInvoicesData();
        fetchSOData();
        fetchSummaryMetrics();
      } else {
        showToast(`Lỗi xóa hóa đơn: ${data.error}`, 'danger');
      }
    } catch (err) {
      showToast(`Lỗi kết nối: ${err.message}`, 'danger');
    }
  }

  // 3. Sales Orders List & Rendering
  async function fetchSOData() {
    const tbody = document.getElementById('tbodySOs');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Đang tải danh sách đơn hàng...</td></tr>';
    
    try {
      const response = await fetch('/api/odoo/so');
      if (!response.ok) throw new Error('Failed to fetch SOs');
      const data = await response.json();
      renderSOs(data);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Lỗi: ${e.message}</td></tr>`;
    }
  }

  function renderSOs(orders) {
    const tbody = document.getElementById('tbodySOs');
    if (!tbody) return;
    
    if (!orders.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">Không tìm thấy đơn bán hàng nào.</td></tr>';
      return;
    }
    
    tbody.innerHTML = orders.map(o => {
      const total = o.amount_total ? Number(o.amount_total).toLocaleString() + ' đ' : '0 đ';
      const stateLabel = o.state === 'sale' ? 'Đơn bán hàng' : o.state === 'done' ? 'Hoàn tất' : o.state === 'draft' ? 'Báo giá' : o.state || 'N/A';
      const invoiceLinks = o.invoice_ids && o.invoice_ids.length
        ? o.invoice_ids.map(id => `<a href="/api/odoo/invoices/${id}/pdf?access_token=${encodeURIComponent(getAuthToken())}" target="_blank" class="pdf-link" style="color: var(--accent-secondary); text-decoration: underline; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">📄 Tải PDF (#${id})</a>`).join('<br>')
        : `<a href="/api/odoo/so/${o.id}/invoice-pdf?access_token=${encodeURIComponent(getAuthToken())}" target="_blank" class="pdf-link btn-create-invoice-pdf" data-so-id="${o.id}" style="color: var(--accent-secondary); text-decoration: underline; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">➕ Tạo & Tải PDF</a>`;
      return `
        <tr>
          <td><strong>${o.name || '-'}</strong></td>
          <td>${o.partner || 'N/A'}</td>
          <td><strong>${total}</strong></td>
          <td><span class="badge ${o.state === 'sale' ? 'text-success' : 'text-warning'}">${stateLabel}</span></td>
          <td>${invoiceLinks}</td>
        </tr>
      `;
    }).join('');
  }

  const btnRefreshSOs = document.getElementById('btnRefreshSOs');
  if (btnRefreshSOs) {
    btnRefreshSOs.addEventListener('click', fetchSOData);
  }

  // Auto-refresh the sales orders table when user generates a PDF on the fly
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.btn-create-invoice-pdf');
    if (link) {
      setTimeout(() => {
        fetchSOData();
      }, 4000);
    }
  });

  // 4. Production History Caching & Rendering
  function getLocalProductionHistory() {
    try {
      const stored = localStorage.getItem('production_history');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error(e);
    }
    return [];
  }

  function saveProductionHistory(item) {
    let history = getLocalProductionHistory();
    history.unshift(item);
    if (history.length > 50) history = history.slice(0, 50);
    localStorage.setItem('production_history', JSON.stringify(history));
  }

  async function renderProductionHistory() {
    const tbody = document.getElementById('tbodyProductionHistory');
    if (!tbody) return;
    
    let history = [];
    try {
      const response = await fetch('/api/odoo/production-log');
      if (response.ok) {
        history = await response.json();
      }
    } catch (e) {
      console.error(e);
    }

    if (!history.length) {
      history = getLocalProductionHistory();
    }
    
    if (!history.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Chưa có lịch sử sản xuất trong phiên này.</td></tr>';
      return;
    }
    
    tbody.innerHTML = history.map((h, index) => {
      const deductedText = h.deducted && h.deducted.length 
        ? h.deducted.map(d => `${d.name} (-${d.deducted} chiếc, còn ${d.remaining})`).join('<br>') 
        : 'Không khấu hao';
      const statusBadgeClass = h.status === 'canceled' ? 'text-danger' : 'text-success';
      const statusTextVi = h.status === 'canceled' ? 'Đã hủy' : 'Hoàn thành';
      const cancelBtn = h.status === 'canceled' ? '' : `<button type="button" class="btn btn-sm btn-cancel-production" data-index="${index}" style="margin-left: 8px; padding: 2px 6px; font-size: 0.75rem; color: var(--accent-danger); background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2);">Hủy</button>`;
      
      return `
        <tr class="${h.status === 'canceled' ? 'opacity-50' : ''}">
          <td>${h.timestamp}</td>
          <td><strong>${h.productName}</strong></td>
          <td><strong class="${h.status === 'canceled' ? 'text-muted text-decoration-line-through' : 'text-success'}">+${h.qty}</strong></td>
          <td><small>${deductedText}</small></td>
          <td><span class="badge ${statusBadgeClass}">${statusTextVi}</span>${cancelBtn}</td>
        </tr>
      `;
    }).join('');

    // Bind cancel buttons
    document.querySelectorAll('.btn-cancel-production').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = e.target.getAttribute('data-index');
        if (!confirm('Bạn có chắc muốn hủy phiếu sản xuất này? Tồn kho thành phẩm sẽ bị trừ đi và nguyên liệu sẽ được cộng lại.')) return;
        
        try {
          showToast('Đang hủy phiếu sản xuất...', 'info');
          const res = await fetch(`/api/odoo/production/${idx}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            showToast('Đã hủy phiếu sản xuất thành công!', 'success');
            renderProductionHistory();
            fetchSummaryMetrics();
          } else {
            showToast(`Lỗi hủy phiếu: ${data.error}`, 'danger');
          }
        } catch (err) {
          showToast(`Lỗi hệ thống: ${err.message}`, 'danger');
        }
      });
    });
  }

  // 5. Form Submissions Event Listeners
  const formPO = document.getElementById('formPO');
  if (formPO) {
    formPO.addEventListener('submit', async (e) => {
      e.preventDefault();
      const vendorId = document.getElementById('poVendor').value;
      
      if (!vendorId) {
        showToast('Vui lòng chọn Nhà cung cấp', 'warning');
        return;
      }
      
      if (currentPOLines.length === 0) {
        showToast('Vui lòng thêm ít nhất một dòng nguyên liệu sản phẩm', 'warning');
        return;
      }

      // Rollback helper for newly created products
      async function rollbackCreatedProducts(productMap) {
        if (!productMap || productMap.length === 0) return;
        showToast(`Đang dọn dẹp ${productMap.length} nguyên liệu đã sinh ra từ database...`, 'warning');
        for (const item of productMap) {
          try {
            await fetch(`/api/odoo/products/${item.odooId}`, { method: 'DELETE' });
            console.log(`Rollback: Deleted product ID ${item.odooId}`);
          } catch (deleteErr) {
            console.error(`Rollback failed for product ID ${item.odooId}:`, deleteErr);
          }
          // Restore IDs to their temporary form in current lines and cache
          currentPOLines.forEach(line => {
            if (line.product_id === item.odooId) {
              line.product_id = item.tempId;
            }
          });
          const cachedProduct = cache.products.find(p => p.id === item.odooId);
          if (cachedProduct) {
            cachedProduct.id = item.tempId;
            cachedProduct.isTemp = true;
          }
          const draftProduct = draftPOProducts.find(p => p.id === item.odooId);
          if (draftProduct) {
            draftProduct.id = item.tempId;
            draftProduct.isTemp = true;
          }
        }
        fetchProductsData();
      }

      // Check if there are any temporary products
      const tempLines = currentPOLines.filter(line => String(line.product_id).startsWith('temp_'));
      if (tempLines.length > 0) {
        const tempNames = tempLines.map(line => `- ${line.product_name}`).join('\n');
        const confirmCreate = confirm(`Đơn hàng của bạn có chứa các nguyên liệu mới chưa được xác nhận tạo trong hệ thống:\n\n${tempNames}\n\nBạn có chắc chắn muốn tạo các nguyên liệu mới này trong database Odoo không?`);
        if (!confirmCreate) {
          showToast('Hủy tạo đơn hàng do không xác nhận tạo nguyên liệu mới.', 'warning');
          return;
        }
      }
      
      const createdProductMap = [];
      // Resolve any temporary products first before creating the PO
      try {
        for (const line of currentPOLines) {
          if (String(line.product_id).startsWith('temp_')) {
            showToast(`Đang lưu nguyên liệu "${line.product_name}" vào Odoo...`, 'info');
            const tempProduct = findDraftPOProduct(line.product_id) || cache.products.find(p => p.id === line.product_id);
            if (tempProduct) {
              const prodResponse = await fetch('/api/odoo/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: tempProduct.name,
                  default_code: tempProduct.default_code,
                  type: tempProduct.type,
                  list_price: tempProduct.list_price,
                  standard_price: tempProduct.standard_price,
                  description: tempProduct.description
                })
              });
              const prodData = await prodResponse.json();
              if (prodData.success) {
                const newId = Number(prodData.id);
                createdProductMap.push({ tempId: line.product_id, odooId: newId });
                line.product_id = newId;
                tempProduct.id = newId;
                tempProduct.isTemp = false;
              } else {
                showToast(`Không thể tạo nguyên liệu "${tempProduct.name}" trên Odoo: ${prodData.error}`, 'danger');
                await rollbackCreatedProducts(createdProductMap);
                return;
              }
            }
          }
        }
      } catch (err) {
        showToast(`Lỗi chuẩn bị nguyên liệu: ${err.message}`, 'danger');
        await rollbackCreatedProducts(createdProductMap);
        return;
      }

      const poDateInput = document.getElementById('poDate');
      const payload = {
        partner_id: Number(vendorId),
        date_order: poDateInput && poDateInput.value ? new Date(poDateInput.value).toISOString().replace('T', ' ').substring(0, 19) : undefined,
        order_line: currentPOLines.map(line => ({
          product_id: line.product_id,
          product_qty: line.product_qty,
          price_unit: line.price_unit
        }))
      };
      
      const btnSubmit = formPO.querySelector('button[type="submit"]');
      if (btnSubmit) {
         btnSubmit.disabled = true;
         btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Đang xử lý...';
      }

      try {
        showToast('Đang tạo đơn mua hàng...', 'info');
        const response = await fetch('/api/odoo/purchase-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.success) {
          showToast(`Đã tạo PO thành công (ID: ${data.id})`, 'success');
          formPO.reset();
          currentPOLines = [];
          draftPOProducts = [];
          renderPOLines();
          // Filter out successfully saved temporary products
          cache.tempProducts = cache.tempProducts.filter(p => p.isTemp === true && String(p.id).startsWith('temp_'));
          fetchProductsData();
          fetchPOsData();
          fetchReceiptsData();
          fetchSummaryMetrics();
        } else {
          showToast(`Lỗi tạo đơn mua hàng: ${data.error}`, 'danger');
          await rollbackCreatedProducts(createdProductMap);
        }
      } catch (err) {
        showToast(`Lỗi kết nối: ${err.message}`, 'danger');
        await rollbackCreatedProducts(createdProductMap);
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = '<i class="bi bi-check-circle"></i> Xác nhận Tạo Đơn';
        }
      }
    });
  }

  const prodSelectYieldForBom = document.getElementById('prodSelectYield');
  if (prodSelectYieldForBom) {
    prodSelectYieldForBom.addEventListener('change', () => {
      loadProductionBomPreview(prodSelectYieldForBom.value);
    });
  }

  const prodQtyYieldForBom = document.getElementById('prodQtyYield');
  if (prodQtyYieldForBom) {
    prodQtyYieldForBom.addEventListener('input', () => {
       if (typeof renderProductionBomPreview === 'function') renderProductionBomPreview();
    });
  }

  const formProduction = document.getElementById('formProduction');
  if (formProduction) {
    formProduction.addEventListener('submit', async (e) => {
      e.preventDefault();
      const productId = document.getElementById('prodSelectYield').value;
      const qty = document.getElementById('prodQtyYield').value;
      
      if (!productId || !qty) {
        showToast('Vui lòng chọn sản phẩm và sản lượng', 'warning');
        return;
      }
      
      const payload = {
        product_id: Number(productId),
        yield_qty: Number(qty),
        actual_bom_lines: currentBomData && Array.isArray(currentBomData.lines) 
          ? currentBomData.lines.map(l => ({ product_id: l.productId, qty: l.actualQty }))
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
          
          // Save and render history
          const historyItem = data.productionLog || {
            timestamp: new Date().toLocaleString(),
            productName: data.productName,
            qty: qty,
            deducted: data.deducted || [],
            status: 'Hoàn thành'
          };
          saveProductionHistory(historyItem);
          
          formProduction.reset();
          renderProductionBomPreview(null);
          renderProductionHistory();
          fetchSummaryMetrics();
        } else {
          showToast(`Lỗi: ${data.error}`, 'danger');
        }
      } catch (err) {
        showToast(`Lỗi kết nối: ${err.message}`, 'danger');
      }
    });
  }

  let currentSOLines = [];

  function renderSOLines() {
    const tbody = document.getElementById('tbodySOLines');
    const lblTotal = document.getElementById('lblSOTotal');
    if (!tbody || !lblTotal) return;

    if (currentSOLines.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding: 12px;">Chưa có dòng nào được thêm. Vui lòng chọn sản phẩm ở trên rồi nhấn "Thêm Dòng".</td></tr>';
      lblTotal.textContent = '0 đ';
      return;
    }

    let grandTotal = 0;
    tbody.innerHTML = currentSOLines.map((line, idx) => {
      const lineTotal = line.product_qty * line.price_unit;
      grandTotal += lineTotal;
      return `
        <tr style="border-bottom: 1px solid rgba(0, 0, 0, 0.05);">
          <td style="padding: 8px 6px;"><strong>${line.product_name}</strong></td>
          <td style="padding: 8px 6px; text-align: right; width: 110px;">
            <input type="number" class="form-input txt-so-line-qty" data-index="${idx}" min="1" value="${line.product_qty}" style="padding: 4px 8px; font-size: 0.85rem; width: 80px; text-align: right; margin: 0; display: inline-block;">
          </td>
          <td style="padding: 8px 6px; text-align: right;">${Number(line.price_unit).toLocaleString()} đ</td>
          <td style="padding: 8px 6px; text-align: right;"><strong>${lineTotal.toLocaleString()} đ</strong></td>
          <td style="padding: 8px 6px; text-align: center;">
            <button type="button" class="btn btn-sm btn-accent btn-remove-so-line" data-index="${idx}" style="padding: 2px 6px; font-size: 0.75rem; color: var(--accent-danger); background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); margin: 0;">Xóa</button>
          </td>
        </tr>
      `;
    }).join('');

    lblTotal.textContent = grandTotal.toLocaleString() + ' đ';

    // Bind remove button events
    document.querySelectorAll('.btn-remove-so-line').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-index'));
        currentSOLines.splice(idx, 1);
        renderSOLines();
      });
    });

    // Bind quantity input change events
    document.querySelectorAll('.txt-so-line-qty').forEach(input => {
      input.addEventListener('change', () => {
        const idx = Number(input.getAttribute('data-index'));
        const newQty = Number(input.value);
        if (newQty > 0) {
          currentSOLines[idx].product_qty = newQty;
          renderSOLines();
        } else {
          input.value = currentSOLines[idx].product_qty;
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.target.blur();
        }
      });
    });
  }

  // Bind Add SO line button click
  const btnAddSOLine = document.getElementById('btnAddSOLine');
  if (btnAddSOLine) {
    btnAddSOLine.addEventListener('click', () => {
      const prodSelect = document.getElementById('salesProduct');
      const qtyInput = document.getElementById('salesQty');
      const priceInput = document.getElementById('salesPrice');
      
      const productId = prodSelect.value;
      const qty = Number(qtyInput.value);
      
      if (!productId || qty <= 0) {
        showToast('Vui lòng chọn sản phẩm và nhập số lượng hợp lệ', 'warning');
        return;
      }
      
      const selectedOption = prodSelect.options[prodSelect.selectedIndex];
      const productName = selectedOption.textContent;
      
      // Look up unit price directly from list_price of product template
      const product = cache.products.find(p => p.id === Number(productId));
      const price = product ? (product.list_price || 0) : 0;
      
      const existing = currentSOLines.find(line => line.product_id === Number(productId));
      if (existing) {
        existing.product_qty += qty;
      } else {
        currentSOLines.push({
          product_id: Number(productId),
          product_name: productName,
          product_qty: qty,
          price_unit: price
        });
      }
      
      qtyInput.value = 5;
      if (priceInput) priceInput.value = 0;
      prodSelect.value = '';
      
      renderSOLines();
      showToast('Đã thêm dòng sản phẩm đặt hàng', 'success');
    });
  }

  const formSalesOrder = document.getElementById('formSalesOrder');
  if (formSalesOrder) {
    formSalesOrder.addEventListener('submit', async (e) => {
      e.preventDefault();
      const customerId = document.getElementById('salesCustomer').value;
      
      if (!customerId) {
        showToast('Vui lòng chọn Khách Hàng', 'warning');
        return;
      }
      
      if (currentSOLines.length === 0) {
        showToast('Vui lòng thêm ít nhất một dòng sản phẩm đặt hàng', 'warning');
        return;
      }
      
      const payload = {
        partner_id: Number(customerId),
        order_line: currentSOLines.map(line => ({
          product_id: line.product_id,
          product_qty: line.product_qty,
          price_unit: line.price_unit
        }))
      };
      
      const btnSubmit = formSalesOrder.querySelector('button[type="submit"]');
      if (btnSubmit) {
         btnSubmit.disabled = true;
         btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Đang xử lý...';
      }

      try {
        showToast('Đang tạo đơn bán hàng...', 'info');
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
            showToast(`Đã tạo đơn bán hàng thành công (SO: ${data.id})`, 'success');
          }
          formSalesOrder.reset();
          currentSOLines = [];
          renderSOLines();
          fetchSOData();
          fetchSummaryMetrics();
        } else {
          showToast(`Lỗi: ${data.error}`, 'danger');
        }
      } catch (err) {
        showToast(`Lỗi kết nối: ${err.message}`, 'danger');
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = '<i class="bi bi-check-circle"></i> Xác nhận Tạo Đơn';
        }
      }
    });
  }

  // --- Searchable Combobox Component ---
  function removeVietnameseTones(str) {
    if (!str) return '';
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g,"a"); 
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g,"e"); 
    str = str.replace(/ì|í|ị|ỉ|ĩ/g,"i"); 
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g,"o"); 
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g,"u"); 
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g,"y"); 
    str = str.replace(/đ/g,"d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|B|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    str = str.replace(/\u0300|\u0301|\u0309|\u0303|\u0323/g, ""); 
    str = str.replace(/\u02C6|\u0306|\u031B/g, ""); 
    return str;
  }

  window.generateSKUFromName = generateSKUFromName; // Make it globally accessible for other potential uses

  function generateSKUFromName(name) {
    if (!name) return '';
    const cleanName = removeVietnameseTones(name).toUpperCase();
    const words = cleanName.split(/\s+/).filter(w => w.length > 0);
    let code = words.map(w => {
      if (/[0-9]/.test(w)) return w;
      return w.charAt(0);
    }).join('');
    return code.replace(/[^A-Z0-9]/g, '');
  }

  function wrapSelectInCombobox(selectId, placeholder, createBtnId, nameInputId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    if (select.parentNode.classList.contains('combobox-container')) return;

    const container = document.createElement('div');
    container.className = 'combobox-container';
    container.style.position = 'relative';
    container.style.flex = '1';
    
    select.parentNode.insertBefore(container, select);
    container.appendChild(select);
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-input combobox-input';
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.required = select.required;
    container.appendChild(input);
    
    const dropdown = document.createElement('div');
    dropdown.className = 'combobox-dropdown glass-dropdown';
    dropdown.style.display = 'none';
    container.appendChild(dropdown);
    
    select.style.display = 'none';
    
    let activeIndex = -1;
    let filteredItems = [];
    
    function syncInput() {
      const selectedOpt = select.options[select.selectedIndex];
      if (selectedOpt && selectedOpt.value !== "") {
        input.value = selectedOpt.textContent;
      } else {
        input.value = '';
      }
    }
    
    const originalValueDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(select, 'value', {
      get: function() {
        return originalValueDescriptor.get.call(this);
      },
      set: function(val) {
        originalValueDescriptor.set.call(this, val);
        syncInput();
      },
      configurable: true
    });
    
    select.addEventListener('change', syncInput);
    
    const observer = new MutationObserver(syncInput);
    observer.observe(select, { childList: true, subtree: true });
    
    function showDropdown() {
      dropdown.style.display = 'block';
      renderItems();
    }
    
    function hideDropdown() {
      dropdown.style.display = 'none';
      activeIndex = -1;
    }
    
    function renderItems() {
      const query = input.value.trim();
      const normalizedQuery = removeVietnameseTones(query.toLowerCase());
      
      const options = Array.from(select.options)
        .filter(opt => opt.value !== "")
        .map(opt => ({ id: opt.value, name: opt.textContent }));
        
      filteredItems = options.filter(item => 
        removeVietnameseTones(item.name.toLowerCase()).includes(normalizedQuery)
      );
      
      dropdown.innerHTML = '';
      
      if (filteredItems.length === 0) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'glass-dropdown-item text-muted';
        emptyItem.style.fontStyle = 'italic';
        emptyItem.textContent = 'Không tìm thấy kết quả';
        dropdown.appendChild(emptyItem);
      } else {
        filteredItems.forEach((item, idx) => {
          const div = document.createElement('div');
          div.className = 'glass-dropdown-item';
          if (idx === activeIndex) div.classList.add('active');
          div.textContent = item.name;
          div.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectOption(item);
          });
          dropdown.appendChild(div);
        });
      }
      
      const exactMatch = options.some(item => item.name.toLowerCase() === query.toLowerCase());
      const createBtn = createBtnId ? document.getElementById(createBtnId) : null;
      const canCreateFromHere = createBtn && createBtn.style.display !== 'none';
      if (query !== '' && !exactMatch && canCreateFromHere) {
        const createDiv = document.createElement('div');
        createDiv.className = 'glass-dropdown-item create-new-item';
        createDiv.textContent = `➕ Tạo mới "${query}"`;
        createDiv.addEventListener('mousedown', (e) => {
          e.preventDefault();
          hideDropdown();
          const nameInput = document.getElementById(nameInputId);
          if (createBtn && nameInput) {
            createBtn.click();
            nameInput.value = query;
            nameInput.dispatchEvent(new Event('input'));
          }
        });
        dropdown.appendChild(createDiv);
      }
    }
    
    function selectOption(item) {
      select.value = item.id;
      select.dispatchEvent(new Event('change'));
      hideDropdown();
    }
    
    input.addEventListener('focus', showDropdown);
    input.addEventListener('input', () => {
      activeIndex = -1;
      showDropdown();
    });
    
    input.addEventListener('blur', () => {
      setTimeout(() => {
        hideDropdown();
        const query = input.value.trim().toLowerCase();
        const options = Array.from(select.options).filter(opt => opt.value !== "");
        const matched = options.find(opt => opt.textContent.toLowerCase() === query);
        if (matched) {
          select.value = matched.value;
          select.dispatchEvent(new Event('change'));
        } else if (input.value.trim() === '') {
          select.value = '';
          select.dispatchEvent(new Event('change'));
        } else {
          syncInput();
        }
      }, 200);
    });
    
    input.addEventListener('keydown', (e) => {
      if (dropdown.style.display === 'none') {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          showDropdown();
        }
        return;
      }
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % filteredItems.length;
        renderItems();
        scrollActiveIntoView();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + filteredItems.length) % filteredItems.length;
        renderItems();
        scrollActiveIntoView();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < filteredItems.length) {
          selectOption(filteredItems[activeIndex]);
        } else {
          const query = input.value.trim();
          const options = Array.from(select.options).filter(opt => opt.value !== "");
          const exactMatch = options.some(item => item.textContent.toLowerCase() === query.toLowerCase());
          const createBtn = createBtnId ? document.getElementById(createBtnId) : null;
          const canCreateFromHere = createBtn && createBtn.style.display !== 'none';
          if (query !== '' && !exactMatch && canCreateFromHere) {
            hideDropdown();
            const nameInput = document.getElementById(nameInputId);
            if (createBtn && nameInput) {
              createBtn.click();
              nameInput.value = query;
              nameInput.dispatchEvent(new Event('input'));
            }
          }
        }
      } else if (e.key === 'Escape') {
        hideDropdown();
      }
    });
    
    function scrollActiveIntoView() {
      const activeEl = dropdown.querySelector('.glass-dropdown-item.active');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
    
    syncInput();
  }

  // --- Init Searchable Comboboxes ---
  wrapSelectInCombobox('poVendor', 'Chọn hoặc nhập nhà cung cấp mới...', 'btnCreateVendorPO', 'partnerName');
  wrapSelectInCombobox('poProduct', 'Tìm nguyên liệu...', null, 'prodName');
  wrapSelectInCombobox('prodSelectYield', 'Tìm thành phẩm...', null, 'prodName');
  wrapSelectInCombobox('salesCustomer', 'Chọn hoặc nhập khách hàng mới...', 'btnCreateCustomerSales', 'partnerName');
  wrapSelectInCombobox('salesProduct', 'Tìm sản phẩm...', null, 'prodName');

  // --- Sub-Tab Navigation for Purchase & Inventory (Orders Tab) ---
  const subTabs = document.querySelectorAll('.sub-tab');
  const subTabPanels = document.querySelectorAll('.sub-tab-panel');
  if (subTabs.length && subTabPanels.length) {
    subTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const subtabName = tab.getAttribute('data-subtab');
        
        // Update active state of sub-tab buttons
        subTabs.forEach(t => {
          t.classList.remove('active');
          t.style.color = 'var(--text-muted)';
          t.style.borderBottom = '2px solid transparent';
          t.style.fontWeight = '500';
        });
        tab.classList.add('active');
        tab.style.color = 'var(--accent-primary)';
        tab.style.borderBottom = '2px solid var(--accent-primary)';
        tab.style.fontWeight = '600';
        
        // Show matching sub-tab panel
        subTabPanels.forEach(panel => {
          panel.classList.remove('active');
          panel.style.display = 'none';
        });
        const activeSubPanel = document.getElementById(`subPanel${subtabName.charAt(0).toUpperCase() + subtabName.slice(1)}`);
        if (activeSubPanel) {
          activeSubPanel.classList.add('active');
          activeSubPanel.style.display = 'block';
        }
      });
    });
  }

  // --- Mobile Responsive Sidebar Toggle ---
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const appSidebar = document.getElementById('appSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  if (btnToggleSidebar && appSidebar && sidebarOverlay) {
    btnToggleSidebar.addEventListener('click', () => {
      appSidebar.classList.toggle('show');
      sidebarOverlay.classList.toggle('show');
    });

    sidebarOverlay.addEventListener('click', () => {
      appSidebar.classList.remove('show');
      sidebarOverlay.classList.remove('show');
    });

    const sidebarNavItems = appSidebar.querySelectorAll('.nav-item');
    sidebarNavItems.forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          appSidebar.classList.remove('show');
          sidebarOverlay.classList.remove('show');
        }
      });
    });
  }

  // --- Init ---
  checkSession();
  const currentRole = getCurrentRole();
  if (currentRole) {
    if (currentRole === 'admin') {
      loadConfigSettings();
    }
    checkSystemStatus();
    fetchSummaryMetrics();
  }

  // --- History Details ---
  const historyDetailDialog = document.getElementById('historyDetailDialog');
  const btnCloseHistoryDetail = document.getElementById('btnCloseHistoryDetail');
  
  if (btnCloseHistoryDetail) {
    btnCloseHistoryDetail.addEventListener('click', () => historyDetailDialog.close());
  }

  window.openHistoryDetail = async function(type, id) {
    const tbody = document.getElementById('tbodyHistoryDetailLines');
    const info = document.getElementById('historyDetailInfo');
    const title = document.getElementById('historyDetailTitle');
    
    if (!historyDetailDialog) return;
    
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Đang tải...</td></tr>';
    info.innerHTML = '';
    title.textContent = type === 'po' ? 'Chi Tiết Đơn Mua Hàng' : 'Chi Tiết Phiếu Nhận Kho';
    historyDetailDialog.showModal();

    try {
      const response = await fetch(`/api/odoo/${type === 'po' ? 'po' : 'receipts'}/${id}`);
      if (!response.ok) throw new Error('Không thể tải chi tiết');
      const data = await response.json();
      
      if (type === 'po') {
        info.innerHTML = `<strong>Mã:</strong> ${data.po.name} <br> <strong>Nhà cung cấp:</strong> ${data.po.partner_id ? data.po.partner_id[1] : 'N/A'} <br> <strong>Tổng tiền:</strong> ${Number(data.po.amount_total).toLocaleString()} đ`;
        
        if (!data.lines || data.lines.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="text-center">Không có sản phẩm nào.</td></tr>';
        } else {
          tbody.innerHTML = data.lines.map(l => `
            <tr>
              <td>${l.product_id ? l.product_id[1] : l.name}</td>
              <td>${l.product_qty}</td>
              <td>${Number(l.price_unit).toLocaleString()} đ</td>
              <td><strong>${Number(l.price_subtotal).toLocaleString()} đ</strong></td>
            </tr>
          `).join('');
        }
      } else {
        info.innerHTML = `<strong>Mã phiếu:</strong> ${data.receipt.name} <br> <strong>Tham chiếu:</strong> ${data.receipt.origin || 'N/A'} <br> <strong>Đối tác:</strong> ${data.receipt.partner_id ? data.receipt.partner_id[1] : 'N/A'}`;
        
        if (!data.lines || data.lines.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="text-center">Không có sản phẩm nào.</td></tr>';
        } else {
          tbody.innerHTML = data.lines.map(l => `
            <tr>
              <td>${l.product_id ? l.product_id[1] : l.name}</td>
              <td>${l.product_uom_qty}</td>
              <td class="text-center">-</td>
              <td class="text-center">-</td>
            </tr>
          `).join('');
        }
      }
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Lỗi: ${e.message}</td></tr>`;
    }
  };
});
