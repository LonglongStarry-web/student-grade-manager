(function () {
  "use strict";

  const STORAGE_KEY = "offline-grade-manager-v1";
  const EMPTY_DATA = () => ({
    version: 1,
    settings: { passScore: 60, excellentScore: 85 },
    classes: [],
    subjects: [],
    students: [],
    exams: [],
    scores: []
  });

  let data = loadData();
  let activeExamId = null;
  let toastTimer = null;
  let confirmAction = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const byId = (items, id) => items.find(item => item.id === id);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const formatNumber = value => Number.isFinite(value) ? value.toFixed(1) : "--";
  const formatPercent = value => Number.isFinite(value) ? `${value.toFixed(1)}%` : "--";
  const formatDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString("zh-CN") : "未设置";

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return EMPTY_DATA();
      const parsed = JSON.parse(raw);
      if (!isValidData(parsed)) throw new Error("数据结构不完整");
      return parsed;
    } catch (error) {
      console.error("读取本地数据失败", error);
      return EMPTY_DATA();
    }
  }

  function isValidData(value) {
    return value && typeof value === "object" &&
      ["classes", "subjects", "students", "exams", "scores"].every(key => Array.isArray(value[key])) &&
      value.settings && Number.isFinite(Number(value.settings.passScore)) && Number.isFinite(Number(value.settings.excellentScore));
  }

  function saveData(message = "数据已自动保存") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const status = $("#save-status");
    status.textContent = message;
    status.classList.add("is-saved");
    window.setTimeout(() => { status.textContent = "数据已保存"; }, 1200);
  }

  function notify(message, type = "success") {
    const toast = $("#toast");
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast is-visible${type === "error" ? " is-error" : ""}`;
    toastTimer = window.setTimeout(() => { toast.className = "toast"; }, 2600);
  }

  function confirmDialog(message, action, buttonText = "确认删除") {
    confirmAction = action;
    $("#confirm-message").textContent = message;
    $("#confirm-ok").textContent = buttonText;
    $("#confirm-modal").hidden = false;
    $("#confirm-cancel").focus();
  }

  function closeConfirm() {
    $("#confirm-modal").hidden = true;
    confirmAction = null;
  }

  function showView(viewName) {
    $$(".view").forEach(view => view.classList.toggle("is-active", view.id === `view-${viewName}`));
    $$(".nav-button").forEach(button => button.classList.toggle("is-active", button.dataset.view === viewName || (viewName === "score-entry" && button.dataset.view === "exams")));
    if (viewName !== "score-entry") activeExamId = viewName === "analysis" ? activeExamId : null;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function optionList(items, placeholder, selected = "", includeAll = false) {
    const first = includeAll ? `<option value="">${escapeHtml(placeholder)}</option>` : `<option value="">${escapeHtml(placeholder)}</option>`;
    return first + items.map(item => `<option value="${item.id}"${item.id === selected ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
  }

  function getExamScores(examId) {
    return data.scores.filter(score => score.examId === examId && Number.isFinite(score.value));
  }

  function getExamStudents(exam) {
    return data.students.filter(student => student.classId === exam.classId).sort((a, b) => a.studentNo.localeCompare(b.studentNo, "zh-CN", { numeric: true }));
  }

  function calculateStats(examId) {
    const exam = byId(data.exams, examId);
    if (!exam) return null;
    const students = getExamStudents(exam);
    const entries = getExamScores(examId);
    const values = entries.map(item => item.value).sort((a, b) => a - b);
    if (!values.length) return { total: students.length, entered: 0, absent: students.length, average: NaN, max: NaN, min: NaN, median: NaN, stdDev: NaN, passRate: NaN, excellentRate: NaN };
    const sum = values.reduce((acc, value) => acc + value, 0);
    const average = sum / values.length;
    const middle = Math.floor(values.length / 2);
    const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    const variance = values.reduce((acc, value) => acc + Math.pow(value - average, 2), 0) / values.length;
    return {
      total: students.length,
      entered: values.length,
      absent: Math.max(0, students.length - values.length),
      average,
      max: values[values.length - 1],
      min: values[0],
      median,
      stdDev: Math.sqrt(variance),
      passRate: values.filter(value => value >= data.settings.passScore).length / values.length * 100,
      excellentRate: values.filter(value => value >= data.settings.excellentScore).length / values.length * 100
    };
  }

  function renderAll() {
    renderSelects();
    renderDashboard();
    renderBaseData();
    renderExamList();
    renderAnalysis();
    renderHistory();
    renderSettings();
  }

  function renderSelects() {
    const current = selector => $(selector)?.value || "";
    const classOptions = (placeholder, selected, all = false) => optionList(data.classes, placeholder, selected, all);
    const subjectOptions = (placeholder, selected, all = false) => optionList(data.subjects, placeholder, selected, all);

    const studentClassFilter = $("#student-class-filter");
    const studentFilterValue = current("#student-class-filter") || data.classes[0]?.id || "";
    studentClassFilter.innerHTML = classOptions("暂无班级", studentFilterValue);
    studentClassFilter.value = studentFilterValue;

    $$('#student-form select[name="classId"], #exam-form select[name="classId"]').forEach(select => {
      const old = select.value;
      select.innerHTML = classOptions("请选择班级", old);
    });
    const examSubject = $('#exam-form select[name="subjectId"]');
    const oldSubject = examSubject.value;
    examSubject.innerHTML = subjectOptions("请选择科目", oldSubject);

    const examClassFilter = $("#exam-class-filter");
    const examClassValue = current("#exam-class-filter");
    examClassFilter.innerHTML = classOptions("全部班级", examClassValue, true);
    const examSubjectFilter = $("#exam-subject-filter");
    const examSubjectValue = current("#exam-subject-filter");
    examSubjectFilter.innerHTML = subjectOptions("全部科目", examSubjectValue, true);

    const examOptions = data.exams.slice().sort((a, b) => b.date.localeCompare(a.date)).map(exam => ({
      id: exam.id,
      name: `${exam.name} · ${byId(data.classes, exam.classId)?.name || "未知班级"} · ${byId(data.subjects, exam.subjectId)?.name || "未知科目"}`
    }));
    ["#analysis-exam-select", "#csv-exam-select"].forEach(selector => {
      const select = $(selector);
      const old = select.value || activeExamId || examOptions[0]?.id || "";
      select.innerHTML = optionList(examOptions, "暂无考试", old);
      select.value = examOptions.some(item => item.id === old) ? old : (examOptions[0]?.id || "");
    });

    const historyClass = $("#history-class-select");
    const oldHistoryClass = historyClass.value || data.classes[0]?.id || "";
    historyClass.innerHTML = classOptions("暂无班级", oldHistoryClass);
    historyClass.value = oldHistoryClass;
    renderHistoryStudentOptions();
  }

  function renderDashboard() {
    const completedScores = data.scores.filter(score => Number.isFinite(score.value)).length;
    const latestExam = data.exams.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    const latestStats = latestExam ? calculateStats(latestExam.id) : null;
    $("#dashboard-metrics").innerHTML = [
      ["班级数量", data.classes.length, "已建立的班级"],
      ["学生人数", data.students.length, "全部班级学生"],
      ["考试场次", data.exams.length, `已录入 ${completedScores} 条成绩`],
      ["最近平均分", latestStats && latestStats.entered ? formatNumber(latestStats.average) : "--", latestExam ? latestExam.name : "暂无考试"]
    ].map(([label, value, note]) => `<article class="metric-card"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}</div><div class="metric-note">${escapeHtml(note)}</div></article>`).join("");

    const recent = data.exams.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    $("#recent-exams").innerHTML = recent.length ? examRows(recent, true) : emptyState("还没有考试记录", "请先建立班级、学生和科目，再新建考试。", "base-data", "先去建立资料");
  }

  function renderBaseData() {
    $("#class-list").innerHTML = data.classes.length ? data.classes.map(item => {
      const count = data.students.filter(student => student.classId === item.id).length;
      return `<div class="list-row"><div><strong>${escapeHtml(item.name)}</strong><br><small>${count} 名学生</small></div><div class="table-actions"><button class="text-button small-button" data-edit-class="${item.id}">编辑</button><button class="text-button small-button" data-delete-class="${item.id}">删除</button></div></div>`;
    }).join("") : emptyState("暂无班级", "请在上方输入班级名称。", "", "");

    $("#subject-list").innerHTML = data.subjects.length ? data.subjects.map(item => {
      const count = data.exams.filter(exam => exam.subjectId === item.id).length;
      return `<div class="list-row"><div><strong>${escapeHtml(item.name)}</strong><br><small>${count} 场考试</small></div><div class="table-actions"><button class="text-button small-button" data-edit-subject="${item.id}">编辑</button><button class="text-button small-button" data-delete-subject="${item.id}">删除</button></div></div>`;
    }).join("") : emptyState("暂无科目", "请在上方输入科目名称。", "", "");

    renderStudentList();
  }

  function renderStudentList() {
    const classId = $("#student-class-filter").value;
    const students = data.students.filter(student => !classId || student.classId === classId).sort((a, b) => a.studentNo.localeCompare(b.studentNo, "zh-CN", { numeric: true }));
    $("#student-list").innerHTML = students.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>学号</th><th>姓名</th><th>班级</th><th>已参加考试</th><th></th></tr></thead><tbody>${students.map(student => {
      const examIds = data.exams.filter(exam => exam.classId === student.classId).map(exam => exam.id);
      const entered = data.scores.filter(score => score.studentId === student.id && examIds.includes(score.examId) && Number.isFinite(score.value)).length;
      return `<tr><td>${escapeHtml(student.studentNo)}</td><td><strong>${escapeHtml(student.name)}</strong></td><td>${escapeHtml(byId(data.classes, student.classId)?.name || "未知班级")}</td><td>${entered} 场</td><td><div class="table-actions"><button class="text-button small-button" data-edit-student="${student.id}">编辑</button><button class="text-button small-button" data-delete-student="${student.id}">删除</button></div></td></tr>`;
    }).join("")}</tbody></table></div>` : emptyState("该班级暂无学生", "使用上方表单添加学生。", "", "");
  }

  function renderExamList() {
    const classFilter = $("#exam-class-filter").value;
    const subjectFilter = $("#exam-subject-filter").value;
    const exams = data.exams.filter(exam => (!classFilter || exam.classId === classFilter) && (!subjectFilter || exam.subjectId === subjectFilter)).sort((a, b) => b.date.localeCompare(a.date));
    $("#exam-list").innerHTML = exams.length ? examRows(exams, false) : emptyState("暂无符合条件的考试", "新建考试后即可为整班录入成绩。", "", "");
  }

  function examRows(exams, compact) {
    return `<div class="exam-cards">${exams.map(exam => {
      const stats = calculateStats(exam.id);
      const progress = stats.total ? stats.entered / stats.total * 100 : 0;
      return `<article class="exam-row"><div><h4>${escapeHtml(exam.name)}</h4><p>${escapeHtml(byId(data.classes, exam.classId)?.name || "未知班级")} · ${escapeHtml(byId(data.subjects, exam.subjectId)?.name || "未知科目")} · ${formatDate(exam.date)}</p></div><div><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div><div class="progress-label">已录 ${stats.entered}/${stats.total} 人</div></div><div class="exam-average"><strong>${stats.entered ? formatNumber(stats.average) : "--"}</strong><span>平均分</span></div><div class="table-actions"><button class="primary-button small-button" data-enter-score="${exam.id}">录入成绩</button><button class="secondary-button small-button" data-analyze="${exam.id}">分析</button>${compact ? "" : `<button class="text-button small-button" data-edit-exam="${exam.id}">编辑</button><button class="text-button small-button" data-delete-exam="${exam.id}">删除</button>`}</div></article>`;
    }).join("")}</div>`;
  }

  function openScoreEntry(examId) {
    const exam = byId(data.exams, examId);
    if (!exam) return;
    activeExamId = examId;
    $("#score-entry-title").textContent = exam.name;
    $("#score-entry-meta").textContent = `${byId(data.classes, exam.classId)?.name || "未知班级"} · ${byId(data.subjects, exam.subjectId)?.name || "未知科目"} · ${formatDate(exam.date)}`;
    const students = getExamStudents(exam);
    $("#score-entry-table").innerHTML = students.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>学号</th><th>姓名</th><th>成绩</th><th>状态</th></tr></thead><tbody>${students.map(student => {
      const score = data.scores.find(item => item.examId === examId && item.studentId === student.id);
      const value = Number.isFinite(score?.value) ? score.value : "";
      return `<tr><td>${escapeHtml(student.studentNo)}</td><td><strong>${escapeHtml(student.name)}</strong></td><td><input class="score-input" type="number" min="0" max="100" step="0.1" inputmode="decimal" data-student-id="${student.id}" value="${value}" aria-label="${escapeHtml(student.name)}的成绩"></td><td class="score-status">${value === "" ? "缺考/未录入" : scoreLabel(Number(value))}</td></tr>`;
    }).join("")}</tbody></table></div>` : emptyState("该班级暂无学生", "请先在基础资料中添加学生。", "base-data", "添加学生");
    showView("score-entry");
  }

  function scoreLabel(value) {
    if (value >= data.settings.excellentScore) return "优秀";
    if (value >= data.settings.passScore) return "及格";
    return "未及格";
  }

  function saveScore(input) {
    const raw = input.value.trim();
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
      input.classList.add("is-invalid");
      input.closest("tr").querySelector(".score-status").textContent = "请输入 0–100";
      return;
    }
    input.classList.remove("is-invalid");
    const studentId = input.dataset.studentId;
    const index = data.scores.findIndex(item => item.examId === activeExamId && item.studentId === studentId);
    if (value === null) {
      if (index >= 0) data.scores.splice(index, 1);
    } else if (index >= 0) {
      data.scores[index].value = value;
    } else {
      data.scores.push({ examId: activeExamId, studentId, value });
    }
    input.closest("tr").querySelector(".score-status").textContent = value === null ? "缺考/未录入" : scoreLabel(value);
    saveData();
  }

  function renderAnalysis() {
    const container = $("#analysis-content");
    const examId = $("#analysis-exam-select").value;
    const exam = byId(data.exams, examId);
    if (!exam) {
      container.innerHTML = emptyState("暂无可分析的考试", "请先新建考试并录入成绩。", "exams", "去新建考试");
      return;
    }
    const stats = calculateStats(examId);
    const students = getExamStudents(exam);
    const valuesByStudent = new Map(data.scores.filter(score => score.examId === examId && Number.isFinite(score.value)).map(score => [score.studentId, score.value]));
    const ranked = students.map(student => ({ student, score: valuesByStudent.get(student.id) })).sort((a, b) => {
      if (!Number.isFinite(a.score)) return 1;
      if (!Number.isFinite(b.score)) return -1;
      return b.score - a.score;
    });
    const scoredValues = ranked.filter(item => Number.isFinite(item.score)).map(item => item.score);
    const getRank = score => Number.isFinite(score) ? scoredValues.findIndex(value => value === score) + 1 : "--";
    const ranges = [
      { label: "90–100", count: scoredValues.filter(v => v >= 90).length },
      { label: "80–89", count: scoredValues.filter(v => v >= 80 && v < 90).length },
      { label: "70–79", count: scoredValues.filter(v => v >= 70 && v < 80).length },
      { label: "60–69", count: scoredValues.filter(v => v >= 60 && v < 70).length },
      { label: "0–59", count: scoredValues.filter(v => v < 60).length }
    ];
    const maxRange = Math.max(1, ...ranges.map(item => item.count));
    const metricItems = [
      ["平均分", formatNumber(stats.average)], ["最高分", formatNumber(stats.max)], ["最低分", formatNumber(stats.min)],
      ["中位数", formatNumber(stats.median)], ["及格率", formatPercent(stats.passRate)], ["优秀率", formatPercent(stats.excellentRate)], ["标准差", formatNumber(stats.stdDev)]
    ];
    container.innerHTML = `<div class="metric-grid analysis-metrics">${metricItems.map(([label, value]) => `<article class="metric-card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div></article>`).join("")}</div>
      <div class="analysis-grid">
        <section class="content-section"><div class="section-heading"><div><h3>分数段分布</h3><p>已录 ${stats.entered} 人，缺考或未录 ${stats.absent} 人</p></div></div><div class="distribution">${ranges.map(item => `<div class="distribution-row"><span>${item.label}</span><div class="distribution-bar"><div class="distribution-fill" style="width:${item.count / maxRange * 100}%"></div></div><span class="distribution-count">${item.count} 人</span></div>`).join("")}</div></section>
        <section class="content-section"><div class="section-heading"><div><h3>成绩明细与排名</h3><p>同分学生获得相同名次</p></div><button class="secondary-button small-button" type="button" data-export-analysis="${examId}">导出 CSV</button></div>${ranked.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>名次</th><th>学号</th><th>姓名</th><th>成绩</th><th>结果</th></tr></thead><tbody>${ranked.map(item => `<tr><td>${getRank(item.score)}</td><td>${escapeHtml(item.student.studentNo)}</td><td><strong>${escapeHtml(item.student.name)}</strong></td><td class="number-cell">${Number.isFinite(item.score) ? formatNumber(item.score) : "缺考"}</td><td class="${Number.isFinite(item.score) && item.score >= data.settings.excellentScore ? "result-excellent" : Number.isFinite(item.score) && item.score < data.settings.passScore ? "result-fail" : ""}">${Number.isFinite(item.score) ? scoreLabel(item.score) : "--"}</td></tr>`).join("")}</tbody></table></div>` : emptyState("暂无学生", "该班级还没有学生。", "", "")}</section>
      </div>`;
  }

  function renderHistoryStudentOptions() {
    const classId = $("#history-class-select").value;
    const select = $("#history-student-select");
    const old = select.value;
    const students = data.students.filter(student => student.classId === classId).sort((a, b) => a.studentNo.localeCompare(b.studentNo, "zh-CN", { numeric: true }));
    select.innerHTML = optionList(students, "暂无学生", old);
    if (!students.some(student => student.id === old)) select.value = students[0]?.id || "";
  }

  function renderHistory() {
    const studentId = $("#history-student-select").value;
    const student = byId(data.students, studentId);
    const container = $("#student-history");
    if (!student) {
      container.innerHTML = emptyState("请选择学生", "建立学生资料后可查看个人成绩。", "", "");
      return;
    }
    const exams = data.exams.filter(exam => exam.classId === student.classId).sort((a, b) => a.date.localeCompare(b.date));
    const records = exams.map(exam => ({ exam, score: data.scores.find(item => item.examId === exam.id && item.studentId === student.id)?.value })).filter(item => Number.isFinite(item.score));
    if (!records.length) {
      container.innerHTML = emptyState(`${student.name} 暂无成绩`, "录入考试成绩后将在这里显示变化。", "", "");
      return;
    }
    const average = records.reduce((sum, item) => sum + item.score, 0) / records.length;
    container.innerHTML = `<p><strong>${escapeHtml(student.name)}</strong> · 共 ${records.length} 次有效成绩 · 平均分 ${formatNumber(average)}</p><div class="trend-list">${records.map(({ exam, score }) => `<div class="trend-row"><div><strong>${escapeHtml(exam.name)}</strong><br><small>${escapeHtml(byId(data.subjects, exam.subjectId)?.name || "未知科目")}</small></div><small>${formatDate(exam.date)}</small><div class="trend-track"><div class="trend-fill" style="width:${score}%"></div></div><div class="trend-score">${formatNumber(score)}</div></div>`).join("")}</div>`;
  }

  function renderSettings() {
    const form = $("#settings-form");
    form.elements.passScore.value = data.settings.passScore;
    form.elements.excellentScore.value = data.settings.excellentScore;
    const hasAnyData = [data.classes, data.subjects, data.students, data.exams, data.scores].some(items => items.length);
    $("#load-demo").disabled = hasAnyData;
  }

  function emptyState(title, message, view, buttonLabel) {
    return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>${view ? `<div style="margin-top:14px"><button class="secondary-button small-button" data-go="${view}">${escapeHtml(buttonLabel)}</button></div>` : ""}</div>`;
  }

  function resetForm(form) {
    form.reset();
    form.elements.id.value = "";
    const cancel = $(".form-cancel", form);
    if (cancel) cancel.hidden = true;
    if (form.id === "exam-form") form.elements.date.value = new Date().toISOString().slice(0, 10);
    renderSelects();
  }

  function editEntity(formSelector, item) {
    const form = $(formSelector);
    Object.entries(item).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; });
    $(".form-cancel", form).hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    form.querySelector('input:not([type="hidden"]), select').focus();
  }

  function exportJson() {
    const payload = { ...data, exportedAt: new Date().toISOString() };
    downloadFile(`学生成绩备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    notify("完整备份已导出");
  }

  function exportCsv(examId) {
    const exam = byId(data.exams, examId);
    if (!exam) return notify("请先选择考试", "error");
    const students = getExamStudents(exam);
    const scores = new Map(data.scores.filter(item => item.examId === examId).map(item => [item.studentId, item.value]));
    const rows = [
      ["考试名称", exam.name], ["日期", exam.date], ["班级", byId(data.classes, exam.classId)?.name || ""], ["科目", byId(data.subjects, exam.subjectId)?.name || ""], [],
      ["学号", "姓名", "成绩", "结果", "名次"]
    ];
    const numericScores = [...scores.values()].filter(Number.isFinite).sort((a, b) => b - a);
    students.forEach(student => {
      const score = scores.get(student.id);
      rows.push([student.studentNo, student.name, Number.isFinite(score) ? score : "缺考", Number.isFinite(score) ? scoreLabel(score) : "", Number.isFinite(score) ? numericScores.findIndex(value => value === score) + 1 : ""]);
    });
    const stats = calculateStats(examId);
    rows.push([], ["平均分", formatNumber(stats.average)], ["最高分", formatNumber(stats.max)], ["最低分", formatNumber(stats.min)], ["及格率", formatPercent(stats.passRate)], ["优秀率", formatPercent(stats.excellentRate)]);
    const csv = "\ufeff" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
    downloadFile(`${safeFileName(exam.name)}-${safeFileName(byId(data.classes, exam.classId)?.name || "班级")}.csv`, csv, "text/csv;charset=utf-8");
    notify("成绩表已导出");
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function safeFileName(value) {
    return String(value).replace(/[\\/:*?"<>|]/g, "-");
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function loadDemoData() {
    const classId = uid();
    const subjects = [{ id: uid(), name: "语文" }, { id: uid(), name: "数学" }, { id: uid(), name: "英语" }];
    const names = ["陈晨", "杜雨", "高远", "何欣", "李明", "林悦", "罗文", "王宁", "吴桐", "徐安", "杨帆", "张蕾"];
    const students = names.map((name, index) => ({ id: uid(), classId, studentNo: String(index + 1).padStart(3, "0"), name }));
    const exams = subjects.map((subject, index) => ({ id: uid(), name: index === 0 ? "春季期中考试" : "三月月考", date: `2026-0${index + 3}-15`, classId, subjectId: subject.id }));
    const scores = [];
    exams.forEach((exam, examIndex) => students.forEach((student, studentIndex) => {
      if (!(examIndex === 2 && studentIndex === 11)) scores.push({ examId: exam.id, studentId: student.id, value: Math.min(100, 54 + ((studentIndex * 7 + examIndex * 11) % 44)) });
    }));
    data = { version: 1, settings: { passScore: 60, excellentScore: 85 }, classes: [{ id: classId, name: "高一（1）班" }], subjects, students, exams, scores };
    saveData();
    renderAll();
    notify("示例数据已生成");
    showView("dashboard");
  }

  function bindEvents() {
    document.addEventListener("click", event => {
      const go = event.target.closest("[data-go]");
      if (go) return showView(go.dataset.go);
      const nav = event.target.closest(".nav-button");
      if (nav) return showView(nav.dataset.view);

      const idFrom = name => event.target.closest(`[data-${name}]`)?.dataset[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
      let id;
      if ((id = idFrom("edit-class"))) return editEntity("#class-form", byId(data.classes, id));
      if ((id = idFrom("edit-subject"))) return editEntity("#subject-form", byId(data.subjects, id));
      if ((id = idFrom("edit-student"))) return editEntity("#student-form", byId(data.students, id));
      if ((id = idFrom("edit-exam"))) return editEntity("#exam-form", byId(data.exams, id));
      if ((id = idFrom("enter-score"))) return openScoreEntry(id);
      if ((id = idFrom("analyze"))) {
        activeExamId = id;
        $("#analysis-exam-select").value = id;
        renderAnalysis();
        showView("analysis");
        return;
      }
      if ((id = idFrom("export-analysis"))) return exportCsv(id);

      if ((id = idFrom("delete-class"))) {
        const item = byId(data.classes, id);
        return confirmDialog(`删除“${item.name}”会同时删除该班学生、考试和成绩。确定继续吗？`, () => {
          const studentIds = data.students.filter(s => s.classId === id).map(s => s.id);
          const examIds = data.exams.filter(e => e.classId === id).map(e => e.id);
          data.classes = data.classes.filter(x => x.id !== id);
          data.students = data.students.filter(x => x.classId !== id);
          data.exams = data.exams.filter(x => x.classId !== id);
          data.scores = data.scores.filter(x => !studentIds.includes(x.studentId) && !examIds.includes(x.examId));
          saveData(); renderAll(); notify("班级及相关数据已删除");
        });
      }
      if ((id = idFrom("delete-subject"))) {
        const item = byId(data.subjects, id);
        return confirmDialog(`删除“${item.name}”会同时删除该科目的考试和成绩。确定继续吗？`, () => {
          const examIds = data.exams.filter(e => e.subjectId === id).map(e => e.id);
          data.subjects = data.subjects.filter(x => x.id !== id);
          data.exams = data.exams.filter(x => x.subjectId !== id);
          data.scores = data.scores.filter(x => !examIds.includes(x.examId));
          saveData(); renderAll(); notify("科目及相关考试已删除");
        });
      }
      if ((id = idFrom("delete-student"))) {
        const item = byId(data.students, id);
        return confirmDialog(`删除学生“${item.name}”及其全部成绩，确定继续吗？`, () => {
          data.students = data.students.filter(x => x.id !== id);
          data.scores = data.scores.filter(x => x.studentId !== id);
          saveData(); renderAll(); notify("学生已删除");
        });
      }
      if ((id = idFrom("delete-exam"))) {
        const item = byId(data.exams, id);
        return confirmDialog(`删除考试“${item.name}”及本场全部成绩，确定继续吗？`, () => {
          data.exams = data.exams.filter(x => x.id !== id);
          data.scores = data.scores.filter(x => x.examId !== id);
          saveData(); renderAll(); notify("考试已删除");
        });
      }
    });

    $("#class-form").addEventListener("submit", event => {
      event.preventDefault();
      const form = event.currentTarget;
      const id = form.elements.id.value;
      const name = form.elements.name.value.trim();
      if (data.classes.some(item => item.name === name && item.id !== id)) return notify("班级名称不能重复", "error");
      if (id) byId(data.classes, id).name = name; else data.classes.push({ id: uid(), name });
      saveData(); resetForm(form); renderAll(); notify(id ? "班级已修改" : "班级已添加");
    });

    $("#subject-form").addEventListener("submit", event => {
      event.preventDefault();
      const form = event.currentTarget;
      const id = form.elements.id.value;
      const name = form.elements.name.value.trim();
      if (data.subjects.some(item => item.name === name && item.id !== id)) return notify("科目名称不能重复", "error");
      if (id) byId(data.subjects, id).name = name; else data.subjects.push({ id: uid(), name });
      saveData(); resetForm(form); renderAll(); notify(id ? "科目已修改" : "科目已添加");
    });

    $("#student-form").addEventListener("submit", event => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form));
      values.name = values.name.trim(); values.studentNo = values.studentNo.trim();
      if (data.students.some(item => item.classId === values.classId && item.studentNo === values.studentNo && item.id !== values.id)) return notify("同一班级内学号不能重复", "error");
      if (values.id) Object.assign(byId(data.students, values.id), { name: values.name, studentNo: values.studentNo, classId: values.classId });
      else data.students.push({ id: uid(), name: values.name, studentNo: values.studentNo, classId: values.classId });
      const wasEdit = Boolean(values.id);
      saveData(); resetForm(form); renderAll(); notify(wasEdit ? "学生资料已修改" : "学生已添加");
    });

    $("#exam-form").addEventListener("submit", event => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form));
      values.name = values.name.trim();
      const duplicate = data.exams.some(item => item.name === values.name && item.date === values.date && item.classId === values.classId && item.subjectId === values.subjectId && item.id !== values.id);
      if (duplicate) return notify("相同班级、科目和日期已有同名考试", "error");
      if (values.id) Object.assign(byId(data.exams, values.id), { name: values.name, date: values.date, classId: values.classId, subjectId: values.subjectId });
      else data.exams.push({ id: uid(), name: values.name, date: values.date, classId: values.classId, subjectId: values.subjectId });
      const wasEdit = Boolean(values.id);
      saveData(); resetForm(form); renderAll(); notify(wasEdit ? "考试已修改" : "考试已创建");
    });

    $$(".form-cancel").forEach(button => button.addEventListener("click", () => resetForm(button.closest("form"))));
    $("#student-class-filter").addEventListener("change", renderStudentList);
    $("#exam-class-filter").addEventListener("change", renderExamList);
    $("#exam-subject-filter").addEventListener("change", renderExamList);
    $("#analysis-exam-select").addEventListener("change", renderAnalysis);
    $("#history-class-select").addEventListener("change", () => { renderHistoryStudentOptions(); renderHistory(); });
    $("#history-student-select").addEventListener("change", renderHistory);

    $("#score-entry-table").addEventListener("change", event => { if (event.target.matches(".score-input")) saveScore(event.target); });
    $("#score-entry-table").addEventListener("keydown", event => {
      if (event.key === "Enter" && event.target.matches(".score-input")) {
        event.preventDefault();
        saveScore(event.target);
        const inputs = $$(".score-input", $("#score-entry-table"));
        const next = inputs[inputs.indexOf(event.target) + 1];
        if (next) { next.focus(); next.select(); }
      }
    });
    $("#finish-score-entry").addEventListener("click", () => {
      const invalid = $(".score-input.is-invalid", $("#score-entry-table"));
      if (invalid) return invalid.focus();
      const id = activeExamId;
      renderAll();
      $("#analysis-exam-select").value = id;
      renderAnalysis();
      showView("analysis");
    });
    $("#clear-scores").addEventListener("click", () => {
      if (!activeExamId) return;
      confirmDialog("确定清空本场考试的全部成绩吗？学生名单和考试本身会保留。", () => {
        data.scores = data.scores.filter(item => item.examId !== activeExamId);
        saveData(); openScoreEntry(activeExamId); notify("本场成绩已清空");
      }, "确认清空");
    });

    $("#settings-form").addEventListener("submit", event => {
      event.preventDefault();
      const passScore = Number(event.currentTarget.elements.passScore.value);
      const excellentScore = Number(event.currentTarget.elements.excellentScore.value);
      if (excellentScore < passScore) return notify("优秀分数不能低于及格分数", "error");
      data.settings = { passScore, excellentScore };
      saveData(); renderAll(); notify("统计标准已更新");
    });
    $("#export-backup").addEventListener("click", exportJson);
    $("#export-csv").addEventListener("click", () => exportCsv($("#csv-exam-select").value));
    $("#load-demo").addEventListener("click", loadDemoData);
    $("#import-backup").addEventListener("change", event => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          if (!isValidData(imported)) throw new Error("文件不是有效的本系统备份");
          confirmDialog("恢复备份会覆盖当前全部数据。确定继续吗？", () => {
            data = { version: imported.version || 1, settings: imported.settings, classes: imported.classes, subjects: imported.subjects, students: imported.students, exams: imported.exams, scores: imported.scores };
            saveData(); renderAll(); notify("备份恢复成功");
          }, "确认恢复");
        } catch (error) { notify(`无法恢复：${error.message}`, "error"); }
        event.target.value = "";
      };
      reader.readAsText(file, "utf-8");
    });
    $("#clear-all-data").addEventListener("click", () => confirmDialog("这会永久删除全部班级、学生、考试和成绩。建议先导出备份。确定继续吗？", () => {
      data = EMPTY_DATA(); saveData(); renderAll(); notify("全部数据已清空"); showView("dashboard");
    }, "确认全部清空"));
    $("#confirm-cancel").addEventListener("click", closeConfirm);
    $("#confirm-ok").addEventListener("click", () => { const action = confirmAction; closeConfirm(); if (action) action(); });
    $("#confirm-modal").addEventListener("click", event => { if (event.target === event.currentTarget) closeConfirm(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("#confirm-modal").hidden) closeConfirm(); });
  }

  function init() {
    bindEvents();
    $("#exam-form").elements.date.value = new Date().toISOString().slice(0, 10);
    renderAll();
  }

  init();
})();
