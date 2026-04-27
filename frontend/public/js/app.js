// Control de Activos - Main Application

// ===== API Configuration =====
const API_BASE = '/api';

// ===== State =====
let state = {
  token: localStorage.getItem('token'),
  user: null,
  branding: null,
  assets: [],
  users: [],
  auditLogs: [],
  auditPagination: null,
  auditPage: 1,
  currentView: 'dashboard'
};

// ===== Utility Functions =====
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ===== API Functions =====
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {};

  // Only add Content-Type if not FormData and no custom Content-Type
  const hasCustomContentType = options.headers && options.headers['Content-Type'];
  if (options.body instanceof FormData) {
    // Let browser set Content-Type for FormData (includes boundary)
  } else if (!hasCustomContentType) {
    headers['Content-Type'] = 'application/json';
  }

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  // Merge with any custom headers from options
  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    logout();
    throw new Error('Sesión expirada');
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Error en la solicitud');
  }

  return data;
}

// ===== Auth Functions =====
async function login(username, password) {
  const data = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });

  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('token', data.token);

  // Check if must change password
  if (data.user.must_change_password) {
    showView('change-password-view');
  } else {
    // Show loading view while fetching all data
    showView('loading-view');

    // Load all initial data in parallel
    await Promise.all([
      loadBranding(),
      loadStats(),
      loadAssets(),
      loadUsers(),
      loadCatalogs()
    ]);

    // Then show main view
    showView('main-view');
    applyRolePermissions(); // Apply role-based visibility
    showPage('dashboard'); // Always start at dashboard
  }

  return data;
}

async function changePassword(currentPassword, newPassword) {
  await apiRequest('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword })
  });

  state.user.must_change_password = false;

  // Show loading view while fetching all data
  showView('loading-view');

  // Load all initial data in parallel
  await Promise.all([
    loadBranding(),
    loadStats(),
    loadAssets(),
    loadUsers()
  ]);

// Then show main view
    showView('main-view');
    showPage('dashboard'); // Always start at dashboard
}

function logout() {
  if (state.token) {
    apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
  }

  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  
  // Reset menu visibility for next login
  $$('.admin-only').forEach(el => el.classList.remove('hidden'));
  $$('.operator-only').forEach(el => el.classList.remove('hidden'));
  
  showView('login-view');
}

// ===== Branding Functions =====
async function loadBranding() {
  try {
    const data = await apiRequest('/branding');
    state.branding = data.branding;
    applyBranding();
  } catch (error) {
    console.error('Failed to load branding:', error);
  }
}

function applyBranding() {
  const b = state.branding || {};

  // Apply colors
  if (b.primary_color) {
    document.documentElement.style.setProperty('--primary-color', b.primary_color);
  }
  if (b.secondary_color) {
    document.documentElement.style.setProperty('--secondary-color', b.secondary_color);
  }

  // Apply text
  const title = b.app_name || 'Control de Activos';
  document.title = title;
  setText('login-title', title);
  setText('sidebar-title', title);

  // Set input values (not textContent)
  setValue('app-name-input', b.app_name || 'Control de Activos');
  setValue('login-title-input', b.login_title || 'Control de Activos');
  setValue('login-subtitle-input', b.login_subtitle || '');

  // Also update the displayed titles
  if (b.login_title) setText('login-title', b.login_title);
  if (b.login_subtitle) setText('login-subtitle', b.login_subtitle);

  // Apply color inputs
  setValue('primary-color-input', b.primary_color || '#0d9488');
  setValue('secondary-color-input', b.secondary_color || '#0f766e');

  // Apply retirement header inputs
  setValue('retirement-header-line1', b.retirement_header_line1 || 'Texto de Encabezado Línea 1');
  setValue('retirement-header-line2', b.retirement_header_line2 || 'Texto de Encabezado Línea 2');
  setValue('retirement-header-line3', b.retirement_header_line3 || 'Texto de Encabezado Línea 3');
  setValue('retirement-header-line4', b.retirement_header_line4 || 'Texto de Encabezado Línea 4');
  setValue('retirement-header-title', b.retirement_header_title || 'Solicitud de Baja de Activos');
  setValue('retirement-header-note', b.retirement_header_note || 'Nota: Ambas columnas son espacios disponibles para indicar bienes o traslados.');

  // Apply logo (use default if none)
  const defaultLogo = '/data/branding/logo.svg';
  const logoUrl = b.logo_path ? (b.logo_path.startsWith('/') ? b.logo_path : `/data/branding/${b.logo_path}`) : defaultLogo;
  
  // Apply logo with fallback handling for each element
  ['login-logo', 'sidebar-logo', 'current-logo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.onerror = function() {
        this.style.display = 'none';
        // For sidebar-logo, show the SVG fallback
        if (id === 'sidebar-logo') {
          const svgFallback = document.getElementById('sidebar-logo-svg');
          if (svgFallback) svgFallback.style.display = 'flex';
        } else {
          const fallback = this.nextElementSibling;
          if (fallback && fallback.classList.contains('fallback-logo')) {
            fallback.style.display = 'flex';
          } else if (fallback && fallback.tagName === 'IMG') {
            fallback.style.display = 'block';
          }
        }
      };
      el.onload = function() {
        // For sidebar-logo, hide the SVG fallback when image loads
        if (id === 'sidebar-logo') {
          this.style.display = 'block';
          const svgFallback = document.getElementById('sidebar-logo-svg');
          if (svgFallback) svgFallback.style.display = 'none';
        }
      };
      el.src = logoUrl;
    }
  });

  // Apply login background
  const loginView = document.getElementById('login-view');
  const bgPreview = document.getElementById('bg-preview');
  
  if (b.login_background_path) {
    const bgUrl = b.login_background_path.startsWith('/') ? b.login_background_path : `/data/branding/${b.login_background_path}`;
    console.log('Applying login background:', bgUrl);
    loginView.style.background = `url(${bgUrl}) center/cover no-repeat fixed`;
    
    // Update preview
    if (bgPreview) {
      bgPreview.style.background = `url(${bgUrl}) center/cover no-repeat`;
      bgPreview.style.height = '150px';
      bgPreview.style.borderRadius = 'var(--radius-md)';
    }
  } else {
    // No background - clear
    console.log('No login background configured');
    loginView.style.background = '';
    if (bgPreview) {
      bgPreview.style.background = '';
      bgPreview.style.height = '100px';
    }
  }
}

