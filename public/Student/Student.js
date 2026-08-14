// Student.js
// Re-uses authentication, profile setup, and logout provided globally by shared-auth.js

/* ======================= CẤU HÌNH ======================= */

const BASE_URL = "";

// Re-use USER_ID already validated and resolved by shared-auth.js
const STUDENT_ID = USER_ID;

console.log("[Student.js] Đang chạy với studentId =", STUDENT_ID);

/* ======================= HELPER GỌI API ======================= */

async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Lỗi server (${res.status})`);
  }
  return json.data;
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Lỗi server (${res.status})`);
  }
  return json.data;
}

/* ======================= STATE ======================= */

let allHomeworks = []; // Dữ liệu gốc từ /dashboard
let classesMap = new Map(); // classId -> className (đổ vào bộ lọc)

/* ======================= LOAD DỮ LIỆU ======================= */

async function loadDashboard() {
  try {
    const [classes, homeworks] = await Promise.all([
      apiGet(`/api/students/${STUDENT_ID}/classes`),
      apiGet(`/api/students/${STUDENT_ID}/dashboard`),
    ]);

    classesMap = new Map(classes.map((c) => [c.classId, c.className]));
    allHomeworks = homeworks;

    populateClassFilter(classes);
    renderStats(allHomeworks);
    applyFiltersAndRender();
  } catch (err) {
    console.error(err);
    document.getElementById("assignmentList").innerHTML =
      `<p style="color:#c0392b">❌ Không tải được dữ liệu: ${err.message}</p>`;
  }
}

function populateClassFilter(classes) {
  const select = document.getElementById("classFilter");
  select.innerHTML = `<option value="all">Môn học</option>`;
  classes.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.className; // <-- Changed from c.classId to c.className
    opt.textContent = c.className;
    select.appendChild(opt);
  });
}

/* ======================= THỐNG KÊ ======================= */

function renderStats(homeworks) {
  const total = homeworks.length;
  const now = Date.now();

  const upcoming = homeworks.filter((h) => {
    const deadline = new Date(h.deadline).getTime();
    return h.submissionStatus === "not_submitted" && deadline > now && deadline - now < 3 * 24 * 3600 * 1000;
  }).length;

  const overdue = homeworks.filter((h) => {
    const deadline = new Date(h.deadline).getTime();
    return h.submissionStatus === "not_submitted" && deadline < now;
  }).length;

  const gradedScores = homeworks.filter((h) => h.score != null).map((h) => h.score);
  const avgScore = gradedScores.length
    ? (gradedScores.reduce((a, b) => a + b, 0) / gradedScores.length).toFixed(1)
    : "—";

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statUpcoming").textContent = upcoming;
  document.getElementById("statOverdue").textContent = overdue;
  document.getElementById("statCompleted").textContent = avgScore;
}

/* ======================= LỌC + HIỂN THỊ DANH SÁCH ======================= */

function isOverdue(hw) {
  return hw.submissionStatus === "not_submitted" && new Date(hw.deadline).getTime() < Date.now();
}

// Single source of truth for status label + badge class, shared by the
// card list and the detail modal so they never drift out of sync.
function getStatusMeta(hw) {
  const overdue = isOverdue(hw);
  if (hw.submissionStatus === "graded") {
    return { label: "Đã chấm điểm", badgeClass: "badge-completed" };
  }
  if (hw.submissionStatus === "submitted") {
    return { label: "Đã nộp, chờ chấm", badgeClass: "badge-published" };
  }
  if (overdue) {
    return { label: "Quá hạn", badgeClass: "badge-overdue" };
  }
  return { label: "Chưa nộp", badgeClass: "badge-draft" };
}

function applyFiltersAndRender() {
  const keyword = document.getElementById("searchInput").value.trim().toLowerCase();
  const selectedClassName = document.getElementById("classFilter").value; // <-- Selected class name
  const statusFilter = document.getElementById("statusFilter").value;

  let filtered = allHomeworks.filter((hw) => {
    const matchKeyword =
      !keyword ||
      hw.title?.toLowerCase().includes(keyword) ||
      hw.className?.toLowerCase().includes(keyword) ||
      hw.note?.toLowerCase().includes(keyword);

    // <-- Changed from hw.classId to hw.className
    const matchClass = selectedClassName === "all" || hw.className === selectedClassName;

    let matchStatus = true;
    if (statusFilter === "completed") matchStatus = hw.submissionStatus === "graded";
    else if (statusFilter === "incompleted") matchStatus = hw.submissionStatus === "not_submitted" && !isOverdue(hw);
    else if (statusFilter === "overdue") matchStatus = isOverdue(hw);

    return matchKeyword && matchClass && matchStatus;
  });

  renderList(filtered);
}

