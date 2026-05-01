/* PCTrack — Frontend (Netlify + Supabase) */

let devices  = [];
let deleteId = null;
let currentUser = null;

// ── API ──────────────────────────────────────
function getToken() { return localStorage.getItem('pctrack_token'); }
function setToken(t) { localStorage.setItem('pctrack_token', t); }
function clearToken() { localStorage.removeItem('pctrack_token'); }

async function api(method, path, body) {
  const token = getToken();
  const opts  = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// ── Boot ──────────────────────────────────────
(async () => {
  if (!getToken()) { showLogin(); return; }
  try {
    currentUser = await api('GET', '/auth/me');
    bootApp();
  } catch { clearToken(); showLogin(); }
})();

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display   = 'none';
}

async function bootApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display   = 'block';
  document.getElementById('navUsername').textContent   = currentUser.username;
  document.getElementById('navAvatar').textContent     = currentUser.username[0].toUpperCase();
  await loadDevices();
}

// ── Login ─────────────────────────────────────
document.getElementById('loginUser').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('loginPass').focus(); });
document.getElementById('loginPass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errEl    = document.getElementById('loginError');
  const spinner  = document.getElementById('loginSpinner');
  const btnText  = document.getElementById('loginBtnText');

  errEl.style.display = 'none';
  spinner.style.display = 'block';
  btnText.textContent = 'Verificando...';

  try {
    const res = await api('POST', '/auth/login', { username, password });
    setToken(res.token);
    currentUser = { username: res.username, role: res.role };
    bootApp();
  } catch(e) {
    document.getElementById('loginErrorMsg').textContent = e.message;
    errEl.style.display = 'flex';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginPass').focus();
  } finally {
    spinner.style.display = 'none';
    btnText.textContent = 'Iniciar sesión';
  }
}

async function doLogout() {
  clearToken();
  currentUser = null;
  showLogin();
}

function togglePass() {
  const inp  = document.getElementById('loginPass');
  const icon = document.getElementById('togglePassIcon');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  icon.className = inp.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
}

// ── Data ──────────────────────────────────────
async function loadDevices() {
  try { devices = await api('GET', '/devices'); render(); }
  catch(e) { toast(e.message, 'danger'); }
}

// ── Date helpers ──────────────────────────────
const today = () => new Date().toISOString().split('T')[0];

