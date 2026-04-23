/* ═══════════════════════════════════════════
   DASHBOARD CLASES — app.js
   Firebase Firestore + GitHub API + Chart.js
═══════════════════════════════════════════ */

// ── GA4 Config ────────────────────────────
// Obtén este ID en: Google Cloud Console → APIs y servicios → Credenciales → OAuth 2.0
const GA4_CLIENT_ID = '329516504476-fr88jh978m3k58htd7uo637h996ccqde.apps.googleusercontent.com';

const GA4_PROPERTIES = {
  TI3011: '534160397',
  TI3032: '534168961',
  TI3031: '530804457',
};

// ── Constants ──────────────────────────────
const COURSES = {
  TI3011: { name: 'Lógica y Resolución de Problemas', color: 'purple', ghColor: '#8b5cf6' },
  TI3032: { name: 'Bases de Datos No Estructuradas',  color: 'blue',   ghColor: '#3b82f6' },
  TI3031: { name: 'Programación Frontend',            color: 'teal',   ghColor: '#14b8a6' },
};

const TYPE_ICONS = {
  sugerencia:   '💡',
  consulta:     '❓',
  error:        '🐛',
  felicitacion: '🎉',
};

const GH_OWNER = 'germardones';

// ── State ───────────────────────────────────
let allSuggestions = [];
let charts = {};
let db = null;
let activeFilter = { course: 'all', type: null };
let gaToken = null;

// ── Firebase Init ────────────────────────────
function initFirebase() {
  try {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    db = firebase.firestore();
    setupAuth();
  } catch (e) {
    console.warn('Firebase no configurado. Completa firebase-config.js', e);
    showFirebaseWarning();
  }
}

// ── Auth ─────────────────────────────────────
function setupAuth() {
  const overlay   = document.getElementById('loginOverlay');
  const loginBtn  = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const emailEl   = document.getElementById('loginEmail');
  const passEl    = document.getElementById('loginPass');
  const errorEl   = document.getElementById('loginError');

  // Watch auth state
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      overlay.classList.add('hidden');
      logoutBtn.style.display = 'flex';
      // Start data listeners only after auth
      if (!db._listeners) {
        db._listeners = true;
        listenSuggestions();
        loadGitHubStats();
      }
    } else {
      overlay.classList.remove('hidden');
      logoutBtn.style.display = 'none';
    }
  });

  // Login submit — also triggered by Enter key
  async function doLogin() {
    const email = emailEl.value.trim();
    const pass  = passEl.value;
    if (!email || !pass) { errorEl.textContent = 'Completa email y contraseña.'; return; }
    loginBtn.disabled = true;
    loginBtn.textContent = 'Ingresando...';
    errorEl.textContent = '';
    try {
      await firebase.auth().signInWithEmailAndPassword(email, pass);
    } catch (err) {
      const msgs = {
        'auth/invalid-email':    'Email inválido.',
        'auth/user-not-found':   'Usuario no encontrado.',
        'auth/wrong-password':   'Contraseña incorrecta.',
        'auth/invalid-credential': 'Credenciales incorrectas.',
        'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
      };
      errorEl.textContent = msgs[err.code] || 'Error al iniciar sesión.';
      loginBtn.disabled = false;
      loginBtn.textContent = 'Iniciar sesión';
    }
  }

  loginBtn.addEventListener('click', doLogin);
  passEl.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  // Logout
  logoutBtn.addEventListener('click', () => firebase.auth().signOut());
}

function showFirebaseWarning() {
  const banner = document.createElement('div');
  banner.style.cssText = `
    position: fixed; top: 64px; left: 0; right: 0; z-index: 999;
    background: #92400e; color: #fef3c7; padding: 0.75rem 2rem;
    font-size: 0.85rem; text-align: center; border-bottom: 1px solid #b45309;
  `;
  banner.innerHTML = `⚠️ <strong>Firebase no configurado.</strong> Edita <code>firebase-config.js</code> con tus credenciales para activar las sugerencias.`;
  document.body.appendChild(banner);
}

