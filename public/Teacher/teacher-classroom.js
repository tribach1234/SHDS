// teacher-classroom.js
// "Lớp học": danh sách lớp giáo viên đang dạy -> chọn buổi học -> điểm danh
// (Có mặt / Muộn / Vắng) -> hồ sơ học sinh.
// Requires shared_auth.js to run first (defines TEACHER_ID, handleLogout, comingSoon).

(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const els = {
    classListView: $("#classListView"),
    classGrid: $("#classGrid"),
    classCount: $("#classCount"),

    rosterView: $("#rosterView"),
    rosterClassName: $("#rosterClassName"),
    rosterStats: $("#rosterStats"),
    rosterList: $("#rosterList"),
    rosterCount: $("#rosterCount"),
    sessionSelect: $("#sessionSelect"),
    backToClassesBtn: $("#backToClassesBtn"),
    saveAttendanceBtn: $("#saveAttendanceBtn"),

    profileModal: $("#profileModal"),
    profileAvatar: $("#profileAvatar"),
    profileName: $("#profileName"),
    profileEmail: $("#profileEmail"),
    profileStats: $("#profileStats"),
    profileHomeworkList: $("#profileHomeworkList"),
    hwLimitSelect: $("#hwLimitSelect"),
    closeProfileBtn: $("#closeProfileBtn"),

    toastRegion: $("#toastRegion"),
    sidebar: $("#sidebar"),
    sidebarOverlay: $("#sidebarOverlay"),
    mobileMenuBtn: $("#mobileMenuBtn"),
  };

  const ATT_LABEL = { ATTENDED: "Có mặt", LATE: "Muộn", ABSENT: "Vắng", UNMARKED: "Chưa điểm danh" };

  let currentClassId = null;
  let currentSessions = [];
  let currentStudentId = null;
  // studentId -> "ATTENDED" | "LATE" | "ABSENT" (đang chỉnh, chưa lưu)
  let pendingAttendance = new Map();

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso.replace(" ", "T"));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("vi-VN");
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
      </div>`;
    els.toastRegion.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  async function apiGet(path) {
    const res = await fetch(path);
    const json = await res.json();
    if (!res.ok || json.success === false) throw new Error(json.error || `Lỗi server (${res.status})`);
    return json.data;
  }

  async function apiPost(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || json.success === false) throw new Error(json.error || `Lỗi server (${res.status})`);
    return json.data;
  }

  /* ===================== VIEW 1: DANH SÁCH LỚP ===================== */

  async function loadClasses() {
    try {
      const classes = await apiGet(`/api/teacher/${encodeURIComponent(TEACHER_ID)}/classes`);
      renderClassGrid(classes);
    } catch (err) {
      els.classGrid.innerHTML = `<p style="padding:16px;color:#c0392b">❌ ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderClassGrid(classes) {
    els.classCount.textContent = `${classes.length} lớp`;

    if (!classes.length) {
      els.classGrid.innerHTML = `
        <div class="empty-state">
          <div>
            <div class="empty-illustration"><svg><use href="#i-users"></use></svg></div>
            <h3>Chưa có lớp nào</h3>
            <p>Tài khoản này chưa được gán làm giáo viên phụ trách lớp nào.</p>
          </div>
        </div>`;
      return;
    }

    els.classGrid.innerHTML = classes.map((c) => `
      <article class="class-card" data-class-id="${escapeHtml(c.classId)}" data-class-name="${escapeHtml(c.className)}">
        <div class="class-card-top">
          <div class="assignment-icon"><svg><use href="#i-users"></use></svg></div>
          <div>
            <h3 class="class-card-title">${escapeHtml(c.className)}</h3>
            <span class="meta-item">${c.studentCount} học sinh</span>
          </div>
        </div>
        ${c.description ? `<p class="assignment-desc">${escapeHtml(c.description)}</p>` : ""}
        <div class="class-card-attendance">
          ${c.latestSession
            ? `<span class="meta-item" style="width:100%">Buổi gần nhất: ${escapeHtml(c.latestSession.title)}</span>
               <span class="badge badge-published">Có mặt: ${c.attendedLatest}</span>
               <span class="badge badge-draft">Muộn: ${c.lateLatest}</span>
               <span class="badge badge-overdue">Vắng: ${c.absentLatest}</span>`
            : `<span class="meta-item">Lớp chưa có buổi học nào</span>`}
        </div>
        <button class="btn btn-primary" type="button" data-open-class>Xem lớp</button>
      </article>
    `).join("");

    $$("[data-open-class]", els.classGrid).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const card = e.target.closest("[data-class-id]");
        openRoster(card.dataset.classId, card.dataset.className);
      });
    });
  }

  /* ===================== VIEW 2: SĨ SỐ + ĐIỂM DANH ===================== */

  async function openRoster(classId, className) {
    currentClassId = classId;
    pendingAttendance = new Map();

    els.classListView.style.display = "none";
    els.rosterView.style.display = "block";
    els.rosterClassName.textContent = className;

    try {
      currentSessions = await apiGet(`/api/classes/${encodeURIComponent(classId)}/sessions`);
    } catch (err) {
      currentSessions = [];
      showToast("Lỗi", err.message, "error");
    }

    els.sessionSelect.innerHTML = currentSessions.length
      ? currentSessions.map((s) => `<option value="${escapeHtml(s.homeworkId)}">${escapeHtml(s.title)}</option>`).join("")
      : `<option value="">Chưa có buổi học</option>`;

    await loadRoster(currentSessions[0]?.homeworkId);
  }

  function closeRoster() {
    currentClassId = null;
    els.rosterView.style.display = "none";
    els.classListView.style.display = "block";
    loadClasses(); // cập nhật lại số liệu trên các thẻ lớp
  }

  async function loadRoster(homeworkId) {
    els.rosterList.innerHTML = `<p style="padding:16px;color:#888">Đang tải dữ liệu...</p>`;
    if (!homeworkId) {
      els.rosterList.innerHTML = `<p style="padding:16px;color:#888">Lớp này chưa có buổi học nào để điểm danh.</p>`;
      els.rosterCount.textContent = `0 học sinh`;
      els.rosterStats.innerHTML = "";
      return;
    }
    try {
      const data = await apiGet(
        `/api/classes/${encodeURIComponent(currentClassId)}/roster?homeworkId=${encodeURIComponent(homeworkId)}`
      );
      if (data.session) els.sessionSelect.value = data.session.homeworkId;
      pendingAttendance = new Map(data.students.map((s) => [s.studentId, s.attendanceStatus]));
      renderRoster(data.students);
    } catch (err) {
      els.rosterList.innerHTML = `<p style="padding:16px;color:#c0392b">❌ ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderRoster(students) {
    els.rosterCount.textContent = `${students.length} học sinh`;
    updateRosterStats();

    if (!students.length) {
      els.rosterList.innerHTML = `<p style="padding:16px;color:#888">Lớp này chưa có học sinh.</p>`;
      return;
    }

    els.rosterList.innerHTML = students.map((s) => {
      const status = pendingAttendance.get(s.studentId) || "UNMARKED";
      return `
        <article class="assignment-card roster-row" data-student-id="${escapeHtml(s.studentId)}">
          <div class="assignment-icon"><svg><use href="#i-users"></use></svg></div>
          <div class="assignment-main">
            <div class="assignment-title-row">
              <h3 class="assignment-title">${escapeHtml(s.fullName || s.studentId)}</h3>
              ${s.score != null ? `<span class="badge badge-completed">Điểm: ${s.score}</span>` : ""}
            </div>
            <div class="assignment-meta">
              <span class="meta-item">${escapeHtml(s.email || s.studentId)}</span>
            </div>
          </div>
          <div class="card-actions roster-actions">
            <button type="button" class="attendance-btn attended ${status === "ATTENDED" ? "active" : ""}" data-att="ATTENDED">Có mặt</button>
            <button type="button" class="attendance-btn late ${status === "LATE" ? "active" : ""}" data-att="LATE">Muộn</button>
            <button type="button" class="attendance-btn absent ${status === "ABSENT" ? "active" : ""}" data-att="ABSENT">Vắng</button>
            <button type="button" class="btn btn-secondary" data-view-profile>Xem hồ sơ</button>
          </div>
        </article>`;
    }).join("");

    $$(".roster-row", els.rosterList).forEach((row) => {
      const studentId = row.dataset.studentId;

      $$(".attendance-btn", row).forEach((btn) => {
        btn.addEventListener("click", () => {
          pendingAttendance.set(studentId, btn.dataset.att);
          $$(".attendance-btn", row).forEach((b) => b.classList.toggle("active", b === btn));
          updateRosterStats();
        });
      });

      $("[data-view-profile]", row).addEventListener("click", () => openProfile(studentId));
    });
  }

  function updateRosterStats() {
    const values = [...pendingAttendance.values()];
    const attended = values.filter((v) => v === "ATTENDED").length;
    const late = values.filter((v) => v === "LATE").length;
    const absent = values.filter((v) => v === "ABSENT").length;
    const unmarked = pendingAttendance.size - attended - late - absent;
    els.rosterStats.innerHTML = `
      <span class="badge badge-published">Có mặt: ${attended}</span>
      <span class="badge badge-draft">Muộn: ${late}</span>
      <span class="badge badge-overdue">Vắng: ${absent}</span>
      <span class="badge badge-completed">Chưa điểm danh: ${unmarked}</span>
    `;
  }

  async function saveAttendance() {
    const homeworkId = els.sessionSelect.value;
    if (!homeworkId) {
      showToast("Không có buổi học", "Lớp này chưa có buổi học nào.", "error");
      return;
    }

    const records = [...pendingAttendance.entries()]
      .filter(([, status]) => ["ATTENDED", "LATE", "ABSENT"].includes(status))
      .map(([studentId, status]) => ({ studentId, status }));

    if (!records.length) {
      showToast("Chưa có gì để lưu", "Hãy chọn Có mặt / Muộn / Vắng cho ít nhất 1 học sinh.", "error");
      return;
    }

    try {
      const data = await apiPost(`/api/classes/${encodeURIComponent(currentClassId)}/attendance`, {
        homeworkId,
        records,
      });
      pendingAttendance = new Map(data.students.map((s) => [s.studentId, s.attendanceStatus]));
      renderRoster(data.students);
      showToast("Đã lưu điểm danh", `Điểm danh cho "${data.session?.title || ""}" đã được lưu.`);
    } catch (err) {
      showToast("Lỗi", err.message, "error");
    }
  }

  /* ===================== MODAL: HỒ SƠ HỌC SINH ===================== */

  function statusLabel(status) {
    return { not_submitted: "Chưa nộp", submitted: "Đã điểm danh/nộp", graded: "Đã chấm điểm" }[status] || status;
  }
  function statusBadgeClass(status) {
    return { not_submitted: "badge-overdue", submitted: "badge-published", graded: "badge-completed" }[status] || "badge-draft";
  }

  async function openProfile(studentId) {
    currentStudentId = studentId;
    els.profileModal.classList.add("open");
    els.profileHomeworkList.innerHTML = `<p style="padding:16px;color:#888">Đang tải dữ liệu...</p>`;
    await loadProfile();
  }

  async function loadProfile() {
    if (!currentStudentId) return;
    const limit = els.hwLimitSelect.value || 5;
    try {
      const data = await apiGet(
        `/api/students/${encodeURIComponent(currentStudentId)}/profile?classId=${encodeURIComponent(currentClassId)}&limit=${encodeURIComponent(limit)}`
      );
      renderProfile(data);
    } catch (err) {
      els.profileHomeworkList.innerHTML = `<p style="padding:16px;color:#c0392b">❌ ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderProfile(data) {
    const { student, homeworks, totalHomeworksInClass, submittedCount, averageScore, attendanceSummary } = data;

    els.profileAvatar.textContent = (student.fullName || student.id || "HS").slice(0, 2).toUpperCase();
    els.profileName.textContent = student.fullName || student.id;
    els.profileEmail.textContent = student.email || student.id;

    els.profileStats.innerHTML = `
      <div class="mini-stat"><span class="mini-stat-value">${submittedCount}/${totalHomeworksInClass}</span><span class="mini-stat-title">Đã nộp / Tổng bài</span></div>
      <div class="mini-stat"><span class="mini-stat-value">${averageScore != null ? averageScore : "—"}</span><span class="mini-stat-title">Điểm trung bình</span></div>
      <div class="mini-stat"><span class="mini-stat-value">${attendanceSummary.attended}/${attendanceSummary.totalSessions}</span><span class="mini-stat-title">Có mặt / Tổng buổi</span></div>
      <div class="mini-stat"><span class="mini-stat-value">${attendanceSummary.absent}</span><span class="mini-stat-title">Buổi vắng</span></div>
    `;

    if (!homeworks.length) {
      els.profileHomeworkList.innerHTML = `<p style="padding:16px;color:#888">Lớp này chưa có bài tập / buổi học nào.</p>`;
      return;
    }

    els.profileHomeworkList.innerHTML = homeworks.map((h) => `
      <article class="assignment-card">
        <div class="assignment-icon"><svg><use href="#i-task"></use></svg></div>
        <div class="assignment-main">
          <div class="assignment-title-row">
            <h3 class="assignment-title">${escapeHtml(h.title)}</h3>
            <span class="badge ${statusBadgeClass(h.submissionStatus)}">${statusLabel(h.submissionStatus)}</span>
            ${h.attendanceStatus ? `<span class="badge badge-draft">${escapeHtml(ATT_LABEL[h.attendanceStatus] || h.attendanceStatus)}</span>` : ""}
          </div>
          <div class="assignment-meta">
            <span class="meta-item">Hạn: ${formatDateTime(h.deadline)}</span>
            ${h.score != null ? `<span class="meta-item">Điểm: <b>${h.score}</b></span>` : ""}
          </div>
          ${h.comment ? `<p class="assignment-desc">${escapeHtml(h.comment)}</p>` : ""}
        </div>
      </article>
    `).join("");
  }

  function closeProfile() {
    els.profileModal.classList.remove("open");
    currentStudentId = null;
  }

  /* ===================== SỰ KIỆN ===================== */

  els.backToClassesBtn.addEventListener("click", closeRoster);
  els.sessionSelect.addEventListener("change", () => loadRoster(els.sessionSelect.value));
  els.saveAttendanceBtn.addEventListener("click", saveAttendance);

  els.closeProfileBtn.addEventListener("click", closeProfile);
  els.profileModal.addEventListener("mousedown", (e) => {
    if (e.target === els.profileModal) closeProfile();
  });
  els.hwLimitSelect.addEventListener("change", loadProfile);

  els.mobileMenuBtn.addEventListener("click", () => {
    els.sidebar.classList.add("open");
    els.sidebarOverlay.classList.add("open");
  });
  els.sidebarOverlay.addEventListener("click", () => {
    els.sidebar.classList.remove("open");
    els.sidebarOverlay.classList.remove("open");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.profileModal.classList.contains("open")) closeProfile();
  });

  /* ===================== KHỞI ĐỘNG ===================== */
  loadClasses();
})();