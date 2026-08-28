(() => {
  "use strict";

  const API_BASE = '/api';
  const CURRENT_STUDENT_ID = window.STUDENT_ID || window.USER_ID || (typeof USER_ID !== 'undefined' ? USER_ID : '');

  let allRequests = [];

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function formatDate(iso) {
    return iso ? new Date(iso).toLocaleString('vi-VN') : '—';
  }

  async function apiGet(path) {
    const res = await fetch(path);
    const json = await res.json();
    if (!res.ok || json.success === false) {
      throw new Error(json.error || `Lỗi server (${res.status})`);
    }
    return json.data;
  }

  function renderPhucKhaoList(requests) {
    const container = document.getElementById('phuckhaoList');

    if (!requests || requests.length === 0) {
      container.innerHTML = '<p style="padding:20px; color:#64748b; background:#fff; border-radius:12px; text-align:center;">Bạn chưa gửi yêu cầu phúc khảo nào.</p>';
      return;
    }

    const STATUS_MAP = {
      pending: { label: 'Chờ xử lý', class: 'badge-pending' },
      active:  { label: 'Đang chấm lại', class: 'badge-active' },
      done:    { label: 'Đã hoàn thành', class: 'badge-done' },
      approved:{ label: 'Đã hoàn thành', class: 'badge-done' },
      completed:{ label: 'Đã hoàn thành', class: 'badge-done' }
    };

    container.innerHTML = requests.map(req => {
      const statusKey = (req.appealStatus || 'pending').toLowerCase();
      const statusInfo = STATUS_MAP[statusKey] || { label: req.appealStatus, class: 'badge-pending' };
      
      return `
        <article class="phuckhao-card">
          <div class="card-header">
            <h3 class="card-title">${escapeHtml(req.homeworkTitle || 'Bài tập')}</h3>
            <span class="badge ${statusInfo.class}">${statusInfo.label}</span>
          </div>

          <div class="card-meta">
            <span>📚 Lớp: <strong>${escapeHtml(req.className || '—')}</strong></span>
            <span>📅 Ngày yêu cầu: ${formatDate(req.requestedAt)}</span>
            ${req.updatedAt ? `<span>🕒 Cập nhật: ${formatDate(req.updatedAt)}</span>` : ''}
            ${req.score != null ? `<span class="score-badge">⭐ Điểm: ${req.score}</span>` : ''}
          </div>

          <div class="reason-box">
            <div class="reason-label">Lý do bạn gửi phúc khảo:</div>
            <p class="reason-text">${escapeHtml(req.appealReason || 'Không có lý do')}</p>
          </div>
        </article>
      `;
    }).join('');
  }

  function handleFilter() {
    const selectedStatus = document.getElementById('statusFilter').value;
    if (!selectedStatus) {
      renderPhucKhaoList(allRequests);
    } else {
      const filtered = allRequests.filter(req => {
        const s = (req.appealStatus || 'pending').toLowerCase();
        if (selectedStatus === 'done') {
          return s === 'done' || s === 'approved' || s === 'completed';
        }
        return s === selectedStatus;
      });
      renderPhucKhaoList(filtered);
    }
  }

  async function loadStudentRequests() {
    try {
      if (!CURRENT_STUDENT_ID) {
        throw new Error("Không tìm thấy thông tin định danh học sinh.");
      }
      allRequests = await apiGet(`${API_BASE}/student/${encodeURIComponent(CURRENT_STUDENT_ID)}/phuckhao`);
      renderPhucKhaoList(allRequests);
    } catch (err) {
      document.getElementById('phuckhaoList').innerHTML = `<p style="color:#c0392b;">❌ Lỗi: ${escapeHtml(err.message)}</p>`;
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    loadStudentRequests();
    document.getElementById('statusFilter').addEventListener('change', handleFilter);
  });
})();