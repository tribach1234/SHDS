// shared-auth.js
// Shared auth guard + profile/logout wiring for every page.
// Include this BEFORE any page-specific script (e.g., teacher.js, Student.js).

const urlParams = new URLSearchParams(window.location.search);
const ROLE = localStorage.getItem("role");

// 1. Dynamically resolve ID based on the user's role
const idKey = ROLE === "TEACHER" ? "teacherId" : "studentId";
const USER_ID = urlParams.get(idKey) || localStorage.getItem(idKey);
window.TEACHER_ID = USER_ID;
// 2. Auth guard: Check if user is logged in AND on the correct page type
const path = window.location.pathname.toLowerCase();
const isInvalidTeacher = path.includes("teacher") && ROLE !== "TEACHER";
const isInvalidStudent = path.includes("student") && ROLE !== "STUDENT";

if (!USER_ID || !ROLE || isInvalidTeacher || isInvalidStudent) {
  window.location.href = "/Login.html";
}

// 3. Unified profile setup for both Student and Teacher views
function setupUserProfile() {
  const defaultName = ROLE === "TEACHER" ? "Giáo viên" : "Học sinh";
  const fullName = localStorage.getItem("fullName") || defaultName;
  const avatarText = fullName.slice(0, 2).toUpperCase();

  // Try to find Teacher DOM elements
  const teacherAvatar = document.querySelector(".teacher-chip .avatar");
  const teacherName = document.querySelector(".teacher-chip .teacher-text strong");
  
  // Try to find Student DOM elements
  const studentAvatar = document.getElementById("userAvatar");
  const studentName = document.getElementById("userName");

  // Populate whatever exists on the current page
  if (teacherAvatar) teacherAvatar.textContent = avatarText;
  if (teacherName) teacherName.textContent = fullName;
  if (studentAvatar) studentAvatar.textContent = avatarText;
  if (studentName) studentName.textContent = fullName;
}

// 4. Unified logout clearing all possible session variables
window.handleLogout = function () {
  ["teacherId", "studentId", "fullName", "role"].forEach(key => localStorage.removeItem(key));
  window.location.href = "/Login.html";
};

// 5. Shared stub for dead links
window.comingSoon = function (label) {
  alert(`"${label}" đang được phát triển, vui lòng quay lại sau!`);
};

setupUserProfile();