// student-progress.js
// Trang "Kết quả và tiến độ" — danh sách bài đã nộp cùng điểm số.
// Dữ liệu lấy từ StudentService qua modules/routes.js:
//   GET /api/students/:studentId/submissions -> StudentService.getSubmissions
// Yêu cầu shared_auth.js chạy trước (định nghĩa USER_ID).

const STUDENT_ID = USER_ID;

let allSubmissions = [];
let allHomeworks = [];
let selectedYear = new Date().getFullYear();

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString("vi-VN") : "—";
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Lỗi server (${res.status})`);
  }
  return json.data;
}

function renderStats(submissions) {
  const total = submissions.length;
  const graded = submissions.filter((s) => s.score != null);
  const pending = total - graded.length;
  const avg = graded.length
    ? (graded.reduce((sum, s) => sum + s.score, 0) / graded.length).toFixed(1)
    : "—";

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statGraded").textContent = graded.length;
  document.getElementById("statPending").textContent = pending;
  document.getElementById("statAvgScore").textContent = avg;
}

function populateClassFilter(submissions) {
  const select = document.getElementById("classFilter");
  const currentValue = select.value || "all";
  const classes = [...new Set(submissions.map((s) => s.className).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "vi")
  );

  select.innerHTML =
    `<option value="all">Tất cả lớp</option>` +
    classes.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

  select.value = classes.includes(currentValue) ? currentValue : "all";
}

function getSubmissionStatusDistribution(homeworks) {
  const distribution = new Map([['Đã nộp bài', 0], ['Chưa nộp bài', 0]]);
  homeworks.forEach((hw) => {
    const submitted = hw.submissionStatus !== "not_submitted";
    distribution.set(submitted ? 'Đã nộp bài' : 'Chưa nộp bài', distribution.get(submitted ? 'Đã nộp bài' : 'Chưa nộp bài') + 1);
  });
  return Array.from(distribution.entries());
}

function renderScorePieChart(homeworks) {
  const distribution = getSubmissionStatusDistribution(homeworks);
  const total = homeworks.length || 1;
  const svg = document.getElementById("scorePieChart");
  const colors = ["#60c2a6", "#f56565"];

  let startAngle = 0;
  const radius = 72;
  const center = 90;

  const paths = distribution.map(([label, count], index) => {
    const value = count / total;
    const angle = value * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const largeArcFlag = angle > Math.PI ? 1 : 0;

    const x1 = center + radius * Math.cos(startAngle - Math.PI / 2);
    const y1 = center + radius * Math.sin(startAngle - Math.PI / 2);
    const x2 = center + radius * Math.cos(endAngle - Math.PI / 2);
    const y2 = center + radius * Math.sin(endAngle - Math.PI / 2);

    const path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
    const color = colors[index % colors.length];
    startAngle = endAngle;

    return `<path d="${path}" fill="${color}"></path>`;
  });

  svg.innerHTML = `<circle cx="${center}" cy="${center}" r="${radius + 14}" fill="#f7fafc" />` + paths.join("");

  const legend = document.getElementById("pieLegend");
  legend.innerHTML = distribution
    .map(([label, count], index) => {
      const color = colors[index % colors.length];
      return `<div class="chart-legend-item"><span class="chart-legend-swatch" style="background:${color}"></span><span class="chart-legend-label">${escapeHtml(label)}</span><span class="chart-legend-count">${count} bài</span></div>`;
    })
    .join("");
}

function getMonthlyAverageScores(submissions, year) {
  const monthScores = Array.from({ length: 12 }, () => []);

  submissions.forEach((s) => {
    if (s.score == null || !s.submittedAt) return;
    const date = new Date(s.submittedAt);
    if (date.getFullYear() !== year) return;
    monthScores[date.getMonth()].push(s.score);
  });

  return monthScores.map((scores) => {
    if (!scores.length) return null;
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  });
}

function renderYearToggle(years) {
  const toggle = document.getElementById("yearToggle");
  toggle.innerHTML = years
    .map((year) => {
      const active = year === selectedYear ? " active" : "";
      return `<button type="button" class="year-toggle-btn${active}" data-year="${year}">${year}</button>`;
    })
    .join("");

  toggle.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedYear = Number(button.dataset.year);
      renderYearToggle(years);
      renderLineChart(allSubmissions, selectedYear);
    });
  });
}

function renderLineChart(submissions, year) {
  const monthlyAverages = getMonthlyAverageScores(submissions, year);
  const svg = document.getElementById("scoreLineChart");
  const width = 560;
  const height = 280;
  const padding = 42;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const allScores = submissions
    .map((s) => Number(s.score))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const maxScore = allScores.length ? Math.max(...allScores, 10) : 10;
  const visiblePoints = monthlyAverages.map((avg, index) => ({ month: index, avg }));

  const points = visiblePoints.map(({ month, avg }) => {
    const x = padding + (chartWidth / 11) * month;
    const y = avg == null ? height - padding : padding + chartHeight - (avg / maxScore) * chartHeight;
    return { x, y, avg };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  const monthLabels = ['Th1','Th2','Th3','Th4','Th5','Th6','Th7','Th8','Th9','Th10','Th11','Th12'];

  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const y = padding + (chartHeight / 4) * i;
    const value = maxScore - (maxScore / 4) * i;
    return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="#e5e7eb" stroke-width="1" />` +
      `<text x="${padding - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#64748b">${value.toFixed(0)}</text>`;
  }).join("");

  const dots = points
    .map((point) => {
      const text = point.avg == null ? '—' : point.avg.toFixed(1);
      return `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#4f8ef7" />` +
        `<text x="${point.x}" y="${point.y - 12}" text-anchor="middle" font-size="11" fill="#1f2937">${text}</text>`;
    })
    .join("");

  const xLabels = points
    .map((point, index) => `<text x="${point.x}" y="${height - padding + 20}" text-anchor="middle" font-size="11" fill="#64748b">${monthLabels[index]}</text>`)
    .join("");

  svg.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" fill="transparent" />
    ${gridLines}
    <path d="${linePath}" fill="none" stroke="#4f8ef7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    ${dots}
    ${xLabels}
  `;
}

/* =======================================================================
   CHART SWITCHER — fully config-driven

   CHART_DEFINITIONS is the single source of truth for which charts exist
   on this page, in what order, with what label, and whether they're
   visible by default. Both the dropdown menu markup and the panel
   lookup are generated from this array at runtime, so adding, removing,
   or reordering charts means editing this array only — no HTML edits,
   no new if/else branches in JS.

   The HTML side only needs a <section class="chart-panel" data-chart="X">
   for each entry here, and an empty #chartDropdownMenu container.
   ======================================================================= */

const CHART_DEFINITIONS = [
  { id: "pie", label: "Trạng thái nộp bài", defaultActive: true },
  { id: "line", label: "Điểm trung bình theo tháng", defaultActive: false },
];

// Built once at setup time: [ <section data-chart='pie'>, <section data-chart='line'>, ... ]
let chartSections = [];

function renderChartDropdownMenu() {
  const menu = document.getElementById("chartDropdownMenu");
  if (!menu) return;

  menu.innerHTML = CHART_DEFINITIONS.map((def) => `
    <button type="button" class="chart-dropdown-item chart-toggle-item${def.defaultActive ? " active" : ""}" data-chart="${escapeHtml(def.id)}" role="menuitem">
      <span class="chart-switch-control"><span class="chart-switch-indicator"></span></span>
      <span class="chart-switch-label">${escapeHtml(def.label)}</span>
    </button>
  `).join("");
}

function getOrCreateEmptyChartMessage() {
  let el = document.getElementById("chartEmptyMessage");
  if (!el) {
    el = document.createElement("p");
    el.id = "chartEmptyMessage";
    el.style.padding = "16px";
    el.style.color = "#888";
    el.textContent = "Không có biểu đồ nào đang bật. Chọn ít nhất một biểu đồ để xem.";
    const anchor = chartSections[0];
    anchor?.parentNode?.insertBefore(el, anchor);
  }
  return el;
}

function updateEmptyChartMessage() {
  const anyVisible = chartSections.some((section) => section && !section.hidden);
  const emptyMessage = getOrCreateEmptyChartMessage();
  emptyMessage.hidden = anyVisible;
}

function setChartVisibility(chart, visible) {
  const item = document.querySelector(`#chartSwitcher .chart-toggle-item[data-chart="${chart}"]`);
  if (!item) return;

  const matchedSections = chartSections.filter((section) => section.dataset.chart === chart);
  if (!matchedSections.length) return;

  item.classList.toggle("active", visible);
  matchedSections.forEach((section) => {
    section.hidden = !visible;
  });

  updateEmptyChartMessage();
}

