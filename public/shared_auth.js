// shared-auth.js
// Shared auth guard + profile/logout wiring for every page.
// Include this BEFORE any page-specific script (e.g., teacher.js, Student.js).

const ROLE = localStorage.getItem("role");
const USER_ID = localStorage.getItem("teacherId") || localStorage.getItem("studentId") || localStorage.getItem("adminId");
window.TEACHER_ID = USER_ID;

// 1. Auth guard: Check client-side state
const path = window.location.pathname.toLowerCase();
const isInvalidTeacher = path.includes("teacher") && ROLE !== "TEACHER";
const isInvalidStudent = path.includes("student") && ROLE !== "STUDENT";
const isInvalidAdmin   = path.includes("/admin/") && ROLE !== "ADMIN";

if (!USER_ID || !ROLE || isInvalidTeacher || isInvalidStudent || isInvalidAdmin) {
  window.location.href = "/Login.html";
}


// 2. Server-side session verification
async function verifySession() {
  if (path.includes("login.html")) return;
  try {
    const res = await fetch("/api/me");
    if (!res.ok) throw new Error("Session expired");
  } catch (err) {
    handleLogout();
  }
}

// 3. Unified profile setup for both Student and Teacher views
function setupUserProfile() {
  const defaultName = ROLE === "TEACHER" ? "Giáo viên" : "Học sinh";
  const fullName = localStorage.getItem("fullName") || defaultName;
  const avatarText = fullName.slice(0, 2).toUpperCase();

  const teacherAvatar = document.querySelector(".teacher-chip .avatar");
  const teacherName = document.querySelector(".teacher-chip .teacher-text strong");
  const studentAvatar = document.getElementById("userAvatar");
  const studentName = document.getElementById("userName");

  if (teacherAvatar) teacherAvatar.textContent = avatarText;
  if (teacherName) teacherName.textContent = fullName;
  if (studentAvatar) studentAvatar.textContent = avatarText;
  if (studentName) studentName.textContent = fullName;
}

// 4. Async Logout (Destroys server session + clears localStorage)
window.handleLogout = async function () {
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch (err) {
    console.error("Lỗi đăng xuất server:", err);
  } finally {
    ["teacherId", "studentId", "fullName", "role"].forEach(key => localStorage.removeItem(key));
    window.location.href = "/Login.html";
  }
};

// 5. Shared stub for dead links
window.comingSoon = function (label) {
  alert(`"${label}" đang được phát triển, vui lòng quay lại sau!`);
};

// Run setup and session check on page load
setupUserProfile();
verifySession();