async function saveBranding(brandingData) {
  await apiRequest('/branding', {
    method: 'PUT',
    body: JSON.stringify(brandingData)
  });
  await loadBranding();
  showToast('Branding actualizado', 'success');
}

// ===== Asset Functions =====
let assetPagination = { page: 1, limit: 25, total: 0, pages: 0 };

async function loadAssets(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  const data = await apiRequest(`/assets${params ? '?' + params : ''}`);
  state.assets = data.assets;
  assetPagination = data.pagination || { page: 1, limit: 25, total: 0, pages: 0 };
  renderAssets();
  renderAssetPagination();
  return data;
}

async function saveAsset(assetData) {
  const idInput = document.getElementById('asset-id');
  const id = idInput ? idInput.value : '';

  if (id) {
    await apiRequest(`/assets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(assetData)
    });
    showToast('Activo actualizado', 'success');
  } else {
    await apiRequest('/assets', {
      method: 'POST',
      body: JSON.stringify(assetData)
    });
    showToast('Activo creado', 'success');
  }

  // Close modal after saving
  var overlay = document.getElementById('modal-overlay');
  var modal = document.getElementById('asset-modal');
  if (overlay) overlay.classList.add('hidden');
  if (modal) modal.classList.add('hidden');
  
  await loadAssets();
}

async function deleteAsset(id) {
  await apiRequest(`/assets/${id}`, { method: 'DELETE' });
  showToast('Activo desactivado', 'success');
  await loadAssets();
}

// ===== Retirement Functions =====
async function openRetirementModal(assetId) {
  var asset = state.assets.find(function(a) { return a.id === assetId; });
  if (!asset) {
    showToast('Activo no encontrado', 'error');
    return;
  }

  var d = function(id) { return document.getElementById(id); };
  var modal = d('retirement-modal');
  var overlay = d('modal-overlay');

  // Fill asset info
  d('retirement-asset-id').value = assetId;
  d('retirement-asset-number').textContent = asset.asset_number;
  d('retirement-asset-description').textContent = asset.description;
  d('retirement-asset-brand').textContent = asset.brand || '-';
  d('retirement-asset-model').textContent = asset.model || '-';
  d('retirement-asset-serial').textContent = asset.serial_number || '-';
  d('retirement-asset-responsible').textContent = asset.responsible || '-';
  d('retirement-asset-location').textContent = asset.location || '-';
  d('retirement-asset-category').textContent = asset.category || '-';

  // Clear form fields
  d('retirement-reason').value = '';
  d('inspector-name').value = '';
  d('inspector-cedula').value = '';
  d('current-responsible-name').value = '';
  d('current-responsible-cedula').value = '';
  d('superior-name').value = '';
  d('superior-cedula').value = '';

  if (overlay) overlay.classList.remove('hidden');
  if (modal) modal.classList.remove('hidden');
}

async function submitRetirement(e) {
  e.preventDefault();

  var d = function(id) { return document.getElementById(id); };
  var assetId = d('retirement-asset-id').value;
  var reason = d('retirement-reason').value;

  if (!reason || reason.trim() === '') {
    showToast('El motivo de la baja es requerido', 'error');
    return;
  }

  var retirementData = {
    asset_id: parseInt(assetId),
    reason: reason.trim(),
    inspector_name: d('inspector-name').value.trim() || null,
    inspector_cedula: d('inspector-cedula').value.trim() || null,
    current_responsible_name: d('current-responsible-name').value.trim() || null,
    current_responsible_cedula: d('current-responsible-cedula').value.trim() || null,
    superior_name: d('superior-name').value.trim() || null,
    superior_cedula: d('superior-cedula').value.trim() || null
  };

  try {
    await apiRequest('/retirements', {
      method: 'POST',
      body: JSON.stringify(retirementData)
    });

    showToast('Activo dado de baja correctamente', 'success');

    // Close modal
    var modal = d('retirement-modal');
    var overlay = d('modal-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (modal) modal.classList.add('hidden');

    // Reload assets
    await loadAssets();
  } catch (err) {
    showToast(err.message || 'Error al procesar la baja', 'error');
  }
}

async function downloadRetirementPDF(assetId) {
  try {
    var response = await fetch(`${API_BASE}/retirements/asset/${assetId}/pdf`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (!response.ok) {
      var data = await response.json();
      throw new Error(data.error || 'Error al generar PDF');
    }

    var blob = await response.blob();
    var asset = state.assets.find(function(a) { return a.id === assetId; });
    var filename = asset ? `baja_${asset.asset_number}.pdf` : 'baja.pdf';
    downloadBlob(blob, filename);
  } catch (err) {
    showToast(err.message || 'Error al descargar PDF', 'error');
  }
}

async function downloadTemplate() {
  const response = await fetch(`${API_BASE}/assets/template`, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  });
  const blob = await response.blob();
  downloadBlob(blob, 'plantilla_activos.xlsx');
}

async function exportAssetsExcel() {
  // Get current filter values from the UI
  const search = document.getElementById('asset-search')?.value || '';
  const status = document.getElementById('filter-status')?.value || '';
  const category = document.getElementById('filter-category')?.value || '';
  
  // Build query params
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (status) params.append('status', status);
  if (category) params.append('category', category);
  
  const queryString = params.toString();
  const url = `${API_BASE}/assets/export${queryString ? '?' + queryString : ''}`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  });
  const blob = await response.blob();
  const date = new Date().toISOString().split('T')[0];
  downloadBlob(blob, `activos_${date}.xlsx`);
}

async function loadStats() {
  console.log('loadStats called');
  try {
    var data = await apiRequest('/assets/stats/summary');
    console.log('Stats data received:', data);
    
    // Debug: check if elements exist
    console.log('stat-total exists:', document.getElementById('stat-total'));
    
    // Use document.getElementById directly - map IDs to data keys
    var statsMap = {
      'stat-total': 'total',
      'stat-active': 'active',
      'stat-repair': 'inRepair',
      'stat-inactive': 'inactive'
    };
    
    var d = function(elId) { 
      var el = document.getElementById(elId); 
      var dataKey = statsMap[elId];
      if (el && dataKey !== undefined) {
        el.textContent = data.stats[dataKey] || 0;
        console.log('Set', elId, 'to', data.stats[dataKey] || 0);
      } else {
        console.log('Element', elId, 'not found or no dataKey');
      }
    };
    d('stat-total');
    d('stat-active');
    d('stat-repair');
    d('stat-inactive');

    // Render recent assets
    renderRecentAssets(data.stats.recent);

    // Render categories
    renderCategories(data.stats.categories);
  } catch(err) {
    console.error('Error loading stats:', err);
  }

  return data;
}

// ===== Catalog Functions =====
async function loadCatalogs() {
  try {
    const data = await apiRequest('/assets/catalogs');
    
    // Update category datalist
    const categoryList = document.getElementById('category-list');
    if (categoryList) {
      categoryList.innerHTML = data.categories.map(c => `<option value="${c}">`).join('');
    }

    // Update status datalist in modal
    const modalStatusList = document.getElementById('status-list');
    if (modalStatusList) {
      modalStatusList.innerHTML = data.statuses.map(s => `<option value="${s}">`).join('');
    }

    // Update category datalist in modal
    const modalCategoryList = document.getElementById('category-list');
    if (modalCategoryList) {
      modalCategoryList.innerHTML = data.categories.map(c => `<option value="${c}">`).join('');
    }

    // Update location datalist in modal
    const locationList = document.getElementById('location-list');
    if (locationList && data.locations.length > 0) {
      locationList.innerHTML = data.locations.map(l => `<option value="${l}">`).join('');
    }

    // Update filter category dropdown
    const filterCategory = document.getElementById('filter-category');
    if (filterCategory) {
      filterCategory.innerHTML = '<option value="">Todas las categorías</option>' + 
        data.categories.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // Update filter status dropdown
    const filterStatus = document.getElementById('filter-status');
    if (filterStatus) {
      filterStatus.innerHTML = '<option value="">Todos los estados</option>' + 
        data.statuses.map(s => `<option value="${s}">${s}</option>`).join('');
    }

    return data;
  } catch(err) {
    console.error('Error loading catalogs:', err);
    return { categories: [], statuses: [], locations: [] };
  }
}

// ===== User Functions =====
async function loadUsers() {
  const data = await apiRequest('/users');
  state.users = data.users;
  renderUsers();
  return data;
}

async function loadProfileData() {
  // Load current user's profile data
  var data = await apiRequest('/auth/me');
  var user = data.user;

  document.getElementById('profile-user-id').value = user.id;
  document.getElementById('profile-username').value = user.username;
  document.getElementById('profile-fullname').value = user.full_name || '';
  document.getElementById('profile-email').value = user.email || '';
}

function handleProfileSubmit(e) {
  e.preventDefault();

  var fullName = document.getElementById('profile-fullname').value;
  var email = document.getElementById('profile-email').value || null;

  if (!fullName) {
    showToast('Nombre completo requerido', 'error');
    return;
  }

  apiRequest('/users/' + state.user.id, {
    method: 'PUT',
    body: JSON.stringify({
      full_name: fullName,
      email: email
    })
  }).then(function() {
    showToast('Información actualizada', 'success');
    // Update local state
    state.user.full_name = fullName;
    state.user.email = email;
    setText('user-name', fullName);
  }).catch(function(err) {
    showToast(err.message || 'Error al actualizar', 'error');
  });
}

function handleProfilePasswordSubmit(e) {
  e.preventDefault();

  var currentPassword = document.getElementById('profile-current-password').value;
  var newPassword = document.getElementById('profile-new-password').value;
  var confirmPassword = document.getElementById('profile-confirm-password').value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    showToast('Todos los campos son requeridos', 'error');
    return;
  }

  if (newPassword.length < 6) {
    showToast('La contraseña debe tener al menos 6 caracteres', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('Las contraseñas no coinciden', 'error');
    return;
  }

  apiRequest('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({
      currentPassword: currentPassword,
      newPassword: newPassword
    })
  }).then(function() {
    showToast('Contraseña cambiada correctamente', 'success');
    document.getElementById('profile-current-password').value = '';
    document.getElementById('profile-new-password').value = '';
    document.getElementById('profile-confirm-password').value = '';
  }).catch(function(err) {
    showToast(err.message || 'Error al cambiar contraseña', 'error');
  });
}

async function saveUser(userData) {
  const id = getValue('user-id');

  if (id) {
    await apiRequest(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData)
    });
    showToast('Usuario actualizado', 'success');
  } else {
    await apiRequest('/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    showToast('Usuario creado', 'success');
  }

  await loadUsers();
}

async function deleteUser(id) {
  await apiRequest(`/users/${id}`, { method: 'DELETE' });
  showToast('Usuario desactivado', 'success');
  await loadUsers();
}

async function resetUserPassword(id, newPassword) {
  await apiRequest(`/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ newPassword })
  });
  showToast('Contraseña reiniciada', 'success');
}

