// teacher-assignmentReview.js
// Powers the "Kiểm tra bài nộp" (Assignment Review) page

(() => {
  "use strict";

  const HOMEWORK_ID = new URLSearchParams(window.location.search).get('homeworkId');
  const SUBMISSION_ID = new URLSearchParams(window.location.search).get('submissionId');
  const API_BASE = '/api';
  const TEACHER_ID = window.TEACHER_ID; // Defined in shared_auth.js
  const $ = (selector, root = document) => root.querySelector(selector);

  let currentSubmissions = [];
  let currentSubmission = null;

  // ── Helper Functions ─────────────────────────────────────────────
  
  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDateTime(isoString) {
    if (!isoString) return "—";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  function isGraded(item) {
    return item.score !== null && item.score !== undefined;
  }

  function showToast(title, message, type = "success") {
    let toastRegion = $("#toastRegion");
    if (!toastRegion) {
      toastRegion = document.createElement("div");
      toastRegion.id = "toastRegion";
      toastRegion.className = "toast-region";
      toastRegion.setAttribute("aria-live", "polite");
      toastRegion.setAttribute("aria-atomic", "true");
      document.body.appendChild(toastRegion);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${type === "error" ? "error" : ""}`;
    toast.innerHTML = `
      <div class="toast-icon">
        <svg><use href="#${type === "error" ? "i-alert" : "i-check"}"></use></svg>
      </div>
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
    toastRegion.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function isValidHttpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  function buildPreviewHtml(fileLink) {
    if (!fileLink) {
      return `<p class="preview-empty" style="color:#888;">Học sinh chưa để lại liên kết bài làm.</p>`;
    }

    if (!isValidHttpUrl(fileLink)) {
      return `<p class="preview-empty" style="color:#c0392b;">Liên kết bài làm không hợp lệ (không phải URL http/https): "${escapeHtml(fileLink)}"</p>`;
    }

    const safeLink = escapeHtml(fileLink);

    // Scratch project
    const scratchMatch = fileLink.match(/scratch\.mit\.edu\/projects\/(\d+)/i);
    if (scratchMatch) {
      return `
        <div style="font-weight:bold; margin-bottom:8px;">🧩 Mô phỏng dự án Scratch</div>
        <iframe style="width:100%; height:400px; border:none; border-radius:8px;" src="https://scratch.mit.edu/projects/${scratchMatch[1]}/embed" allowtransparency="true" allowfullscreen loading="lazy"></iframe>
      `;
    }

    // TurboWarp mirror
    const turbowarpMatch = fileLink.match(/turbowarp\.org\/(\d+)/i);
    if (turbowarpMatch) {
      return `
        <div style="font-weight:bold; margin-bottom:8px;">🧩 Mô phỏng dự án Scratch (TurboWarp)</div>
        <iframe style="width:100%; height:400px; border:none; border-radius:8px;" src="https://turbowarp.org/${turbowarpMatch[1]}/embed" loading="lazy"></iframe>
      `;
    }

    // Trinket
    const trinketMatch = fileLink.match(/trinket\.io\/([\w-]+\/[\w-]+)/i);
    if (trinketMatch) {
      return `
        <div style="font-weight:bold; margin-bottom:8px;">🐍 Mô phỏng chương trình Python (Trinket)</div>
        <iframe style="width:100%; height:400px; border:none; border-radius:8px;" src="https://trinket.io/embed/${trinketMatch[1]}?runOption=run" loading="lazy"></iframe>
      `;
    }

    // Replit
    const replitMatch = fileLink.match(/replit\.com\/@([\w-]+)\/([\w-]+)/i);
    if (replitMatch) {
      return `
        <div style="font-weight:bold; margin-bottom:8px;">🐍 Mô phỏng chương trình Python (Replit)</div>
        <iframe style="width:100%; height:400px; border:none; border-radius:8px;" src="https://replit.com/@${replitMatch[1]}/${replitMatch[2]}?embed=true" loading="lazy"></iframe>
      `;
    }

    // Plain Python file / GitHub link
    if (/\.py(\?|$)/i.test(fileLink) || /github\.com/i.test(fileLink)) {
      return `
        <div style="font-weight:bold; margin-bottom:8px;">🐍 Bài làm Python</div>
        <p style="margin-bottom:8px; color:#555;">Không thể nhúng trực tiếp file này tại đây.</p>
        <a class="btn btn-secondary" href="${safeLink}" target="_blank" rel="noopener noreferrer">Mở bài làm trong tab mới</a>
      `;
    }

    // Fallback iframe
    return `
      <div style="font-weight:bold; margin-bottom:8px;">🔗 Xem trước bài làm</div>
      <iframe style="width:100%; height:400px; border:1px solid #cbd5e1; border-radius:8px;" src="${safeLink}" loading="lazy"></iframe>
      <p style="margin-top:8px; font-size:0.9em; color:#64748b;">Nếu không hiển thị được, hãy <a href="${safeLink}" target="_blank" rel="noopener noreferrer">mở bài làm trong tab mới</a>.</p>
    `;
  }

  // ── API Fetchers ─────────────────────────────────────────────────
  
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

  // ── Core Rendering ───────────────────────────────────────────────
  
  function renderAssignmentDetail(assignment) {
    document.getElementById('assignmentTitle').textContent = assignment.title || 'Bài tập';
    document.getElementById('detailClass').textContent = assignment.className || '—';
    document.getElementById('detailPoints').textContent = assignment.points != null ? `${assignment.points} điểm` : '—';
    document.getElementById('detailDeadline').textContent = formatDateTime(assignment.deadline);
    document.getElementById('detailStatus').textContent = assignment.status || '—';
    document.getElementById('detailDescription').textContent = assignment.note || 'Không có mô tả.';
  }

  function renderSubmissions(submissions) {
    const container = document.getElementById('submissionList');
    document.getElementById('submissionCount').textContent = `${submissions.length} nộp`;

    if (!submissions.length) {
      container.innerHTML = `
        <div class="empty-state" style="text-align:center; padding:40px 20px;">
          <div class="empty-illustration" style="font-size:48px; color:#cbd5e1; margin-bottom:16px;"><svg style="width:48px;height:48px;"><use href="#i-task"></use></svg></div>
          <h3 style="color:#334155;">Chưa có học sinh nộp bài</h3>
          <p style="color:#64748b;">Khi học sinh nộp bài, chúng sẽ xuất hiện ở đây.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = submissions
      .map((submission) => {
        const graded = isGraded(submission);
        const appealPending = submission.appealStatus === 'pending';
        const who = submission.studentName || submission.studentId || "Không rõ học sinh";
        
        return `
          <article class="assignment-card ${graded ? "graded" : "pending"}" data-id="${escapeHtml(submission.id)}">
            <div class="assignment-icon"><svg><use href="#i-users"></use></svg></div>
            <div class="assignment-main">
              <div class="assignment-title-row">
                <h3 class="assignment-title">${escapeHtml(who)}</h3>
                <span class="badge ${graded ? 'badge-completed' : 'badge-published'}">${graded ? 'Đã chấm' : 'Chờ chấm'}</span>
              </div>
              <div class="assignment-meta">
                <span class="meta-item"><svg><use href="#i-clock"></use></svg>${formatDateTime(submission.submittedAt)}</span>
                ${graded ? `<span class="meta-item"><svg><use href="#i-star"></use></svg>Điểm: ${submission.score}</span>` : ''}
              </div>
              ${submission.comment ? `<p class="assignment-desc" style="margin-top:8px;"><strong>Nhận xét:</strong> ${escapeHtml(submission.comment)}</p>` : ''}
              ${appealPending ? '<div style="margin-top:8px;"><span class="badge badge-warning" style="background:#fef3c7;color:#d97706;padding:2px 8px;border-radius:4px;font-size:12px;">Phúc khảo đang chờ</span></div>' : ''}
              ${submission.appealStatus && submission.appealStatus !== 'none' && submission.appealReason ? `<p class="assignment-desc" style="margin-top:4px;"><strong>Lý do phúc khảo:</strong> ${escapeHtml(submission.appealReason)}</p>` : ''}
            </div>
            <div class="card-actions" style="display:flex; align-items:center; gap:8px;">
              <button class="btn btn-primary grade-button" type="button" data-submission-id="${escapeHtml(submission.id)}">
                <svg><use href="#i-check"></use></svg>
                <span>${graded ? 'Sửa điểm' : 'Chấm bài'}</span>
              </button>
            </div>
          </article>`;
      })
      .join('');
  }

  // ── Integrated Grading Modal ──────────────────────────────────────
  
  function renderGradeDialog(submission) {
    const existingModal = document.getElementById('gradeModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'gradeModal';
    modal.className = 'modal-overlay active';
    
    modal.innerHTML = `
      <div class="modal-content">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
          <h2 style="margin:0; font-size:18px;">Chấm bài - ${escapeHtml(submission.studentName || 'Học sinh')}</h2>
          <button class="close-btn" type="button" data-close-modal style="background:none; border:none; font-size:20px; cursor:pointer;">&times;</button>
        </div>
        
        <div class="split-layout">
          <div class="split-left">
            <div style="background:#f8fafc; padding:12px; border-radius:8px; margin-bottom:16px; font-size:14px;">
              <div style="margin-bottom:6px;"><strong>Ngày nộp:</strong> ${formatDateTime(submission.submittedAt)}</div>
              <div style="word-break:break-all;"><strong>Bài làm:</strong> ${submission.fileLink ? `<a href="${escapeHtml(submission.fileLink)}" target="_blank" style="color:#0284c7;">${escapeHtml(submission.fileLink)}</a>` : '—'}</div>
            </div>

            <form id="gradeForm" novalidate>
              <input type="hidden" id="gradeSubmissionId" value="${escapeHtml(submission.id)}" />
              
              <div style="margin-bottom:16px;">
                <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px;">Điểm số <span style="color:red">*</span></label>
                <input id="gradeScore" type="number" min="0" step="0.1" value="${submission.score != null ? submission.score : ''}" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;" required />
              </div>
              
              <div style="margin-bottom:16px;">
                <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px;">Nhận xét cho học sinh</label>
                <textarea id="gradeComment" rows="4" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; resize:vertical;">${escapeHtml(submission.comment || '')}</textarea>
              </div>
              
              <div style="margin-bottom:24px;">
                <label style="display:block; margin-bottom:6px; font-weight:600; font-size:14px;">Trạng thái phúc khảo</label>
                <select id="gradeAppealStatus" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;">
                  <option value="done" ${submission.appealStatus === 'done' || submission.appealStatus === 'approved' ? 'selected' : ''}>Đã duyệt / Hoàn tất</option>
                  <option value="pending" ${submission.appealStatus === 'pending' ? 'selected' : ''}>Chờ phúc khảo</option>
                  <option value="rejected" ${submission.appealStatus === 'rejected' ? 'selected' : ''}>Từ chối</option>
                </select>
              </div>

              <div style="display:flex; gap:12px; justify-content:flex-end;">
                <button class="btn" type="button" data-close-modal style="padding:8px 16px; border:1px solid #ccc; border-radius:6px; background:#fff; cursor:pointer;">Hủy</button>
                <button class="btn btn-primary" type="submit" style="padding:8px 16px; background:#10b981; color:#fff; border:none; border-radius:6px; cursor:pointer;">Lưu điểm</button>
              </div>
            </form>
          </div>

          <div class="split-right">
            ${buildPreviewHtml(submission.fileLink)}
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);

    // Xử lý đóng modal
    modal.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => modal.remove());
    });

    // Xử lý nộp Form chấm bài trực tiếp tại đây
    const gradeForm = modal.querySelector('#gradeForm');
    gradeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      
      const submissionId = document.getElementById('gradeSubmissionId').value;
      const score = document.getElementById('gradeScore').value;
      const comment = document.getElementById('gradeComment').value.trim();
      const appealStatus = document.getElementById('gradeAppealStatus').value || 'done';

      if (score === "" || isNaN(Number(score)) || Number(score) < 0) {
        document.getElementById('gradeScore').focus();
        showToast("Lỗi", "Vui lòng nhập điểm hợp lệ.", "error");
        return;
      }

      try {
        await apiPost(`${API_BASE}/teacher/${encodeURIComponent(TEACHER_ID)}/submissions/${encodeURIComponent(submissionId)}/grade`, {
          score: Number(score),
          comment,
          appealStatus,
          homeworkId: HOMEWORK_ID
        });
        
        modal.remove();
        showToast("Đã lưu điểm", "Bài làm đã được chấm lại thành công.");
        await loadPageData();
      } catch (err) {
        showToast("Không thể lưu điểm", err.message, "error");
      }
    });

    setTimeout(() => document.getElementById('gradeScore').focus(), 100);
  }
  
  // ── Page Initialization ──────────────────────────────────────────

  async function loadPageData() {
    if (!HOMEWORK_ID) {
      document.getElementById('assignmentTitle').textContent = 'Bài tập không hợp lệ';
      document.getElementById('assignmentMeta').textContent = 'Không tìm thấy mã bài tập trong URL.';
      return;
    }

    try {
      const [assignment, submissions] = await Promise.all([
        apiGet(`${API_BASE}/teacher/${encodeURIComponent(TEACHER_ID)}/assignments/${encodeURIComponent(HOMEWORK_ID)}`),
        apiGet(`${API_BASE}/teacher/${encodeURIComponent(TEACHER_ID)}/assignments/${encodeURIComponent(HOMEWORK_ID)}/submissions`),
      ]);

      currentSubmissions = submissions;
      renderAssignmentDetail(assignment);
      renderSubmissions(submissions);

      // Tự động mở Modal chấm bài nếu chuyển hướng từ trang Phúc khảo
      if (SUBMISSION_ID) {
        const targetSub = currentSubmissions.find(s => String(s.id) === String(SUBMISSION_ID));
        if (targetSub) {
          renderGradeDialog(targetSub);
        }
      }
    } catch (err) {
      console.error(err);
      document.getElementById('submissionList').innerHTML = `<p style="padding:16px;color:#c0392b">❌ Không tải được dữ liệu: ${escapeHtml(err.message)}</p>`;
      showToast("Lỗi tải dữ liệu", err.message, "error");
    }
  }

  function handleSubmissionActions(event) {
    const gradeButton = event.target.closest('.grade-button');
    if (!gradeButton) return;
    
    const submissionId = gradeButton.dataset.submissionId;
    if (!submissionId) return;

    currentSubmission = currentSubmissions.find((submission) => String(submission.id) === String(submissionId)) || null;
    if (!currentSubmission) return;

    renderGradeDialog(currentSubmission);
  }

  // ── Event Listeners ──────────────────────────────────────────────

  window.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadPageData);
    
    const submissionList = document.getElementById('submissionList');
    if (submissionList) submissionList.addEventListener('click', handleSubmissionActions);
    
    loadPageData();
  });
})();