// ── Real-time Firestore listener ─────────────
function listenSuggestions() {
  db.collection('sugerencias')
    .orderBy('timestamp', 'desc')
    .onSnapshot(snapshot => {
      allSuggestions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateAllStats();
      renderRecentFeed();
      renderAllSuggestions();
      renderCourseFeed('TI3011');
      renderCourseFeed('TI3032');
      renderCourseFeed('TI3031');
      updateCharts();
      document.getElementById('lastUpdated').textContent = 'actualizado ' + timeAgo(new Date());
    }, err => {
      console.error('Firestore error:', err);
    });
}

// ── Stats ────────────────────────────────────
function updateAllStats() {
  const total   = allSuggestions.length;
  const unread  = allSuggestions.filter(s => !s.leida).length;
  const today   = allSuggestions.filter(s => isToday(s.timestamp?.toDate?.())).length;

  setEl('statSugerencias', total);
  setEl('statNoLeidas', unread);
  setEl('statHoy', today);

  // Per-course counts
  ['TI3011', 'TI3032', 'TI3031'].forEach((c, i) => {
    const n = allSuggestions.filter(s => s.curso === c).length;
    setEl(`c${i+1}-sugs`, n);
  });
}

// ── Feeds ────────────────────────────────────
function renderRecentFeed() {
  const recent = allSuggestions.slice(0, 6);
  const el = document.getElementById('recentFeed');
  el.innerHTML = recent.length ? recent.map(sugCard).join('') : emptyState('Aún no hay sugerencias.');
}

function renderAllSuggestions() {
  const el = document.getElementById('allSuggestions');
  const filtered = filterSuggestions(allSuggestions);
  el.innerHTML = filtered.length ? filtered.map(sugCard).join('') : emptyState('No hay resultados para este filtro.');
}

function renderCourseFeed(curso) {
  const el = document.getElementById(`feed-${curso}`);
  if (!el) return;
  const items = allSuggestions.filter(s => s.curso === curso);
  el.innerHTML = items.length ? items.slice(0, 20).map(sugCard).join('') : emptyState(`No hay sugerencias para ${curso} aún.`);
}

function filterSuggestions(list) {
  return list.filter(s => {
    const matchCourse = activeFilter.course === 'all' || s.curso === activeFilter.course;
    const matchType   = !activeFilter.type || s.tipo === activeFilter.type;
    return matchCourse && matchType;
  });
}

function sugCard(s) {
  const color = COURSES[s.curso]?.color || 'purple';
  const icon  = TYPE_ICONS[s.tipo] || '📝';
  const time  = s.timestamp?.toDate ? timeAgo(s.timestamp.toDate()) : 'Pendiente';
  const unread = !s.leida ? 'unread' : '';
  return `
    <div class="sug-card ${unread}">
      <div class="sug-type-icon">${icon}</div>
      <div class="sug-body">
        <div class="sug-meta">
          <span class="sug-name">${escHtml(s.nombre || 'Anónimo')}</span>
          <span class="sug-course ${color}">${s.curso || ''}</span>
          ${s.paralelo ? `<span class="sug-paralelo">Paralelo ${escHtml(s.paralelo)}</span>` : ''}
        </div>
        <div class="sug-msg">${escHtml(s.mensaje || '')}</div>
      </div>
      <div class="sug-actions">
        <div class="sug-time">${time}</div>
        <div class="sug-type-label">${s.tipo || ''}</div>
        <button class="sug-delete-btn" onclick="deleteSuggestion('${s.id}')" title="Eliminar sugerencia">🗑</button>
      </div>
    </div>`;
}

async function deleteSuggestion(id) {
  if (!confirm('¿Eliminar esta sugerencia? Esta acción no se puede deshacer.')) return;
  try {
    await db.collection('sugerencias').doc(id).delete();
  } catch (e) {
    alert('Error al eliminar: ' + e.message);
  }
}

function emptyState(msg) {
  return `<div class="feed-empty">${msg}</div>`;
}

