const HOMEWORK_ID = new URLSearchParams(window.location.search).get('homeworkId');
const API_BASE = '/api';
let currentSubmissions = [];
let currentSubmission = null;

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

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Lỗi server (${res.status})`);
  }
  return json.data;
}

function renderAssignmentDetail(assignment) {
  document.getElementById('assignmentTitle').textContent = assignment.title || 'Bài tập';
  document.getElementById('detailClass').textContent = assignment.className || '—';
  document.getElementById('detailPoints').textContent = assignment.points != null ? `${assignment.points} điểm` : '—';
  document.getElementById('detailDeadline').textContent = formatDate(assignment.deadline);
  document.getElementById('detailStatus').textContent = assignment.status || '—';
  document.getElementById('detailDescription').textContent = assignment.note || 'Không có mô tả.';
}

function renderSubmissions(submissions) {
  const container = document.getElementById('submissionList');
  document.getElementById('submissionCount').textContent = `${submissions.length} nộp`;

  if (!submissions.length) {
    container.innerHTML = '<p style="padding:16px;color:#888">Chưa có học sinh nộp bài.</p>';
    return;
  }

  container.innerHTML = submissions
    .map((submission) => {
      const graded = submission.score != null;
      const appealPending = submission.appealStatus === 'pending';
      return `
        <article class="assignment-card">
          <div class="assignment-icon"><svg><use href="#i-users"></use></svg></div>
          <div class="assignment-main">
            <div class="assignment-title-row">
              <h3 class="assignment-title">${escapeHtml(submission.studentName || submission.studentId)}</h3>
              <span class="badge ${graded ? 'badge-completed' : 'badge-published'}">${graded ? 'Đã chấm' : 'Chưa chấm'}</span>
            </div>
            <div class="assignment-meta">
              <span class="meta-item"><svg><use href="#i-class"></use></svg>${escapeHtml(submission.className)}</span>
              <span class="meta-item"><svg><use href="#i-calendar"></use></svg>Nộp lúc: ${formatDate(submission.submittedAt)}</span>
              ${graded ? `<span class="meta-item"><svg><use href="#i-star"></use></svg>Điểm: ${submission.score}</span>` : ''}
            </div>
            ${submission.comment ? `<p class="assignment-desc">Nhận xét: ${escapeHtml(submission.comment)}</p>` : ''}
            ${submission.fileLink ? `<p class="assignment-desc"><strong>Link bài nộp:</strong> <a href="${escapeHtml(submission.fileLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(submission.fileLink)}</a></p>` : ''}
            ${submission.appealStatus && submission.appealStatus !== 'none' ? `<p class="assignment-desc"><strong>Phúc khảo:</strong> ${escapeHtml(submission.appealStatus)}${submission.appealReason ? ` — ${escapeHtml(submission.appealReason)}` : ''}</p>` : ''}
            <div style="margin-top:12px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <button class="btn btn-primary grade-button" type="button" data-submission-id="${escapeHtml(submission.id)}">Chấm bài</button>
              ${graded ? `<button class="btn btn-secondary reopen-button" type="button" data-submission-id="${escapeHtml(submission.id)}">Cập nhật điểm</button>` : ''}
              ${appealPending ? '<span class="badge badge-warning">Phúc khảo đang chờ</span>' : ''}
            </div>
          </div>
        </article>`;
    })
    .join('');
}

function renderGradeDialog() {
  if (document.getElementById('gradeModal')) return;

  const modal = document.createElement('div');
  modal.id = 'gradeModal';
  modal.className = 'modal-backdrop open';
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="gradeModalTitle">
      <div class="modal-header">
        <div class="modal-title-wrap">
          <div class="modal-title-icon"><svg><use href="#i-star"></use></svg></div>
          <div>
            <h2 id="gradeModalTitle">Chấm bài</h2>
            <p id="gradeModalSubtitle">Nhập điểm và nhận xét.</p>
          </div>
        </div>
        <button class="close-btn" type="button" data-close-modal aria-label="Đóng"><svg><use href="#i-close"></use></svg></button>
      </div>
      <form id="gradeForm" novalidate>
        <div class="modal-body">
          <input type="hidden" id="gradeSubmissionId" />
          <div class="field">
            <label for="gradeScore">Điểm</label>
            <input id="gradeScore" type="number" min="0" step="0.1" />
          </div>
          <div class="field">
            <label for="gradeComment">Nhận xét</label>
            <textarea id="gradeComment" rows="4" placeholder="Nhập nhận xét cho học viên..."></textarea>
          </div>
          <div class="field">
            <label for="gradeAppealStatus">Trạng thái phúc khảo</label>
            <select id="gradeAppealStatus">
              <option value="">Không thay đổi</option>
              <option value="pending">Chờ phúc khảo</option>
              <option value="resolved">Đã giải quyết</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" type="button" data-close-modal>Hủy</button>
          <button class="btn btn-primary" type="submit">Lưu điểm</button>
        </div>
      </form>
    </div>`;

  document.body.appendChild(modal);

  modal.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => modal.remove());
  });

  modal.addEventListener('mousedown', (event) => {
    if (event.target === modal) modal.remove();
  });

  document.getElementById('gradeForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submissionId = document.getElementById('gradeSubmissionId').value;
    const score = document.getElementById('gradeScore').value;
    const comment = document.getElementById('gradeComment').value;
    const appealStatus = document.getElementById('gradeAppealStatus').value;

    try {
      await apiPost(`${API_BASE}/teacher/${encodeURIComponent(window.TEACHER_ID)}/submissions/${encodeURIComponent(submissionId)}/grade`, {
        score: Number(score),
        comment,
        appealStatus: appealStatus || undefined,
      });
      modal.remove();
      await loadPageData();
      window.alert('Đã lưu điểm thành công.');
    } catch (err) {
      window.alert(`Không thể lưu điểm: ${err.message}`);
    }
  });
}