function renderList(homeworks) {
  const container = document.getElementById("assignmentList");
  document.getElementById("resultCount").textContent = `${homeworks.length} bài tập`;

  if (homeworks.length === 0) {
    container.innerHTML = `<p style="padding:20px;color:#888">Không có bài tập nào khớp bộ lọc.</p>`;
    return;
  }

  container.innerHTML = homeworks
    .map((hw) => {
      const overdue = isOverdue(hw);
      const deadlineStr = new Date(hw.deadline).toLocaleString("vi-VN");
      const { label, badgeClass } = getStatusMeta(hw);
      const title = escapeHtml(hw.title);

      // Nút "Nộp bài" chỉ hiện khi học sinh CHƯA nộp — không hiện khi đã
      // nộp (chờ chấm) hay đã được chấm điểm.
      const submitButtonHtml =
          hw.submissionStatus === "not_submitted"
            ? `<button class="btn btn-primary" data-homework-id="${hw.homeworkId}" onclick="event.stopPropagation(); openSubmitDialog('${hw.homeworkId}')">
                <span>Nộp bài</span>
              </button>`
            : "";

      const descriptionHtml = hw.note
        ? `<p class="assignment-desc">${escapeHtml(hw.note)}</p>`
        : "";

      return `
        <article class="assignment-card ${overdue ? "overdue" : ""}" data-id="${hw.homeworkId}"
          onclick="openHomeworkDetail('${hw.homeworkId}')">
          <div class="assignment-icon"><svg><use href="#i-task"></use></svg></div>
          <div class="assignment-main">
            <div class="assignment-title-row">
              <h3 class="assignment-title" title="${title}">${title}</h3>
              <span class="badge ${badgeClass}">${label}</span>
            </div>
            <div class="assignment-meta">
              <span class="meta-item"><svg><use href="#i-class"></use></svg>${escapeHtml(hw.className || "")}</span>
              <span class="meta-item"><svg><use href="#i-calendar"></use></svg>Hạn: ${deadlineStr}</span>
              ${hw.score != null ? `<span class="meta-item"><svg><use href="#i-star"></use></svg>Điểm: ${hw.score}</span>` : ""}
            </div>
            ${descriptionHtml}
            ${hw.comment ? `<p class="assignment-desc" style="color:var(--success);">Nhận xét: ${escapeHtml(hw.comment)}</p>` : ""}
          </div>
          <div class="card-actions">
            ${submitButtonHtml}
          </div>
        </article>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// Only ever treat a value as a clickable link if it's a real http(s) URL —
// otherwise the browser will resolve it as a relative path off the current
// page (e.g. a stray value like "asdasd" turning into a 404 request).
function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/* ======================= CHI TIẾT BÀI TẬP (MODAL) ======================= */

window.openHomeworkDetail = function (homeworkId) {
  const hw = allHomeworks.find((h) => h.homeworkId === homeworkId);
  if (!hw) return;

  const modalEl = document.getElementById("homeworkDetailModal");
  if (!modalEl) {
    console.warn("[Student.js] Thiếu #homeworkDetailModal trong Student.html — không thể mở chi tiết bài tập.");
    return;
  }

  const deadlineStr = new Date(hw.deadline).toLocaleString("vi-VN");
  const { label, badgeClass } = getStatusMeta(hw);

  document.getElementById("detailModalTitle").textContent = hw.title;
  document.getElementById("detailModalMeta").textContent = hw.className || "";

  document.getElementById("detailMetaRow").innerHTML = `
    <span class="meta-item"><svg><use href="#i-class"></use></svg>${escapeHtml(hw.className || "")}</span>
    <span class="meta-item"><svg><use href="#i-calendar"></use></svg>Hạn: ${escapeHtml(deadlineStr)}</span>
    <span class="badge ${badgeClass}">${escapeHtml(label)}</span>
  `;

  document.getElementById("detailNote").textContent = hw.note || "Không có mô tả.";

  const materialBox = document.getElementById("detailMaterial");
  if (hw.joinLink && isValidHttpUrl(hw.joinLink)) {
    materialBox.innerHTML = `
      <a class="btn btn-secondary" href="${escapeHtml(hw.joinLink)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;">
        <svg style="width:16px;height:16px;"><use href="#i-link"></use></svg>
        <span>Mở tài liệu / liên kết lớp học</span>
      </a>`;
  } else {
    materialBox.innerHTML = "";
  }

  const submissionBox = document.getElementById("detailSubmissionBox");
  const submitBtn = document.getElementById("detailSubmitBtn");

  if (hw.submissionStatus === "not_submitted") {
    submissionBox.innerHTML = `<p style="margin:0;color:var(--ink-soft);font-size:13px;">Bạn chưa nộp bài tập này.</p>`;
    submitBtn.style.display = "inline-flex";
    submitBtn.dataset.homeworkId = hw.homeworkId;
  } else {
    submitBtn.style.display = "none";
    const submittedAtStr = hw.submittedAt ? new Date(hw.submittedAt).toLocaleString("vi-VN") : "—";
    const fileLinkHtml =
      hw.fileLink && isValidHttpUrl(hw.fileLink)
        ? `<a href="${escapeHtml(hw.fileLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(hw.fileLink)}</a>`
        : hw.fileLink
        ? escapeHtml(hw.fileLink)
        : "—";

    submissionBox.innerHTML = `
      <p style="margin:0 0 6px;font-size:13px;"><strong>Đã nộp lúc:</strong> ${escapeHtml(submittedAtStr)}</p>
      <p style="margin:0 0 6px;font-size:13px;word-break:break-all;"><strong>Bài làm:</strong> ${fileLinkHtml}</p>
      ${
        hw.score != null
          ? `<p style="margin:10px 0 0;font-size:13px;"><strong>Điểm:</strong> ${hw.score}${hw.comment ? ` — ${escapeHtml(hw.comment)}` : ""}</p>`
          : `<p style="margin:10px 0 0;font-size:13px;color:var(--ink-soft);">Chưa được chấm.</p>`
      }
    `;
  }

  modalEl.classList.add("open");
  document.body.style.overflow = "hidden";
};

window.closeHomeworkDetail = function () {
  document.getElementById("homeworkDetailModal")?.classList.remove("open");
  document.body.style.overflow = "";
};

window.handleDetailSubmit = function () {
  const id = document.getElementById("detailSubmitBtn").dataset.homeworkId;
  closeHomeworkDetail();
  if (id) {
    window.openSubmitDialog(id);
  }
};

// Đóng modal khi click ra ngoài, hoặc nhấn Esc
// (bọc trong kiểm tra null để một lỗi thiếu phần tử modal không làm
// crash toàn bộ script và chặn loadDashboard() chạy bên dưới)
const detailModalEl = document.getElementById("homeworkDetailModal");
if (detailModalEl) {
  detailModalEl.addEventListener("mousedown", (event) => {
    if (event.target.id === "homeworkDetailModal") closeHomeworkDetail();
  });
} else {
  console.warn(
    "[Student.js] Không tìm thấy #homeworkDetailModal trong Student.html — hãy chắc chắn bạn đã cập nhật cả Student.html lẫn Student.js."
  );
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.getElementById("homeworkDetailModal")?.classList.contains("open")) {
    closeHomeworkDetail();
  }
});

/* ======================= NỘP BÀI ======================= */

// Redirect to Studentnopbai.html and pass the homework ID in the URL
window.openSubmitDialog = function (homeworkId) {
  if (homeworkId) {
    window.location.href = `Studentnopbai.html?homeworkId=${encodeURIComponent(homeworkId)}`;
  }
};

/* ======================= SỰ KIỆN ======================= */

document.getElementById("searchInput").addEventListener("input", applyFiltersAndRender);
document.getElementById("classFilter").addEventListener("change", applyFiltersAndRender);
document.getElementById("statusFilter").addEventListener("change", applyFiltersAndRender);

/* ======================= KHỞI ĐỘNG ======================= */

loadDashboard();