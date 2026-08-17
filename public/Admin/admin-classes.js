const PAGE_SIZE = 20;
let currentPage = 1;
let editingClassId = null;
let teachersList = [];

// Improved ESC helper: safely escapes quotes to prevent HTML attribute breakage
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escJs(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&/g, '&amp;');
}

// Lấy danh sách giáo viên để điền vào dropdown select
async function loadTeachersOptions() {
  try {
    const res = await fetch('/api/admin/teachers?limit=1000');
    const data = await res.json();
    const select = document.getElementById('cTeacher');
    if (!select) return;

    if (data.success && Array.isArray(data.data)) {
      teachersList = data.data;
      select.innerHTML = `<option value="">-- Chưa phân công --</option>` + 
        teachersList.map(t => {
          const tId = t.id || t.teacher_id || '';
          const tName = t.fullName || t.name || 'N/A';
          return `<option value="${esc(tId)}">${esc(tName)} (${esc(tId)})</option>`;
        }).join('');
    }
  } catch (err) {
    console.error('Không thể tải danh sách giáo viên:', err);
  }
}

async function loadClasses(page = 1) {
  currentPage = page;
  const searchInput = document.getElementById('searchInput');
  const search = searchInput ? searchInput.value.trim() : '';
  const params = new URLSearchParams({ search, page, limit: PAGE_SIZE });

  try {
    const res = await fetch(`/api/admin/classes?${params}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Lỗi tải danh sách lớp học');

    const countEl = document.getElementById('resultCount');
    if (countEl) countEl.textContent = `${data.total || 0} lớp học`;

    const tbody = document.getElementById('classTableBody');
    if (!tbody) return;

    const classes = data.data || [];

    if (!classes.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding:32px;text-align:center;color:#888">Không tìm thấy lớp học nào.</td></tr>`;
      return;
    }

tbody.innerHTML = classes.map(c => {
      // 1. Smart mapping for Class ID / Code
      // If c.id/c.code is missing, fall back to c.name which holds codes like 'DN-ART-ART1'
      const rawId = c.classId || c.id || c.class_id || c.code || '';
      const classId = rawId || c.name || '';

      // 2. Smart mapping for Class Name
      // If c.name was used as the ID, fallback to className/title or generate 'Lớp [ID]'
      let className = c.className || c.title || c.description || '';
      if (!className) {
        className = (c.name && c.name !== classId) ? c.name : (classId ? `Lớp ${classId}` : '');
      }

      // 3. Robust Teacher Name resolution
      const teacherName = c.teacherName || c.teacher_name || (c.teacher ? (c.teacher.fullName || c.teacher.name) : '');
      
      // 4. Schedule resolution
      const schedule = c.schedule || c.class_schedule || '';

      // UI Components with Fallbacks
      const idHtml = classId 
        ? `<code style="font-size:12px;background:#f0f4f8;padding:3px 8px;border-radius:4px;font-weight:600">${esc(classId)}</code>` 
        : `<span style="color:#aaa;font-style:italic">N/A</span>`;

      const nameHtml = className 
        ? `<strong>${esc(className)}</strong>` 
        : `<span style="color:#aaa;font-style:italic">Chưa có tên</span>`;

      const teacherHtml = teacherName 
        ? esc(teacherName) 
        : `<span style="color:#aaa;font-style:italic">Chưa phân công</span>`;

      const scheduleHtml = schedule 
        ? esc(schedule) 
        : `<span style="color:#aaa;font-style:italic">Chưa xếp lịch</span>`;

      return `
        <tr>
          <td>${idHtml}</td>
          <td>${nameHtml}</td>
          <td>${teacherHtml}</td>
          <td>${scheduleHtml}</td>
          <td class="td-actions">
            <button class="icon-btn" title="Chỉnh sửa" onclick="openEditClass('${escJs(classId)}')">
              <svg><use href="#i-edit"/></svg>
            </button>
            <button class="icon-btn danger" title="Xóa" onclick="deleteClass('${escJs(classId)}','${escJs(className)}')">
              <svg><use href="#i-trash"/></svg>
            </button>
          </td>
        </tr>`;
    }).join('');

    if (typeof buildPagination === 'function') {
      const pagEl = document.getElementById('pagination');
      if (pagEl) {
        buildPagination(pagEl, {
          current: currentPage,
          total: data.total || 0,
          limit: PAGE_SIZE,
          onPage: loadClasses
        });
      }
    }
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast('Lỗi tải dữ liệu: ' + err.message, 'error');
    } else {
      console.error(err);
    }
  }
}