// ── Charts ────────────────────────────────────
function initCharts() {
  Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#94a3b8';
  Chart.defaults.borderColor = 'rgba(148,163,184,0.1)';

  // Donut — by course
  charts.byCourse = new Chart(document.getElementById('chartByCourse'), {
    type: 'doughnut',
    data: {
      labels: ['TI3011', 'TI3032', 'TI3031'],
      datasets: [{ data: [0, 0, 0], backgroundColor: ['#8b5cf6', '#3b82f6', '#14b8a6'], borderWidth: 2, borderColor: 'transparent' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { padding: 16, boxWidth: 12 } } },
      cutout: '65%',
    }
  });

  // Bar — by type
  charts.byType = new Chart(document.getElementById('chartByType'), {
    type: 'bar',
    data: {
      labels: ['Sugerencia', 'Consulta', 'Error', 'Felicitación'],
      datasets: [{
        data: [0, 0, 0, 0],
        backgroundColor: ['rgba(139,92,246,0.7)', 'rgba(59,130,246,0.7)', 'rgba(239,68,68,0.7)', 'rgba(16,185,129,0.7)'],
        borderRadius: 6, borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(148,163,184,0.08)' } }, x: { grid: { display: false } } }
    }
  });

  // Bar — GA4 visits per course
  charts.ga4Visits = new Chart(document.getElementById('chartGA4Visits'), {
    type: 'bar',
    data: {
      labels: ['TI3011', 'TI3032', 'TI3031'],
      datasets: [
        {
          label: 'Sesiones',
          data: [0, 0, 0],
          backgroundColor: ['rgba(139,92,246,0.8)', 'rgba(59,130,246,0.8)', 'rgba(20,184,166,0.8)'],
          borderRadius: 6, borderSkipped: false,
        },
        {
          label: 'Usuarios',
          data: [0, 0, 0],
          backgroundColor: ['rgba(139,92,246,0.45)', 'rgba(59,130,246,0.45)', 'rgba(20,184,166,0.45)'],
          borderRadius: 6, borderSkipped: false,
        },
        {
          label: 'Vistas',
          data: [0, 0, 0],
          backgroundColor: ['rgba(139,92,246,0.2)', 'rgba(59,130,246,0.2)', 'rgba(20,184,166,0.2)'],
          borderRadius: 6, borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.08)' } },
        x: { grid: { display: false } },
      },
    },
  });

  // Line — GA4 daily visits per course
  charts.ga4Daily = new Chart(document.getElementById('chartGA4Daily'), {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.08)' } },
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
      },
      elements: { point: { radius: 2 }, line: { tension: 0.4 } },
    },
  });

  // Line — timeline (last 30 days)
  charts.timeline = new Chart(document.getElementById('chartTimeline'), {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(148,163,184,0.08)' } },
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } }
      },
      elements: { point: { radius: 3 }, line: { tension: 0.4 } }
    }
  });
}

function updateCharts() {
  if (!charts.byCourse) return;

  // By course
  const counts = ['TI3011', 'TI3032', 'TI3031'].map(c => allSuggestions.filter(s => s.curso === c).length);
  charts.byCourse.data.datasets[0].data = counts;
  charts.byCourse.update();

  // By type
  const types = ['sugerencia', 'consulta', 'error', 'felicitacion'];
  charts.byType.data.datasets[0].data = types.map(t => allSuggestions.filter(s => s.tipo === t).length);
  charts.byType.update();

  // Timeline — last 30 days
  const days = last30Days();
  const courseKeys = Object.keys(COURSES);
  const courseColors = ['#8b5cf6', '#3b82f6', '#14b8a6'];

  charts.timeline.data.labels = days.map(d => d.label);
  charts.timeline.data.datasets = courseKeys.map((curso, i) => ({
    label: curso,
    data: days.map(d => allSuggestions.filter(s => s.curso === curso && sameDay(s.timestamp?.toDate?.(), d.date)).length),
    borderColor: courseColors[i],
    backgroundColor: courseColors[i] + '22',
    fill: true,
  }));
  charts.timeline.update();
}

// ── GitHub API ────────────────────────────────
async function loadGitHubStats() {
  const courseMap = { TI3011: 'c1', TI3032: 'c2', TI3031: 'c3' };
  await Promise.allSettled(Object.keys(COURSES).map(async repo => {
    try {
      const r = await fetch(`https://api.github.com/repos/${GH_OWNER}/${repo}`);
      if (!r.ok) return;
      const d = await r.json();
      const key = courseMap[repo];
      setEl(`${key}-commits`, '—'); // commits need separate call
      setEl(`${key}-stars`,   d.stargazers_count ?? 0);
      setEl(`${key}-update`,  'Actualizado ' + timeAgo(new Date(d.pushed_at)));
      renderGHStats(repo, d);
    } catch { /* rate limited or offline */ }
  }));

  // Separate commit count call
  await Promise.allSettled(Object.keys(COURSES).map(async (repo, i) => {
    try {
      const r = await fetch(`https://api.github.com/repos/${GH_OWNER}/${repo}/commits?per_page=1`);
      const link = r.headers.get('Link') || '';
      const match = link.match(/page=(\d+)>; rel="last"/);
      const count = match ? match[1] : '—';
      setEl(`c${i+1}-commits`, count);
    } catch { /* ignore */ }
  }));
}

