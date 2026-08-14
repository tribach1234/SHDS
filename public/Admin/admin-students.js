// admin-students.js

const PAGE_SIZE = 20;
let currentPage = 1;
let editingStudentId = null;
let assignStudentId = null;
let assignStudentName = '';

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Load students ─────────────────────────────────────────────
async function loadStudents(page = 1) {
  currentPage = page;
  const search  = document.getElementById('searchInput').value.trim();
  const classId = document.getElementById('classFilter').value;
  const sort    = document.getElementById('sortSelect').value;
  const params  = new URLSearchParams({ search, classId, sort, page, limit: PAGE_SIZE });

  try {
    const res = await fetch(`/api/admin/students?${params}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const total = data.total;
    document.getElementById('resultCount').textContent = `${total} học sinh`;

    const tbody = document.getElementById('studentTableBody');
    if (!data.data.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:32px;text-align:center">
        <div class="empty-state" style="min-height:unset">
          <div class="empty-illustration"><svg style="width:32px;height:32px"><use href="#i-users"/></svg></div>
          <h3>Không tìm thấy học sinh</h3>
          <p>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</p>
        </div></td></tr>`;
    } else {
      tbody.innerHTML = data.data.map(s => {
        const classes = s.classes ? s.classes.split(',').map(c => `<code style="font-size:11px;background:#f8f0f5;padding:1px 5px;border-radius:5px;margin-right:3px">${esc(c)}</code>`).join('') : '<span style="color:#bbb">—</span>';
        const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString('vi-VN') : '—';
        return `<tr>
          <td><code style="font-size:12px;background:#f8f0f5;padding:2px 7px;border-radius:6px">${esc(s.id)}</code></td>
          <td><strong>${esc(s.fullName)}</strong></td>
          <td style="color:#666;font-size:13px">${esc(s.email)}</td>
          <td>${classes}</td>
          <td style="color:#999;font-size:12px">${date}</td>
          <td class="td-actions">
            <button class="icon-btn" title="Phân lớp" onclick="openAssignModal('${esc(s.id)}','${esc(s.fullName).replace(/'/g,"\\'")}')">
              <svg><use href="#i-class"/></svg>
            </button>
            <button class="icon-btn" title="Chỉnh sửa" onclick="openEditStudent('${esc(s.id)}')">
              <svg><use href="#i-edit"/></svg>
            </button>
            <button class="icon-btn danger" title="Xóa" onclick="deleteStudent('${esc(s.id)}','${esc(s.fullName).replace(/'/g,"\\'")}')">
              <svg><use href="#i-trash"/></svg>
            </button>
          </td>
        </tr>`;
      }).join('');
    }

    buildPagination(document.getElementById('pagination'), {
      current: currentPage, total, limit: PAGE_SIZE, onPage: loadStudents
    });
  } catch (err) {
    showToast('Lỗi tải dữ liệu: ' + err.message, 'error');
  }
}

// ── Load class filter dropdown ────────────────────────────────
async function loadClassFilter() {
  try {
    const res = await fetch('/api/admin/all-classes');
    const data = await res.json();
    const sel = document.getElementById('classFilter');
    sel.innerHTML = '<option value="all">Tất cả lớp</option>' +
      data.data.map(c => `<option value="${esc(c.classId)}">${esc(c.className)}</option>`).join('');

    // Also populate sClass select in create modal
    const sClass = document.getElementById('sClass');
    sClass.innerHTML = '<option value="">— Chọn lớp —</option>' +
      data.data.map(c => `<option value="${esc(c.classId)}">${esc(c.className)}</option>`).join('');

    // addClassSelect for assign modal
    const addSel = document.getElementById('addClassSelect');
    addSel.innerHTML = '<option value="">— Chọn lớp để thêm —</option>' +
      data.data.map(c => `<option value="${esc(c.classId)}">${esc(c.className)}</option>`).join('');
  } catch {}
}

// ── Create modal ──────────────────────────────────────────────
function openCreateModal() {
  editingStudentId = null;
  document.getElementById('studentModalTitle').textContent = 'Thêm học sinh';
  document.getElementById('studentModalSub').textContent = 'Tạo tài khoản học sinh mới';
  document.getElementById('sId').value = '';
  document.getElementById('sName').value = '';
  document.getElementById('sEmail').value = '';
  document.getElementById('sPass').value = '';
  document.getElementById('sClass').value = '';
  document.getElementById('sId').disabled = false;
  document.getElementById('studentModal').classList.add('open');
}

