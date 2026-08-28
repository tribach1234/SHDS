// teacher-overview.js
// Populates the Teacher Overview dashboard from real data in SQLite via
// GET /api/teacher/:teacherId/overview (see modules/routes.js + modules/db.js).
// Requires teacher-auth.js to run first (defines TEACHER_ID).

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function timeAgo(isoString) {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

function renderTodoList(todo) {
  const container = document.getElementById("todoList");
  const countEl = document.getElementById("todoCount");

  countEl.textContent = `${todo.length} mục`;

  if (!todo.length) {
    container.innerHTML = `<p style="padding:16px;color:#888">Không có bài nào đang chờ chấm. 🎉</p>`;
    return;
  }

  container.innerHTML = todo
    .map((item) => {
      const who = item.studentName || item.studentId;
      return `
        <article class="assignment-card">
          <div class="assignment-icon"><svg><use href="#i-task"></use></svg></div>
          <div class="assignment-main">
            <div class="assignment-title-row">
              <h3 class="assignment-title">${escapeHtml(item.title)}</h3>
              <span class="badge badge-published">Chờ chấm</span>
            </div>
            <div class="assignment-meta">
              <span class="meta-item"><svg><use href="#i-users"></use></svg>${escapeHtml(item.classId)} · ${escapeHtml(who)}</span>
              <span class="meta-item"><svg><use href="#i-clock"></use></svg>${timeAgo(item.submittedAt)}</span>
            </div>
          </div>
        </article>`;
    })
    .join("");
}

async function loadOverview() {
  try {
    const res = await fetch(`/api/teacher/${encodeURIComponent(TEACHER_ID)}/overview`);
    const json = await res.json();
    if (!res.ok || json.success === false) {
      throw new Error(json.error || `Lỗi server (${res.status})`);
    }

    const { pendingGrading, dueSoon, submissionRate, todo } = json.data;

    document.getElementById("statPendingGrading").textContent = pendingGrading;
    document.getElementById("statDueSoon").textContent = dueSoon;
    document.getElementById("statSubmissionRate").textContent =
      submissionRate === null ? "—" : `${submissionRate}%`;
    // "Thắc mắc/Báo cáo" has no backing table yet — see the panel below,
    // left as "—" intentionally rather than showing a fake number.

    renderTodoList(todo);
  } catch (err) {
    console.error(err);
    document.getElementById("todoList").innerHTML =
      `<p style="padding:16px;color:#c0392b">❌ Không tải được dữ liệu: ${escapeHtml(err.message)}</p>`;
  }
}

loadOverview();