function renderGHStats(repo, d) {
  const el = document.getElementById(`gh-${repo}`);
  if (!el) return;
  el.innerHTML = `
    <div class="gh-stat"><span class="gh-stat-val">⭐ ${d.stargazers_count}</span><span class="gh-stat-lbl">Stars</span></div>
    <div class="gh-divider"></div>
    <div class="gh-stat"><span class="gh-stat-val">🍴 ${d.forks_count}</span><span class="gh-stat-lbl">Forks</span></div>
    <div class="gh-divider"></div>
    <div class="gh-stat"><span class="gh-stat-val">👁️ ${d.watchers_count}</span><span class="gh-stat-lbl">Watchers</span></div>
    <div class="gh-divider"></div>
    <div class="gh-stat"><span class="gh-stat-val">${d.open_issues_count}</span><span class="gh-stat-lbl">Issues abiertos</span></div>
    <div class="gh-divider"></div>
    <div class="gh-stat"><span class="gh-stat-val">${timeAgo(new Date(d.pushed_at))}</span><span class="gh-stat-lbl">Último push</span></div>
    <div style="margin-left:auto">
      <a href="${d.html_url}" target="_blank" class="btn-sm">↗ Repositorio</a>
    </div>
  `;
}

// ── Navigation ────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`view-${tab.dataset.view}`).classList.add('active');
    });
  });
}

function setupFilters() {
  document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter.course = btn.dataset.filter;
      renderAllSuggestions();
    });
  });
  document.querySelectorAll('.filter-btn[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      const already = btn.classList.contains('active');
      document.querySelectorAll('.filter-btn[data-type]').forEach(b => b.classList.remove('active'));
      if (!already) { btn.classList.add('active'); activeFilter.type = btn.dataset.type; }
      else { activeFilter.type = null; }
      renderAllSuggestions();
    });
  });
}

// ── Theme ─────────────────────────────────────
function setupTheme() {
  const btn = document.getElementById('themeBtn');
  const saved = localStorage.getItem('dashboard-theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  btn.textContent = saved === 'dark' ? '🌙' : '☀️';

  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    btn.textContent = next === 'dark' ? '🌙' : '☀️';
    localStorage.setItem('dashboard-theme', next);
  });
}

// ── Helpers ───────────────────────────────────
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(date) {
  if (!date || isNaN(date)) return '—';
  const sec = Math.floor((Date.now() - date) / 1000);
  if (sec < 60)   return 'hace un momento';
  if (sec < 3600) return `hace ${Math.floor(sec/60)} min`;
  if (sec < 86400)return `hace ${Math.floor(sec/3600)}h`;
  if (sec < 604800)return `hace ${Math.floor(sec/86400)} días`;
  return date.toLocaleDateString('es-CL');
}

function isToday(date) {
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() &&
         date.getMonth()    === now.getMonth() &&
         date.getDate()     === now.getDate();
}

function sameDay(date, ref) {
  if (!date) return false;
  return date.toDateString() === ref.toDateString();
}

function last30Days() {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return { date: d, label: d.toLocaleDateString('es-CL', { day:'numeric', month:'short' }) };
  });
}

// ── GA4 ──────────────────────────────────────
function initGA4() {
  const btn = document.getElementById('ga4ConnectBtn');
  if (!btn) return;

  if (GA4_CLIENT_ID.startsWith('REEMPLAZA')) {
    btn.textContent = 'Configura GA4_CLIENT_ID en app.js';
    btn.disabled = true;
    return;
  }

  function tryInit() {
    if (typeof google === 'undefined' || !google.accounts?.oauth2) {
      setTimeout(tryInit, 300);
      return;
    }
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GA4_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      callback: async (resp) => {
        if (resp.error) return;
        gaToken = resp.access_token;
        document.getElementById('ga4ConnectArea').style.display = 'none';
        document.getElementById('ga4CardsGrid').classList.add('connected');
        await loadAllGA4Data();
      },
    });
    btn.addEventListener('click', () => tokenClient.requestAccessToken());
  }
  tryInit();
}

