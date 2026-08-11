// nop-bai.js
// Trang "Nộp bài": liệt kê các bài tập CHƯA NỘP của học sinh, cho chọn 1 bài
// rồi hiện form nộp bài tương ứng.
// Re-uses auth/profile/logout from shared_auth.js (phải load trước file này).

const STUDENT_ID = USER_ID;

const listSection = document.getElementById("listSection");
const formSection = document.getElementById("formSection");
const homeworkList = document.getElementById("homeworkList");
const backToListBtn = document.getElementById("backToListBtn");
const submitForm = document.getElementById("submitForm");
const submitBtn = document.getElementById("submitBtn");

let notSubmitted = [];

/* ======================= HELPERS ======================= */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDeadline(iso) {
  return new Date(iso).toLocaleString("vi-VN");
}

async function apiGet(path) {
  const res = await fetch(path);
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Lỗi server (${res.status})`);
  }
  return json.data;
}

async function apiPost(path, body) {
  const res = await fetch(path, {
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

/* ======================= DANH SÁCH ======================= */

function renderList() {
  document.getElementById("listCount").textContent = `${notSubmitted.length} bài tập`;

  if (!notSubmitted.length) {
    homeworkList.innerHTML = `<p style="padding:20px;color:#888">🎉 Bạn không còn bài tập nào cần nộp.</p>`;
    return;
  }

  homeworkList.innerHTML = notSubmitted
    .map((hw) => {
      const overdue = new Date(hw.deadline).getTime() < Date.now();
      return `
        <article class="assignment-card" data-id="${escapeHtml(hw.homeworkId)}" style="cursor:pointer;">
          <div class="assignment-icon"><svg><use href="#i-task"></use></svg></div>
          <div class="assignment-main">
            <div class="assignment-title-row">
              <h3 class="assignment-title" title="${escapeHtml(hw.title)}">${escapeHtml(hw.title)}</h3>
              <span class="badge ${overdue ? "badge-overdue" : "badge-published"}">${overdue ? "Quá hạn" : "Chưa nộp"}</span>
            </div>
            <div class="assignment-meta">
              <span class="meta-item"><svg><use href="#i-class"></use></svg>${escapeHtml(hw.className || "")}</span>
              <span class="meta-item"><svg><use href="#i-calendar"></use></svg>Hạn: ${formatDeadline(hw.deadline)}</span>
            </div>
          </div>
        </article>`;
    })
    .join("");

  [...homeworkList.querySelectorAll("[data-id]")].forEach((card) => {
    card.addEventListener("click", () => openForm(card.dataset.id));
  });
}

/* ======================= FORM NỘP BÀI ======================= */

function openForm(homeworkId) {
  const hw = notSubmitted.find((h) => String(h.homeworkId) === String(homeworkId));
  if (!hw) return;

  const deadlineMs = new Date(hw.deadline).getTime();
  const overdue = deadlineMs < Date.now();
  const dueSoon = !overdue && deadlineMs - Date.now() <= 3 * 24 * 3600 * 1000;

  document.getElementById("formHomeworkId").value = hw.homeworkId;
  document.getElementById("formTitle").textContent = hw.title;
  document.getElementById("formClass").textContent = hw.className || "—";
  document.getElementById("formDeadline").textContent = `${formatDeadline(hw.deadline)}${overdue ? " (Đã quá hạn)" : dueSoon ? " (Sắp đến hạn)" : ""}`;
  document.getElementById("formPoints").textContent = hw.points != null ? `${hw.points} điểm` : "—";
  document.getElementById("formStatus").textContent = hw.status || "—";
  document.getElementById("formNote").textContent = hw.note || "Không có mô tả.";

  const linkWrap = document.getElementById("formMaterialWrap");
  const linkEl = document.getElementById("formMaterialLink");
  if (hw.joinLink) {
    linkEl.innerHTML = `<a href="${escapeHtml(hw.joinLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(hw.joinLink)}</a>`;
    linkWrap.style.display = "";
  } else {
    linkWrap.style.display = "none";
  }

  document.getElementById("fileLink").value = "";
  clearFormMessage();

  listSection.style.display = "none";
  formSection.style.display = "";

  // Lưu homeworkId vào URL để có thể mở thẳng form khi tải lại trang
  const url = new URL(window.location.href);
  url.searchParams.set("homeworkId", hw.homeworkId);
  window.history.replaceState({}, "", url);
}

function backToList() {
  formSection.style.display = "none";
  listSection.style.display = "";

  const url = new URL(window.location.href);
  url.searchParams.delete("homeworkId");
  window.history.replaceState({}, "", url);
}

function clearFormMessage() {
  const msg = document.getElementById("formMessage");
  msg.textContent = "";
  msg.className = "form-message";
}

function showFormMessage(text, isError = false) {
  const msg = document.getElementById("formMessage");
  msg.textContent = text;
  msg.className = `form-message ${isError ? "error" : "success"}`;
}

/* ======================= LOAD DỮ LIỆU ======================= */

async function loadNotSubmitted() {
  try {
    const homeworks = await apiGet(`/api/students/${STUDENT_ID}/dashboard`);
    notSubmitted = homeworks.filter((h) => h.submissionStatus === "not_submitted");
    renderList();

    // Nếu đến từ nút "Nộp bài" trên Student.html (có sẵn ?homeworkId=...), mở form luôn
    const params = new URLSearchParams(window.location.search);
    const hwId = params.get("homeworkId");
    if (hwId) openForm(hwId);
  } catch (err) {
    console.error(err);
    homeworkList.innerHTML = `<p style="padding:20px;color:#c0392b">❌ Không tải được dữ liệu: ${escapeHtml(err.message)}</p>`;
  }
}

/* ======================= SỰ KIỆN ======================= */

submitForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const homeworkId = document.getElementById("formHomeworkId").value;
  const fileLink = document.getElementById("fileLink").value.trim();

  if (!fileLink) {
    showFormMessage("Vui lòng nhập link bài nộp.", true);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.querySelector("span").textContent = "Đang nộp...";

  try {
    await apiPost(`/api/homeworks/${homeworkId}/submit`, {
      studentId: STUDENT_ID,
      fileLink,
    });

    showFormMessage("✅ Nộp bài thành công! Đang quay lại trang bài tập...");
    notSubmitted = notSubmitted.filter((h) => String(h.homeworkId) !== String(homeworkId));

    setTimeout(() => {
      window.location.href = "/Student/Student.html";
    }, 900);
  } catch (err) {
    showFormMessage("❌ Nộp bài thất bại: " + err.message, true);
    submitBtn.disabled = false;
    submitBtn.querySelector("span").textContent = "Nộp bài";
  }
});

backToListBtn.addEventListener("click", backToList);

/* ======================= KHỞI ĐỘNG ======================= */

loadNotSubmitted();