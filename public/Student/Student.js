// Student.js
// Nối trang Student.html với các route thật trong routes.js:
//   GET  /api/students/:studentId/classes
//   GET  /api/students/:studentId/dashboard
//   GET  /api/homeworks/:homeworkId
//   POST /api/homeworks/:homeworkId/submit
//   GET  /api/homeworks/:homeworkId/submission
//   GET  /api/students/:studentId/submissions
//
// Gọi API server thật (không dùng Local Storage cho dữ liệu bài tập).

/* ======================= CẤU HÌNH ======================= */

// Cùng domain với trang HTML (routes.js đã có sẵn "/api/..." trong path)
// -> để rỗng nếu Student.html được server chính (Express) phục vụ luôn qua express.static.
const BASE_URL = "";

// Ưu tiên lấy studentId từ URL (?studentId=...) để test nhiều tài khoản dễ dàng,
// ví dụ: http://localhost:3000/Student/Student.html?studentId=test-student-01
// Nếu không có trên URL, thử lấy từ localStorage (trang login lưu sau này),
// cuối cùng mới fallback về "student-1".
// Student.js

const urlParams = new URLSearchParams(window.location.search);
const STUDENT_ID = urlParams.get("studentId") || localStorage.getItem("studentId"); //[cite: 2]
const ROLE = localStorage.getItem("role"); //

// Auth Guard: Redirect back to login if unauthenticated or wrong role
if (!STUDENT_ID || ROLE !== "STUDENT") {
  window.location.href = "/Login.html";
}

// Populate user profile info from localStorage
function setupUserProfile() {
  const fullName = localStorage.getItem("fullName") || "Học sinh"; //[cite: 4]
  const avatarEl = document.getElementById("userAvatar");
  const nameEl = document.getElementById("userName");

  if (avatarEl) avatarEl.textContent = fullName.slice(0, 2).toUpperCase();
  if (nameEl) nameEl.textContent = fullName;
}

// Clear session and return to login[cite: 4]
window.handleLogout = function () {
  localStorage.removeItem("studentId"); //[cite: 4]
  localStorage.removeItem("fullName"); //[cite: 4]
  localStorage.removeItem("role"); //[cite: 4]
  window.location.href = "/Login.html";
};

// Execute profile setup on script init
setupUserProfile();

console.log("[Student.js] Đang test với studentId =", STUDENT_ID);

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

let allHomeworks = []; // dữ liệu gốc từ /dashboard
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
    opt.value = c.classId;
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

function statusLabel(status) {
  return { not_submitted: "Chưa hoàn thành", submitted: "Đã nộp, chờ chấm", graded: "Đã chấm điểm" }[status] || status;
}

function statusColor(status) {
  return { not_submitted: "#e74c3c", submitted: "#f39c12", graded: "#27ae60" }[status] || "#999";
}

function isOverdue(hw) {
  return hw.submissionStatus === "not_submitted" && new Date(hw.deadline).getTime() < Date.now();
}

function applyFiltersAndRender() {
  const keyword = document.getElementById("searchInput").value.trim().toLowerCase();
  const classId = document.getElementById("classFilter").value;
  const statusFilter = document.getElementById("statusFilter").value;

  let filtered = allHomeworks.filter((hw) => {
    const matchKeyword =
      !keyword ||
      hw.title?.toLowerCase().includes(keyword) ||
      hw.className?.toLowerCase().includes(keyword) ||
      hw.note?.toLowerCase().includes(keyword);

    const matchClass = classId === "all" || hw.classId === classId;

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
      const status = overdue ? "overdue" : hw.submissionStatus;
      const label = overdue ? "Quá hạn" : statusLabel(hw.submissionStatus);
      const color = overdue ? "#e74c3c" : statusColor(hw.submissionStatus);

      return `
        <article class="assignment-card" style="border:1px solid #e2e2e2;border-radius:10px;padding:14px 16px;margin-bottom:10px;background:#fff;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
            <div>
              <h3 style="margin:0 0 4px 0;font-size:15px;">${escapeHtml(hw.title)}</h3>
              <div style="font-size:12px;color:#888;">${escapeHtml(hw.className || "")} · Hạn: ${deadlineStr}</div>
              ${hw.note ? `<p style="margin:6px 0 0 0;font-size:13px;color:#555;">${escapeHtml(hw.note)}</p>` : ""}
              ${hw.score != null ? `<div style="margin-top:6px;font-size:13px;">Điểm: <b>${hw.score}</b>${hw.comment ? ` — ${escapeHtml(hw.comment)}` : ""}</div>` : ""}
            </div>
            <div style="text-align:right;white-space:nowrap;">
              <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;color:#fff;background:${color};">
                ${label}
              </span>
              <div style="margin-top:8px;">
                ${
                  hw.submissionStatus === "graded"
                    ? ""
                    : `<button class="btn btn-primary" data-homework-id="${hw.homeworkId}" onclick="openSubmitDialog('${hw.homeworkId}')">Nộp bài</button>`
                }
              </div>
            </div>
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

/* ======================= NỘP BÀI ======================= */

window.openSubmitDialog = async function (homeworkId) {
  const fileLink = prompt("Dán link bài làm (Scratch / GitHub / Drive...):");
  if (!fileLink) return;

  try {
    await apiPost(`/api/homeworks/${homeworkId}/submit`, {
      studentId: STUDENT_ID,
      fileLink,
    });
    alert("Nộp bài thành công!");
    await loadDashboard(); // tải lại để cập nhật trạng thái
  } catch (err) {
    alert("Nộp bài thất bại: " + err.message);
  }
};

/* ======================= SỰ KIỆN ======================= */

document.getElementById("searchInput").addEventListener("input", applyFiltersAndRender);
document.getElementById("classFilter").addEventListener("change", applyFiltersAndRender);
document.getElementById("statusFilter").addEventListener("change", applyFiltersAndRender);

/* ======================= KHỞI ĐỘNG ======================= */

loadDashboard();