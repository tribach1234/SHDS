const PAGE_SIZE = 20;
let currentPage = 1;
let editingTeacherId = null;

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function escJs(s) {
  if (!s) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
}

async function loadTeachers(page = 1) {
  currentPage = page;
  const search = document.getElementById('searchInput').value.trim();
  const params = new URLSearchParams({ search, page, limit: PAGE_SIZE });

  try {
    const res = await fetch(`/api/admin/teachers?${params}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    document.getElementById('resultCount').textContent = `${data.total} giáo viên`;
    const tbody = document.getElementById('teacherTableBody');

    if (!data.data.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding:32px;text-align:center;color:#888">Không tìm thấy giáo viên nào.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.data.map(t => `
      <tr>
        <td><code style="font-size:12px;background:#f0f4f8;padding:3px 8px;border-radius:4px">${esc(t.id)}</code></td>
        <td><strong>${esc(t.fullName)}</strong></td>
        <td>${esc(t.email)}</td>
        <td>${t.createdAt ? new Date(t.createdAt).toLocaleDateString('vi-VN') : 'N/A'}</td>
        <td class="td-actions">
          <button class="icon-btn" title="Chỉnh sửa" onclick="openEditTeacher('${escJs(t.id)}')">
            <svg><use href="#i-edit"/></svg>
          </button>
          <button class="icon-btn danger" title="Xóa" onclick="deleteTeacher('${escJs(t.id)}','${escJs(t.fullName)}')">
            <svg><use href="#i-trash"/></svg>
          </button>
        </td>
      </tr>`).join('');

    buildPagination(document.getElementById('pagination'), {
      current: currentPage, total: data.total, limit: PAGE_SIZE, onPage: loadTeachers
    });
  } catch (err) {
    showToast('Lỗi tải dữ liệu: ' + err.message, 'error');
  }
}

function openCreateModal() {
  editingTeacherId = null;
  document.getElementById('teacherModalTitle').textContent = 'Thêm giáo viên mới';
  document.getElementById('tId').value = '';
  document.getElementById('tName').value = '';
  document.getElementById('tEmail').value = '';
  document.getElementById('tPass').value = '';
  document.getElementById('tId').disabled = false;
  document.getElementById('teacherModal').classList.add('open');
}

async function openEditTeacher(id) {
  try {
    const res = await fetch(`/api/admin/teachers/${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    editingTeacherId = id;
    document.getElementById('teacherModalTitle').textContent = 'Chỉnh sửa giáo viên';
    document.getElementById('tId').value = data.data.id;
    document.getElementById('tName').value = data.data.fullName;
    document.getElementById('tEmail').value = data.data.email;
    document.getElementById('tPass').value = ''; // Để trống nếu không muốn đổi pass
    document.getElementById('tId').disabled = true;
    document.getElementById('teacherModal').classList.add('open');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function closeTeacherModal() {
  document.getElementById('teacherModal').classList.remove('open');
}

async function saveTeacher() {
  const id = document.getElementById('tId').value.trim();
  const fullName = document.getElementById('tName').value.trim();
  const email = document.getElementById('tEmail').value.trim();
  const pass = document.getElementById('tPass').value;

  if (!editingTeacherId && (!id || !fullName || !email || !pass)) {
    return showToast('Vui lòng điền đầy đủ các thông tin bắt buộc!', 'error');
  }

  try {
    const url = editingTeacherId ? `/api/admin/teachers/${encodeURIComponent(editingTeacherId)}` : '/api/admin/teachers';
    const method = editingTeacherId ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, fullName, email, pass: pass || undefined })
    });
    
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    showToast(data.message, 'success');
    closeTeacherModal();
    loadTeachers(currentPage);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function deleteTeacher(id, name) {
  showConfirm({
    title: 'Xóa giáo viên',
    message: `Bạn có chắc muốn xóa giáo viên "${name}"?`,
    confirmText: 'Xóa',
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/admin/teachers/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        showToast(data.message, 'success');
        loadTeachers(currentPage);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });
}

document.getElementById('createTeacherBtn').addEventListener('click', openCreateModal);
document.getElementById('searchInput').addEventListener('input', () => loadTeachers(1));

const teacherModal = document.getElementById('teacherModal');
if (teacherModal) {
  teacherModal.addEventListener('click', e => {
    if (e.target === teacherModal) closeTeacherModal();
  });
}

loadTeachers(1);