function addMonths(dateStr, months) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}
function daysFromNow(dateStr) {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr+'T12:00:00') - new Date(today()+'T12:00:00')) / 86400000);
}
function fmtDate(d) {
  if (!d) return '—';
  const [y,m,day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function alertStatus(d) {
  const next = d.last_maint ? addMonths(d.last_maint, parseInt(d.interval_months||6)) : null;
  if (!next) return 'pending-never';
  const days = daysFromNow(next);
  if (days < 0)   return 'overdue';
  if (days <= 30) return 'soon';
  return d.status === 'done' ? 'ok' : 'pending';
}

// ── Render ────────────────────────────────────
function render() { renderStats(); renderAlerts(); renderTable(); }

function renderStats() {
  const total   = devices.length;
  const ok      = devices.filter(d => alertStatus(d) === 'ok').length;
  const pending = devices.filter(d => ['pending','pending-never'].includes(alertStatus(d))).length;
  const overdue = devices.filter(d => alertStatus(d) === 'overdue').length;
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><div class="stat-icon-wrap si-blue"><i class="bi bi-hdd-stack"></i></div><div class="stat-info"><div class="val">${total}</div><div class="lbl">Total equipos</div></div></div>
    <div class="stat-card"><div class="stat-icon-wrap si-green"><i class="bi bi-check-circle-fill"></i></div><div class="stat-info"><div class="val">${ok}</div><div class="lbl">Al día</div></div></div>
    <div class="stat-card"><div class="stat-icon-wrap si-yellow"><i class="bi bi-hourglass-split"></i></div><div class="stat-info"><div class="val">${pending}</div><div class="lbl">Pendientes</div></div></div>
    <div class="stat-card"><div class="stat-icon-wrap si-red"><i class="bi bi-exclamation-triangle-fill"></i></div><div class="stat-info"><div class="val">${overdue}</div><div class="lbl">Vencidos</div></div></div>
  `;
}

function renderAlerts() {
  const area    = document.getElementById('alertsArea');
  const overdue = devices.filter(d => alertStatus(d) === 'overdue');
  const soon    = devices.filter(d => alertStatus(d) === 'soon');
  let html = '';
  if (overdue.length) html += `<div class="alert-strip overdue"><i class="bi bi-exclamation-octagon-fill"></i><div><strong>${overdue.length} equipo(s) con mantenimiento vencido:</strong> ${overdue.map(d=>`<span class="mono">${esc(d.name)}</span>`).join(', ')}</div></div>`;
  if (soon.length)    html += `<div class="alert-strip soon"><i class="bi bi-bell-fill"></i><div><strong>${soon.length} equipo(s) próximos (≤30 días):</strong> ${soon.map(d=>`<span class="mono">${esc(d.name)}</span>`).join(', ')}</div></div>`;
  area.innerHTML = html;
}

function renderTable() {
  const q   = (document.getElementById('searchInput').value||'').toLowerCase();
  const sf  = document.getElementById('filterStatus').value;
  const inf = document.getElementById('filterInterval').value;
  document.getElementById('clearFiltersBtn').style.display = (q||sf||inf) ? 'flex' : 'none';

  const filtered = devices.filter(d => {
    const matchQ = !q || [d.name,d.description,d.assigned_to,d.location].filter(Boolean).some(s=>s.toLowerCase().includes(q));
    const as = alertStatus(d);
    const matchS = !sf ||
      (sf==='ok'      && as==='ok') ||
      (sf==='pending' && ['pending','pending-never'].includes(as)) ||
      (sf==='overdue' && as==='overdue') ||
      (sf==='soon'    && as==='soon');
    const matchI = !inf || String(d.interval_months||6) === inf;
    return matchQ && matchS && matchI;
  });

  const body   = document.getElementById('devBody');
  const footer = document.getElementById('tableFooter');

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="7"><div class="empty-state">
      <i class="bi bi-hdd empty-icon"></i>
      <p>${devices.length===0 ? 'No hay equipos registrados todavía.' : 'Ningún equipo coincide con los filtros.'}</p>
      ${devices.length>0 ? `<p style="margin-top:.35rem;font-size:.78rem"><a href="#" onclick="clearFilters();return false">Limpiar filtros</a></p>` : ''}
    </div></td></tr>`;
    footer.innerHTML = '';
    return;
  }

  body.innerHTML = filtered.map(d => buildRow(d)).join('');
  footer.innerHTML = `<i class="bi bi-list-ul"></i> Mostrando ${filtered.length} de ${devices.length} equipos`;
}

function buildRow(d) {
  const as     = alertStatus(d);
  const months = parseInt(d.interval_months||6);
  const next   = d.last_maint ? addMonths(d.last_maint, months) : null;
  const days   = next ? daysFromNow(next) : null;

  let badge = '';
  if      (as==='overdue')      badge = `<span class="badge badge-overdue"><i class="bi bi-x-circle-fill"></i> Vencido</span>`;
  else if (as==='soon')         badge = `<span class="badge badge-soon"><i class="bi bi-bell-fill"></i> Próximo</span>`;
  else if (as==='ok')           badge = `<span class="badge badge-ok"><i class="bi bi-check-circle-fill"></i> Al día</span>`;
  else                          badge = `<span class="badge badge-pending"><i class="bi bi-hourglass-split"></i> Pendiente</span>`;

  let nextHtml = '<span class="date-mono">—</span>';
  if (next) {
    const cls    = as==='overdue' ? 'next-over' : as==='soon' ? 'next-warn' : 'next-ok';
    const dLabel = days===0 ? 'hoy' : days>0 ? `en ${days}d` : `hace ${Math.abs(days)}d`;
    nextHtml = `<div class="next-cell"><span class="next-date ${cls}">${fmtDate(next)}</span><span class="next-delta ${cls}">${dLabel}</span></div>`;
  }

  let progress = '';
  if (d.last_maint && next) {
    const elapsed = Math.abs(daysFromNow(d.last_maint));
    const pct     = Math.min(100, Math.round((elapsed / (months*30.4)) * 100));
    const color   = pct>=100 ? 'var(--red-h)' : pct>=80 ? 'var(--yellow-text)' : 'var(--green-text)';
    progress = `<div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div><span class="progress-pct">${pct}%</span></div>`;
  }

  const rowCls = as==='overdue' ? 'row-overdue' : as==='soon' ? 'row-soon' : '';
  return `<tr class="${rowCls}">
    <td class="cell-name">
      <div class="name-tag">${esc(d.name)}</div>
      <div class="desc-tag" title="${esc(d.description||'')}">${esc(d.description||'Sin descripción')}</div>
      ${progress}
    </td>
    <td>${badge}</td>
    <td class="d-none d-xl-table-cell"><span class="date-mono">${fmtDate(d.last_maint)}</span></td>
    <td class="d-none d-lg-table-cell">${nextHtml}</td>
    <td class="d-none d-md-table-cell"><span class="interval-tag"><i class="bi bi-arrow-repeat"></i> ${months===6?'6 meses':'1 año'}</span></td>
    <td class="d-none d-xl-table-cell">${d.assigned_to?`<span class="assigned-tag"><i class="bi bi-person-circle"></i> ${esc(d.assigned_to)}</span>`:'<span class="date-mono">—</span>'}</td>
    <td><div class="actions-cell">
      <button class="icon-btn view"    title="Ver detalle"             onclick="openDetail('${d.id}')"><i class="bi bi-eye"></i></button>
      <button class="icon-btn success" title="Registrar mantenimiento" onclick="markDone('${d.id}')"><i class="bi bi-check-lg"></i></button>
      <button class="icon-btn edit"    title="Editar equipo"           onclick="openEditModal('${d.id}')"><i class="bi bi-pencil"></i></button>
      <button class="icon-btn danger"  title="Eliminar"                onclick="openDeleteModal('${d.id}')"><i class="bi bi-trash3"></i></button>
    </div></td>
  </tr>`;
}

// ── Filters ───────────────────────────────────
document.getElementById('searchInput').addEventListener('input', renderTable);
document.getElementById('filterStatus').addEventListener('change', renderTable);
document.getElementById('filterInterval').addEventListener('change', renderTable);
function clearFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterInterval').value = '';
  renderTable();
}