function openCreateModal() {
  editingClassId = null;
  document.getElementById('classModalTitle').textContent = 'Tạo lớp học mới';
  document.getElementById('cId').value = '';
  document.getElementById('cName').value = '';
  document.getElementById('cTeacher').value = '';
  document.getElementById('cSchedule').value = '';
  document.getElementById('cId').disabled = false;
  document.getElementById('classModal').classList.add('open');
}

async function openEditClass(id) {
  if (!id) return;
  try {
    // Ensure dropdown options exist before setting selected value
    if (!teachersList.length) {
      await loadTeachersOptions();
    }

    const res = await fetch(`/api/admin/classes/${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Không tìm thấy thông tin lớp học');

    const cls = data.data;
    editingClassId = cls.classId || cls.id || cls.class_id || id;

    document.getElementById('classModalTitle').textContent = 'Chỉnh sửa lớp học';
    document.getElementById('cId').value = cls.classId || cls.id || cls.class_id || '';
    document.getElementById('cName').value = cls.className || cls.name || '';
    document.getElementById('cTeacher').value = cls.teacherId || cls.teacher_id || '';
    document.getElementById('cSchedule').value = cls.schedule || '';
    document.getElementById('cId').disabled = true;
    document.getElementById('classModal').classList.add('open');
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}

function closeClassModal() {
  const modal = document.getElementById('classModal');
  if (modal) modal.classList.remove('open');
}

async function saveClass() {
  const id = document.getElementById('cId').value.trim();
  const name = document.getElementById('cName').value.trim();
  const teacherId = document.getElementById('cTeacher').value;
  const schedule = document.getElementById('cSchedule').value.trim();

  // Validation checks
  if (!editingClassId && !id) {
    return typeof showToast === 'function' ? showToast('Vui lòng nhập Mã lớp!', 'error') : alert('Vui lòng nhập Mã lớp!');
  }
  if (!name) {
    return typeof showToast === 'function' ? showToast('Vui lòng nhập Tên lớp!', 'error') : alert('Vui lòng nhập Tên lớp!');
  }

  const finalId = editingClassId || id;

  try {
    const url = editingClassId ? `/api/admin/classes/${encodeURIComponent(editingClassId)}` : '/api/admin/classes';
    const method = editingClassId ? 'PUT' : 'POST';

    // Send both variants (id/classId and name/className) to match any backend requirement
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        id: finalId, 
        classId: finalId, 
        name: name, 
        className: name, 
        teacherId, 
        schedule 
      })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Thao tác không thành công');

    if (typeof showToast === 'function') showToast(data.message, 'success');
    closeClassModal();
    loadClasses(currentPage);
  } catch (err) {
    if (typeof showToast === 'function') showToast(err.message, 'error');
  }
}
function deleteClass(id, name) {
  if (typeof showConfirm === 'function') {
    showConfirm({
      title: 'Xóa lớp học',
      message: `Bạn có chắc muốn xóa lớp "${name || id}"?`,
      confirmText: 'Xóa',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/classes/${encodeURIComponent(id)}`, { method: 'DELETE' });
          const data = await res.json();
          if (!data.success) throw new Error(data.message);
          showToast(data.message, 'success');
          loadClasses(currentPage);
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });
  }
}

// Event Bindings
const createBtn = document.getElementById('createClassBtn');
if (createBtn) createBtn.addEventListener('click', openCreateModal);

const searchInput = document.getElementById('searchInput');
if (searchInput) searchInput.addEventListener('input', () => loadClasses(1));

const classModal = document.getElementById('classModal');
if (classModal) {
  classModal.addEventListener('click', e => {
    if (e.target === classModal) closeClassModal();
  });
}

// Initialize
loadTeachersOptions();
loadClasses(1);