function setupChartSwitcher() {
  // Locate every chart panel by its data-chart attribute, keyed by
  // the same ids used in CHART_DEFINITIONS.
  chartSections = Array.from(document.querySelectorAll("section.chart-panel[data-chart]"));

  renderChartDropdownMenu();

  const dropdownButton = document.getElementById("chartDropdownButton");
  const dropdownMenu = document.getElementById("chartDropdownMenu");
  const items = document.querySelectorAll("#chartSwitcher .chart-toggle-item");

  // initialize visibility from CHART_DEFINITIONS defaults
  items.forEach((item) => {
    const chart = item.dataset.chart;
    const visible = item.classList.contains("active");
    setChartVisibility(chart, visible);

    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const currentlyActive = item.classList.contains("active");
      setChartVisibility(chart, !currentlyActive);
    });
  });

  // dropdown open/close
  if (dropdownButton && dropdownMenu) {
    dropdownButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = !dropdownMenu.classList.contains("hidden");
      dropdownMenu.classList.toggle("hidden", isOpen);
      dropdownButton.setAttribute("aria-expanded", String(!isOpen));
    });

    document.addEventListener("click", (event) => {
      if (!document.getElementById("chartSwitcher").contains(event.target)) {
        dropdownMenu.classList.add("hidden");
        dropdownButton.setAttribute("aria-expanded", "false");
      }
    });
  }
}