// ── Add / Edit ────────────────────────────────
function openAddModal() {
  document.getElementById('deviceModalTitle').textContent = 'Agregar equipo';
  document.getElementById('deviceModalIcon').innerHTML = '<i class="bi bi-plus-lg"></i>';
  document.getElementById('deviceModalIcon').className = 'modal-icon';
  document.getElementById('saveDeviceLabel').textContent = 'Guardar equipo';
  ['editId','fName','fDesc','fLocation','fAssigned'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fStatus').value    = 'pending';
  document.getElementById('fInterval').value  = '6';
  document.getElementById('fLastMaint').value = today();
  new bootstrap.Modal(document.getElementById('deviceModal')).show();
  setTimeout(() => document.getElementById('fName').focus(), 350);
}

function openEditModal(id) {
  const d = devices.find(x=>x.id===id); if(!d) return;
  document.getElementById('deviceModalTitle').textContent = 'Editar equipo';
  document.getElementById('deviceModalIcon').innerHTML = '<i class="bi bi-pencil"></i>';
  document.getElementById('deviceModalIcon').className = 'modal-icon blue';
  document.getElementById('saveDeviceLabel').textContent = 'Guardar cambios';
  document.getElementById('editId').value     = d.id;
  document.getElementById('fName').value      = d.name;
  document.getElementById('fDesc').value      = d.description||'';
  document.getElementById('fLocation').value  = d.location||'';
  document.getElementById('fAssigned').value  = d.assigned_to||'';
  document.getElementById('fStatus').value    = d.status||'pending';
  document.getElementById('fInterval').value  = String(d.interval_months||6);
  document.getElementById('fLastMaint').value = d.last_maint||today();
  new bootstrap.Modal(document.getElementById('deviceModal')).show();
}

async function saveDevice() {
  const id   = document.getElementById('editId').value;
  const name = document.getElementById('fName').value.trim();
  if (!name) { toast('El nombre del equipo es requerido.','warning'); document.getElementById('fName').focus(); return; }
  const payload = {
    name,
    description:     document.getElementById('fDesc').value.trim(),
    location:        document.getElementById('fLocation').value.trim(),
    assigned_to:     document.getElementById('fAssigned').value.trim(),
    status:          document.getElementById('fStatus').value,
    interval_months: parseInt(document.getElementById('fInterval').value),
    last_maint:      document.getElementById('fLastMaint').value || null,
  };
  try {
    if (id) {
      const updated = await api('PUT', `/devices/${id}`, payload);
      devices = devices.map(d => d.id===id ? updated : d);
      toast(`Equipo "${name}" actualizado.`, 'success');
    } else {
      const created = await api('POST', '/devices', payload);
      devices.unshift(created);
      toast(`Equipo "${name}" agregado.`, 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('deviceModal')).hide();
    render();
  } catch(e) { toast(e.message,'danger'); }
}

// ── Mark done ─────────────────────────────────
async function markDone(id) {
  const d = devices.find(x=>x.id===id); if(!d) return;
  try {
    const updated = await api('PATCH', `/devices/${id}/done`);
    devices = devices.map(x => x.id===id ? updated : x);
    toast(`✅ Mantenimiento registrado para "${d.name}".`, 'success');
    render();
  } catch(e) { toast(e.message,'danger'); }
}

// ── Delete ────────────────────────────────────
function openDeleteModal(id) {
  const d = devices.find(x=>x.id===id); if(!d) return;
  deleteId = id;
  document.getElementById('deleteDeviceName').textContent = d.name;
  new bootstrap.Modal(document.getElementById('deleteModal')).show();
}
async function confirmDelete() {
  const d = devices.find(x=>x.id===deleteId); if(!d) return;
  try {
    await api('DELETE', `/devices/${deleteId}`);
    devices = devices.filter(x=>x.id!==deleteId);
    bootstrap.Modal.getInstance(document.getElementById('deleteModal')).hide();
    toast(`Equipo "${d.name}" eliminado.`, 'danger');
    render();
  } catch(e) { toast(e.message,'danger'); }
  deleteId = null;
}

// ── Detail ────────────────────────────────────
function openDetail(id) {
  const d = devices.find(x=>x.id===id); if(!d) return;
  const as     = alertStatus(d);
  const months = parseInt(d.interval_months||6);
  const next   = d.last_maint ? addMonths(d.last_maint, months) : null;
  const days   = next ? daysFromNow(next) : null;

  let badge = '';
  if      (as==='overdue') badge = `<span class="badge badge-overdue"><i class="bi bi-x-circle-fill"></i> Vencido (hace ${Math.abs(days)} días)</span>`;
  else if (as==='soon')    badge = `<span class="badge badge-soon"><i class="bi bi-bell-fill"></i> Próximo en ${days} días</span>`;
  else if (as==='ok')      badge = `<span class="badge badge-ok"><i class="bi bi-check-circle-fill"></i> Al día</span>`;
  else                     badge = `<span class="badge badge-pending"><i class="bi bi-hourglass-split"></i> Pendiente</span>`;

  let progressHtml = '';
  if (d.last_maint && next) {
    const elapsed = Math.abs(daysFromNow(d.last_maint));
    const pct     = Math.min(100, Math.round((elapsed/(months*30.4))*100));
    const color   = pct>=100 ? 'var(--red-h)' : pct>=80 ? 'var(--yellow-text)' : 'var(--green-text)';
    progressHtml = `<div class="detail-full"><div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--text-muted);margin-bottom:.25rem"><span>Progreso del ciclo</span><span class="mono">${pct}%</span></div><div class="detail-progress-bar"><div class="detail-progress-fill" style="width:${pct}%;background:${color}"></div></div></div>`;
  }

  document.getElementById('detailTitle').textContent = d.name;
  document.getElementById('detailBody').innerHTML = `<div class="detail-grid">
    <div class="detail-field detail-full"><label>Estado</label><div class="val">${badge}</div></div>
    <div class="detail-field"><label>Descripción</label><div class="val">${esc(d.description||'—')}</div></div>
    <div class="detail-field"><label>Ubicación</label><div class="val"><i class="bi bi-geo-alt" style="color:var(--text-muted)"></i> ${esc(d.location||'—')}</div></div>
    <div class="detail-field"><label>Usuario asignado</label><div class="val"><i class="bi bi-person" style="color:var(--text-muted)"></i> ${esc(d.assigned_to||'—')}</div></div>
    <div class="detail-field"><label>Intervalo</label><div class="val"><i class="bi bi-arrow-repeat" style="color:var(--text-muted)"></i> ${months===6?'Cada 6 meses':'Cada 1 año'}</div></div>
    <div class="detail-field"><label>Último mantenimiento</label><div class="val mono">${fmtDate(d.last_maint)}</div></div>
    <div class="detail-field"><label>Próximo mantenimiento</label><div class="val mono ${as==='overdue'?'next-over':as==='soon'?'next-warn':'next-ok'}">${fmtDate(next)}</div></div>
    <div class="detail-field"><label>ID del equipo</label><div class="val mono" style="font-size:.72rem;color:var(--text-muted)">${d.id}</div></div>
    ${progressHtml}
  </div>`;
  document.getElementById('detailFooter').innerHTML = `
    <button class="btn-ghost" data-bs-dismiss="modal">Cerrar</button>
    <button class="btn-ghost" onclick="openEditModal('${d.id}');bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide()"><i class="bi bi-pencil"></i> Editar</button>
    <button class="btn-primary" onclick="markDone('${d.id}');bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide()"><i class="bi bi-check-lg"></i> Registrar mantenimiento hoy</button>
  `;
  new bootstrap.Modal(document.getElementById('detailModal')).show();
}

// ── Log ───────────────────────────────────────
async function openLogModal() {
  const body = document.getElementById('logBody');
  body.innerHTML = `<div class="empty-state"><div class="btn-spinner mx-auto" style="width:24px;height:24px;border-color:var(--border);border-top-color:var(--text-muted)"></div></div>`;
  new bootstrap.Modal(document.getElementById('logModal')).show();
  try {
    const logs = await api('GET', '/devices/meta/log');
    if (!logs.length) { body.innerHTML=`<div class="empty-state"><i class="bi bi-clock-history empty-icon"></i><p>No hay actividad registrada.</p></div>`; return; }
    const cm = {blue:'var(--blue-h)',green:'var(--green-text)',red:'var(--red-h)',yellow:'var(--yellow-text)'};
    body.innerHTML = logs.map(e => {
      const dt = new Date(e.created_at);
      const ts = dt.toLocaleDateString('es') + ' · ' + dt.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
      return `<div class="log-entry"><div class="log-dot" style="background:${cm[e.color]||'var(--text-muted)'}"></div><div><div class="log-text">${esc(e.message)}</div><div class="log-meta"><span>${ts}</span>${e.username?`<span><i class="bi bi-person"></i> ${esc(e.username)}</span>`:''}</div></div></div>`;
    }).join('');
  } catch(e) { body.innerHTML=`<div class="empty-state"><p style="color:var(--red-h)">${esc(e.message)}</p></div>`; }
}

async function clearLog() {
  if (!confirm('¿Limpiar todo el historial?')) return;
  try {
    await api('DELETE', '/devices/meta/log');
    bootstrap.Modal.getInstance(document.getElementById('logModal')).hide();
    toast('Historial limpiado.','warning');
  } catch(e) { toast(e.message,'danger'); }
}

// ── Toast ─────────────────────────────────────
function toast(msg, type='success') {
  const icons  = {success:'bi-check-circle-fill',danger:'bi-x-circle-fill',warning:'bi-exclamation-triangle-fill',info:'bi-info-circle-fill'};
  const colors = {success:'var(--green-text)',danger:'var(--red-h)',warning:'var(--yellow-text)',info:'var(--blue-h)'};
  const el = document.createElement('div');
  el.className = 'gh-toast';
  el.innerHTML = `<i class="bi ${icons[type]||icons.info}" style="color:${colors[type]};flex-shrink:0;font-size:1rem"></i><span>${esc(msg)}</span>`;
  document.getElementById('toastArea').appendChild(el);
  setTimeout(() => { el.classList.add('toast-fade-out'); setTimeout(()=>el.remove(),250); }, 3500);
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