async function fetchGA4Report(propertyId) {
  const resp = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gaToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'screenPageViews' },
        ],
      }),
    }
  );
  if (!resp.ok) throw new Error(`GA4 ${resp.status}`);
  return resp.json();
}

async function fetchGA4DailyReport(propertyId) {
  const resp = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gaToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
    }
  );
  if (!resp.ok) throw new Error(`GA4 ${resp.status}`);
  return resp.json();
}

async function loadAllGA4Data() {
  const ga4Data = {};
  const ga4Daily = {};
  await Promise.allSettled(
    Object.entries(GA4_PROPERTIES).map(async ([course, propId]) => {
      const el = document.getElementById(`ga4-${course}`);
      if (!el) return;
      try {
        const [data, daily] = await Promise.all([
          fetchGA4Report(propId),
          fetchGA4DailyReport(propId),
        ]);
        const vals      = data.rows?.[0]?.metricValues ?? [];
        const sessions  = Number(vals[0]?.value ?? 0);
        const users     = Number(vals[1]?.value ?? 0);
        const pageviews = Number(vals[2]?.value ?? 0);
        ga4Data[course] = { sessions, users, pageviews };
        ga4Daily[course] = Object.fromEntries(
          (daily.rows ?? []).map(r => [r.dimensionValues[0].value, Number(r.metricValues[0].value)])
        );
        el.innerHTML = `
          <div class="ga4-metric">
            <span class="ga4-val">${sessions.toLocaleString('es-CL')}</span>
            <span class="ga4-lbl">Sesiones</span>
          </div>
          <div class="ga4-metric">
            <span class="ga4-val">${users.toLocaleString('es-CL')}</span>
            <span class="ga4-lbl">Usuarios</span>
          </div>
          <div class="ga4-metric">
            <span class="ga4-val">${pageviews.toLocaleString('es-CL')}</span>
            <span class="ga4-lbl">Vistas</span>
          </div>`;
      } catch {
        el.innerHTML = `<span class="ga4-error">Sin acceso a esta propiedad</span>`;
      }
    })
  );
  updateGA4Chart(ga4Data);
  updateGA4DailyChart(ga4Daily);
}

function updateGA4DailyChart(ga4Daily) {
  if (!charts.ga4Daily) return;

  // Build sorted list of all dates across all courses
  const dateSet = new Set();
  Object.values(ga4Daily).forEach(byDate => Object.keys(byDate).forEach(d => dateSet.add(d)));
  const sortedDates = [...dateSet].sort();

  const courseColors = { TI3011: '#8b5cf6', TI3032: '#3b82f6', TI3031: '#14b8a6' };

  charts.ga4Daily.data.labels = sortedDates.map(d => `${d.slice(6,8)}/${d.slice(4,6)}`);
  charts.ga4Daily.data.datasets = Object.entries(ga4Daily).map(([course, byDate]) => ({
    label: course,
    data: sortedDates.map(d => byDate[d] ?? 0),
    borderColor: courseColors[course] ?? '#94a3b8',
    backgroundColor: (courseColors[course] ?? '#94a3b8') + '22',
    fill: true,
  }));
  charts.ga4Daily.update();

  const card = document.getElementById('ga4DailyChartCard');
  if (card) card.style.display = 'block';
}

function updateGA4Chart(ga4Data) {
  if (!charts.ga4Visits) return;
  const courses = ['TI3011', 'TI3032', 'TI3031'];
  charts.ga4Visits.data.datasets[0].data = courses.map(c => ga4Data[c]?.sessions  ?? 0);
  charts.ga4Visits.data.datasets[1].data = courses.map(c => ga4Data[c]?.users     ?? 0);
  charts.ga4Visits.data.datasets[2].data = courses.map(c => ga4Data[c]?.pageviews ?? 0);
  charts.ga4Visits.update();
  const card = document.getElementById('ga4VisitsChartCard');
  if (card) card.style.display = 'block';
}

// ── Boot ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  setupNav();
  setupFilters();
  initCharts();
  initFirebase();
  initGA4();
});
