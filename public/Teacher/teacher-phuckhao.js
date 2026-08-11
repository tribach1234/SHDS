const API_BASE = '/api';
let allRequests = [];

// Tự động nhận diện ID giáo viên từ shared_auth.js (hỗ trợ cả TEACHER_ID lẫn USER_ID)
const CURRENT_TEACHER_ID = window.TEACHER_ID || window.USER_ID || (typeof USER_ID !== 'undefined' ? USER_ID : '');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('vi-VN') : '—';
}

async function apiGet(path) {
  const res = await fetch(path);
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Lỗi server (${res.status})`);
  }
  return json.data;
}

function renderRequestList(requests) {
  const container = document.getElementById('requestList');
  document.getElementById('requestCount').textContent = `${requests.length} yêu cầu`;

  if (!requests.length) {
    container.innerHTML = '<p style="padding:16px;color:#888">Hiện tại không có yêu cầu phúc khảo nào cho lớp này.</p>';
    return;
  }

  container.innerHTML = requests
    .map((req) => {
      const statusLabel = req.appealStatus === 'pending' ? 'Đang chờ xử lý' : req.appealStatus;
      const statusClass = req.appealStatus === 'pending' ? 'badge-warning' : 'badge-completed';

      return `
        <article class="assignment-card" style="border:1px solid #e2e2e2; border-radius:8px; padding:16px; margin-bottom:12px; background:#fff;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
            <div class="assignment-main">
              <div class="assignment-title-row" style="display:flex; align-items:center; gap:10px;">
                <h3 class="assignment-title" style="margin:0;">${escapeHtml(req.studentName || req.studentId)}</h3>
                <span class="badge ${statusClass}">${escapeHtml(statusLabel)}</span>
              </div>
              <div class="assignment-meta" style="margin-top:6px; font-size:13px; color:#666;">
                <span class="meta-item">Lớp: <b>${escapeHtml(req.className || req.classId || '—')}</b></span> · 
                <span class="meta-item">Gửi lúc: ${formatDate(req.requestedAt)}</span>
              </div>
              <p class="assignment-desc" style="margin:8px 0 4px 0;"><strong>Bài tập:</strong> ${escapeHtml(req.homeworkTitle || '—')}</p>
              <p class="assignment-desc" style="margin:4px 0;"><strong>Lý do phúc khảo:</strong> <span style="color:#c0392b;">${escapeHtml(req.appealReason || 'Không có')}</span></p>
              <p class="assignment-desc" style="margin:4px 0; font-size:12px; color:#888;">Cập nhật lần cuối: ${formatDate(req.updatedAt)}</p>
            </div>
            
            <div style="text-align:right; white-space:nowrap;">
              <a href="teacher-assignmentManage.html?homeworkId=${encodeURIComponent(req.homeworkId)}&submissionId=${encodeURIComponent(req.submissionId)}" 
                 style="display:inline-block; padding:6px 12px; background:#27ae60; color:#fff; border-radius:6px; text-decoration:none; font-size:13px; font-weight:600;">
                 Chấm lại / Xử lý
              </a>
            </div>
          </div>
        </article>`;
    })
    .join('');
}

function populateClassFilter(requests) {
  const classFilter = document.getElementById('classFilter');
  const classMap = new Map();

  requests.forEach(req => {
    if (req.classId) {
      classMap.set(req.classId, req.className || req.classId);
    }
  });

  classFilter.innerHTML = '<option value="">Tất cả lớp học</option>';

  classMap.forEach((className, classId) => {
    const option = document.createElement('option');
    option.value = classId;
    option.textContent = className;
    classFilter.appendChild(option);
  });
}

function handleClassFilterChange() {
  const selectedClassId = document.getElementById('classFilter').value;
  if (!selectedClassId) {
    renderRequestList(allRequests);
  } else {
    const filtered = allRequests.filter(req => req.classId === selectedClassId);
    renderRequestList(filtered);
  }
}

async function loadPhucKhaoRequests() {
  try {
    if (!CURRENT_TEACHER_ID) {
      throw new Error("Không tìm thấy thông tin định danh giáo viên.");
    }
    allRequests = await apiGet(`${API_BASE}/teacher/${encodeURIComponent(CURRENT_TEACHER_ID)}/phuckhao`);
    populateClassFilter(allRequests);
    renderRequestList(allRequests);
  } catch (err) {
    const container = document.getElementById('requestList');
    container.innerHTML = `<p style="padding:16px;color:#c0392b">❌ Không tải được yêu cầu phúc khảo: ${escapeHtml(err.message)}</p>`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadPhucKhaoRequests();
  document.getElementById('classFilter').addEventListener('change', handleClassFilterChange);
});