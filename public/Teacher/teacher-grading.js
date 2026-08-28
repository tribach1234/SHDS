// teacher-grading.js
// Powers the "Chấm bài" (grading) page:
//  - GET  /api/teacher/:teacherId/submissions  -> list of everything students submitted
//  - POST /api/submissions/:id/grade           -> save score + comment
// Requires shared_auth.js to run first (defines TEACHER_ID).

(() => {
  "use strict";

  const API_LIST = `/api/teacher/${encodeURIComponent(TEACHER_ID)}/submissions`;
  const API_GRADE = (id) => `/api/submissions/${encodeURIComponent(id)}/grade`;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const elements = {
    list: $("#submissionList"),
    resultCount: $("#resultCount"),
    search: $("#searchInput"),
    classFilter: $("#classFilter"),
    statusFilter: $("#statusFilter"),
    modal: $("#gradingModal"),
    modalSubtitle: $("#gradingModalSubtitle"),
    form: $("#gradingForm"),
    submissionId: $("#submissionId"),
    scoreInput: $("#scoreInput"),
    maxPointsDisplay: $("#maxPointsDisplay"),
    commentInput: $("#commentInput"),
    infoStudent: $("#infoStudent"),
    infoClass: $("#infoClass"),
    infoSubmittedAt: $("#infoSubmittedAt"),
    infoLink: $("#infoLink"),
    simulationPreview: $("#simulationPreview"),
    toastRegion: $("#toastRegion"),
    sidebar: $("#sidebar"),
    sidebarOverlay: $("#sidebarOverlay"),
    mobileMenuBtn: $("#mobileMenuBtn"),
    stats: {
      total: $("#statTotal"),
      pending: $("#statPending"),
      graded: $("#statGraded"),
      avg: $("#statAvg"),
    },
  };

  let submissions = [];
  let lastFocusedElement = null;

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
    elements.toastRegion.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // ── Load data ────────────────────────────────────────────────────
  async function loadSubmissions() {
    try {
      const res = await fetch(API_LIST);
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || `Lỗi server (${res.status})`);
      }
      submissions = json.data || [];
    } catch (err) {
      console.error(err);
      elements.list.innerHTML = `<p style="padding:16px;color:#c0392b">❌ Không tải được dữ liệu: ${escapeHtml(err.message)}</p>`;
      submissions = [];
    }
    render();
  }

  // ── Render list + stats ─────────────────────────────────────────
  function updateClassFilter() {
    const currentValue = elements.classFilter.value || "all";
    const classes = [...new Set(submissions.map((s) => s.classId).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "vi")
    );

    elements.classFilter.innerHTML = `
      <option value="all">Tất cả lớp</option>
      ${classes.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}
    `;
    elements.classFilter.value = classes.includes(currentValue) ? currentValue : "all";
  }

  function updateStats() {
    const total = submissions.length;
    const graded = submissions.filter(isGraded);
    const pending = total - graded.length;
    const avg = graded.length
      ? (graded.reduce((sum, s) => sum + Number(s.score), 0) / graded.length).toFixed(1)
      : "—";

    elements.stats.total.textContent = total;
    elements.stats.pending.textContent = pending;
    elements.stats.graded.textContent = graded.length;
    elements.stats.avg.textContent = avg;
  }

  function render() {
    updateClassFilter();
    updateStats();

    const keyword = elements.search.value.trim().toLocaleLowerCase("vi");
    const classValue = elements.classFilter.value;
    const statusValue = elements.statusFilter.value;

    const filtered = submissions.filter((item) => {
      const who = item.studentName || item.studentId || "";
      const haystack = `${item.homeworkTitle || ""} ${who} ${item.classId || ""}`.toLocaleLowerCase("vi");
      const matchKeyword = !keyword || haystack.includes(keyword);
      const matchClass = classValue === "all" || item.classId === classValue;
      const graded = isGraded(item);
      const matchStatus =
        statusValue === "all" || (statusValue === "graded" ? graded : !graded);
      return matchKeyword && matchClass && matchStatus;
    });

    elements.resultCount.textContent = `${filtered.length} bài nộp`;

    if (!filtered.length) {
      elements.list.innerHTML = `
        <div class="empty-state">
          <div>
            <div class="empty-illustration"><svg><use href="#i-task"></use></svg></div>
            <h3>Chưa có bài nộp phù hợp</h3>
            <p>Thử thay đổi từ khóa hoặc bộ lọc. Khi học sinh nộp bài, chúng sẽ xuất hiện ở đây.</p>
          </div>
        </div>
      `;
      return;
    }

    elements.list.innerHTML = filtered
      .map((item) => {
        const graded = isGraded(item);
        const who = item.studentName || item.studentId || "Không rõ học sinh";
        const badge = graded
          ? `<span class="badge badge-completed">Đã chấm · ${item.score}${item.maxPoints ? `/${item.maxPoints}` : ""}</span>`
          : `<span class="badge badge-published">Chờ chấm</span>`;

        return `
          <article class="assignment-card ${graded ? "graded" : "pending"}" data-id="${escapeHtml(item.id)}">
            <div class="assignment-icon"><svg><use href="#i-task"></use></svg></div>
            <div class="assignment-main">
              <div class="assignment-title-row">
                <h3 class="assignment-title" title="${escapeHtml(item.homeworkTitle)}">${escapeHtml(item.homeworkTitle)}</h3>
                ${badge}
              </div>
              <div class="assignment-meta">
                <span class="meta-item"><svg><use href="#i-users"></use></svg>${escapeHtml(who)}</span>
                <span class="meta-item"><svg><use href="#i-class"></use></svg>${escapeHtml(item.classId || "")}</span>
                <span class="meta-item"><svg><use href="#i-clock"></use></svg>${formatDateTime(item.submittedAt)}</span>
              </div>
            </div>
            <div class="card-actions">
              <button class="btn btn-primary" type="button" data-action="grade">
                <svg><use href="#i-check"></use></svg>
                <span>${graded ? "Xem / Sửa điểm" : "Chấm bài"}</span>
              </button>
            </div>
          </article>
        `;
      })
      .join("");
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
      return `<p class="preview-empty">Học sinh chưa để lại liên kết bài làm.</p>`;
    }

    if (!isValidHttpUrl(fileLink)) {
      return `<p class="preview-empty">Liên kết bài làm không hợp lệ (không phải URL http/https): "${escapeHtml(fileLink)}"</p>`;
    }

    const safeLink = escapeHtml(fileLink);

    // Scratch project — https://scratch.mit.edu/projects/123456789/
    const scratchMatch = fileLink.match(/scratch\.mit\.edu\/projects\/(\d+)/i);
    if (scratchMatch) {
      const projectId = scratchMatch[1];
      return `
        <div class="preview-label">🧩 Mô phỏng dự án Scratch</div>
        <iframe class="preview-frame" src="https://scratch.mit.edu/projects/${projectId}/embed"
          allowtransparency="true" allowfullscreen loading="lazy"></iframe>
      `;
    }

    // TurboWarp mirror — loads faster, supports more project sources
    const turbowarpMatch = fileLink.match(/turbowarp\.org\/(\d+)/i);
    if (turbowarpMatch) {
      const projectId = turbowarpMatch[1];
      return `
        <div class="preview-label">🧩 Mô phỏng dự án Scratch (TurboWarp)</div>
        <iframe class="preview-frame" src="https://turbowarp.org/${projectId}/embed" loading="lazy"></iframe>
      `;
    }

    // Trinket — commonly used to share runnable Python
    const trinketMatch = fileLink.match(/trinket\.io\/([\w-]+\/[\w-]+)/i);
    if (trinketMatch) {
      return `
        <div class="preview-label">🐍 Mô phỏng chương trình Python (Trinket)</div>
        <iframe class="preview-frame" src="https://trinket.io/embed/${trinketMatch[1]}?runOption=run" loading="lazy"></iframe>
      `;
    }

    // Replit
    const replitMatch = fileLink.match(/replit\.com\/@([\w-]+)\/([\w-]+)/i);
    if (replitMatch) {
      return `
        <div class="preview-label">🐍 Mô phỏng chương trình Python (Replit)</div>
        <iframe class="preview-frame" src="https://replit.com/@${replitMatch[1]}/${replitMatch[2]}?embed=true" loading="lazy"></iframe>
      `;
    }

    // Plain Python file / GitHub link — can't safely embed cross-origin code
    if (/\.py(\?|$)/i.test(fileLink) || /github\.com/i.test(fileLink)) {
      return `
        <div class="preview-label">🐍 Bài làm Python</div>
        <p class="preview-note">Không thể nhúng trực tiếp file này tại đây.</p>
        <a class="btn btn-secondary" href="${safeLink}" target="_blank" rel="noopener noreferrer">Mở bài làm trong tab mới</a>
      `;
    }

    // Fallback — best-effort iframe of whatever link was submitted
    return `
      <div class="preview-label">🔗 Xem trước bài làm</div>
      <iframe class="preview-frame" src="${safeLink}" loading="lazy"></iframe>
      <p class="preview-note">Nếu không hiển thị được (do trang chặn nhúng), hãy <a href="${safeLink}" target="_blank" rel="noopener noreferrer">mở bài làm trong tab mới</a>.</p>
    `;
  }

  // ── Modal open/close ─────────────────────────────────────────────
  function openModal(modal) {
    lastFocusedElement = document.activeElement;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeModal(modal) {
    modal.classList.remove("open");
    document.body.style.overflow = "";
    lastFocusedElement?.focus?.();
  }

  function clearValidation() {
    $("#fieldScore")?.classList.remove("invalid");
  }

  function openGradingModal(id) {
    const item = submissions.find((s) => String(s.id) === String(id));
    if (!item) return;

    clearValidation();

    const who = item.studentName || item.studentId || "Không rõ học sinh";
    elements.modalSubtitle.textContent = `${item.homeworkTitle} · ${item.classId || ""}`;
    elements.infoStudent.textContent = who;
    elements.infoClass.textContent = item.classId || "—";
    elements.infoSubmittedAt.textContent = formatDateTime(item.submittedAt);

    if (item.fileLink && isValidHttpUrl(item.fileLink)) {
      elements.infoLink.innerHTML = `<a href="${escapeHtml(item.fileLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.fileLink)}</a>`;
    } else if (item.fileLink) {
      elements.infoLink.textContent = item.fileLink; // invalid URL — show as plain text, not a link
    } else {
      elements.infoLink.textContent = "—";
    }

    elements.submissionId.value = item.id;
    elements.scoreInput.value = item.score ?? "";
    elements.scoreInput.max = item.maxPoints || 10;
    elements.maxPointsDisplay.value = item.maxPoints ? `/ ${item.maxPoints}` : "/ 10";
    elements.commentInput.value = item.comment || "";

    elements.simulationPreview.innerHTML = buildPreviewHtml(item.fileLink);

    openModal(elements.modal);
    setTimeout(() => elements.scoreInput.focus(), 50);
  }

  async function handleGradeSubmit(event) {
    event.preventDefault();
    clearValidation();

    const id = elements.submissionId.value;
    const score = elements.scoreInput.value;
    const comment = elements.commentInput.value.trim();

    if (score === "" || isNaN(Number(score)) || Number(score) < 0) {
      $("#fieldScore")?.classList.add("invalid");
      elements.scoreInput.focus();
      return;
    }

    try {
      const res = await fetch(API_GRADE(id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: Number(score), comment }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || `Lỗi server (${res.status})`);
      }

      const index = submissions.findIndex((s) => String(s.id) === String(id));
      if (index !== -1) {
        submissions[index] = { ...submissions[index], score: Number(score), comment };
      }

      showToast("Đã lưu điểm", "Điểm và nhận xét đã được lưu vào cơ sở dữ liệu.");
      closeModal(elements.modal);
      render();
    } catch (err) {
      console.error(err);
      showToast("Lỗi", err.message, "error");
    }
  }

  // ── Events ───────────────────────────────────────────────────────
  elements.search.addEventListener("input", render);
  elements.classFilter.addEventListener("change", render);
  elements.statusFilter.addEventListener("change", render);
  elements.form.addEventListener("submit", handleGradeSubmit);

  elements.list.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="grade"]');
    const card = event.target.closest("[data-id]");
    if (!button && !card) return;
    const id = card?.dataset.id;
    if (id) openGradingModal(id);
  });

  $$("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(elements.modal));
  });

  elements.modal.addEventListener("mousedown", (event) => {
    if (event.target === elements.modal) closeModal(elements.modal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.modal.classList.contains("open")) {
      closeModal(elements.modal);
    }
  });

  elements.mobileMenuBtn?.addEventListener("click", () => {
    elements.sidebar.classList.add("open");
    elements.sidebarOverlay.classList.add("open");
  });
  elements.sidebarOverlay?.addEventListener("click", () => {
    elements.sidebar.classList.remove("open");
    elements.sidebarOverlay.classList.remove("open");
  });

  // Boot
  loadSubmissions();
})();