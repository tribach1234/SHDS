// teacher-assignmentReview.js
// Powers the "Kiểm tra bài nộp" (Assignment Review) page
// Merged with enhanced grading capabilities from teacher-grading.js

(() => {
  "use strict";

  const HOMEWORK_ID = new URLSearchParams(window.location.search).get('homeworkId');
  const API_BASE = '/api';
  const TEACHER_ID = window.TEACHER_ID; // Defined in shared_auth.js

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

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

  // ── Simulation preview (Scratch / Python auto-detect) ──────────────
  
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
      <p style="margin-top:8px; font-size:0.9em; color:#64748b;">Nếu không hiển thị được (do trang chặn nhúng), hãy <a href="${safeLink}" target="_blank" rel="noopener noreferrer">mở bài làm trong tab mới</a>.</p>
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
                <span class="meta-item"><svg><use href="#i-class"></use></svg>${escapeHtml(submission.className || '')}</span>
                <span class="meta-item"><svg><use href="#i-clock"></use></svg>${formatDateTime(submission.submittedAt)}</span>
                ${graded ? `<span class="meta-item"><svg><use href="#i-star"></use></svg>Điểm: ${submission.score}</span>` : ''}
              </div>
              ${submission.comment ? `<p class="assignment-desc" style="margin-top:8px;"><strong>Nhận xét:</strong> ${escapeHtml(submission.comment)}</p>` : ''}
              ${appealPending ? '<div style="margin-top:8px;"><span class="badge badge-warning">Phúc khảo đang chờ</span></div>' : ''}
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
  
  function renderGradeDialog() {
    if (document.getElementById('gradeModal')) return;

    const modal = document.createElement('div');
    modal.id = 'gradeModal';
    modal.className = 'modal-backdrop open';
    
    // Injecting a 2-column layout to handle the dynamic simulation capabilities gracefully 
    modal.innerHTML = `
      <style>
        .split-layout { display: flex; flex-wrap: wrap; gap: 32px; padding: 28px; }
        .split-left { flex: 0 0 360px; max-width: 100%; }
        .split-right { flex: 1 1 650px; border-left: 1px solid #e2e8f0; padding-left: 32px; min-height: 550px; }
        @media (max-width: 900px) {
          .split-left { flex: 1 1 100%; }
          .split-right { border-left: none; padding-left: 0; border-top: 1px solid #e2e8f0; padding-top: 24px; min-height: auto; }
        }
      </style>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="gradeModalTitle" style="max-width:1400px; width:95%; max-height:90vh; overflow-y:auto;">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <div class="modal-title-icon"><svg><use href="#i-check"></use></svg></div>
            <div>
              <h2 id="gradeModalTitle">Chấm bài</h2>
              <p id="gradeModalSubtitle">Nhập điểm, nhận xét và xem mô phỏng bài làm.</p>
            </div>
          </div>
          <button class="close-btn" type="button" data-close-modal aria-label="Đóng"><svg><use href="#i-close"></use></svg></button>
        </div>
        
        <div class="modal-body split-layout">
          <div class="split-left">
            <div style="background:#f8fafc; padding:16px; border-radius:8px; margin-bottom:24px; font-size:14px;">
              <div style="margin-bottom:8px;"><strong>Học sinh:</strong> <span id="infoStudent">—</span></div>
              <div style="margin-bottom:8px;"><strong>Ngày nộp:</strong> <span id="infoSubmittedAt">—</span></div>
              <div style="word-break:break-all;"><strong>Bài làm:</strong> <span id="infoLink">—</span></div>
            </div>

            <form id="gradeForm" novalidate>
              <input type="hidden" id="gradeSubmissionId" />
              
              <div class="field" style="margin-bottom:16px;">
                <label for="gradeScore">Điểm số <span class="required">*</span></label>
                <input id="gradeScore" type="number" min="0" step="0.1" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px;" />
              </div>
              
              <div class="field" style="margin-bottom:16px;">
                <label for="gradeComment">Nhận xét cho học sinh</label>
                <textarea id="gradeComment" rows="5" placeholder="Nhập nhận xét..." style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; resize:vertical;"></textarea>
              </div>
              
              <div class="field" style="margin-bottom:24px;">
                <label for="gradeAppealStatus">Trạng thái phúc khảo</label>
                <select id="gradeAppealStatus" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px;">
                  <option value="">Không thay đổi</option>
                  <option value="pending">Chờ phúc khảo</option>
                  <option value="resolved">Đã giải quyết</option>
                </select>
              </div>

              <div style="display:flex; gap:12px; justify-content:flex-end;">
                <button class="btn btn-secondary" type="button" data-close-modal>Hủy</button>
                <button class="btn btn-primary" type="submit">
                  <svg><use href="#i-check"></use></svg>
                  <span>Lưu điểm</span>
                </button>
              </div>
            </form>
          </div>

          <div class="split-right">
            <div id="simulationPreview">
              <p class="preview-empty" style="color:#888;">Đang tải mô phỏng...</p>
            </div>
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);

    modal.querySelectorAll('[data-close-modal]').forEach((button) => {
      button.addEventListener('click', () => {
        modal.classList.remove('open');
        setTimeout(() => modal.remove(), 200); 
      });
    });

    modal.addEventListener('mousedown', (event) => {
      if (event.target === modal) {
        modal.classList.remove('open');
        setTimeout(() => modal.remove(), 200);
      }
    });

    document.getElementById('gradeForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      
      const submissionId = document.getElementById('gradeSubmissionId').value;
      const score = document.getElementById('gradeScore').value;
      const comment = document.getElementById('gradeComment').value.trim();
      const appealStatus = document.getElementById('gradeAppealStatus').value;

      if (score === "" || isNaN(Number(score)) || Number(score) < 0) {
        document.getElementById('gradeScore').focus();
        showToast("Lỗi", "Vui lòng nhập điểm hợp lệ.", "error");
        return;
      }

      try {
        await apiPost(`${API_BASE}/teacher/${encodeURIComponent(TEACHER_ID)}/submissions/${encodeURIComponent(submissionId)}/grade`, {
          score: Number(score),
          comment,
          appealStatus: appealStatus || undefined,
        });
        
        modal.classList.remove('open');
        setTimeout(() => modal.remove(), 200);
        showToast("Đã lưu điểm", "Điểm và nhận xét đã được lưu thành công.");
        await loadPageData();
      } catch (err) {
        showToast("Không thể lưu điểm", err.message, "error");
      }
    });
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

    currentSubmission = currentSubmissions.find((submission) => submission.id === submissionId) || null;
    if (!currentSubmission) return;

    renderGradeDialog();
    
    // Fill form elements
    document.getElementById('gradeSubmissionId').value = submissionId;
    document.getElementById('gradeScore').value = currentSubmission.score != null ? currentSubmission.score : '';
    document.getElementById('gradeComment').value = currentSubmission.comment || '';
    document.getElementById('gradeAppealStatus').value = currentSubmission.appealStatus || '';
    
    // Fill static context info
    const who = currentSubmission.studentName || currentSubmission.studentId || "Không rõ học sinh";
    document.getElementById('infoStudent').textContent = who;
    document.getElementById('infoSubmittedAt').textContent = formatDateTime(currentSubmission.submittedAt);
    
    const infoLink = document.getElementById('infoLink');
    if (currentSubmission.fileLink && isValidHttpUrl(currentSubmission.fileLink)) {
      infoLink.innerHTML = `<a href="${escapeHtml(currentSubmission.fileLink)}" target="_blank" rel="noopener noreferrer" style="color:#0284c7;text-decoration:underline;">${escapeHtml(currentSubmission.fileLink)}</a>`;
    } else if (currentSubmission.fileLink) {
      infoLink.textContent = currentSubmission.fileLink; 
    } else {
      infoLink.textContent = "—";
    }

    // Generate specific Simulation Preview
    document.getElementById('simulationPreview').innerHTML = buildPreviewHtml(currentSubmission.fileLink);
    
    // Optional quality of life: instantly focus score input
    setTimeout(() => document.getElementById('gradeScore').focus(), 100);
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