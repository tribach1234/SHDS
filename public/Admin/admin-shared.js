// admin-shared.js — Auth guard + profile + logout for all Admin pages.
// Include BEFORE any page-specific script.

// 1. Client-side guard check function
function checkAdminAuth() {
  const role = localStorage.getItem('role');
  const adminId = localStorage.getItem('adminId') || localStorage.getItem('userId');
  
  if (!adminId || role !== 'ADMIN') {
    window.location.replace('/Login.html');
    return false;
  }
  
  // Expose globally dynamically for any legacy scripts
  window.ADMIN_ID = adminId;
  return adminId;
}

// Immediate guard check on load
if (!checkAdminAuth()) {
  throw new Error("Unauthorized");
}

// Safe dynamic fetch wrapper (prevents redeclaration errors if loaded twice)
if (!window._origFetch) {
  window._origFetch = window.fetch;
  window.fetch = async function (url, options = {}) {
    const currentAdminId = localStorage.getItem('adminId') || localStorage.getItem('userId') || '';
    options.headers = { ...(options.headers || {}), 'X-Admin-Id': currentAdminId };
    
    const response = await window._origFetch(url, options);
    
    const contentType = response.headers.get('content-type');
    if (!response.ok && contentType && contentType.includes('text/html')) {
      throw new Error(`Server returned HTML error (${response.status}). Check route URL.`);
    }

    // --- GLOBAL 404 ERROR INTERCEPTOR FOR STUDENTS ---
    if (response.status === 404 && typeof url === 'string' && url.includes('/api/admin/students/')) {
      if (typeof window.showToast === 'function') {
        window.showToast("Không tìm thấy học sinh (hoặc không thuộc quyền quản lý của bạn)!", "error");
      }
    }

    return response;
  };
}

// 2. Server-side session verification
async function verifyAdminSession() {
  try {
    const adminId = localStorage.getItem('adminId') || localStorage.getItem('userId');
    
    const res = await fetch('/api/me', {
      headers: {
        'x-admin-id': adminId,
        'x-user-role': 'ADMIN'
      }
    });
    
    const data = await res.json();
    
    // DEBUG: Inspect this output in your F12 Console
    console.log("🔍 /api/me response check:", { 
      httpStatus: res.status, 
      sentAdminId: adminId, 
      responseData: data 
    });

    if (!res.ok || !data.success || data.user?.role !== 'ADMIN') {
      console.warn("❌ Server rejected session, but logout is paused for debugging.");
      // adminLogout(); // <-- Temporarily disabled so you can read the console
    }
  } catch (err) {
    console.error("❌ Session verification error:", err);
    // adminLogout(); // <-- Temporarily disabled
  }
}

// 3. Setup admin profile chip in topbar[cite: 23]
function setupAdminProfile() {
  const fullName = localStorage.getItem('fullName') || 'Admin';
  const avatarText = fullName.split(' ').map(w => w[0]).slice(-2).join('').toUpperCase() || 'AD';
  const el = document.getElementById('adminAvatar');
  const nameEl = document.getElementById('adminName');
  if (el) el.textContent = avatarText;
  if (nameEl) nameEl.textContent = fullName;
}

// 4. Logout[cite: 23]
window.adminLogout = async function () {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch {}
  ['teacherId', 'studentId', 'adminId', 'fullName', 'role'].forEach(k => localStorage.removeItem(k));
  window.location.href = '/Login.html';
};

// 5. Toast notification system[cite: 23]
const _toastContainer = (() => {
  const c = document.createElement('div');
  c.className = 'toast-container';
  document.body.appendChild(c);
  return c;
})();

let _lastStudentErrorTime = 0;
let _lastGeneralToastMsg = '';
let _lastGeneralToastTime = 0;

window.showToast = function(msg, type = 'info') {
  const now = Date.now();
  const lowerMsg = msg.toLowerCase();
  
  // Smart filter for student-not-found errors (blocks all variations for 4 seconds)
  if (lowerMsg.includes('không tìm thấy học sinh')) {
    if (now - _lastStudentErrorTime < 4000) return;
    _lastStudentErrorTime = now;
  } else {
    // General deduplication for other toasts
    if (msg === _lastGeneralToastMsg && now - _lastGeneralToastTime < 3000) return;
    _lastGeneralToastMsg = msg;
    _lastGeneralToastTime = now;
  }

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

// 6. Confirm dialog helper[cite: 23]
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

// 7. Pagination helper[cite: 23]
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

// Run on load[cite: 23]
setupAdminProfile();
verifyAdminSession();