function renderList() {
  const keyword = document.getElementById("searchInput").value.trim().toLowerCase();
  const classValue = document.getElementById("classFilter").value;
  const statusValue = document.getElementById("statusFilter").value;

  const filtered = allSubmissions.filter((s) => {
    const haystack = `${s.homeworkTitle} ${s.className}`.toLowerCase();
    const matchKeyword = !keyword || haystack.includes(keyword);
    const matchClass = classValue === "all" || s.className === classValue;
    const effectiveStatus = s.score != null ? "graded" : "pending";
    const matchStatus = statusValue === "all" || statusValue === effectiveStatus;
    return matchKeyword && matchClass && matchStatus;
  });

  const container = document.getElementById("submissionList");
  document.getElementById("resultCount").textContent = `${filtered.length} bài nộp`;

  if (!filtered.length) {
    container.innerHTML = `<p style="padding:20px;color:#888">Không có bài nộp nào khớp bộ lọc.</p>`;
    return;
  }

  container.innerHTML = filtered
    .map((s) => {
      const graded = s.score != null;
      const appealLabel = s.appealStatus && s.appealStatus !== 'none'
        ? `<span class="meta-item"><svg><use href="#i-alert"></use></svg>Phúc khảo: ${escapeHtml(s.appealStatus)}</span>`
        : "";
      const appealReason = s.appealReason ? `<p class="assignment-desc"><strong>Lý do phúc khảo:</strong> ${escapeHtml(s.appealReason)}</p>` : "";
      const canRequestRegrade = graded && s.appealStatus !== 'pending';
      return `
        <article class="assignment-card">
          <div class="assignment-icon"><svg><use href="#i-check"></use></svg></div>
          <div class="assignment-main">
            <div class="assignment-title-row">
              <h3 class="assignment-title">${escapeHtml(s.homeworkTitle)}</h3>
              <span class="badge ${graded ? "badge-completed" : "badge-published"}">${graded ? "Đã chấm" : "Chờ chấm"}</span>
            </div>
            <div class="assignment-meta">
              <span class="meta-item"><svg><use href="#i-class"></use></svg>${escapeHtml(s.className)}</span>
              <span class="meta-item"><svg><use href="#i-calendar"></use></svg>Nộp lúc: ${formatDate(s.submittedAt)}</span>
              ${graded ? `<span class="meta-item"><svg><use href="#i-star"></use></svg>Điểm: ${s.score}</span>` : ""}
              ${appealLabel}
            </div>
            ${s.comment ? `<p class="assignment-desc">Nhận xét: ${escapeHtml(s.comment)}</p>` : ""}
            ${appealReason}
            ${canRequestRegrade ? `<button class="btn btn-secondary regrade-button" type="button" data-submission-id="${escapeHtml(s.id)}">Yêu cầu phúc khảo</button>` : ""}
          </div>
        </article>`;
    })
    .join("");
}

async function loadSubmissions() {
  try {
    const [submissions, homeworks] = await Promise.all([
      apiGet(`/api/students/${encodeURIComponent(STUDENT_ID)}/submissions`),
      apiGet(`/api/students/${encodeURIComponent(STUDENT_ID)}/dashboard`),
    ]);

    allSubmissions = submissions;
    allHomeworks = homeworks;

    renderStats(allSubmissions);
    populateClassFilter(allSubmissions);
    renderScorePieChart(allHomeworks);

    const years = Array.from(
      new Set(allSubmissions.map((s) => new Date(s.submittedAt).getFullYear()).filter(Boolean))
    ).sort((a, b) => b - a);
    if (!years.includes(selectedYear)) {
      selectedYear = years[0] || selectedYear;
    }
    renderYearToggle(years.length ? years : [selectedYear]);
    setupChartSwitcher();
    renderLineChart(allSubmissions, selectedYear);
    renderList();
  } catch (err) {
    console.error(err);
    document.getElementById("submissionList").innerHTML =
      `<p style="padding:16px;color:#c0392b">❌ Không tải được dữ liệu: ${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById("searchInput").addEventListener("input", renderList);
document.getElementById("classFilter").addEventListener("change", renderList);
document.getElementById("statusFilter").addEventListener("change", renderList);

document.getElementById("submissionList").addEventListener("click", async (event) => {
  const button = event.target.closest('.regrade-button');
  if (!button) return;

  const submissionId = button.dataset.submissionId;
  if (!submissionId) return;

  const reason = window.prompt('Vui lòng nhập lý do phúc khảo cho bài này:');
  if (!reason || !reason.trim()) {
    return;
  }

  try {
    await apiPost(`/api/submissions/${encodeURIComponent(submissionId)}/regrade`, {
      studentId: STUDENT_ID,
      reason: reason.trim(),
    });
    window.alert('Yêu cầu phúc khảo đã được gửi đến giáo viên.');
    await loadSubmissions();
  } catch (err) {
    window.alert(`Không thể gửi yêu cầu phúc khảo: ${err.message}`);
  }
});

loadSubmissions();