// ===== Audit Functions =====
async function loadAudit(filters = {}) {
  // Get limit from selector or use default
  const limit = parseInt($('#audit-limit')?.value) || 10;
  
  // Merge with existing pagination state
  const params = new URLSearchParams({
    page: state.auditPage || 1,
    page_size: limit,
    ...filters
  }).toString();
  const data = await apiRequest(`/audit?${params}`);
  state.auditLogs = data.logs;
  state.auditPagination = data.pagination;
  renderAudit();
  return data;
}

// Pagination controls for audit
function setupAuditPagination() {
  $('#btn-audit-prev')?.addEventListener('click', () => {
    if (state.auditPagination?.page > 1) {
      state.auditPage = state.auditPagination.page - 1;
      loadAudit();
    }
  });

  $('#btn-audit-next')?.addEventListener('click', () => {
    if (state.auditPagination?.page < state.auditPagination?.total_pages) {
      state.auditPage = state.auditPagination.page + 1;
      loadAudit();
    }
  });

  $('#audit-limit')?.addEventListener('change', () => {
    state.auditPage = 1;
    loadAudit();
  });
}

// Filter button for audit
$('#btn-audit-filter')?.addEventListener('click', () => {
  // Reset to page 1 when filtering
  state.auditPage = 1;
  loadAudit({
    user_id: getValue('audit-user') || undefined,
    action: getValue('audit-action') || undefined,
    entity_type: getValue('audit-entity-type') || undefined,
    start_date: getValue('audit-start-date') || undefined,
    end_date: getValue('audit-end-date') || undefined
  });
});

