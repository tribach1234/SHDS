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
      // 1. Status Mapping
      const STATUS_MAP = {
        pending: { label: 'Đang chờ xử lý', badgeClass: 'status-badge-pending' },
        approved: { label: 'Đã chấp nhận', badgeClass: 'status-badge-approved' },
        rejected: { label: 'Đã từ chối', badgeClass: 'status-badge-rejected' },
        completed: { label: 'Đã chấm', badgeClass: 'status-badge-completed' }
      };

      const status = STATUS_MAP[req.appealStatus] || {
        label: escapeHtml(req.appealStatus || 'Đã chấm'),
        badgeClass: 'status-badge-completed'
      };

      // 2. Data formatting
      const studentName = escapeHtml(req.studentName || req.studentId || 'Học sinh');
      const className = escapeHtml(req.className || req.classId || '—');
      const homeworkTitle = escapeHtml(req.homeworkTitle || 'Buổi học/Bài tập');
      const reason = escapeHtml(req.appealReason || 'Không có lý do được cung cấp.');
      // Inside renderRequestList() in teacher-phuckhao.js:
const actionUrl = `teacher-assignmentReview.html?homeworkId=${encodeURIComponent(req.homeworkId)}&submissionId=${encodeURIComponent(req.submissionId)}`;
      const formattedTime = formatDate(req.requestedAt || req.submittedAt);
      const scoreText = req.score != null ? `Điểm: ${req.score}` : null;

      // 3. Render Card matching screenshot layout
      return `
        <article class="assignment-card">
          <!-- Left Icon Box -->
          <div class="status-icon-box">
            <svg class="check-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>

          <!-- Main Content -->
          <div class="card-content">
            <!-- Header: Title & Status Badge -->
            <div class="card-header">
              <h3 class="card-title">${homeworkTitle}</h3>
              <span class="status-badge ${status.badgeClass}">${status.label}</span>
            </div>

            <!-- Metadata Row -->
            <div class="card-meta">
              <span class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                ${className}
              </span>

              <span class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Nộp lúc: ${formattedTime}
              </span>

              <span class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                ${studentName}
              </span>

              ${scoreText ? `
              <span class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                ${scoreText}
              </span>` : ''}
            </div>

            <!-- Enlarged Prominent Reason Callout Block -->
            <div class="reason-block">
              <div class="reason-header">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                Lý do phúc khảo:
              </div>
              <p class="reason-text-large">${reason}</p>
            </div>

            <!-- Action Button -->
            <div class="card-action">
              <a href="${actionUrl}" class="btn-appeal">Chấm lại / Xử lý &rarr;</a>
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