async function loadPageData() {
  if (!HOMEWORK_ID) {
    document.getElementById('assignmentTitle').textContent = 'Bài tập không hợp lệ';
    document.getElementById('assignmentMeta').textContent = 'Không tìm thấy mã bài tập trong URL.';
    return;
  }

  try {
    const [assignment, submissions] = await Promise.all([
      apiGet(`${API_BASE}/teacher/${encodeURIComponent(window.TEACHER_ID)}/assignments/${encodeURIComponent(HOMEWORK_ID)}`),
      apiGet(`${API_BASE}/teacher/${encodeURIComponent(window.TEACHER_ID)}/assignments/${encodeURIComponent(HOMEWORK_ID)}/submissions`),
    ]);

    currentSubmissions = submissions;
    renderAssignmentDetail(assignment);
    renderSubmissions(submissions);
  } catch (err) {
    console.error(err);
    document.getElementById('submissionList').innerHTML = `<p style="padding:16px;color:#c0392b">❌ Không tải được dữ liệu: ${escapeHtml(err.message)}</p>`;
  }
}

function handleSubmissionActions(event) {
  const gradeButton = event.target.closest('.grade-button, .reopen-button');
  if (!gradeButton) return;
  const submissionId = gradeButton.dataset.submissionId;
  if (!submissionId) return;

  currentSubmission = currentSubmissions.find((submission) => submission.id === submissionId) || null;
  renderGradeDialog();
  document.getElementById('gradeSubmissionId').value = submissionId;

  if (currentSubmission) {
    document.getElementById('gradeScore').value = currentSubmission.score != null ? currentSubmission.score : '';
    document.getElementById('gradeComment').value = currentSubmission.comment || '';
    document.getElementById('gradeAppealStatus').value = currentSubmission.appealStatus || '';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refreshBtn').addEventListener('click', loadPageData);
  document.getElementById('submissionList').addEventListener('click', handleSubmissionActions);
  loadPageData();
});