// ===== View Functions =====
function showView(viewId) {
  document.querySelectorAll('.view').forEach(el => {
    el.classList.add('hidden');
  });

  const view = document.getElementById(viewId);
  if (view) {
    view.classList.remove('hidden');
  }
}

function showPage(pageId) {
  document.querySelectorAll('.page-view').forEach(el => {
    el.classList.add('hidden');
  });

  document.getElementById(`view-${pageId}`)?.classList.remove('hidden');
}

// ===== DOM Helpers =====
function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return document.querySelectorAll(selector);
}

function setText(selector, text) {
  var query = selector.startsWith('#') || selector.startsWith('.') ? selector : '#' + selector;
  const el = $(query);
  if (el) el.textContent = text;
}

function setValue(selector, value) {
  var query = selector.startsWith('#') || selector.startsWith('.') ? selector : '#' + selector;
  const el = $(query);
  if (el) el.value = value;
}

function getValue(selector) {
  // Auto-add # if missing (for IDs like 'user-id' vs CSS selectors like '.class')
  var query = selector.startsWith('#') || selector.startsWith('.') ? selector : '#' + selector;
  const el = $(query);
  return el ? el.value : '';
}

function setSrc(selector, src) {
  var query = selector.startsWith('#') || selector.startsWith('.') ? selector : '#' + selector;
  const el = $(query);
  if (el) el.src = src;
}

function show(id) {
  var query = id.startsWith('#') || id.startsWith('.') ? id : '#' + id;
  $(query)?.classList.remove('hidden');
}

function hide(id) {
  $(id)?.classList.add('hidden');
}

