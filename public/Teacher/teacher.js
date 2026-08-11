(() => {
    "use strict";
  
    // Relative URL so this works on any host/port. Routes are defined as
    // "/api/assignments/:teacherId" in modules/routes.js, so TEACHER_ID
    // (set by teacher-auth.js, which must load before this file) gets
    // appended to every call below.
    const API_URL = "/api/assignments";
    
  
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  
    const elements = {
      list: $("#assignmentList"),
      resultCount: $("#resultCount"),
      search: $("#searchInput"),
      classFilter: $("#classFilter"),
      statusFilter: $("#statusFilter"),
      addButton: $("#addAssignmentBtn"),
      assignmentModal: $("#assignmentModal"),
      deleteModal: $("#deleteModal"),
      form: $("#assignmentForm"),
      modalTitle: $("#modalTitle"),
      modalSubtitle: $("#modalSubtitle"),
      saveButtonText: $("#saveButtonText"),
      descriptionCount: $("#descriptionCount"),
      toastRegion: $("#toastRegion"),
      deleteAssignmentName: $("#deleteAssignmentName"),
      cancelDeleteBtn: $("#cancelDeleteBtn"),
      confirmDeleteBtn: $("#confirmDeleteBtn"),
      sidebar: $("#sidebar"),
      sidebarOverlay: $("#sidebarOverlay"),
      mobileMenuBtn: $("#mobileMenuBtn"),
      stats: {
        total: $("#statTotal"),
        upcoming: $("#statUpcoming"),
        overdue: $("#statOverdue"),
        completed: $("#statCompleted")
      },
      fields: {
        id: $("#assignmentId"),
        title: $("#title"),
        className: $("#className"),
        points: $("#points"),
        dueDate: $("#dueDate"),
        dueTime: $("#dueTime"),
        status: $("#status"),
        materialUrl: $("#materialUrl"),
        description: $("#description")
      }
    };
  
    let assignments = [];
    let pendingDeleteId = null;
    let lastFocusedElement = null;
  
    // Fetch assignments from SQL database dynamically based on account ID
    async function loadAssignmentsFromDb() {
      try {
        const response = await fetch(`${API_URL}/${encodeURIComponent(TEACHER_ID)}`);
        if (!response.ok) throw new Error("Network response was not ok");
        assignments = await response.json();
      } catch (error) {
        console.error("Không thể lấy dữ liệu từ DB:", error);
        showToast("Lỗi kết nối", "Không thể tải dữ liệu từ máy chủ.", "error");
      }
      render();
    }
  
    // Save to SQL Database
    async function saveAssignmentToDb(data) {
      try {
        const response = await fetch(`${API_URL}/${encodeURIComponent(TEACHER_ID)}`, {
                                                  method: "POST",
                                                  headers: {
                                                      "Content-Type": "application/json"
                                                  },
                                                  body: JSON.stringify(data)
                                              });
        if (!response.ok) throw new Error("Failed to save");
      } catch (error) {
        console.error("Lỗi khi lưu:", error);
        showToast("Lỗi", "Không thể lưu vào database", "error");
      }
    }
  
    // Delete from SQL Database
    async function deleteAssignmentFromDb(id) {
      try {
        const response = await fetch(`${API_URL}/${encodeURIComponent(TEACHER_ID)}/${id}`, {
                                                              method: "DELETE"
                                                          });
        if (!response.ok) throw new Error("Failed to delete");
      } catch (error) {
        console.error("Lỗi khi xóa:", error);
        showToast("Lỗi", "Không thể xóa dữ liệu", "error");
      }
    }
  
    function toLocalDateInput(date) {
      const offset = date.getTimezoneOffset();
      return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
    }
  
    function addDays(baseDate, days) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + days);
      return date;
    }
  
    function assignmentDateTime(item) {
      return new Date(`${item.dueDate}T${item.dueTime || "23:59"}:00`);
    }
  
    function isOverdue(item) {
      return item.status !== "completed" &&
        item.status !== "draft" &&
        assignmentDateTime(item).getTime() < Date.now();
    }
  
    function isUpcoming(item) {
      if (item.status !== "published" || isOverdue(item)) return false;
      const diff = assignmentDateTime(item).getTime() - Date.now();
      return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
    }
  
    function formatDate(dateString, timeString) {
      const date = new Date(`${dateString}T${timeString || "23:59"}:00`);
      return new Intl.DateTimeFormat("vi-VN", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
    }
  
    function escapeHtml(value = "") {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
  
    function getStatusInfo(item) {
      if (isOverdue(item)) return { text: "Quá hạn", className: "badge-overdue" };
      if (item.status === "draft") return { text: "Bản nháp", className: "badge-draft" };
      if (item.status === "completed") return { text: "Hoàn thành", className: "badge-completed" };
      return { text: "Đã giao", className: "badge-published" };
    }
  
    function render() {
      updateClassFilter();
      updateStats();
  
      const keyword = elements.search.value.trim().toLocaleLowerCase("vi");
      const classValue = elements.classFilter.value;
      const statusValue = elements.statusFilter.value;
  
      const filtered = assignments
        .filter(item => {
          const haystack = `${item.title} ${item.className} ${item.description || ""}`.toLocaleLowerCase("vi");
          const matchKeyword = !keyword || haystack.includes(keyword);
          const matchClass = classValue === "all" || item.className === classValue;
          const effectiveStatus = isOverdue(item) ? "overdue" : item.status;
          const matchStatus = statusValue === "all" || effectiveStatus === statusValue;
          return matchKeyword && matchClass && matchStatus;
        })
        .sort((a, b) => assignmentDateTime(a) - assignmentDateTime(b));
  
      elements.resultCount.textContent = `${filtered.length} bài tập`;
  
      if (!filtered.length) {
        elements.list.innerHTML = `
          <div class="empty-state">
            <div>
              <div class="empty-illustration"><svg><use href="#i-task"></use></svg></div>
              <h3>Chưa có bài tập phù hợp</h3>
              <p>Thử thay đổi từ khóa hoặc bộ lọc. Bạn cũng có thể tạo một bài tập mới ngay bây giờ.</p>
              <button class="btn btn-primary" type="button" data-empty-add>
                <svg><use href="#i-plus"></use></svg>
                Giao bài mới
              </button>
            </div>
          </div>
        `;
        $("[data-empty-add]", elements.list)?.addEventListener("click", openCreateModal);
        return;
      }
  
      elements.list.innerHTML = filtered.map(item => {
        const status = getStatusInfo(item);
        const overdueClass = isOverdue(item) ? "overdue" : "";
        const safeUrl = item.materialUrl && /^https?:\/\//i.test(item.materialUrl) ? item.materialUrl : "";
  
        return `
          <article class="assignment-card ${overdueClass}" data-id="${escapeHtml(item.id)}">
            <div class="assignment-icon"><svg><use href="#i-task"></use></svg></div>
            <div class="assignment-main">
              <div class="assignment-title-row">
                <h3 class="assignment-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
                <span class="badge ${status.className}">${status.text}</span>
              </div>
              <div class="assignment-meta">
                <span class="meta-item">
                  <svg><use href="#i-class"></use></svg>
                  ${escapeHtml(item.className)}
                </span>
                <span class="meta-item">
                  <svg><use href="#i-calendar"></use></svg>
                  ${escapeHtml(formatDate(item.dueDate, item.dueTime))}
                </span>
                <span class="meta-item">
                  <svg><use href="#i-star"></use></svg>
                  ${Number(item.points)} điểm
                </span>
                ${safeUrl ? `
                  <a class="meta-item" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--green-700);font-weight:700;text-decoration:none">
                    <svg><use href="#i-link"></use></svg>
                    Tài liệu
                  </a>` : ""}
              </div>
              ${item.description ? `<p class="assignment-desc">${escapeHtml(item.description)}</p>` : ""}
            </div>
            <div class="card-actions" aria-label="Thao tác với ${escapeHtml(item.title)}">
              <button class="icon-btn" type="button" data-action="submissions" title="Xem nộp bài" aria-label="Xem nộp bài">
                <svg><use href="#i-users"></use></svg>
              </button>
              <button class="icon-btn" type="button" data-action="duplicate" title="Nhân bản" aria-label="Nhân bản bài tập">
                <svg><use href="#i-copy"></use></svg>
              </button>
              <button class="icon-btn" type="button" data-action="edit" title="Chỉnh sửa" aria-label="Chỉnh sửa bài tập">
                <svg><use href="#i-edit"></use></svg>
              </button>
              <button class="icon-btn danger" type="button" data-action="delete" title="Xóa" aria-label="Xóa bài tập">
                <svg><use href="#i-trash"></use></svg>
              </button>
            </div>
          </article>
        `;
      }).join("");
    }
  
    function updateStats() {
      elements.stats.total.textContent = assignments.length;
      elements.stats.upcoming.textContent = assignments.filter(isUpcoming).length;
      elements.stats.overdue.textContent = assignments.filter(isOverdue).length;
      elements.stats.completed.textContent = assignments.filter(item => item.status === "completed").length;
    }
  
    function updateClassFilter() {
      const currentValue = elements.classFilter.value || "all";
      const classes = [...new Set(assignments.map(item => item.className).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "vi"));
  
      elements.classFilter.innerHTML = `
        <option value="all">Tất cả lớp</option>
        ${classes.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}
      `;
  
      elements.classFilter.value = classes.includes(currentValue) ? currentValue : "all";
    }
  
    function openModal(modal) {
      lastFocusedElement = document.activeElement;
      modal.classList.add("open");
      document.body.style.overflow = "hidden";
    }
  
    function closeModal(modal) {
      modal.classList.remove("open");
      if (!$$(".modal-backdrop.open").length) {
        document.body.style.overflow = "";
      }
      lastFocusedElement?.focus?.();
    }
  
    function openCreateModal() {
      clearValidation();
      elements.form.reset();
      elements.fields.id.value = "";
      elements.fields.points.value = "10";
      elements.fields.dueTime.value = "23:59";
      elements.fields.status.value = "published";
      elements.fields.dueDate.value = toLocalDateInput(addDays(new Date(), 7));
      elements.modalTitle.textContent = "Giao bài tập mới";
      elements.modalSubtitle.textContent = "Điền đầy đủ thông tin trước khi lưu.";
      elements.saveButtonText.textContent = "Lưu bài tập";
      elements.descriptionCount.textContent = "0";
      openModal(elements.assignmentModal);
      setTimeout(() => elements.fields.title.focus(), 50);
    }
  
    function openEditModal(id) {
      const item = assignments.find(assignment => assignment.id === id);
      if (!item) return;
  
      clearValidation();
      elements.fields.id.value = item.id;
      elements.fields.title.value = item.title;
      elements.fields.className.value = item.className;
      elements.fields.points.value = item.points;
      elements.fields.dueDate.value = item.dueDate;
      elements.fields.dueTime.value = item.dueTime;
      elements.fields.status.value = item.status;
      elements.fields.materialUrl.value = item.materialUrl || "";
      elements.fields.description.value = item.description || "";
      elements.descriptionCount.textContent = String((item.description || "").length);
      elements.modalTitle.textContent = "Chỉnh sửa bài tập";
      elements.modalSubtitle.textContent = "Cập nhật nội dung rồi nhấn lưu thay đổi.";
      elements.saveButtonText.textContent = "Lưu thay đổi";
      openModal(elements.assignmentModal);
      setTimeout(() => elements.fields.title.focus(), 50);
    }
  
    function validateForm() {
      clearValidation();
      let valid = true;
  
      const rules = [
        { field: "fieldTitle", invalid: !elements.fields.title.value.trim() },
        { field: "fieldClassName", invalid: !elements.fields.className.value.trim() },
        {
          field: "fieldPoints",
          invalid: !Number.isFinite(Number(elements.fields.points.value)) ||
            Number(elements.fields.points.value) < 1 ||
            Number(elements.fields.points.value) > 1000
        },
        { field: "fieldDueDate", invalid: !elements.fields.dueDate.value },
        { field: "fieldDueTime", invalid: !elements.fields.dueTime.value }
      ];
  
      rules.forEach(rule => {
        if (rule.invalid) {
          document.getElementById(rule.field).classList.add("invalid");
          valid = false;
        }
      });
  
      if (!valid) {
        $(".field.invalid input, .field.invalid select, .field.invalid textarea")?.focus();
      }
  
      return valid;
    }
  
    function clearValidation() {
      $$(".field.invalid").forEach(field => field.classList.remove("invalid"));
    }
  
    async function handleSubmit(event) {
      event.preventDefault();
      if (!validateForm()) return;
  
      const id = elements.fields.id.value;
      const now = new Date().toISOString();
  
      const data = {
        id: id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
        title: elements.fields.title.value.trim(),
        className: elements.fields.className.value.trim(),
        points: Number(elements.fields.points.value),
        dueDate: elements.fields.dueDate.value,
        dueTime: elements.fields.dueTime.value,
        status: elements.fields.status.value,
        materialUrl: elements.fields.materialUrl.value.trim(),
        description: elements.fields.description.value.trim(),
        createdAt: now,
        updatedAt: now
      };
  
      // Sync with Node.js Database backend
      await saveAssignmentToDb(data);
  
      if (id) {
        const index = assignments.findIndex(item => item.id === id);
        if (index !== -1) {
          data.createdAt = assignments[index].createdAt || now;
          assignments[index] = data;
        }
        showToast("Đã cập nhật bài tập", `"${data.title}" đã được lưu vào CSDL.`);
      } else {
        assignments.push(data);
        showToast("Đã tạo bài tập", `"${data.title}" đã được lưu vào CSDL.`);
      }
  
      closeModal(elements.assignmentModal);
      render();
    }
  
    async function duplicateAssignment(id) {
      const source = assignments.find(item => item.id === id);
      if (!source) return;
  
      const copy = {
        ...source,
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        title: `${source.title} (Bản sao)`,
        status: "draft",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
  
      await saveAssignmentToDb(copy);
      assignments.push(copy);
      render();
      showToast("Đã nhân bản bài tập", "Bản sao được lưu ở trạng thái nháp.");
    }
  
    function requestDelete(id) {
      const item = assignments.find(assignment => assignment.id === id);
      if (!item) return;
      pendingDeleteId = id;
      elements.deleteAssignmentName.textContent = `"${item.title}"`;
      openModal(elements.deleteModal);
      setTimeout(() => elements.cancelDeleteBtn.focus(), 50);
    }
  
    async function confirmDelete() {
      if (!pendingDeleteId) return;
      const item = assignments.find(assignment => assignment.id === pendingDeleteId);
      
      // Delete from Node backend
      await deleteAssignmentFromDb(pendingDeleteId);

      assignments = assignments.filter(assignment => assignment.id !== pendingDeleteId);
      
      closeModal(elements.deleteModal);
      render();
      showToast("Đã xóa bài tập", item ? `"${item.title}" đã được xóa.` : "Bài tập đã được xóa.");
      pendingDeleteId = null;
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
  
    function closeSidebar() {
      elements.sidebar.classList.remove("open");
      elements.sidebarOverlay.classList.remove("open");
    }
  
    elements.addButton.addEventListener("click", openCreateModal);
    elements.form.addEventListener("submit", handleSubmit);
    elements.search.addEventListener("input", render);
    elements.classFilter.addEventListener("change", render);
    elements.statusFilter.addEventListener("change", render);
  
    elements.fields.description.addEventListener("input", event => {
      elements.descriptionCount.textContent = String(event.target.value.length);
    });
  
    elements.list.addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
  
      const card = button.closest("[data-id]");
      const id = card?.dataset.id;
      if (!id) return;
  
      const action = button.dataset.action;
      if (action === "submissions") openSubmissionPage(id);
      if (action === "edit") openEditModal(id);
      if (action === "delete") requestDelete(id);
      if (action === "duplicate") duplicateAssignment(id);
    });
  
    $$("[data-close-modal]").forEach(button => {
      button.addEventListener("click", () => closeModal(elements.assignmentModal));
    });
  
    elements.cancelDeleteBtn.addEventListener("click", () => {
      pendingDeleteId = null;
      closeModal(elements.deleteModal);
    });

    function openSubmissionPage(homeworkId) {
      window.location.href = `/Teacher/teacher-assignmentReview.html?homeworkId=${encodeURIComponent(homeworkId)}`;
    }
    elements.confirmDeleteBtn.addEventListener("click", confirmDelete);
  
    [elements.assignmentModal, elements.deleteModal].forEach(modal => {
      modal.addEventListener("mousedown", event => {
        if (event.target === modal) {
          if (modal === elements.deleteModal) pendingDeleteId = null;
          closeModal(modal);
        }
      });
    });
  
    elements.mobileMenuBtn.addEventListener("click", () => {
      elements.sidebar.classList.add("open");
      elements.sidebarOverlay.classList.add("open");
    });
    elements.sidebarOverlay.addEventListener("click", closeSidebar);
  
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        if (elements.deleteModal.classList.contains("open")) {
          pendingDeleteId = null;
          closeModal(elements.deleteModal);
        } else if (elements.assignmentModal.classList.contains("open")) {
          closeModal(elements.assignmentModal);
        } else {
          closeSidebar();
        }
      }
    });
  
    // Boot up the application by requesting dynamic data
    loadAssignmentsFromDb();
  })();