// student-overview.js
// Trang "Tổng quan" của học sinh — tổng hợp lớp học & bài tập.
// Dữ liệu lấy từ StudentService qua modules/routes.js:
//   GET /api/students/:studentId/classes    -> StudentService.getMyClasses
//   GET /api/students/:studentId/dashboard  -> StudentService.getAllHomeworks
// Yêu cầu shared_auth.js chạy trước (định nghĩa USER_ID).

const STUDENT_ID = USER_ID;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDeadline(iso) {
  return new Date(iso).toLocaleString("vi-VN");
}

function isOverdue(hw) {
  return hw.submissionStatus === "not_submitted" && new Date(hw.deadline).getTime() < Date.now();
}

function isDueSoon(hw) {
  const diff = new Date(hw.deadline).getTime() - Date.now();
  return hw.submissionStatus === "not_submitted" && diff >= 0 && diff <= 3 * 24 * 3600 * 1000;
}

async function apiGet(path) {
  const res = await fetch(path);
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Lỗi server (${res.status})`);
  }
  return json.data;
}

function renderStats(homeworks) {
  const overdue = homeworks.filter(isOverdue).length;
  const dueSoon = homeworks.filter(isDueSoon).length;
  const graded = homeworks.filter((h) => h.score != null).map((h) => h.score);
  const avg = graded.length ? (graded.reduce((a, b) => a + b, 0) / graded.length).toFixed(1) : "—";

  document.getElementById("statTotal").textContent = homeworks.length;
  document.getElementById("statUpcoming").textContent = dueSoon;
  document.getElementById("statOverdue").textContent = overdue;
  document.getElementById("statAvgScore").textContent = avg;
}

function renderClasses(classes) {
  const container = document.getElementById("classList");
  document.getElementById("classCount").textContent = `${classes.length} lớp`;

  if (!classes.length) {
    container.innerHTML = `<p style="padding:16px;color:#888">Bạn chưa tham gia lớp học nào.</p>`;
    return;
  }

  container.innerHTML = classes
    .map(
      (c) => `
      <article class="assignment-card">
        <div class="assignment-icon"><svg><use href="#i-class"></use></svg></div>
        <div class="assignment-main">
          <div class="assignment-title-row">
            <h3 class="assignment-title">${escapeHtml(c.className)}</h3>
            <span class="badge badge-published">${escapeHtml(c.status || "active")}</span>
          </div>
          <div class="assignment-meta">
            <span class="meta-item">${escapeHtml(c.description || "Chưa có mô tả")}</span>
          </div>
        </div>
      </article>`
    )
    .join("");
}

function renderTodo(homeworks) {
  const container = document.getElementById("todoList");

  const todo = homeworks
    .filter((h) => h.submissionStatus === "not_submitted")
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 6);

  document.getElementById("todoCount").textContent = `${todo.length} mục`;

  if (!todo.length) {
    container.innerHTML = `<p style="padding:16px;color:#888">Bạn đã hoàn thành hết bài tập. 🎉</p>`;
    return;
  }

  container.innerHTML = todo
    .map((hw) => {
      const overdue = isOverdue(hw);
      return `
        <article class="assignment-card ${overdue ? "overdue" : ""}">
          <div class="assignment-icon"><svg><use href="#i-task"></use></svg></div>
          <div class="assignment-main">
            <div class="assignment-title-row">
              <h3 class="assignment-title">${escapeHtml(hw.title)}</h3>
              <span class="badge ${overdue ? "badge-overdue" : "badge-draft"}">${overdue ? "Quá hạn" : "Chưa nộp"}</span>
            </div>
            <div class="assignment-meta">
              <span class="meta-item"><svg><use href="#i-class"></use></svg>${escapeHtml(hw.className)}</span>
              <span class="meta-item"><svg><use href="#i-calendar"></use></svg>Hạn: ${formatDeadline(hw.deadline)}</span>
            </div>
          </div>
        </article>`;
    })
    .join("");
}

async function loadOverview() {
  try {
    const [classes, homeworks] = await Promise.all([
      apiGet(`/api/students/${encodeURIComponent(STUDENT_ID)}/classes`),
      apiGet(`/api/students/${encodeURIComponent(STUDENT_ID)}/dashboard`),
    ]);

    renderStats(homeworks);
    renderClasses(classes);
    renderTodo(homeworks);
  } catch (err) {
    console.error(err);
    document.getElementById("todoList").innerHTML =
      `<p style="padding:16px;color:#c0392b">❌ Không tải được dữ liệu: ${escapeHtml(err.message)}</p>`;
    document.getElementById("classList").innerHTML = "";
  }
}

loadOverview();