// ===== Render Functions =====
function renderAssets() {
  const tbody = $('#assets-tbody');
  if (!tbody) return;

  if (state.assets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">No hay activos</td></tr>';
    setText('assets-count', '0 activos');
    return;
  }

  tbody.innerHTML = state.assets.map(asset => `
    <tr>
      <td><strong>${escapeHtml(asset.asset_number)}</strong></td>
      <td>${escapeHtml(asset.description)}</td>
      <td>${escapeHtml(asset.responsible || '-')}</td>
      <td>${escapeHtml(asset.brand || '-')}</td>
      <td><span class="status-badge ${asset.status.replace(' ', '_')}">${escapeHtml(asset.status)}</span></td>
      <td>${escapeHtml(asset.location || '-')}</td>
      <td>
        <div class="table-actions">
          <button onclick="editAsset(${asset.id})" title="Editar">
            <svg class="icon"><use href="#icon-edit"/></svg>
          </button>
          ${asset.status === 'Activo' ? `
            <button onclick="openRetirementModal(${asset.id})" title="Dar de baja" class="btn-retire">
              <svg class="icon"><use href="#icon-trash"/></svg>
            </button>
          ` : ''}
          ${asset.status === 'Inactivo' ? `
            <button onclick="reactivateAsset(${asset.id}, '${escapeHtml(asset.asset_number)}')" title="Activar" class="btn-activate">
              <svg class="icon"><use href="#icon-check"/></svg>
            </button>
          ` : ''}
          ${asset.status === 'Dado de baja' ? `
            <button onclick="downloadRetirementPDF(${asset.id})" title="Descargar PDF" class="btn-pdf">
              <svg class="icon"><use href="#icon-download"/></svg>
            </button>
          ` : ''}
          ${asset.status === 'Inactivo' ? `
            <button onclick="confirmDeleteAsset(${asset.id}, '${escapeHtml(asset.asset_number)}')" title="Eliminar" class="btn-delete">
              <svg class="icon"><use href="#icon-trash"/></svg>
            </button>
          ` : ''}
          ${asset.status === 'Activo' ? `
            <button onclick="confirmDeleteAsset(${asset.id}, '${escapeHtml(asset.asset_number)}')" title="Inactivar" class="btn-delete">
              <svg class="icon"><use href="#icon-x"/></svg>
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');

  setText('assets-count', `${state.assets.length} activo${state.assets.length !== 1 ? 's' : ''}`);
}

function renderAssetPagination() {
  const prevBtn = $('#btn-asset-prev');
  const nextBtn = $('#btn-asset-next');
  const pageInfo = $('#asset-page-info');
  const limitSelect = $('#asset-limit');
  
  if (prevBtn) prevBtn.disabled = !assetPagination || assetPagination.page <= 1;
  if (nextBtn) nextBtn.disabled = !assetPagination || assetPagination.page >= assetPagination.pages;
  if (pageInfo) {
    pageInfo.textContent = assetPagination 
      ? `Pagina ${assetPagination.page} de ${assetPagination.pages} (${assetPagination.total} totales)`
      : 'Pagina 1 de 1';
  }
  if (limitSelect) limitSelect.value = assetPagination.limit || 25;
}

function changeAssetPage(direction) {
  const newPage = assetPagination.page + direction;
  if (newPage > 0 && newPage <= assetPagination.pages) {
    loadAssets({ page: newPage, limit: assetPagination.limit });
  }
}

function changeAssetLimit() {
  const limit = parseInt($('#asset-limit')?.value) || 25;
  loadAssets({ page: 1, limit: limit });
}

function renderRecentAssets(recentAssets) {
  const container = $('#recent-assets');
  if (!container) return;

  if (!recentAssets || recentAssets.length === 0) {
    container.innerHTML = '<p class="loading">Sin activos recientes</p>';
    return;
  }

  container.innerHTML = recentAssets.map(asset => `
    <div class="recent-asset">
      <div class="recent-asset-info">
        <h4>${escapeHtml(asset.asset_number)}</h4>
        <p>${escapeHtml(asset.description)}</p>
      </div>
      <span class="status-badge ${asset.status.replace(' ', '_')}">${escapeHtml(asset.status)}</span>
    </div>
  `).join('');
}

function renderCategories(categories) {
  const container = $('#categories-chart');
  if (!container) return;

  if (!categories || categories.length === 0) {
    container.innerHTML = '<p class="loading">Sin categorías</p>';
    return;
  }

  container.innerHTML = categories.map(cat => `
    <div class="category-item">
      <span class="category-name">${escapeHtml(cat.category || 'Sin categoría')}</span>
      <span class="category-count">${cat.count}</span>
    </div>
  `).join('');
}

function renderUsers() {
  const tbody = $('#users-tbody');
  if (!tbody) return;

  if (state.users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">No hay usuarios</td></tr>';
    return;
  }

  const isAdmin = state.user?.role === 'admin';

  tbody.innerHTML = state.users.map(user => {
    // Operator can only see "Editar" for their own profile (edit own info)
    // Admin can see all actions
    var showActions = isAdmin || user.id === state.user?.id;
    var onlyEditOwn = !isAdmin && user.id === state.user?.id;

    return `
    <tr>
      <td><strong>${escapeHtml(user.username)}</strong></td>
      <td>${escapeHtml(user.full_name)}</td>
      <td>${escapeHtml(user.email || '-')}</td>
      <td>${user.role === 'admin' ? 'Administrador' : 'Operador'}</td>
      <td><span class="status-badge ${user.is_active ? 'Activo' : 'Inactivo'}">${user.is_active ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <div class="table-actions">
          ${showActions ? `
            <button onclick="editUser(${user.id})" title="Editar">
              <svg class="icon"><use href="#icon-edit"/></svg>
            </button>
          ` : ''}
          ${isAdmin ? `
            <button onclick="resetUserPassword(${user.id})" title="Reiniciar contraseña">
              <svg class="icon"><use href="#icon-key"/></svg>
            </button>
            <button onclick="confirmDeleteUser(${user.id}, '${escapeHtml(user.username)}')" title="Eliminar" class="btn-delete">
              <svg class="icon"><use href="#icon-trash"/></svg>
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `}).join('');
}

function renderAudit() {
  const tbody = $('#audit-tbody');
  if (!tbody) return;

  if (state.auditLogs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading">No hay registros</td></tr>';
    updateAuditPaginationControls();
    return;
  }

  tbody.innerHTML = state.auditLogs.map(log => `
    <tr>
      <td>${formatDateTime(log.created_at)}</td>
      <td>${escapeHtml(log.username || '-')}</td>
      <td>${escapeHtml(log.action)}</td>
      <td>${escapeHtml(log.entity_type || '-')}</td>
      <td>${escapeHtml(log.details) || '-'}</td>
    </tr>
  `).join('');

  updateAuditPaginationControls();
}

function updateAuditPaginationControls() {
  const pag = state.auditPagination;
  const prevBtn = $('#btn-audit-prev');
  const nextBtn = $('#btn-audit-next');
  const pageInfo = $('#audit-page-info');

  if (prevBtn) prevBtn.disabled = !pag || pag.page <= 1;
  if (nextBtn) nextBtn.disabled = !pag || pag.page >= pag.total_pages;
  if (pageInfo) pageInfo.textContent = pag ? `Página ${pag.page} de ${pag.total_pages}` : 'Página 1 de 1';
}

// ===== Actions =====
function openAssetModal(asset = null) {
  console.log('openAssetModal called', asset);
  var d = function(id) { return document.getElementById(id); };
  var modal = d('asset-modal');
  var title = d('asset-modal-title');
  var overlay = d('modal-overlay');
  var form = d('asset-form');

  if (asset) {
    title.textContent = 'Editar Activo';
    d('asset-id').value = asset.id;
    d('asset-number').value = asset.asset_number || '';
    d('asset-description').value = asset.description || '';
    d('asset-responsible').value = asset.responsible || '';
    d('asset-brand').value = asset.brand || '';
    d('asset-model').value = asset.model || '';
    d('asset-serial').value = asset.serial_number || '';
    d('asset-acquisition').value = asset.acquisition_date || '';
    d('asset-status').value = asset.status || 'Activo';
    d('asset-category').value = asset.category || '';
    d('asset-location').value = asset.location || '';
    d('asset-notes').value = asset.notes || '';
  } else {
    title.textContent = 'Nuevo Activo';
    if (form) form.reset();
    d('asset-id').value = '';
    d('asset-status').value = 'Activo';
  }

  if (overlay) overlay.classList.remove('hidden');
  if (modal) modal.classList.remove('hidden');
}

function editAsset(id) {
  console.log('editAsset called', id);
  var asset = state.assets.find(function(a) { return a.id === id; });
  if (asset) openAssetModal(asset);
}

async function confirmDeleteAsset(id, assetNumber) {
  // Show different message based on current status
  const asset = state.assets.find(function(a) { return a.id === id; });
  const isActive = asset && asset.status === 'Activo';
  
  const confirmed = await showConfirm(
    isActive ? 'Inactivar Activo' : 'Eliminar Activo',
    isActive 
      ? `¿Está seguro que desea inactivar el activo ${assetNumber}?`
      : `¿Está seguro que desea eliminar el activo ${assetNumber}?`
  );
  if (confirmed) {
    await deleteAsset(id);
  }
}

async function reactivateAsset(id, assetNumber) {
  const confirmed = await showConfirm('Activar Activo', `¿Está seguro que desea activar el activo ${assetNumber}?`);
  if (confirmed) {
    try {
      await apiRequest('/assets/' + id + '/reactivate', {
        method: 'POST'
      });
      showToast('Activo activado', 'success');
      await loadAssets();
    } catch (err) {
      showToast(err.message || 'Error al activar activos', 'error');
    }
  }
}

function openUserModal(user = null) {
  var d = function(id) { return document.getElementById(id); };
  var modal = d('user-modal');
  var title = d('user-modal-title');
  var passwordGroup = d('user-password-group');
  var confirmPasswordGroup = d('user-confirm-password-group');
  var overlay = d('modal-overlay');
  var form = d('user-form');

  if (user) {
    title.textContent = 'Editar Usuario';
    d('user-id').value = user.id;
    d('user-username').value = user.username || '';
    d('user-fullname').value = user.full_name || '';
    d('user-email').value = user.email || '';
    d('user-role').value = user.role || 'operator';
    d('user-password').value = '';
    d('user-confirm-password').value = '';
    if (passwordGroup) passwordGroup.style.display = 'none';
    if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'none';
  } else {
    title.textContent = 'Nuevo Usuario';
    if (form) form.reset();
    d('user-id').value = '';
    if (passwordGroup) passwordGroup.style.display = 'block';
    if (confirmPasswordGroup) confirmPasswordGroup.style.display = 'block';
  }

  if (overlay) overlay.classList.remove('hidden');
  if (modal) modal.classList.remove('hidden');
}

function editUser(id) {
  console.log('editUser called', id);
  var user = state.users.find(function(u) { return u.id === id; });
  if (user) openUserModal(user);
}

async function confirmDeleteUser(id, username) {
  const confirmed = await showConfirm('Desactivar Usuario', `¿Está seguro que desea desactivar el usuario ${username}?`);
  if (confirmed) {
    await deleteUser(id);
  }
}

async function resetUserPassword(id) {
  // Check permissions: admin can reset any, operator can only reset their own
  if (state.user.role !== 'admin' && state.user.id !== id) {
    showToast('Solo puedes reiniciar tu propia contraseña', 'error');
    return;
  }

  // Open reset password modal
  var d = function(id) { return document.getElementById(id); };
  var user = state.users.find(function(u) { return u.id === id; });
  var title = d('reset-password-title');

  if (title) title.textContent = 'Reiniciar Contraseña: ' + (user ? user.username : '');
  d('reset-password-user-id').value = id;

  // Clear password fields
  d('reset-password-new').value = '';
  d('reset-password-confirm').value = '';

  var modal = d('reset-password-modal');
  var overlay = d('modal-overlay');
  if (overlay) overlay.classList.remove('hidden');
  if (modal) modal.classList.remove('hidden');
}

// ===== Modal Functions =====
function showConfirm(title, message) {
  return new Promise(function(resolve) {
    var d = function(id) { return document.getElementById(id); };
    var titleEl = d('confirm-title');
    var msgEl = d('confirm-message');
    var overlay = d('modal-overlay');
    var modal = d('confirm-modal');
    var confirmBtn = d('btn-confirm');
    
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (overlay) overlay.classList.remove('hidden');
    if (modal) modal.classList.remove('hidden');

    function cleanup() {
      if (confirmBtn) {
        confirmBtn.removeEventListener('click', handleConfirm);
        confirmBtn.removeEventListener('click', handleCancel);
      }
      if (modal) modal.classList.add('hidden');
      if (overlay) overlay.classList.add('hidden');
    }

    function handleConfirm() {
      cleanup();
      resolve(true);
    }

    function handleCancel() {
      cleanup();
      resolve(false);
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', handleConfirm);
    }
    
    // Also handle cancel button
    var cancelBtn = document.querySelector('[data-close="confirm-modal"]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', handleCancel);
    }
  });
}

function closeModal() {
  var modals = document.querySelectorAll('.modal');
  modals.forEach(function(m) { m.classList.add('hidden'); });
  var overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===== Toast =====
function showToast(message, type = 'info') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// ===== Theme =====
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}

// ===== Event Handlers =====
function handleLogin(e) {
  e.preventDefault();
  
  // Use document.getElementById directly to ensure we get the right element
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  
  const username = usernameInput ? usernameInput.value : '';
  const password = passwordInput ? passwordInput.value : '';

  console.log('handleLogin clicked - username:', username, 'password length:', password ? password.length : 0);

  hide('login-error');

  login(username, password)
    .then(() => {
      console.log('Login successful!');
    })
    .catch(err => {
      console.log('Login error:', err.message);
      show('login-error');
      setText('login-error', err.message);
    });
}

function handleChangePassword(e) {
  e.preventDefault();
  
  // Use document.getElementById directly like in handleLogin
  const currentPasswordInput = document.getElementById('current-password');
  const newPasswordInput = document.getElementById('new-password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  
  const currentPassword = currentPasswordInput ? currentPasswordInput.value : '';
  const newPassword = newPasswordInput ? newPasswordInput.value : '';
  const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';

  console.log('handleChangePassword - current:', currentPassword ? 'set' : 'empty', 'new:', newPassword.length, 'confirm:', confirmPassword.length);

  hide('password-error');

  if (newPassword !== confirmPassword) {
    show('password-error');
    setText('password-error', 'Las contraseñas no coinciden');
    return;
  }

  changePassword(currentPassword, newPassword)
    .then(() => {
      console.log('Password changed successfully!');
    })
    .catch(err => {
      console.log('Change password error:', err.message);
      show('password-error');
      setText('password-error', err.message);
    });
}

// Track if asset is being saved to prevent duplicate submissions
let isSavingAsset = false;

function handleAssetSubmit(e) {
  e.preventDefault();
  
  // Prevent duplicate submission
  if (isSavingAsset) {
    console.log('Asset already being saved, skipping...');
    return;
  }
  
  isSavingAsset = true;
  
  // Use document.getElementById directly
  const d = function(id) { return document.getElementById(id); };
  
  const assetData = {
    asset_number: d('asset-number').value || null,
    description: d('asset-description').value,
    responsible: d('asset-responsible').value,
    brand: d('asset-brand').value || null,
    model: d('asset-model').value || null,
    serial_number: d('asset-serial').value || null,
    acquisition_date: d('asset-acquisition').value || null,
    status: d('asset-status').value,
    category: d('asset-category').value || null,
    location: d('asset-location').value || null,
    notes: d('asset-notes').value || null
  };

  console.log('Asset data:', assetData);
  
  // Disable submit button while saving
  const submitBtn = d('asset-form').querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';
  }
  
  saveAsset(assetData).then(() => {
    closeModal();
    loadAssets();
  }).catch(err => {
    console.error('Error saving asset:', err);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Guardar';
    }
  }).finally(() => {
    isSavingAsset = false;
  });
}

function handleUserSubmit(e) {
  e.preventDefault();

  // Validate required fields
  var username = getValue('user-username');
  var fullName = getValue('user-fullname');
  var password = getValue('user-password');
  var confirmPassword = getValue('user-confirm-password');

  if (!username || !fullName) {
    showToast('Usuario y nombre completo requeridos', 'error');
    return;
  }

  // Check if creating new user (password field visible)
  var passwordGroup = document.getElementById('user-password-group');
  if (passwordGroup && passwordGroup.style.display !== 'none') {
    // New user - validate password
    if (!password || password.length < 6) {
      showToast('La contraseña debe tener al menos 6 caracteres', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showToast('Las contraseñas no coinciden', 'error');
      return;
    }
  }

  const userData = {
    username: username,
    full_name: fullName,
    email: getValue('user-email') || null,
    role: getValue('user-role') || 'operator',
    password: password || null
  };

  saveUser(userData).then(() => closeModal());
}

function handleResetPasswordSubmit(e) {
  e.preventDefault();

  var userId = getValue('reset-password-user-id');
  var newPassword = getValue('reset-password-new');
  var confirmPassword = getValue('reset-password-confirm');

  // Validate password
  if (!newPassword || newPassword.length < 6) {
    showToast('La contraseña debe tener al menos 6 caracteres', 'error');
    return;
  }
  if (newPassword !== confirmPassword) {
    showToast('Las contraseñas no coinciden', 'error');
    return;
  }

  // Call the API to reset password
  resetUserPasswordApi(userId, newPassword).then(function() {
    closeModal();
    showToast('Contraseña reiniciada correctamente', 'success');
  }).catch(function(err) {
    showToast(err.message || 'Error al reiniciar contraseña', 'error');
  });
}

function resetUserPasswordApi(userId, newPassword) {
  return apiRequest('/users/' + userId + '/reset-password', {
    method: 'POST',
    body: JSON.stringify({ newPassword: newPassword })
  });
}

function handleBrandingSubmit(e) {
  e.preventDefault();

  const brandingData = {
    app_name: getValue('app-name-input'),
    login_title: getValue('login-title-input'),
    login_subtitle: getValue('login-subtitle-input'),
    primary_color: getValue('primary-color-input'),
    secondary_color: getValue('secondary-color-input')
  };

  saveBranding(brandingData);
}

function handleResetColors() {
  // Reset to default colors (keep current text values)
  var defaultColors = {
    app_name: getValue('app-name-input'),
    login_title: getValue('login-title-input'),
    login_subtitle: getValue('login-subtitle-input'),
    primary_color: '#0d9488',
    secondary_color: '#0f766e'
  };

  // Update the input fields
  setValue('primary-color-input', '#0d9488');
  setValue('secondary-color-input', '#0f766e');

  // Save and apply
  saveBranding(defaultColors);
}

function handleResetBrandingTexts() {
  // Reset texts to defaults
  var defaultTexts = {
    app_name: 'Control de Activos',
    login_title: 'Control de Activos',
    login_subtitle: 'Sistema de Gestión',
    primary_color: getValue('primary-color-input'),
    secondary_color: getValue('secondary-color-input')
  };

  // Update the input fields
  setValue('app-name-input', 'Control de Activos');
  setValue('login-title-input', 'Control de Activos');
  setValue('login-subtitle-input', 'Sistema de Gestión');

  // Save and apply
  saveBranding(defaultTexts);
}

function handleLogoUpload(e) {
  e.preventDefault();
  const file = $('#logo-input').files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('logo', file);

  apiRequest('/branding/logo', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${state.token}` },
    body: formData
  }).then(() => {
    loadBranding();
    showToast('Logo actualizado', 'success');
  }).catch(err => showToast(err.message, 'error'));
}

