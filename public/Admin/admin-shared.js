// admin-shared.js
// Auth guard + profile + logout for all Admin pages.
// Include BEFORE any page-specific script.

const ADMIN_ROLE = localStorage.getItem('role');
const ADMIN_ID   = localStorage.getItem('adminId');
window.ADMIN_ID  = ADMIN_ID;

// 1. Client-side guard
if (!ADMIN_ID || ADMIN_ROLE !== 'ADMIN') {
  window.location.replace('/Login.html');
}

// 2. Server-side session verification
async function verifyAdminSession() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    if (!data.success || data.user?.role !== 'ADMIN') {
      adminLogout();
    }
  } catch {
    adminLogout();
  }
}

// 3. Setup admin profile chip in topbar
function setupAdminProfile() {
  const fullName = localStorage.getItem('fullName') || 'Admin';
  const avatarText = fullName.split(' ').map(w => w[0]).slice(-2).join('').toUpperCase() || 'AD';
  const el = document.getElementById('adminAvatar');
  const nameEl = document.getElementById('adminName');
  if (el) el.textContent = avatarText;
  if (nameEl) nameEl.textContent = fullName;
}

// 4. Logout
window.adminLogout = async function () {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch {}
  ['teacherId', 'studentId', 'adminId', 'fullName', 'role'].forEach(k => localStorage.removeItem(k));
  window.location.href = '/Login.html';
};

// 5. Toast notification system
const _toastContainer = (() => {
  const c = document.createElement('div');
  c.className = 'toast-container';
  document.body.appendChild(c);
  return c;
})();

window.showToast = function(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-msg">${msg}</span>`;
  _toastContainer.appendChild(t);
  setTimeout(() => {
    t.classList.add('hiding');
    t.addEventListener('animationend', () => t.remove());
  }, 3800);
};

// 6. Confirm dialog helper
window.showConfirm = function({ title, message, confirmText = 'Xóa', onConfirm }) {
  const backdrop = document.getElementById('confirmModal');
  if (!backdrop) return;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  const btn = document.getElementById('confirmBtn');
  btn.textContent = confirmText;
  backdrop.classList.add('open');
  const closeConfirm = () => { backdrop.classList.remove('open'); };
  document.getElementById('confirmCancelBtn').onclick = closeConfirm;
  backdrop.onclick = (e) => { if (e.target === backdrop) closeConfirm(); };
  btn.onclick = async () => {
    closeConfirm();
    await onConfirm();
  };
};

// 7. Pagination helper
window.buildPagination = function(container, { current, total, limit, onPage }) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  let html = `<button class="page-btn" ${current === 1 ? 'disabled' : ''} data-p="${current - 1}">‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - current) <= 1) {
      html += `<button class="page-btn ${i === current ? 'active' : ''}" data-p="${i}">${i}</button>`;
    } else if (Math.abs(i - current) === 2) {
      html += `<span class="page-btn" style="pointer-events:none;border:none;background:none">…</span>`;
    }
  }
  html += `<button class="page-btn" ${current === totalPages ? 'disabled' : ''} data-p="${current + 1}">›</button>`;
  container.innerHTML = html;
  container.querySelectorAll('[data-p]').forEach(btn => {
    btn.addEventListener('click', () => onPage(parseInt(btn.dataset.p)));
  });
};

// Run on load
setupAdminProfile();
verifyAdminSession();