async function openEditStudent(id) {
  try {
    const res = await fetch(`/api/admin/students/${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    const s = data.data;
    editingStudentId = id;
    document.getElementById('studentModalTitle').textContent = 'Chỉnh sửa học sinh';
    document.getElementById('studentModalSub').textContent = `ID: ${s.id}`;
    document.getElementById('sId').value = s.id;
    document.getElementById('sName').value = s.fullName;
    document.getElementById('sEmail').value = s.email;
    document.getElementById('sPass').value = '';
    document.getElementById('sId').disabled = true;
    document.getElementById('studentModal').classList.add('open');
  } catch (err) {
    showToast('Lỗi tải thông tin: ' + err.message, 'error');
  }
}

function closeStudentModal() {
  document.getElementById('studentModal').classList.remove('open');
}

// ── Save student ──────────────────────────────────────────────
async function saveStudent() {
  const id      = document.getElementById('sId').value.trim();
  const fullName= document.getElementById('sName').value.trim();
  const email   = document.getElementById('sEmail').value.trim();
  const pass    = document.getElementById('sPass').value;
  const classId = document.getElementById('sClass').value;

  if (!editingStudentId && (!id || !fullName || !email || !pass)) {
    return showToast('Vui lòng điền đầy đủ thông tin!', 'error');
  }

  const btn = document.getElementById('saveStudentBtn');
  btn.disabled = true;
  btn.textContent = 'Đang lưu...';

  try {
    let res, data;
    if (editingStudentId) {
      res  = await fetch(`/api/admin/students/${encodeURIComponent(editingStudentId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, pass: pass || undefined })
      });
    } else {
      res = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, fullName, email, pass, classId })
      });
    }
    data = await res.json();
    if (!data.success) throw new Error(data.message);
    showToast(data.message, 'success');
    closeStudentModal();
    loadStudents(currentPage);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg><use href="#i-check"/></svg> Lưu';
  }
}

// ── Delete student ────────────────────────────────────────────
function deleteStudent(id, name) {
  showConfirm({
    title: 'Xóa học sinh?',
    message: `Bạn có chắc muốn xóa học sinh "${name}"? Hành động này sẽ xóa học sinh khỏi tất cả lớp học và không thể hoàn tác.`,
    confirmText: 'Xóa học sinh',
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/admin/students/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        showToast(data.message, 'success');
        loadStudents(currentPage);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });
}

// ── Assign Modal ──────────────────────────────────────────────
async function openAssignModal(id, name) {
  assignStudentId = id;
  assignStudentName = name;
  document.getElementById('assignModalSub').textContent = name;
  document.getElementById('assignModal').classList.add('open');
  await loadCurrentClasses();
}

function closeAssignModal() {
  document.getElementById('assignModal').classList.remove('open');
  loadStudents(currentPage);
}

async function loadCurrentClasses() {
  try {
    const res = await fetch(`/api/admin/students/${encodeURIComponent(assignStudentId)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    const classes = data.data.classes;
    const container = document.getElementById('currentClassesList');
    if (!classes.length) {
      container.innerHTML = '<div style="padding:12px;color:#aaa;text-align:center;font-size:13px">Chưa có lớp nào</div>';
    } else {
      container.innerHTML = classes.map(c => `
        <div class="member-row">
          <span>${esc(c.className)} <code style="font-size:11px;margin-left:6px;color:#aaa">${esc(c.classId)}</code></span>
          <button class="icon-btn danger" title="Xóa khỏi lớp" onclick="removeFromClass('${esc(c.classId)}')">
            <svg><use href="#i-trash"/></svg>
          </button>
        </div>`).join('');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function addStudentToClass() {
  const classId = document.getElementById('addClassSelect').value;
  if (!classId) return showToast('Vui lòng chọn lớp!', 'error');
  try {
    const res = await fetch(`/api/admin/classes/${encodeURIComponent(classId)}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: assignStudentId, role: 'student' })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    showToast(data.message, 'success');
    await loadCurrentClasses();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeFromClass(classId) {
  try {
    const res = await fetch(`/api/admin/classes/${encodeURIComponent(classId)}/members/${encodeURIComponent(assignStudentId)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    showToast(data.message, 'success');
    await loadCurrentClasses();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Event listeners ───────────────────────────────────────────
document.getElementById('createStudentBtn').addEventListener('click', openCreateModal);
document.getElementById('searchInput').addEventListener('input', () => loadStudents(1));
document.getElementById('classFilter').addEventListener('change', () => loadStudents(1));
document.getElementById('sortSelect').addEventListener('change', () => loadStudents(1));

document.getElementById('studentModal').addEventListener('click', e => {
  if (e.target === document.getElementById('studentModal')) closeStudentModal();
});
document.getElementById('assignModal').addEventListener('click', e => {
  if (e.target === document.getElementById('assignModal')) closeAssignModal();
});

// Auto-open create modal from dashboard quick-action
if (new URLSearchParams(location.search).get('action') === 'create') openCreateModal();

// Init
loadClassFilter();
loadStudents(1);