function handleBgUpload(e) {
  e.preventDefault();
  const file = $('#bg-input').files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('background', file);

  apiRequest('/branding/login-background', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${state.token}` },
    body: formData
  }).then(() => {
    loadBranding();
    showToast('Fondo actualizado', 'success');
  }).catch(err => showToast(err.message, 'error'));
}

function handleRetirementHeaderSubmit(e) {
  e.preventDefault();

  const brandingData = {
    retirement_header_line1: getValue('retirement-header-line1'),
    retirement_header_line2: getValue('retirement-header-line2'),
    retirement_header_line3: getValue('retirement-header-line3'),
    retirement_header_line4: getValue('retirement-header-line4'),
    retirement_header_title: getValue('retirement-header-title'),
    retirement_header_note: getValue('retirement-header-note')
  };

  saveBranding(brandingData);
}

async function handleNavClick(e) {
  const target = e.target.closest('[data-view]');
  if (!target) return;

  e.preventDefault();
  const view = target.dataset.view;
  console.log('handleNavClick - view:', view);

  state.currentView = view;

  // Update nav
  $$('.nav-item').forEach(el => el.classList.remove('active'));
  target.classList.add('active');

  // Update page title
  const titles = {
    dashboard: 'Dashboard',
    assets: 'Activos',
    users: 'Usuarios',
    audit: 'Bitácora',
    branding: 'Branding'
  };
  setText('page-title', titles[view] || view);

  showPage(view);

  // Load data for view
  switch (view) {
    case 'dashboard':
      await loadStats();
      break;
    case 'assets':
      await loadAssets();
      break;
    case 'users':
      await loadUsers();
      break;
    case 'audit':
      await loadAudit();
      break;
    case 'branding':
      await loadBranding(); // Reload branding each time
      break;
  }
}

function handleMenuToggle() {
  $('#sidebar').classList.toggle('open');
}

// ===== Initialize =====
async function init() {
  // Apply saved theme
  const theme = localStorage.getItem('theme');
  if (theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  // Check if logged in
  if (state.token) {
    try {
      const data = await apiRequest('/auth/me');
      state.user = data.user;

      if (data.user.must_change_password) {
        showView('change-password-view');
      } else {
        await loadBranding();
        showView('main-view');
        applyRolePermissions(); // Apply role-based visibility
      }
    } catch (err) {
      logout();
    }
  } else {
    showView('login-view');
  }
}

async function initMainApp() {
  // Check if token exists in localStorage
  const storedToken = localStorage.getItem('token');
  if (storedToken) {
    state.token = storedToken;
    // Validate token by calling /auth/me
    try {
      const data = await apiRequest('/auth/me');
      state.user = data.user;
    } catch (err) {
      // Token invalid - clear and show login
      state.token = null;
      state.user = null;
      localStorage.removeItem('token');
    }
  }

  if (!state.token || !state.user) {
    // Load branding first for login page
    await loadBranding();
    showView('login-view');
    return;
  }

  // Token is valid - load all data and show main view
  showView('loading-view');

  await Promise.all([
    loadBranding(),
    loadStats(),
    loadAssets(),
    loadUsers(),
    loadCatalogs()
  ]);

  // Apply role permissions AFTER all data loaded
  applyRolePermissions();

  showView('main-view');

  // Setup navigation listeners
  setupNavListeners();
}

// Apply role-based visibility
function applyRolePermissions() {
  const isAdmin = state.user?.role === 'admin';
  
  // FIRST: Remove all hidden classes (clean slate for role switch)
  $$('.admin-only').forEach(el => el.classList.remove('hidden'));
  $$('.operator-only').forEach(el => el.classList.remove('hidden'));
  
  // Hide admin-only items from non-admins
  if (!isAdmin) {
    $$('.admin-only').forEach(el => el.classList.add('hidden'));
  }

  // Show operator-only items only for non-admins
  if (isAdmin) {
    $$('.operator-only').forEach(el => el.classList.add('hidden'));
  } else {
    // Load profile data for operators
    loadProfileData();
  }

  // Update user info
  setText('user-name', state.user?.full_name || 'Usuario');
  setText('user-role', state.user?.role === 'admin' ? 'Admin' : 'Operador');
  setText('user-avatar', (state.user?.full_name || 'U')[0].toUpperCase());
  
  // Re-attach nav listeners (they may have been lost on DOM changes)
  setupNavListeners();
}

function setupNavListeners() {
  var navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(function(el) {
    el.removeEventListener('click', handleNavClick); // Remove duplicates
    el.addEventListener('click', handleNavClick);
  });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Setup pagination
  setupAuditPagination();

  initMainApp();

  // Login form
  $('#login-form')?.addEventListener('submit', handleLogin);

  // Change password form
  $('#change-password-form')?.addEventListener('submit', handleChangePassword);

  // Asset form
  $('#asset-form')?.addEventListener('submit', handleAssetSubmit);

  // User form
  $('#user-form')?.addEventListener('submit', handleUserSubmit);

  // Reset password form
  $('#reset-password-form')?.addEventListener('submit', handleResetPasswordSubmit);

  // Profile forms (for operators)
  $('#profile-form')?.addEventListener('submit', handleProfileSubmit);
  $('#profile-password-form')?.addEventListener('submit', handleProfilePasswordSubmit);

  // Branding form
  $('#branding-config-form')?.addEventListener('submit', handleBrandingSubmit);
  $('#retirement-header-form')?.addEventListener('submit', handleRetirementHeaderSubmit);

  // Reset colors button
  $('#btn-reset-colors')?.addEventListener('click', handleResetColors);

  // Reset branding texts button
  $('#btn-reset-branding')?.addEventListener('click', handleResetBrandingTexts);

  // Logo upload
  $('#logo-upload-form')?.addEventListener('submit', handleLogoUpload);

  // Reset logo button
  $('#btn-reset-logo')?.addEventListener('click', async () => {
    setText('confirm-title', 'Restablecer Logo');
    setText('confirm-message', '¿Está seguro que desea restablecer el logo por defecto?');
    show('modal-overlay');
    show('confirm-modal');
    
    // Set up confirm button for logo
    $('#btn-confirm').onclick = async () => {
      closeModal();
      await apiRequest('/branding/logo', { method: 'DELETE' });
      await loadBranding();
      showToast('Logo restablecido', 'success');
    };
  });

  // Reset background button
  $('#btn-reset-bg')?.addEventListener('click', async () => {
    setText('confirm-title', 'Restablecer Fondo');
    setText('confirm-message', '¿Está seguro que desea rétablcer el fondo de login por defecto?');
    show('modal-overlay');
    show('confirm-modal');
    
    // Set up confirm button for background
    $('#btn-confirm').onclick = async () => {
      closeModal();
      await apiRequest('/branding/login-background', { method: 'DELETE' });
      await loadBranding();
      showToast('Fondo restablecido', 'success');
    };
  });

  // Background upload
  $('#bg-upload-form')?.addEventListener('submit', handleBgUpload);

  // Logout button
  $('#btn-logout')?.addEventListener('click', logout);

  // Theme toggle
  $('#btn-theme')?.addEventListener('click', toggleTheme);

  // Menu toggle
  $('#menu-toggle')?.addEventListener('click', handleMenuToggle);

  // New asset button
  var newAssetBtn = document.getElementById('btn-new-asset');
  if (newAssetBtn) {
    newAssetBtn.addEventListener('click', function() {
      console.log('btn-new-asset clicked');
      var modal = document.getElementById('asset-modal');
      var overlay = document.getElementById('modal-overlay');
      var form = document.getElementById('asset-form');
      var idInput = document.getElementById('asset-id');
      var title = document.getElementById('asset-modal-title');
      var status = document.getElementById('asset-status');
      
      if (form) form.reset();
      if (idInput) idInput.value = '';
      if (title) title.textContent = 'Nuevo Activo';
      if (status) status.value = 'Activo';
      if (overlay) overlay.classList.remove('hidden');
      if (modal) modal.classList.remove('hidden');
      
      console.log('Modal opened');
    });
  }

  // New user button
  $('#btn-new-user')?.addEventListener('click', function() {
    console.log('btn-new-user clicked');
    openUserModal();
  });

  // Modal close buttons
  var closeButtons = document.querySelectorAll('[data-close]');
  closeButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var modalId = this.getAttribute('data-close');
      var modal = document.getElementById(modalId);
      var overlay = document.getElementById('modal-overlay');
      if (modal) modal.classList.add('hidden');
      if (overlay && modalId && modalId.includes('modal')) overlay.classList.add('hidden');
    });
  });

  // Overlay click to close modal - DISABLED per user request
  // Users wanted modal to only close via Cancel/Guardar buttons

  // Download template
  $('#btn-download-template')?.addEventListener('click', downloadTemplate);

  // Export Excel
  $('#btn-export-excel')?.addEventListener('click', exportAssetsExcel);

  // Asset filters
  $('#asset-search')?.addEventListener('input', debounce(() => {
    loadAssets({ search: getValue('asset-search'), page: 1 });
  }, 300));

  $('#filter-status')?.addEventListener('change', () => {
    loadAssets({ status: getValue('filter-status'), page: 1 });
  });

  $('#filter-category')?.addEventListener('change', () => {
    loadAssets({ category: getValue('filter-category'), page: 1 });
  });

  // Audit filters (moved to loadAudit)
});

// Utility: debounce
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}