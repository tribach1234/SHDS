// admin-dashboard.js

async function loadDashboard() {
  try {
    const res = await fetch('/api/admin/stats');
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    const d = data.data;

    document.getElementById('statStudents').textContent     = d.students;
    document.getElementById('statTeachers').textContent     = d.teachers;
    document.getElementById('statClasses').textContent      = d.classes;
    document.getElementById('statActiveClasses').textContent= d.activeClasses;
    document.getElementById('statAdmins').textContent       = d.admins;

    // Recent accounts
    const acBody = document.getElementById('recentAccountsBody');
    document.getElementById('recentAccountsCount').textContent = `${d.recentAccounts.length} tài khoản`;
    if (!d.recentAccounts.length) {
      acBody.innerHTML = '<tr><td colspan="4" style="padding:16px;color:#aaa;text-align:center">Chưa có dữ liệu</td></tr>';
    } else {
      acBody.innerHTML = d.recentAccounts.map(a => {
        const roleMap = { student: 'Học sinh', teacher: 'Giáo viên', admin: 'Admin' };
        const badgeMap = { student: 'badge-student', teacher: 'badge-teacher', admin: 'badge-admin' };
        const date = a.createdAt ? new Date(a.createdAt).toLocaleDateString('vi-VN') : '—';
        return `<tr>
          <td><strong>${esc(a.fullName)}</strong></td>
          <td><span class="badge ${badgeMap[a.role] || ''}">${roleMap[a.role] || a.role}</span></td>
          <td style="color:#888;font-size:12px">${esc(a.email)}</td>
          <td style="color:#888;font-size:12px">${date}</td>
        </tr>`;
      }).join('');
    }

    // Recent classes
    const clBody = document.getElementById('recentClassesBody');
    document.getElementById('recentClassesCount').textContent = `${d.recentClasses.length} lớp`;
    if (!d.recentClasses.length) {
      clBody.innerHTML = '<tr><td colspan="3" style="padding:16px;color:#aaa;text-align:center">Chưa có dữ liệu</td></tr>';
    } else {
      clBody.innerHTML = d.recentClasses.map(c => `<tr>
        <td><code style="font-size:12px;background:#f8f0f5;padding:2px 7px;border-radius:6px">${esc(c.classId)}</code></td>
        <td><strong>${esc(c.className)}</strong></td>
        <td><span class="badge badge-${c.status === 'active' ? 'active' : 'inactive'}">${c.status === 'active' ? 'Hoạt động' : 'Không hoạt động'}</span></td>
      </tr>`).join('');
    }
  } catch (err) {
    showToast('Không tải được dữ liệu: ' + err.message, 'error');
  }
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

loadDashboard();
