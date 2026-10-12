/* global echarts */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const t = (key, values) => window.pulseI18n.t(key, values);
const language = () => window.pulseI18n.get();
const SHARE_REPOSITORY = "ccswitch-pulse";
const SHARE_COLORS = {
  dark: ["#73d6c9", "#86a8e6", "#aa93d9", "#dbb66f", "#d88b9d", "#86bb9e"],
  light: ["#2f918b", "#4c74c4", "#795fae", "#a87725", "#b25d76", "#4f8b6e"],
};
const MODEL_COLOR_OVERRIDES = {
  "deepseek-flash": 0,
  "gpt-6-astra": 1,
  "gpt-6-sol": 2,
  "gpt-6.1-sol": 3,
  "gpt-5.6-luna": 4,
  "codex-auto-review": 5,
  "gpt-5.6-sol": 6,
  "deepseek-v4-pro": 7,
  "glm-5.3": 8,
  "qwen3.8-max": 9,
  "unknown": 10,
  "grok-4.6": 11,
};

const COLORS = {
  dark: [
    "#68e2d2",
    "#7aa8ff",
    "#ba97ff",
    "#f6c77a",
    "#ee8fa5",
    "#8fe1a1",
    "#70c9ed",
    "#cc92d7",
    "#eab677",
    "#7e97ec",
    "#98d7c0",
    "#dd8996",
    "#b6cf72",
    "#b1a5fb",
    "#e5a7d5",
  ],
  light: [
    "#087d78",
    "#326bc7",
    "#7952b5",
    "#a76d12",
    "#b74768",
    "#34865b",
    "#237f9f",
    "#9c509e",
    "#b46f36",
    "#4d61b7",
    "#3d8d7a",
    "#b25b72",
    "#718c26",
    "#7666ba",
    "#ad5d97",
  ],
};
const state = {
  meta: null,
  series: null,
  requests: [],
  report: null,
  sessions: null,
  heatmap: null,
  range: null,
  metric: "calls",
  type: "line",
  modelView: "top",
  times: [],
  models: [],
  selected: new Set(),
  legendExpanded: false,
  colors: new Map(),
  cursor: 0,
  anchor: 0,
  timer: null,
  speed: 1,
  preset: "7",
  requestId: 0,
  rankValues: new Map(),
};
const chart = echarts.init($("#main-chart"), null, { renderer: "canvas" });
new ResizeObserver(() => chart.resize()).observe($("#main-chart"));
let toastTimer;

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 3500);
}
const number = (value) =>
  Number(value || 0).toLocaleString(language() === "zh" ? "zh-CN" : "en-US");
function compact(value) {
  const n = Number(value || 0);
  if (language() === "en")
    return n >= 1e9
      ? `${(n / 1e9).toFixed(1)}B`
      : n >= 1e6
        ? `${(n / 1e6).toFixed(1)}M`
        : n >= 1e3
          ? `${(n / 1e3).toFixed(1)}K`
          : number(Math.round(n));
  return n >= 1e8
    ? `${(n / 1e8).toFixed(1)}亿`
    : n >= 1e4
      ? `${(n / 1e4).toFixed(1)}万`
      : number(Math.round(n));
}
function money(value) {
  const n = Number(value || 0);
  return `$${n < 1 && n > 0 ? n.toFixed(3) : n.toFixed(2)}`;
}
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}
function localDateKey(seconds) {
  const date = new Date(seconds * 1000);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function localMonthKey(seconds) {
  return localDateKey(seconds).slice(0, 7);
}
function localDayNumber(seconds) {
  const date = new Date(seconds * 1000);
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}
function startOfLocalDay(seconds) {
  const date = new Date(seconds * 1000);
  date.setHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}
function observedHeatmapCells(range) {
  const cells = new Set();
  const start = Math.floor(range.from / 3600) * 3600;
  for (let time = start; time < range.to; time += 3600) {
    const date = new Date(time * 1000);
    cells.add(`${date.getDay()}-${date.getHours()}`);
    if (cells.size === 168) break;
  }
  return cells;
}

function dateText(seconds, details = true) {
  return new Intl.DateTimeFormat(language() === "zh" ? "zh-CN" : "en-US", {
    ...(state.range && (state.range.to - state.range.from > 300 * 86400 ||
      ["year", "all"].includes(state.preset) ||
      new Date(state.range.from * 1000).getFullYear() !== new Date(state.range.to * 1000).getFullYear())
      ? { year: "numeric" } : {}),
    month: "2-digit",
    day: "2-digit",
    ...(details ? { hour: "2-digit", minute: "2-digit" } : {}),
    hour12: false,
  }).format(new Date(seconds * 1000));
}
function inputDate(seconds) {
  const d = new Date(seconds * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const datePickerState = { prefix: null, year: 0, month: 0 };
function formatDateControlDate(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const date = new Date(seconds * 1000);
  return new Intl.DateTimeFormat(language() === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
function setDateControl(prefix, seconds) {
  const value = inputDate(seconds);
  const [date, time] = value.split("T");
  $(`#date-${prefix}`).value = value;
  $(`#date-${prefix}-trigger`).textContent = formatDateControlDate(seconds);
  $(`#date-${prefix}-trigger`).dataset.value = date;
  $(`#date-${prefix}-time`).value = time;
}
function readDateControl(prefix) {
  const hidden = $(`#date-${prefix}`).value;
  const date = hidden.split("T")[0];
  const time = $(`#date-${prefix}-time`).value;
  if (!date || !/^\d{2}:\d{2}$/.test(time)) return NaN;
  const value = `${date}T${time}`;
  const seconds = Math.floor(new Date(value).getTime() / 1000);
  if (!Number.isFinite(seconds)) return NaN;
  $(`#date-${prefix}`).value = value;
  return seconds;
}
function closeDatePicker(restoreFocus = false) {
  const prefix = datePickerState.prefix;
  datePickerState.prefix = null;
  $("#date-picker-popover").hidden = true;
  for (const name of ["from", "to"]) $(`#date-${name}-trigger`).setAttribute("aria-expanded", "false");
  if (restoreFocus && prefix) $(`#date-${prefix}-trigger`).focus();
}
function positionDatePicker() {
  if (!datePickerState.prefix) return;
  const popover = $("#date-picker-popover");
  const panel = $(".filter-panel");
  const panelRect = panel.getBoundingClientRect();
  const anchorRect = $(`#date-${datePickerState.prefix}-trigger`).closest(".date-input-group").getBoundingClientRect();
  const left = Math.max(8, Math.min(anchorRect.left - panelRect.left - panel.clientLeft, panel.clientWidth - popover.offsetWidth - 8));
  popover.style.left = `${left}px`;
  popover.style.top = `${anchorRect.bottom - panelRect.top - panel.clientTop + 8}px`;
}
function renderDatePicker() {
  const popover = $("#date-picker-popover");
  if (!datePickerState.prefix) return;
  const { year, month, prefix } = datePickerState;
  const selectedValue = $(`#date-${prefix}`).value.split("T")[0];
  const selected = selectedValue ? new Date(`${selectedValue}T12:00`) : null;
  const first = new Date(year, month, 1);
  const firstDay = first.getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const previousDays = new Date(year, month, 0).getDate();
  const weekdays = language() === "zh" ? ["日", "一", "二", "三", "四", "五", "六"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthLabel = new Intl.DateTimeFormat(language() === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "long" }).format(first);
  popover.replaceChildren();
  const header = document.createElement("div");
  header.className = "date-picker-header";
  const title = document.createElement("strong");
  title.textContent = monthLabel;
  const actions = document.createElement("div");
  for (const [label, delta] of [[t("datePreviousMonth"), -1], [t("dateNextMonth"), 1]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "date-picker-nav";
    button.textContent = delta < 0 ? "‹" : "›";
    button.setAttribute("aria-label", label);
    button.addEventListener("click", () => {
      datePickerState.month += delta;
      if (datePickerState.month < 0) { datePickerState.month = 11; datePickerState.year--; }
      if (datePickerState.month > 11) { datePickerState.month = 0; datePickerState.year++; }
      renderDatePicker();
    });
    actions.append(button);
  }
  header.append(title, actions);
  const week = document.createElement("div");
  week.className = "date-picker-week";
  for (const day of weekdays) { const cell = document.createElement("span"); cell.textContent = day; week.append(cell); }
  const grid = document.createElement("div");
  grid.className = "date-picker-grid";
  const total = Math.ceil((firstDay + days) / 7) * 7;
  for (let index = 0; index < total; index++) {
    const dayOffset = index - firstDay + 1;
    const isCurrent = dayOffset >= 1 && dayOffset <= days;
    const day = isCurrent ? dayOffset : dayOffset < 1 ? previousDays + dayOffset : dayOffset - days;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `date-picker-day${isCurrent ? "" : " outside"}`;
    button.textContent = String(day);
    if (isCurrent && selected && selected.getFullYear() === year && selected.getMonth() === month && selected.getDate() === day) button.classList.add("selected");
    if (isCurrent && new Date().getFullYear() === year && new Date().getMonth() === month && new Date().getDate() === day) button.classList.add("today");
    button.disabled = !isCurrent;
    if (isCurrent) {
      button.addEventListener("click", () => {
        const current = $(`#date-${prefix}`).value ? new Date($(`#date-${prefix}`).value) : new Date();
        current.setFullYear(year, month, day);
        setDateControl(prefix, Math.floor(current.getTime() / 1000));
        closeDatePicker(true);
      });
    }
    grid.append(button);
  }
  const footer = document.createElement("div");
  footer.className = "date-picker-footer";
  for (const [label, action] of [[t("dateClear"), () => { $(`#date-${prefix}`).value = ""; $(`#date-${prefix}-trigger`).textContent = "—"; $(`#date-${prefix}-trigger`).dataset.value = ""; closeDatePicker(true); }], [t("dateToday"), () => { setDateControl(prefix, Math.floor(Date.now() / 60000) * 60); closeDatePicker(true); }]]) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "date-picker-footer-button"; button.textContent = label; button.addEventListener("click", action); footer.append(button);
  }
  popover.append(header, week, grid, footer);
  popover.hidden = false;
  positionDatePicker();
}
function openDatePicker(prefix) {
  if (datePickerState.prefix === prefix) { closeDatePicker(); return; }
  const current = $(`#date-${prefix}`).value ? new Date($(`#date-${prefix}`).value) : new Date();
  datePickerState.prefix = prefix;
  datePickerState.year = current.getFullYear();
  datePickerState.month = current.getMonth();
  for (const name of ["from", "to"]) $(`#date-${name}-trigger`).setAttribute("aria-expanded", String(name === prefix));
  renderDatePicker();
}
function refreshDateControlLabels() {
  for (const prefix of ["from", "to"]) {
    const value = $(`#date-${prefix}`).value;
    if (value) {
      const seconds = Math.floor(new Date(value).getTime() / 1000);
      $(`#date-${prefix}-trigger`).textContent = formatDateControlDate(seconds);
    }
  }
  if (datePickerState.prefix) renderDatePicker();
}

function sourceName(source) {
  return source === "proxy"
    ? t("sourceProxy")
    : source === "codex_session"
      ? t("sourceSession")
      : source || t("sourceUnknown");
}
function colorFor(model) {
  if (!state.colors.has(model)) {
    const normalized = String(model).toLowerCase();
    let index = MODEL_COLOR_OVERRIDES[normalized];
    if (index == null) {
      let hash = 2166136261;
      for (const char of normalized) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
      }
      index = (hash >>> 0) % COLORS.dark.length;
    }
    state.colors.set(model, index);
  }
  return COLORS[window.pulseTheme.get()][state.colors.get(model)];
}
function shareColorFor(model, fallbackIndex = 0) {
  if (model === "__other__") return window.pulseTheme.get() === "light" ? "#93a6ad" : "#879aa8";
  const index = state.colors.get(model) ?? fallbackIndex;
  return SHARE_COLORS[window.pulseTheme.get()][index % SHARE_COLORS.dark.length];
}

function chartTheme() {
  const css = getComputedStyle(document.documentElement);
  const value = (name) => css.getPropertyValue(name).trim();
  return {
    axis: value("--chart-axis"),
    grid: value("--chart-grid"),
    tooltipBg: value("--chart-tooltip-bg"),
    tooltipBorder: value("--chart-tooltip-border"),
    tooltipText: value("--chart-tooltip-text"),
    tooltipMuted: value("--chart-tooltip-muted"),
    future: value("--chart-future"),
    cursor: value("--chart-cursor"),
  };
}
function metricValue(row) {
  return Number(row?.[state.metric] || 0);
}
function metricText(value) {
  return state.metric === "cost" ? money(value) : compact(value);
}
function setText(id, value) {
  $(id).textContent = value;
}
function stopPlayback() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  setText("#play-symbol", "▶");
  $("#play-button").setAttribute("aria-label", t("play"));
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function resetModelSelection() {
  state.selected = new Set();
  state.legendExpanded = false;
}

function setPreset(days, load = true) {
  resetModelSelection();
  if (!state.meta?.available) return;
  state.preset = String(days);
  const source = $("#source-select").value;
  const sourceMeta = source === "all"
    ? null
    : state.meta.sources.find((entry) => entry.id === source);
  const sourceFirst = source === "all"
    ? state.meta.first
    : sourceMeta?.first ?? state.meta.rawFirst ?? state.meta.first;
  const sourceLast = source === "all"
    ? state.meta.last
    : sourceMeta?.last ?? state.meta.last;
  const sourceTo = sourceLast + 1;
  const start = new Date(sourceTo * 1000);
  if (days === "week") {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  } else if (days === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (days === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }
  const from = days === "all" ? sourceFirst
    : ["week", "month", "year"].includes(days)
      ? Math.floor(start.getTime() / 1000)
      : sourceTo - Number(days) * 86400;
  state.range = { from, to: sourceTo };
  setDateControl("from", from);
  setDateControl("to", sourceTo);
  $$(".preset").forEach((button) =>
    button.classList.toggle("active", button.dataset.range === String(days)),
  );
  if (load) loadData();
}

function queryString() {
  const params = new URLSearchParams({
    from: String(state.range.from),
    to: String(state.range.to),
    source: $("#source-select").value,
    modelMode: $("#model-mode").value,
    bucket: $("#bucket-select").value,
    offset: String(-new Date().getTimezoneOffset() * 60),
  });
  return params.toString();
}

function firstAvailable() {
  const source = $("#source-select").value;
  return source === "all"
    ? state.meta?.first
    : state.meta?.sources.find((entry) => entry.id === source)?.first ??
      state.meta?.rawFirst ?? state.meta?.first;
}

function comparisonIsComplete() {
  const params = comparisonParams();
  const from = Number(params.get("compareFrom"));
  return params.has("compareFrom") && firstAvailable() != null && from >= firstAvailable();
}

function comparisonParams() {
  const params = new URLSearchParams();
  const kind = state.preset;
  if (kind === "all") return params;
  const { from, to } = state.range;
  let compareFrom = from - (to - from);
  let compareTo = from;
  if (["week", "month", "year"].includes(kind)) {
    const start = new Date(from * 1000);
    if (kind === "week") start.setDate(start.getDate() - 7);
    if (kind === "month") start.setMonth(start.getMonth() - 1);
    if (kind === "year") start.setFullYear(start.getFullYear() - 1);
    compareFrom = Math.floor(start.getTime() / 1000);
    compareTo = compareFrom + (to - from);
  }
  params.set("compareFrom", String(compareFrom));
  params.set("compareTo", String(compareTo));
  return params;
}

async function loadMeta() {
  state.meta = await fetchJson("/api/meta");
  renderMetaLabels();
}

function renderMetaLabels() {
  if (!state.meta) return;
  $("#demo-label").textContent = state.meta.demo ? t("demo") : "";
  $("#demo-label").title = state.meta.demo ? t("demoHint") : "";
  const status = state.meta.demo ? "demo" : state.meta.available ? "connected" : "missing";
  setText(
    "#db-status",
    status === "demo" ? t("dbDemo") : status === "connected" ? t("dbConnected") : t("dbMissing"),
  );
  const statusDot = $("#online-dot");
  statusDot.className = `online-dot ${status}`;
  setText(
    "#last-updated",
    state.meta.last && !state.meta.empty
      ? t("updated", { date: dateText(state.meta.last) })
      : t("waiting"),
  );
  const select = $("#source-select");
  const current = select.value;
  select.replaceChildren(new Option(t("allSources"), "all"));
  for (const source of state.meta.sources || [])
    select.add(
      new Option(
        t(state.meta.hasRollups ? "sourceCountRecent" : "sourceCount", {
          name: sourceName(source.id),
          count: compact(source.count),
        }),
        source.id,
      ),
    );
  select.value = [...select.options].some((option) => option.value === current)
    ? current
    : "all";
  if (!state.meta.available) showUnavailable();
}

function showUnavailable() {
  $("#empty-state").hidden = false;
  setText("#empty-message", t("unavailable"));
  setText("#kpi-calls", "—");
  setText("#kpi-models", "—");
  setText("#kpi-tokens", "—");
  setText("#kpi-cost", "—");
  chart.clear();
}

async function loadData() {
  if (!state.meta?.available || !state.range) return;
  if (state.meta.hasRollups && $("#source-select").value === "all" &&
      (state.meta.rawFirst == null || state.range.from < state.meta.rawFirst) &&
      ["5m", "15m", "1h"].includes($("#bucket-select").value)) {
    $("#bucket-select").value = "1d";
    toast(t("historicGranularity"));
  }
  stopPlayback();
  const id = ++state.requestId;
  setText("#range-summary", t("loading"));
  try {
    const qs = queryString();
    const reportParams = new URLSearchParams(qs);
    reportParams.set("period", state.preset === "all" ? "all" : ["week", "month", "year"].includes(state.preset) ? state.preset : "rolling");
    for (const [key, value] of comparisonParams()) reportParams.set(key, value);
    const [series, requests, report, sessions, heatmap] = await Promise.all([
      fetchJson(`/api/series?${qs}`),
      fetchJson(`/api/requests?${qs}`),
      fetchJson(`/api/report?${reportParams}`),
      fetchJson(`/api/sessions?${qs}`),
      fetchJson(`/api/heatmap?${qs}`),
    ]);
    if (id !== state.requestId) return;
    state.series = series;
    state.requests = requests;
    state.report = report;
    state.sessions = sessions;
    state.heatmap = heatmap;
    prepareData();
    renderAll();
    setText(
      "#range-summary",
      `${dateText(state.range.from)} — ${dateText(state.range.to)}`,
    );
  } catch (error) {
    setText("#range-summary", t("loadFailed"));
    toast(error.message);
  }
}

// Buckets are aligned to the viewer's local clock, matching the server query.
function bucketStart(time, { offset = 0, bucket = 3600 } = {}) {
  const origin = bucket === 604800 ? 345600 : 0;
  return Math.floor((time + offset - origin) / bucket) * bucket + origin - offset;
}

function prepareData() {
  const { from, to, offset, bucket } = state.series.range;
  const first = bucketStart(from, state.series.range);
  state.times = [];
  for (let time = first; time < to; time += bucket) state.times.push(time);
  // The range end rarely lands on a bucket edge; trailing empty buckets would
  // render as blank slots with phantom axis labels, so drop them.
  const bucketTotals = new Map();
  for (const row of state.series.rows)
    bucketTotals.set(row.bucket, (bucketTotals.get(row.bucket) || 0) + Number(row.calls || 0));
  while (state.times.length > 1 && !bucketTotals.get(state.times.at(-1)))
    state.times.pop();
  const totals = new Map();
  for (const row of state.series.rows)
    totals.set(row.model, (totals.get(row.model) || 0) + row.calls);
  state.models = [...totals.keys()].sort(
    (a, b) => totals.get(b) - totals.get(a) || a.localeCompare(b),
  );
  for (const model of state.models) colorFor(model);
  const retained = [...state.selected].filter((model) => totals.has(model));
  state.selected = new Set(
    state.modelView === "all"
      ? retained.length ? retained : state.models
      : retained.length ? retained.slice(0, 5) : state.models.slice(0, 5),
  );
  state.legendExpanded = false;
  const viewSelect = $("#model-view-select");
  if (viewSelect) viewSelect.value = state.modelView;
  state.cursor = Math.max(0, state.times.length - 1);
  state.anchor = 0;
  $("#scrubber").max = String(Math.max(0, state.times.length - 1));
  $("#scrubber").value = String(state.cursor);
}

function renderAll() {
  renderMetrics();
  renderTimelineCoverage();
  renderLegend();
  renderChart();
  renderPlayback();
  renderInsights();
  renderRequests();
  renderReport();
  renderSessions();
  renderHeatmap();
}
function renderTimelineCoverage() {
  if (!state.series || !state.meta) return;
  const coverage = state.series.coverage || {};
  const text = state.meta.empty ? t("coverageEmpty")
    : coverage.historicalIncluded
      ? coverage.rawFirst == null ? t("coverageArchiveOnly")
        : t("coverageMixed", { date: dateText(coverage.rawFirst, false) })
      : t("coverageRaw");
  setText("#timeline-coverage", text);
}

function renderMetrics() {
  const total = state.series.totals;
  animateNumber($("#kpi-calls"), total.calls, (value) => number(Math.round(value)));
  animateNumber($("#kpi-models"), total.models, (value) => number(Math.round(value)));
  animateNumber($("#kpi-tokens"), total.tokens, (value) => compact(Math.round(value)));
  animateNumber($("#kpi-cost"), total.cost, (value) => money(value));
  for (const key of ["calls", "tokens", "cost"]) {
    const change = comparisonIsComplete() ? state.report?.changes?.[key] : null;
    const note = $("#kpi-" + key + "-note");
    if (!note) continue;
    note.textContent = change == null
      ? t("noComparison")
      : t("comparison", { value: `${change >= 0 ? "+" : ""}${Math.round(change * 100)}%` });
    note.classList.toggle("negative", change != null && change < 0);
  }
  $("#empty-state").hidden = total.calls > 0;
  if (!total.calls) setText("#empty-message", t("emptyRange"));
}

function renderLegend() {
  const host = $("#model-legend");
  host.replaceChildren();
  const legendModels = state.modelView === "top"
    ? state.models.slice(0, 5)
    : state.legendExpanded ? state.models : state.models.slice(0, 10);
  for (const model of legendModels) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `legend-chip${state.selected.has(model) ? "" : " off"}`;
    button.setAttribute("aria-pressed", String(state.selected.has(model)));
    button.title = model;
    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.background = colorFor(model);
    const label = document.createElement("span");
    label.textContent = model;
    button.append(dot, label);
    button.addEventListener("click", () => toggleModel(model));
    host.append(button);
  }
  if (state.modelView === "all" && state.models.length > 10) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "legend-chip legend-more";
    more.textContent = state.legendExpanded
      ? t("showFewerModels")
      : t("showAllModels", { count: state.models.length });
    more.addEventListener("click", () => {
      state.legendExpanded = !state.legendExpanded;
      renderLegend();
    });
    host.append(more);
  }
}
function toggleModel(model) {
  if (state.selected.has(model) && state.selected.size === 1) {
    toast(t("keepOne"));
    return;
  }
  if (state.selected.has(model)) state.selected.delete(model);
  else state.selected.add(model);
  renderLegend();
  renderChart();
  renderRanking();
}

function indexedValues() {
  const byModel = new Map(state.models.map((model) => [model, new Map()]));
  for (const row of state.series.rows)
    byModel.get(row.model)?.set(row.bucket, row);
  return byModel;
}

// Bar width follows the real plot geometry so coarse buckets stay slim and
// dense buckets stay readable instead of turning into either blocks or mud.
function barGeometry(seriesCount) {
  const host = $("#main-chart");
  const plotWidth = Math.max(240, (host?.clientWidth || 760) - 61 - 23);
  const category = plotWidth / Math.max(1, state.times.length);
  if (state.type === "stack")
    return { barMaxWidth: Math.round(Math.max(8, Math.min(36, category * 0.58))) };
  const perSeries = (category * 0.62) / Math.max(1, seriesCount);
  return {
    barMaxWidth: Math.round(Math.max(3, Math.min(13, perSeries))),
    barGap: "18%",
  };
}

function renderChart() {
  if (!state.series || !state.times.length || !state.models.length) {
    chart.clear();
    return;
  }
  const byModel = indexedValues();
  const theme = chartTheme();
  const visible = state.models.filter((model) =>
    state.selected.has(model) && (state.modelView === "all" || state.models.indexOf(model) < 5),
  );
  const fullValues = visible.map((model) =>
    state.times.map((time) => metricValue(byModel.get(model)?.get(time))),
  );
  let max = 0;
  if (state.type === "stack")
    for (let i = 0; i < state.times.length; i++)
      max = Math.max(
        max,
        fullValues.reduce((sum, values) => sum + values[i], 0),
      );
  else for (const values of fullValues) max = Math.max(max, ...values);
  max = max ? max * 1.18 : 1;
  const end = (state.times.at(-1) + state.series.range.bucket) * 1000;
  const cursorTime = state.times[state.cursor] * 1000;
  const series = visible.map((model, index) => ({
    name: model,
    type: state.type === "line" ? "line" : "bar",
    stack: state.type === "stack" ? "total" : undefined,
    smooth: state.type === "line" ? 0.28 : false,
    showSymbol: false,
    connectNulls: false,
    symbolSize: 5,
    ...barGeometry(visible.length),
    emphasis: { focus: "series" },
    itemStyle: {
      color: colorFor(model),
      borderRadius: state.type === "bar" ? [3, 3, 0, 0] : 0,
    },
    lineStyle: { width: 2.5 },
    areaStyle: state.type === "line" ? { opacity: 0.035 } : undefined,
    data: state.times.map((time, i) => [
      time * 1000,
      i <= state.cursor ? fullValues[index][i] : null,
    ]),
    markLine:
      index === 0 && state.cursor < state.times.length - 1
        ? {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: {
              color: theme.cursor,
              type: "dashed",
              width: 1,
              opacity: 0.8,
            },
            data: [{ xAxis: cursorTime }],
          }
        : undefined,
    markArea:
      index === 0 && state.cursor < state.times.length - 1
        ? {
            silent: true,
            itemStyle: { color: theme.future, opacity: 0.54 },
            data: [
              [
                {
                  xAxis:
                    (state.times[state.cursor] + state.series.range.bucket) *
                    1000,
                },
                { xAxis: end },
              ],
            ],
          }
        : undefined,
  }));
  chart.setOption(
    {
      backgroundColor: "transparent",
      animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      animationDuration: 280,
      animationDurationUpdate: state.timer ? Math.min(90, 220 / state.speed) : 120,
      grid: { left: 61, right: 23, top: 21, bottom: 48 },
      tooltip: {
        trigger: "axis",
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        borderWidth: 1,
        textStyle: { color: theme.tooltipText, fontSize: 11 },
        padding: [10, 12],
        axisPointer: {
          type: "line",
          lineStyle: { color: theme.axis, type: "dashed" },
        },
        formatter: (items) => {
          if (!items?.length) return "";
          const time = items[0].axisValue / 1000;
          return (
            `<div style="font-weight:700;margin-bottom:6px;color:${theme.tooltipMuted}">${escapeHtml(dateText(time))}</div>` +
            items
              .filter((item) => item.value && item.value[1] != null)
              .map(
                (item) =>
                  `<div style="display:flex;justify-content:space-between;gap:18px;line-height:1.8"><span><i style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${item.color};margin-right:6px"></i>${escapeHtml(item.seriesName)}</span><b>${escapeHtml(metricText(item.value[1]))}</b></div>`,
              )
              .join("")
          );
        },
      },
      xAxis: {
        type: "time",
        min: state.times[0] * 1000,
        max: end - 1000,
        boundaryGap: false,
        axisLine: { lineStyle: { color: theme.axis } },
        axisTick: { show: false },
        axisLabel: {
          color: theme.axis,
          fontSize: 10,
          margin: 15,
          formatter: (value) =>
            dateText(value / 1000, state.series.range.bucket < 86400),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        max,
        splitNumber: 4,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: theme.axis,
          fontSize: 10,
          formatter: (value) =>
            state.metric === "cost" ? `$${compact(value)}` : compact(value),
        },
        splitLine: { lineStyle: { color: theme.grid, type: "dashed" } },
      },
      series,
    },
    true,
  );
}

function currentRows() {
  const time = state.times[state.cursor];
  return state.series.rows
    .filter((row) => row.bucket === time)
    .sort((a, b) => metricValue(b) - metricValue(a));
}
function renderPlayback() {
  if (!state.series || !state.times.length) return;
  const time = state.times[state.cursor];
  setText("#playback-time", dateText(time));
  setText(
    "#ranking-time",
    t("rankingTime", {
      date: dateText(time),
      period: t(state.series.range.bucket === 604800 ? "currentWeek" :
        state.series.range.bucket < 86400 ? "currentBucket" : "currentDate"),
    }),
  );
  setText("#timeline-start", dateText(state.times[0]));
  setText("#timeline-end", dateText(state.times.at(-1)));
  $("#scrubber").value = String(state.cursor);
  const percent =
    state.times.length <= 1
      ? 100
      : Math.round((state.cursor / (state.times.length - 1)) * 100);
  $("#scrubber").style.background =
    `linear-gradient(90deg,var(--teal) ${percent}%,var(--scrubber-track) ${percent}%)`;
  setText("#play-progress", `${percent}%`);
  renderRanking();
  renderRankingPulse();
}

function renderRankingPulse() {
  const host = $("#ranking-pulse-bars");
  if (!host || !state.series || !state.times.length) return;
  host.replaceChildren();
  const totals = new Map();
  for (const row of state.series.rows)
    totals.set(row.bucket, (totals.get(row.bucket) || 0) + Number(row.calls || 0));
  let buckets = state.times.map((time, index) => ({
    index,
    last: index,
    time,
    calls: totals.get(time) || 0,
  }));
  const limit = 64;
  if (buckets.length > limit) {
    const size = Math.ceil(buckets.length / limit);
    const collapsed = [];
    for (let i = 0; i < buckets.length; i += size) {
      const slice = buckets.slice(i, i + size);
      collapsed.push({
        index: slice[0].index,
        last: slice.at(-1).index,
        time: slice[0].time,
        calls: Math.max(...slice.map((item) => item.calls)),
      });
    }
    buckets = collapsed;
  }
  const max = Math.max(1, ...buckets.map((bucket) => bucket.calls));
  const wrapper = host.closest(".ranking-pulse");
  // A single lonely bar reads as a broken chart; hide the strip until there is
  // a rhythm worth showing.
  if (wrapper) wrapper.hidden = buckets.length < 2 || !state.series.totals.calls;
  host.classList.toggle("dense", buckets.length > 20);
  for (const bucket of buckets) {
    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = "ranking-pulse-bar";
    bar.style.height = `${Math.max(6, Math.round((bucket.calls / max) * 100))}%`;
    if (state.cursor >= bucket.index && state.cursor <= bucket.last)
      bar.classList.add("current");
    bar.title = `${dateText(bucket.time)} · ${number(bucket.calls)}`;
    bar.setAttribute(
      "aria-label",
      t("rankingPulseBar", {
        date: dateText(bucket.time),
        calls: number(bucket.calls),
      }),
    );
    bar.addEventListener("click", () => seek(bucket.index));
    host.append(bar);
  }
}
function animateNumber(element, target, formatter) {
  if (!element) return;
  const next = Number(target || 0);
  const previous = Number(element.dataset.numericValue ?? next);
  element.dataset.numericValue = String(next);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || previous === next) {
    element.textContent = formatter(next);
    return;
  }
  const started = performance.now();
  const duration = 240;
  const frame = (now) => {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = formatter(previous + (next - previous) * eased);
    if (progress < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function renderRanking() {
  if (!state.series || !state.times.length) return;
  const rows = currentRows();
  const host = $("#ranking-list");
  const previousRects = new Map([...host.children].map((element) => [element.dataset.model, element.getBoundingClientRect()]));
  const sum = rows.reduce((total, row) => total + metricValue(row), 0);
  animateNumber($("#bucket-total"), sum, (value) => metricText(value));
  const max = Math.max(1, ...rows.map(metricValue));
  host.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "ranking-foot";
    empty.textContent = t("noBucket");
    host.append(empty);
    return;
  }
  for (const [index, row] of rows.slice(0, 10).entries()) {
    const valueNumber = metricValue(row);
    const element = document.createElement("div");
    element.className = `rank-row${state.selected.has(row.model) ? "" : " inactive"}${index === 0 ? " current" : ""}`;
    element.dataset.model = row.model;
    element.tabIndex = 0;
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", t("rankAria", { model: row.model, value: metricText(valueNumber) }));
    const head = document.createElement("div");
    head.className = "rank-row-head";
    const ordinal = document.createElement("span");
    ordinal.className = "rank-num";
    ordinal.textContent = String(index + 1).padStart(2, "0");
    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.background = colorFor(row.model);
    const name = document.createElement("span");
    name.className = "rank-model";
    name.textContent = row.model;
    name.title = row.model;
    const value = document.createElement("span");
    value.className = "rank-value";
    animateNumber(value, valueNumber, (numberValue) => metricText(numberValue));
    const track = document.createElement("div");
    track.className = "rank-track";
    const fill = document.createElement("div");
    fill.className = "rank-fill";
    fill.style.background = colorFor(row.model);
    fill.style.width = `${Math.max(3, (valueNumber / max) * 100)}%`;
    track.append(fill);
    head.append(ordinal, dot, name, value);
    element.append(head, track);
    element.addEventListener("click", () => toggleModel(row.model));
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleModel(row.model); }
    });
    host.append(element);
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  requestAnimationFrame(() => {
    for (const element of host.children) {
      if (!(element instanceof HTMLElement) || !element.dataset.model) continue;
      const previous = previousRects.get(element.dataset.model);
      const next = element.getBoundingClientRect();
      if (previous) {
        const dx = previous.left - next.left;
        const dy = previous.top - next.top;
        if (dx || dy) {
          element.style.transform = `translate(${dx}px, ${dy}px)`;
          element.style.opacity = "0.72";
          requestAnimationFrame(() => {
            element.style.transform = "";
            element.style.opacity = "";
          });
        }
      } else {
        element.style.transform = "translateY(8px)";
        element.style.opacity = "0";
        requestAnimationFrame(() => {
          element.style.transform = "";
          element.style.opacity = "";
        });
      }
    }
  });
}

function renderInsights() {
  const host = $("#insights-list");
  host.replaceChildren();
  if (!state.series.totals.calls) {
    insight("○", t("insightEmptyTitle"), t("insightEmptyBody"));
    return;
  }
  const timeTotals = new Map(),
    modelTotals = new Map();
  for (const row of state.series.rows) {
    timeTotals.set(row.bucket, (timeTotals.get(row.bucket) || 0) + row.calls);
    modelTotals.set(row.model, (modelTotals.get(row.model) || 0) + row.calls);
  }
  const peak = [...timeTotals].sort((a, b) => b[1] - a[1])[0],
    leader = [...modelTotals].sort((a, b) => b[1] - a[1])[0];
  insight(
    "↗",
    t("peakTitle"),
    t("peakBody", { date: dateText(peak[0]), count: number(peak[1]) }),
  );
  insight(
    "✧",
    t("leaderTitle"),
    t("leaderBody", {
      model: leader[0],
      percent: Math.round((leader[1] / state.series.totals.calls) * 100),
    }),
  );
  insight(
    "◈",
    t("definitionTitle"),
    t("definitionBody", {
      mode: $("#model-mode").selectedOptions[0]?.textContent || "",
      source:
        $("#source-select").selectedOptions[0]?.textContent || t("allSources"),
    }),
  );
  function insight(icon, title, description) {
    const item = document.createElement("div");
    item.className = "insight-item";
    const glyph = document.createElement("span");
    glyph.className = "insight-icon";
    glyph.textContent = icon;
    const body = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = title;
    const p = document.createElement("p");
    p.textContent = description;
    body.append(strong, p);
    item.append(glyph, body);
    host.append(item);
  }
}
function focusRequest(row) {
  if (!state.times.length) return;
  let closest = 0;
  for (let i = 1; i < state.times.length; i++)
    if (Math.abs(state.times[i] - row.time) < Math.abs(state.times[closest] - row.time)) closest = i;
  state.selected = new Set([row.model]);
  renderLegend();
  seek(closest);
  window.location.hash = "#timeline";
  toast(t("requestFocused", { model: row.model, time: dateText(row.time) }));
}

let openRequestKey = null;

function closeRequestDetail() {
  const detail = $("#requests-body .request-detail");
  if (detail) detail.remove();
  const open = $("#requests-body .request-row.open");
  if (open) {
    open.classList.remove("open");
    open.setAttribute("aria-expanded", "false");
  }
  openRequestKey = null;
}

function requestDetailRow(row) {
  const detail = document.createElement("tr");
  detail.className = "request-detail";
  const cell = document.createElement("td");
  cell.colSpan = 5;
  const grid = document.createElement("dl");
  grid.className = "request-detail-grid";
  const input = Number(row.inputTokens || 0);
  const output = Number(row.outputTokens || 0);
  const entries = [
    [t("requestDetailTime"), dateText(row.time)],
    [t("requestDetailModel"), row.model],
    [t("requestDetailSource"), sourceName(row.source)],
    ...(row.aggregate ? [[t("requestDetailCalls"), number(row.calls)]] : []),
    [t("requestDetailInput"), number(input)],
    [t("requestDetailOutput"), number(output)],
    [t("requestDetailTotal"), number(input + output)],
    [t("requestDetailCost"), money(row.cost)],
    [t("requestDetailStatus"), row.status == null ? "—" : String(row.status)],
  ];
  for (const [term, value] of entries) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    grid.append(dt, dd);
  }
  const note = document.createElement("p");
  note.className = "request-detail-note";
  note.textContent = t(row.aggregate ? "requestDetailDemoNote" : "requestDetailNote");
  cell.append(grid, note);
  detail.append(cell);
  return detail;
}

function toggleRequestDetail(element, row, key) {
  if (openRequestKey === key) {
    closeRequestDetail();
    return;
  }
  closeRequestDetail();
  element.classList.add("open");
  element.setAttribute("aria-expanded", "true");
  element.after(requestDetailRow(row));
  openRequestKey = key;
  if (!state.series || !state.times.length) return;
  const start = bucketStart(row.time, state.series.range);
  let index = state.times.indexOf(start);
  if (index < 0) index = state.times.findIndex((time) => time >= start);
  if (index < 0) index = state.times.length - 1;
  if (index !== state.cursor) seek(index);
  toast(t("requestFocused", { model: row.model, time: dateText(row.time) }));
}

function renderRequests() {
  const host = $("#requests-body");
  host.replaceChildren();
  openRequestKey = null;
  const rows = state.requests || [];
  setText("#table-count", t("tableRecent", { count: number(rows.length) }));
  const hint = $("#table-hint");
  if (hint) {
    hint.hidden = !rows.length;
    hint.textContent = rows.length
      ? t(rows.length > 6 ? "requestTableHint" : "requestTableHintShort", {
          count: number(rows.length),
        })
      : "";
  }
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = t("noRequests");
    tr.append(td);
    host.append(tr);
    return;
  }
  rows.forEach((row, index) => {
    const key = `${index}-${row.time}-${row.model}`;
    const tr = document.createElement("tr");
    tr.className = "request-row";
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.setAttribute("aria-expanded", "false");
    tr.setAttribute(
      "aria-label",
      t("requestRowAria", { time: dateText(row.time), model: row.model }),
    );
    const time = document.createElement("td");
    time.textContent = dateText(row.time);
    const model = document.createElement("td");
    const wrap = document.createElement("span");
    wrap.className = "model-cell";
    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.background = colorFor(row.model);
    const name = document.createElement("span");
    name.textContent = row.model;
    wrap.append(dot, name);
    model.append(wrap);
    const source = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = `source-pill${row.source === "proxy" ? "" : " session"}`;
    pill.textContent = sourceName(row.source);
    source.append(pill);
    const tokens = document.createElement("td");
    tokens.textContent = compact(row.inputTokens + row.outputTokens);
    const cost = document.createElement("td");
    cost.textContent = money(row.cost);
    tr.append(time, model, source, tokens, cost);
    tr.addEventListener("click", () => toggleRequestDetail(tr, row, key));
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleRequestDetail(tr, row, key);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeRequestDetail();
      }
    });
    host.append(tr);
  });
}

function reportInterestingFacts(current) {
  const facts = [];
  const heatRows = [...(state.heatmap?.rows || [])];
  const peakHour = heatRows.sort((a, b) => Number(b.calls || 0) - Number(a.calls || 0))[0];
  const span = state.range.to - state.range.from;
  const weekdayNames = language() === "zh" ? ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (peakHour && span <= 2 * 86400)
    facts.push(t("reportFactHour", { hour: String(peakHour.hour).padStart(2, "0"), calls: number(peakHour.calls) }));
  else if (peakHour && span <= 45 * 86400)
    facts.push(t("reportFactWeekday", { day: weekdayNames[peakHour.weekday], hour: String(peakHour.hour).padStart(2, "0") }));
  else if (current.days?.length) {
    const months = new Map();
    for (const day of current.days) {
      const month = localMonthKey(day.time);
      months.set(month, (months.get(month) || 0) + day.calls);
    }
    const month = [...months].sort((a, b) => b[1] - a[1])[0];
    if (month) facts.push(t("reportFactMonth", { month: month[0], calls: number(month[1]) }));
  }
  const latest = state.requests?.[0]?.time;
  if (latest) facts.push(t("reportFactLastActive", { time: dateText(latest, true) }));
  const activeDays = (current.days || []).filter((day) => day.calls > 0).map((day) => localDayNumber(day.time));
  let streak = 0, best = 0, previous = null;
  for (const day of activeDays) {
    streak = previous != null && day === previous + 1 ? streak + 1 : 1;
    best = Math.max(best, streak);
    previous = day;
  }
  if (best > 1) facts.push(t("reportFactStreak", { days: best }));
  return facts.slice(0, 2);
}

function renderReport() {
  if (!state.report) return;
  const { current, previous, changes, coverage } = state.report;
  const leader = current.models[0];
  const oldLeader = previous?.models[0];
  setText("#report-range", `${dateText(state.range.from)} — ${dateText(state.range.to)}`);
  const partial = firstAvailable() != null && firstAvailable() > state.range.from;
  setText("#report-coverage", state.meta.empty ? t("coverageEmpty")
    : partial ? t("coveragePartial", { date: dateText(firstAvailable(), false) })
      : coverage.historicalIncluded
        ? coverage.rawFirst == null ? t("coverageArchiveOnly")
          : t("coverageMixed", { date: dateText(coverage.rawFirst, false) })
        : t("coverageRaw"));
  const headline = !current.calls ? t("reportEmpty")
    : comparisonIsComplete() && oldLeader && oldLeader.model !== leader?.model && previous.calls > 10
      ? t("reportSwitch", { before: oldLeader.model, after: leader.model })
      : t(partial ? "reportLeaderPartial" : "reportLeader", { model: leader.model });
  setText("#report-headline", headline);
  const change = comparisonIsComplete() ? changes?.calls : null;
  setText("#report-subline", !current.calls ? t("reportEmptyHint")
    : change == null ? t("reportTotal", { calls: number(current.calls) })
      : t("reportChange", { calls: number(current.calls), change: `${change >= 0 ? "+" : ""}${Math.round(change * 100)}%` }));
  setText("#report-active", number(current.activeDays));
  setText("#report-peak", current.peak ? `${dateText(current.peak.time, false)} · ${number(current.peak.calls)}` : "—");
  setText("#report-average", current.calls ? number(current.averageDaily) : "—");
  setText("#report-leader", leader ? `${leader.model} · ${Math.round(leader.share * 100)}%` : "—");
  renderSparkline(current.days || []);
  const facts = $("#report-highlights");
  facts.replaceChildren();
  const factsData = [
    t("reportFactAverage", { tokens: current.calls ? compact(Math.round(current.tokens / current.calls)) : "—" }),
    ...reportInterestingFacts(current),
  ];
  for (const fact of factsData) {
    const item = document.createElement("span");
    item.className = "report-fact";
    item.textContent = fact;
    facts.append(item);
  }
  const host = $("#report-models");
  host.replaceChildren();
  for (const entry of current.models.slice(0, 5)) {
    const row = document.createElement("div");
    row.className = "report-model-row";
    const label = document.createElement("div");
    const name = document.createElement("span");
    name.textContent = entry.model;
    const share = document.createElement("strong");
    share.textContent = `${Math.round(entry.share * 100)}%`;
    label.append(name, share);
    const track = document.createElement("div");
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(2, entry.share * 100)}%`;
    fill.style.background = colorFor(entry.model);
    track.append(fill);
    row.append(label, track);
    host.append(row);
  }
  setText("#report-note", state.meta.demo ? t("demoHint")
    : state.meta.empty ? t("reportEmptyNote")
    : coverage.historicalIncluded ? coverage.rawFirst == null ? t("reportArchiveNote") : t("reportMixedNote") : t("reportRawNote"));
  const story = $(".report-story");
  if (story) { story.classList.remove("is-updated"); requestAnimationFrame(() => story.classList.add("is-updated")); }
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svgNode(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, String(value));
  return node;
}
// Daily calls read as a trend, not as a bar wall: a slim line with an area
// wash scales from 7 to 40 days without changing shape.
function renderSparkline(days) {
  const host = $("#report-sparkline");
  if (!host) return;
  host.replaceChildren();
  const data = (days || []).slice(-40);
  if (!data.length) return;
  const width = Math.max(280, Math.round(host.clientWidth || 520));
  const height = 54;
  const top = 13,
    bottom = 6,
    side = 5;
  const max = Math.max(1, ...data.map((day) => Number(day.calls || 0)));
  const peak = data.reduce(
    (best, day) => (Number(day.calls || 0) > Number(best.calls || 0) ? day : best),
    data[0],
  );
  const stepX = data.length > 1 ? (width - side * 2) / (data.length - 1) : 0;
  const xAt = (index) =>
    data.length > 1 ? side + index * stepX : Math.round(width / 2);
  const yAt = (value) =>
    top + (1 - Number(value || 0) / max) * (height - top - bottom);
  const line = data
    .map((day, index) => `${index ? "L" : "M"}${xAt(index).toFixed(1)} ${yAt(day.calls).toFixed(1)}`)
    .join(" ");
  const baseY = height - bottom;
  const teal = getComputedStyle(document.documentElement).getPropertyValue("--teal").trim() || "#0f8a80";
  const svg = svgNode("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: "100%",
    height,
    preserveAspectRatio: "none",
    role: "img",
    "aria-label": t("reportSparklineAria", {
      date: dateText(peak.time, false),
      calls: number(peak.calls),
    }),
  });
  const gradientId = "pulse-sparkline-fill";
  const defs = svgNode("defs");
  const gradient = svgNode("linearGradient", {
    id: gradientId,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
  });
  gradient.append(
    svgNode("stop", { offset: "0%", "stop-color": teal, "stop-opacity": "0.3" }),
    svgNode("stop", { offset: "100%", "stop-color": teal, "stop-opacity": "0" }),
  );
  defs.append(gradient);
  svg.append(defs);
  svg.append(
    svgNode("line", {
      x1: side,
      y1: baseY,
      x2: width - side,
      y2: baseY,
      class: "sparkline-axis",
    }),
  );
  svg.append(
    svgNode("path", {
      d: `${line} L${xAt(data.length - 1).toFixed(1)} ${baseY} L${xAt(0).toFixed(1)} ${baseY} Z`,
      fill: `url(#${gradientId})`,
      stroke: "none",
    }),
  );
  svg.append(svgNode("path", { d: line, class: "sparkline-line" }));
  data.forEach((day, index) => {
    const dot = svgNode("circle", {
      cx: xAt(index).toFixed(1),
      cy: yAt(day.calls).toFixed(1),
      r: day === peak && data.length > 1 ? 3.4 : 2.1,
      class: day === peak ? "sparkline-dot peak" : "sparkline-dot",
    });
    const title = svgNode("title");
    title.textContent = t("reportSparklineBar", {
      date: dateText(day.time, false),
      calls: number(day.calls),
    });
    dot.append(title);
    svg.append(dot);
  });
  host.append(svg);
}

function renderHeatmap() {
  const host = $("#heatmap-grid");
  if (!host || !state.heatmap) return;
  host.replaceChildren();
  const rows = state.heatmap.rows || [];
  const contents = rows.filter((row) => Number(row.calls || 0) > 0);
  const observedCells = observedHeatmapCells(state.range);
  const observedSlots = observedCells.size;
  const byCell = new Map(contents.map((row) => [`${row.weekday}-${row.hour}`, row]));
  const max = Math.max(1, ...contents.map((row) => Number(row.calls || 0)));
  const weekdays = language() === "zh" ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  // Five discrete steps keep quiet hours distinguishable instead of letting one
  // mid tone swallow the whole week.
  const levelOf = (value) => {
    if (!value) return 0;
    const ratio = value / max;
    if (ratio < 0.2) return 1;
    if (ratio < 0.45) return 2;
    if (ratio < 0.72) return 3;
    return 4;
  };
  const corner = document.createElement("span");
  corner.className = "heatmap-corner";
  host.append(corner);
  for (let hour = 0; hour < 24; hour++) {
    const label = document.createElement("span");
    label.className = "heatmap-hour";
    label.textContent = hour % 3 === 0 ? String(hour).padStart(2, "0") : "";
    host.append(label);
  }
  for (let day = 0; day < 7; day++) {
    const label = document.createElement("span");
    label.className = "heatmap-day";
    label.textContent = weekdays[day];
    host.append(label);
    for (let hour = 0; hour < 24; hour++) {
      const key = `${(day + 1) % 7}-${hour}`;
      const row = byCell.get(key) || { calls: 0 };
      const value = Number(row.calls || 0);
      const observed = observedCells.has(key);
      const cell = document.createElement("span");
      cell.className = `heatmap-cell level-${levelOf(value)}${observed ? "" : " unobserved"}`;
      cell.title = observed
        ? `${weekdays[day]} ${String(hour).padStart(2, "0")}:00 · ${number(value)} ${t("heatmapCalls")}`
        : `${weekdays[day]} ${String(hour).padStart(2, "0")}:00 · ${t("heatmapUnobserved")}`;
      cell.setAttribute("role", "img");
      cell.setAttribute(
        "aria-label",
        observed
          ? t("heatmapCellAria", {
              day: weekdays[day],
              hour: String(hour).padStart(2, "0"),
              calls: number(value),
            })
          : t("heatmapCellUnobservedAria", {
              day: weekdays[day],
              hour: String(hour).padStart(2, "0"),
            }),
      );
      host.append(cell);
    }
  }
  const observedDays = Math.max(1, Math.ceil((state.range.to - state.range.from) / 86400));
  setText("#heatmap-range", contents.length ? t("heatmapRange", { max: number(max) }) : t("heatmapEmpty"));
  setText("#heatmap-note", `${state.heatmap.detailOnly ? t("heatmapDetailOnly") : t("heatmapAllData")} · ${t("heatmapObserved", { days: number(observedDays) })}`);
  renderRhythmFacts(contents, weekdays, observedSlots);
}

function renderRhythmFacts(contents, weekdays, observedSlots) {
  const host = $("#rhythm-facts");
  if (!host) return;
  host.replaceChildren();
  if (!contents.length) {
    const term = document.createElement("dt");
    term.textContent = t("rhythmPeakTitle");
    const value = document.createElement("dd");
    value.textContent = t("heatmapEmpty");
    host.append(term, value);
    return;
  }
  const dayTotals = new Array(7).fill(0);
  let peak = { calls: 0, weekday: 1, hour: 0 };
  for (const row of contents) {
    const value = Number(row.calls || 0);
    dayTotals[(Number(row.weekday) + 6) % 7] += value;
    if (value > Number(peak.calls || 0))
      peak = { calls: value, weekday: Number(row.weekday), hour: Number(row.hour) };
  }
  const busiest = dayTotals.indexOf(Math.max(...dayTotals));
  const fullWeekObserved = observedSlots >= 168;
  const quietSlots = Math.max(0, observedSlots - contents.length);
  const entries = [
    [
      t("rhythmPeakTitle"),
      t("rhythmPeakValue", {
        day: weekdays[(peak.weekday + 6) % 7],
        hour: String(peak.hour).padStart(2, "0"),
        calls: number(peak.calls),
      }),
    ],
    [
      t("rhythmDayTitle"),
      t("rhythmDayValue", { day: weekdays[busiest], calls: number(dayTotals[busiest]) }),
    ],
    [
      t(fullWeekObserved ? "rhythmQuietTitle" : "rhythmObservedQuietTitle"),
      t(!fullWeekObserved ? "rhythmObservedQuietValue" : quietSlots === 0 ? "rhythmQuietNone" : "rhythmQuietValue", {
        slots: number(quietSlots),
      }),
    ],
  ];
  for (const [term, value] of entries) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    host.append(dt, dd);
  }
}

function renderSessions() {
  const host = $("#session-list");
  host.replaceChildren();
  const rows = state.sessions?.rows || [];
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "session-empty";
    empty.textContent = t("sessionsEmpty");
    host.append(empty);
    return;
  }
  for (const [index, row] of rows.slice(0, 6).entries()) {
    const item = document.createElement("div");
    item.className = "session-row";
    const name = document.createElement("strong");
    name.textContent = t("sessionIndex", { index: index + 1 });
    const date = document.createElement("span");
    date.textContent = dateText(row.last);
    const stats = document.createElement("small");
    const duration = Math.max(0, Number(row.last) - Number(row.first));
    const durationText = duration >= 3600 ? `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m` : `${Math.max(1, Math.floor(duration / 60))}m`;
    stats.textContent = t("sessionStats", { calls: number(row.calls), models: number(row.models), tokens: compact(row.tokens) });
    const detail = document.createElement("span");
    detail.className = "session-detail";
    detail.textContent = `${durationText} · ${(row.modelNames || []).slice(0, 3).join(" · ")}`;
    item.append(name, date, stats, detail);
    host.append(item);
  }
}

function seek(index) {
  stopPlayback();
  state.cursor = Math.max(0, Math.min(state.times.length - 1, index));
  state.anchor = state.cursor;
  renderChart();
  renderPlayback();
}
function tick() {
  if (state.cursor >= state.times.length - 1) {
    stopPlayback();
    return;
  }
  state.cursor++;
  renderChart();
  renderPlayback();
}
function play() {
  if (!state.times.length) return;
  if (state.timer) {
    stopPlayback();
    return;
  }
  if (state.cursor >= state.times.length - 1) state.cursor = 0;
  state.anchor = state.cursor;
  setText("#play-symbol", "Ⅱ");
  $("#play-button").setAttribute("aria-label", t("pause"));
  renderChart();
  renderPlayback();
  state.timer = setInterval(tick, Math.max(100, 420 / state.speed));
}
function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
function exportCsv() {
  if (!state.series) {
    toast(t("exportEmpty"));
    return;
  }
  const lines = [
    ["time", "model", "calls", "tokens", "estimated_cost_usd"]
      .map(csvCell)
      .join(","),
  ];
  for (const row of state.series.rows)
    lines.push(
      [
        new Date(row.bucket * 1000).toISOString(),
        row.model,
        row.calls,
        row.tokens,
        row.cost,
      ]
        .map(csvCell)
        .join(","),
    );
  const blob = new Blob(["\ufeff", lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ccswitch-pulse-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t("exportDone"));
}

function exportReport() {
  if (!state.report) return toast(t("exportEmpty"));
  const { current, changes } = state.report;
  const clean = (value) => String(value).replace(/[|\r\n]/g, " ").trim();
  const rows = [
    `# ${t("reportExportTitle")}`,
    "",
    `- ${t("reportExportRange")}: ${dateText(state.range.from)} — ${dateText(state.range.to)}`,
    `- ${t("reportExportCoverage")}: ${$("#report-coverage").textContent}`,
    `- ${t("reportExportCalls")}: ${number(current.calls)}`,
    `- ${t("reportExportTokens")}: ${number(current.tokens)}`,
    `- ${t("reportExportCost")}: ${money(current.cost)}`,
    `- ${t("reportExportActive")}: ${number(current.activeDays)}`,
    `- ${t("reportExportPeak")}: ${current.peak ? `${dateText(current.peak.time, false)} · ${number(current.peak.calls)}` : "—"}`,
  ];
  if (comparisonIsComplete() && changes?.calls != null)
    rows.push(`- ${t("reportExportCompare")}: ${changes.calls >= 0 ? "+" : ""}${Math.round(changes.calls * 100)}%`);
  rows.push("", `## ${clean($("#report-headline").textContent)}`, "", `### ${t("reportExportMix")}`, "");
  for (const entry of current.models)
    rows.push(`- ${clean(entry.model)}: ${number(entry.calls)} · ${Math.round(entry.share * 100)}%`);
  rows.push("", t("reportExportDisclaimer"));
  if (state.meta.demo) rows.push(t("demoHint"));
  const blob = new Blob([rows.join("\n") + "\n"], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ccswitch-pulse-report-${localDateKey(state.range.to)}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t("reportDownloaded"));
}
$("#report-download").addEventListener("click", exportReport);

let shareCanvas;
function drawSmoothPath(ctx, points) {
  if (!points.length) return;
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[index - 1] || points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;
    const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y);
  }
}
function drawShareCard() {
  const report = state.report;
  if (!report?.current.calls) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 2400;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  const light = window.pulseTheme.get() === "light";
  const bg = light ? "#eef5f5" : "#0c1420";
  const surface = light ? "#ffffff" : "#132233";
  const textColor = light ? "#18303e" : "#eef7f7";
  const muted = light ? "#627987" : "#91a9ba";
  const accent = light ? "#087d78" : "#68e2d2";
  const stroke = light ? "#d8e7e8" : "#2b4051";
  const current = report.current;
  const showTokens = $("#share-show-tokens").checked;
  const template = $("#share-template").value || "story";
  const mix = template === "mix";
  const rhythm = template === "rhythm";
  const tokensCard = template === "tokens";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1200, 675);
  const glow = ctx.createRadialGradient(1070, 50, 30, 1070, 50, 550);
  glow.addColorStop(0, light ? "#d8efea" : "#183d45");
  glow.addColorStop(1, bg);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1200, 675);
  ctx.fillStyle = surface;
  ctx.beginPath();
  ctx.roundRect(42, 40, 1116, 595, 28);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.fillStyle = accent;
  for (const [x, y, alpha] of [[82, 80, 1], [98, 80, 0.6], [82, 96, 0.6], [98, 96, 0.3]]) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(x, y, 11, 11, 3);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = "700 23px Inter, system-ui, sans-serif";
  ctx.fillStyle = textColor;
  ctx.fillText("CCSwitch Pulse", 128, 99);
  ctx.textAlign = "right";
  ctx.font = "500 15px Inter, system-ui, sans-serif";
  ctx.fillStyle = muted;
  ctx.fillText(`${dateText(state.range.from, false)} — ${dateText(state.range.to, false)}`, 1115, 95);
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = "700 14px Inter, system-ui, sans-serif";
  ctx.fillText(mix ? t("shareMixEyebrow") : rhythm ? t("shareRhythmEyebrow") : tokensCard ? t("shareTokensEyebrow") : t("shareStoryEyebrow"), 82, 171);
  ctx.fillStyle = textColor;
  ctx.font = "700 42px Inter, PingFang SC, system-ui, sans-serif";
  ctx.fillText(mix ? t("shareMixTitle") : rhythm ? t("shareRhythmTitle") : tokensCard ? t("shareTokensTitle") : t("shareStoryTitle"), 82, 221);
  ctx.font = "700 76px Inter, system-ui, sans-serif";
  const headlineValue = tokensCard && showTokens ? compact(current.tokens) : number(current.calls);
  ctx.fillText(headlineValue, 80, 310);
  const metricPill = tokensCard && showTokens ? t("shareTokens") : t("shareCalls");
  ctx.font = "600 14px Inter, PingFang SC, system-ui, sans-serif";
  const pillWidth = Math.max(108, ctx.measureText(metricPill).width + 28);
  ctx.fillStyle = light ? "#e7f2f1" : "#203846";
  ctx.beginPath(); ctx.roundRect(82, 334, pillWidth, 28, 14); ctx.fill();
  ctx.fillStyle = muted;
  ctx.fillText(metricPill, 96, 353);
  let metaY = 402;
  if (showTokens && !tokensCard) {
    ctx.font = "700 24px Inter, system-ui, sans-serif";
    ctx.fillStyle = textColor;
    ctx.fillText(compact(current.tokens), 84, metaY);
    ctx.font = "600 11px Inter, PingFang SC, system-ui, sans-serif";
    ctx.fillStyle = muted;
    ctx.fillText(t("shareTokens"), 84, metaY + 21);
    metaY += 56;
  }
  const latestTime = state.requests?.[0]?.time;
  if ($("#share-show-latest").checked) {
    ctx.font = "600 12px Inter, PingFang SC, system-ui, sans-serif";
    ctx.fillStyle = muted;
    ctx.fillText(`${t("shareLatestActivity")}  ${latestTime ? dateText(latestTime, true) : t("shareLatestUnknown")}`, 84, metaY);
    metaY += 23;
  }
  if (tokensCard) {
    const average = current.calls ? Math.round(current.tokens / current.calls) : 0;
    ctx.font = "600 12px Inter, PingFang SC, system-ui, sans-serif";
    ctx.fillStyle = muted;
    ctx.fillText(showTokens ? t("shareAverageToken", { value: compact(average) }) : t("shareTokensHidden"), 84, metaY);
    metaY += 23;
  }
  if ($("#share-show-cost").checked) {
    ctx.font = "600 14px Inter, PingFang SC, system-ui, sans-serif";
    ctx.fillStyle = muted;
    ctx.fillText(`${t("shareEstimatedCost")}  ${money(current.cost)}`, 84, metaY);
  }
  if (mix) {
    const panelX = 560, panelY = 258, panelW = 538, panelH = 236;
    ctx.fillStyle = light ? "#f2f8f8" : "#172b3b";
    ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 18); ctx.fill();
    ctx.strokeStyle = light ? "#d7e7e7" : "#2a4354";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = "700 13px Inter, PingFang SC, system-ui, sans-serif";
    ctx.fillText(t("shareMixEyebrow"), panelX + 28, panelY + 34);
    ctx.textAlign = "right";
    ctx.fillStyle = muted;
    ctx.font = "600 11px Inter, PingFang SC, system-ui, sans-serif";
    ctx.fillText(t("shareByCalls"), panelX + panelW - 28, panelY + 34);
    ctx.textAlign = "left";
    const segments = current.models.slice(0, 5).map((model, index) => ({
      ...model,
      color: shareColorFor(model.model, index),
      label: model.model.slice(0, 18),
    }));
    if (current.models.length > 5)
      segments.push({
        model: "__other__",
        label: t("shareOther"),
        share: current.models.slice(5).reduce((total, model) => total + model.share, 0),
        color: shareColorFor("__other__"),
      });
    const barX = panelX + 28, barY = panelY + 65, barW = panelW - 56, barH = 26;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 13); ctx.clip();
    let cursor = barX;
    for (const segment of segments) {
      const width = barW * segment.share;
      ctx.fillStyle = segment.color;
      ctx.fillRect(cursor, barY, Math.max(2, width), barH);
      cursor += width;
    }
    ctx.restore();
    ctx.fillStyle = muted;
    ctx.font = "500 10px Inter, PingFang SC, system-ui, sans-serif";
    ctx.fillText(t("shareModels"), barX, barY + 45);
    const colWidth = (barW - 20) / 2;
    segments.forEach((segment, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = barX + col * (colWidth + 20);
      const y = barY + 66 + row * 26;
      ctx.fillStyle = segment.color;
      ctx.beginPath(); ctx.arc(x + 5, y - 4, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = textColor;
      ctx.font = "600 12px Inter, PingFang SC, system-ui, sans-serif";
      ctx.fillText(segment.label, x + 18, y);
      ctx.textAlign = "right";
      ctx.fillStyle = muted;
      ctx.font = "600 12px Inter, PingFang SC, system-ui, sans-serif";
      ctx.fillText(`${Math.round(segment.share * 100)}%`, x + colWidth, y);
      ctx.textAlign = "left";
    });
  } else if (rhythm || tokensCard) {
    const panelX = 560, panelY = 258, panelW = 538, panelH = 236;
    ctx.fillStyle = light ? "#f2f8f8" : "#172b3b";
    ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 18); ctx.fill();
    ctx.strokeStyle = light ? "#d7e7e7" : "#2a4354"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = accent; ctx.font = "700 13px Inter, PingFang SC, system-ui, sans-serif";
    ctx.fillText(rhythm ? t("shareRhythmEyebrow") : t("shareTokensEyebrow"), panelX + 28, panelY + 34);
    if (rhythm) {
      const rows = state.heatmap?.rows || [];
      const hourRows = [...rows].sort((a, b) => Number(b.calls || 0) - Number(a.calls || 0));
      const peak = hourRows[0];
      const dayTotals = new Map();
      for (const row of rows) dayTotals.set(row.weekday, (dayTotals.get(row.weekday) || 0) + Number(row.calls || 0));
      const dayMax = Math.max(1, ...dayTotals.values());
      const days = language() === "zh" ? ["日", "一", "二", "三", "四", "五", "六"] : ["S", "M", "T", "W", "T", "F", "S"];
      ctx.fillStyle = textColor; ctx.font = "700 28px Inter, PingFang SC, system-ui, sans-serif";
      ctx.fillText(peak ? `${String(peak.hour).padStart(2, "0")}:00` : "—", panelX + 28, panelY + 88);
      ctx.fillStyle = muted; ctx.font = "600 11px Inter, PingFang SC, system-ui, sans-serif";
      ctx.fillText(peak ? t("shareRhythmPeak", { calls: number(peak.calls) }) : t("shareLatestUnknown"), panelX + 28, panelY + 111);
      days.forEach((day, index) => {
        const value = dayTotals.get((index + 1) % 7) || 0;
        const y = panelY + 140 + index * 12;
        ctx.fillStyle = muted; ctx.font = "500 9px Inter, system-ui, sans-serif"; ctx.fillText(day, panelX + 28, y + 5);
        ctx.fillStyle = stroke; ctx.fillRect(panelX + 48, y, 350, 7);
        ctx.fillStyle = accent; ctx.fillRect(panelX + 48, y, Math.max(3, 350 * value / dayMax), 7);
        ctx.fillStyle = muted; ctx.fillText(number(value), panelX + 414, y + 5);
      });
    } else {
      const avg = current.calls ? Math.round(current.tokens / current.calls) : 0;
      const dailyTokens = new Map();
      for (const row of state.series.rows) {
        const key = localDateKey(row.bucket);
        dailyTokens.set(key, (dailyTokens.get(key) || 0) + Number(row.tokens || 0));
      }
      const values = [...dailyTokens.values()].slice(-20);
      const maxTokens = Math.max(1, ...values);
      ctx.fillStyle = textColor; ctx.font = "700 30px Inter, system-ui, sans-serif";
      ctx.fillText(showTokens ? compact(avg) : "—", panelX + 28, panelY + 92);
      ctx.fillStyle = muted; ctx.font = "600 13px Inter, PingFang SC, system-ui, sans-serif";
      ctx.fillText(showTokens ? t("shareAverageToken", { value: compact(avg) }) : t("shareTokensHidden"), panelX + 30, panelY + 116);
      ctx.fillStyle = muted; ctx.font = "500 11px Inter, PingFang SC, system-ui, sans-serif";
      ctx.fillText(t("shareTokenTrend"), panelX + 30, panelY + 145);
      if (showTokens) {
        const barW = values.length ? 450 / values.length : 0;
        values.forEach((value, index) => {
          const height = Math.max(3, (value / maxTokens) * 46);
          ctx.fillStyle = accent;
          ctx.globalAlpha = 0.35 + (index / Math.max(1, values.length - 1)) * 0.55;
          ctx.fillRect(panelX + 30 + index * barW, panelY + 196 - height, Math.max(2, barW - 3), height);
        });
        ctx.globalAlpha = 1;
      }
    }
  } else {
    const left = 520, top = 262, width = 574, height = 208;
    const span = Math.max(1, state.range.to - state.range.from);
    const firstDay = startOfLocalDay(state.range.from);
    const dayCount = Math.max(1, localDayNumber(state.range.to - 1) - localDayNumber(firstDay) + 1);
    const useHourly = span <= 2 * 86400 && state.series?.range.bucket < 86400;
    const binCount = useHourly ? 24 : dayCount <= 31 ? Math.max(2, dayCount) : 28;
    const bins = Array(binCount).fill(0);
    const samples = useHourly ? state.series.rows : current.days;
    for (const sample of samples) {
      const time = sample.time ?? sample.bucket;
      const index = useHourly
        ? Math.floor(((time - state.range.from) / span) * binCount)
        : dayCount <= 31
          ? Math.max(0, localDayNumber(time) - localDayNumber(firstDay))
          : Math.floor(((time - state.range.from) / span) * binCount);
      bins[Math.min(binCount - 1, Math.max(0, index))] += sample.calls;
    }
    const max = Math.max(1, ...bins);
    ctx.strokeStyle = stroke;
    for (let i = 0; i < 4; i++) {
      const y = top + (height / 3) * i;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + width, y); ctx.stroke();
    }
    const fill = ctx.createLinearGradient(0, top, 0, top + height);
    fill.addColorStop(0, light ? "#0c817a44" : "#68e2d244");
    fill.addColorStop(1, light ? "#0c817a00" : "#68e2d200");
    const points = bins.map((value, index) => ({
      x: left + (index / (binCount - 1)) * width,
      y: top + height - (value / max) * (height - 18),
    }));
    ctx.beginPath();
    drawSmoothPath(ctx, points);
    ctx.lineTo(left + width, top + height);
    ctx.lineTo(left, top + height);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.beginPath();
    drawSmoothPath(ctx, points);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }
  if (!mix) {
  const legendEntries = current.models.slice(0, 5).map((entry, index) => ({
      label: entry.model.slice(0, 18),
      share: entry.share,
      color: shareColorFor(entry.model, index),
    }));
    if (current.models.length > 5)
      legendEntries.push({
        label: t("shareOther"),
        share: current.models.slice(5).reduce((total, entry) => total + entry.share, 0),
        color: shareColorFor("__other__"),
      });
    let x = 84;
    let y = 520;
    ctx.font = "600 14px Inter, PingFang SC, system-ui, sans-serif";
    for (const [index, entry] of legendEntries.entries()) {
      if (index === 3) { x = 84; y = 544; }
      ctx.fillStyle = entry.color;
      ctx.beginPath(); ctx.arc(x + 5, y - 5, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = textColor;
      const label = `${entry.label}  ${Math.round(entry.share * 100)}%`;
      ctx.fillText(label, x + 20, y);
      x += Math.min(270, ctx.measureText(label).width + 48);
    }
    }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(82, 565); ctx.lineTo(1116, 565); ctx.stroke();
  ctx.font = "500 14px Inter, PingFang SC, system-ui, sans-serif";
  ctx.fillStyle = muted;
  const partial = firstAvailable() != null && firstAvailable() > state.range.from;
  const footer = state.meta.demo ? t("shareDemoFooter") : t("shareLocalFooter");
  ctx.fillText(partial ? `${footer} · ${t("shareCoverage", { date: dateText(firstAvailable(), false) })}` : footer, 82, 600);
  ctx.textAlign = "right";
  ctx.font = "600 13px Inter, system-ui, sans-serif";
  ctx.fillStyle = muted;
  const githubPath = new Path2D("M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z");
  ctx.save();
  ctx.translate(1017, 584);
  ctx.scale(1.35, 1.35);
  ctx.fill(githubPath);
  ctx.restore();
  ctx.fillText(SHARE_REPOSITORY, 1115, 600);
  ctx.textAlign = "left";
  return canvas;
}

function updateShareTemplateChoices() {
  const select = $("#share-template");
  if (!select) return;
  $$("[data-share-template]").forEach((button) => {
    const value = button.dataset.shareTemplate;
    const labels = { story: "shareStoryChoice", mix: "shareMixChoice", rhythm: "shareRhythmChoice", tokens: "shareTokensChoice" };
    button.textContent = t(labels[value] || value);
    button.classList.toggle("active", select.value === value);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(select.value === value));
  });
}

function updateSharePreview() {
  shareCanvas = drawShareCard();
  if (shareCanvas) $("#share-preview").src = shareCanvas.toDataURL("image/png");
}
function openShareDialog(template = null) {
  if (!state.report?.current.calls) return toast(t("exportEmpty"));
  const select = $("#share-template");
  const validTemplates = new Set(["story", "mix", "rhythm", "tokens"]);
  select.value = validTemplates.has(template)
    ? template
    : validTemplates.has(select.value)
      ? select.value
      : "story";
  updateShareTemplateChoices();
  updateSharePreview();
  $("#share-dialog").showModal();
}
$("#share-button").addEventListener("click", openShareDialog);
$("#report-share").addEventListener("click", () => openShareDialog("story"));
$("#share-close").addEventListener("click", () => $("#share-dialog").close());
$("#share-dialog").addEventListener("click", (event) => {
  if (event.target === $("#share-dialog")) $("#share-dialog").close();
});
$("#share-template").addEventListener("change", () => { updateShareTemplateChoices(); updateSharePreview(); });
$$("[data-share-template]").forEach((button) => button.addEventListener("click", () => {
  $("#share-template").value = button.dataset.shareTemplate;
  updateShareTemplateChoices();
  updateSharePreview();
}));
$("#share-show-tokens").addEventListener("change", updateSharePreview);
$("#share-show-latest").addEventListener("change", updateSharePreview);
$("#share-show-cost").addEventListener("change", updateSharePreview);
$("#share-download").addEventListener("click", () => {
  if (!shareCanvas) return;
  shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ccswitch-pulse-${localDateKey(state.range.to)}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t("shareDownloaded"));
  }, "image/png");
});
$("#share-copy").addEventListener("click", async () => {
  if (!shareCanvas || !navigator.clipboard?.write) return toast(t("shareCopyUnavailable"));
  try {
    const blob = await new Promise((resolve) => shareCanvas.toBlob(resolve, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast(t("shareCopied"));
  } catch {
    toast(t("shareCopyUnavailable"));
  }
});

$$(".preset").forEach((button) =>
  button.addEventListener("click", () => setPreset(button.dataset.range)),
);
for (const prefix of ["from", "to"]) {
  $(`#date-${prefix}-trigger`).addEventListener("click", () => openDatePicker(prefix));
  $(`#date-${prefix}-time`).addEventListener("input", () => readDateControl(prefix));
}
$("#date-picker-popover").addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", (event) => {
  if (datePickerState.prefix && !event.target.closest(".date-control") && !event.target.closest("#date-picker-popover")) closeDatePicker();
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDatePicker(true); });
window.addEventListener("resize", positionDatePicker);
$("#apply-button").addEventListener("click", () => {
  const from = readDateControl("from"),
    to = readDateControl("to");
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    toast(t("invalidRange"));
    return;
  }
  resetModelSelection();
  state.range = { from, to };
  state.preset = null;
  $$(".preset").forEach((button) => button.classList.remove("active"));
  loadData();
});
$("#source-select").addEventListener("change", () => {
  resetModelSelection();
  if (state.preset === "all") setPreset("all"); else loadData();
});
["#model-mode", "#bucket-select"].forEach((selector) =>
  $(selector).addEventListener("change", loadData),
);
$("#model-view-select").addEventListener("change", (event) => {
  state.modelView = event.target.value;
  state.selected = new Set(state.modelView === "all" ? state.models : state.models.slice(0, 5));
  state.legendExpanded = false;
  renderLegend();
  renderChart();
});
$$(".metric-button").forEach((button) =>
  button.addEventListener("click", () => {
    state.metric = button.dataset.metric;
    $$(".metric-button").forEach((item) =>
      item.classList.toggle("active", item === button),
    );
    renderChart();
    renderPlayback();
  }),
);
$$(".type-button").forEach((button) =>
  button.addEventListener("click", () => {
    state.type = button.dataset.type;
    $$(".type-button").forEach((item) =>
      item.classList.toggle("active", item === button),
    );
    renderChart();
  }),
);
$("#scrubber").addEventListener("input", (event) =>
  seek(Number(event.target.value)),
);
$("#step-back").addEventListener("click", () => seek(state.cursor - 1));
$("#step-forward").addEventListener("click", () => seek(state.cursor + 1));
$("#play-button").addEventListener("click", play);
$("#speed-select").addEventListener("change", (event) => {
  state.speed = Number(event.target.value);
  if (state.timer) {
    stopPlayback();
    play();
  }
});
$("#export-button").addEventListener("click", exportCsv);
function updateThemeControl() {
  const light = window.pulseTheme.get() === "light";
  const label = t(light ? "toNight" : "toDay");
  $("#theme-label").textContent = t(light ? "night" : "day");
  $("#theme-toggle").setAttribute("aria-label", label);
  $("#theme-toggle").title = label;
}
function updateLanguageControl() {
  const chinese = language() === "zh";
  const label = t(chinese ? "toEnglish" : "toChinese");
  $("#lang-toggle").textContent = chinese ? "EN" : "中文";
  $("#lang-toggle").setAttribute("aria-label", label);
  $("#lang-toggle").title = label;
  document.title = chinese
    ? "CCSwitch Pulse · 模型用量观测台"
    : "CCSwitch Pulse · Model usage dashboard";
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute(
      "content",
      chinese
        ? "CCSwitch Pulse — 回放每一次模型调用。"
        : "CCSwitch Pulse — replay your model usage, locally.",
    );
}
$("#lang-toggle").addEventListener("click", () => {
  window.pulseI18n.set(language() === "zh" ? "en" : "zh");
});
$("#theme-toggle").addEventListener("click", () => {
  window.pulseTheme.apply(
    window.pulseTheme.get() === "light" ? "dark" : "light",
    true,
  );
});
window.addEventListener("pulse-language-change", () => {
  updateLanguageControl();
  updateThemeControl();
  renderMetaLabels();
  updateShareTemplateChoices();
  refreshDateControlLabels();
  if (state.range && state.series)
    setText(
      "#range-summary",
      `${dateText(state.range.from)} — ${dateText(state.range.to)}`,
    );
  if (state.series) renderAll();
  $("#play-button").setAttribute(
    "aria-label",
    t(state.timer ? "pause" : "play"),
  );
});
window.addEventListener("pulse-theme-change", () => {
  updateThemeControl();
  if (state.series) renderAll();
});
function setSideNavActive(id) {
  $$(".side-link").forEach((link) =>
    link.classList.toggle("active", link.getAttribute("href") === `#${id}`),
  );
}
function syncSideNav() {
  setSideNavActive((window.location.hash || "#overview").slice(1));
}
function syncSideNavOnScroll() {
  const sections = ["timeline", "report", "rhythm", "explorer"];
  let current = "overview";
  for (const id of sections) {
    const section = document.getElementById(id);
    if (section && section.getBoundingClientRect().top <= 150) current = id;
  }
  setSideNavActive(current);
}
window.addEventListener("hashchange", syncSideNav);
window.addEventListener("popstate", syncSideNav);
window.addEventListener("scroll", () => requestAnimationFrame(syncSideNavOnScroll), { passive: true });
$$(".side-link").forEach((link) => link.addEventListener("click", (event) => {
  const target = document.querySelector(link.getAttribute("href"));
  if (!target) return;
  event.preventDefault();
  const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - 18);
  window.history.pushState(null, "", link.getAttribute("href"));
  window.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  setSideNavActive(link.getAttribute("href").slice(1));
}));
syncSideNav();

window.pulseI18n.translateStatic();
updateLanguageControl();
updateThemeControl();
$("#refresh-button").addEventListener("click", async () => {
  try {
    await loadMeta();
    if (state.preset) setPreset(state.preset);
    else await loadData();
    toast(t("refreshed"));
  } catch (error) {
    toast(error.message);
  }
});
chart.on("click", (params) => {
  const time = params?.value?.[0] / 1000;
  if (!Number.isFinite(time)) return;
  let closest = 0;
  for (let i = 1; i < state.times.length; i++)
    if (Math.abs(state.times[i] - time) < Math.abs(state.times[closest] - time))
      closest = i;
  seek(closest);
});

(async () => {
  try {
    await loadMeta();
    if (state.meta.available) setPreset(7);
  } catch (error) {
    setText("#db-status", t("connectionFailed"));
    $("#online-dot").className = "online-dot missing";
    $("#empty-state").hidden = false;
    setText("#empty-message", t("dataSourceError"));
    chart.clear();
    toast(error.message);
  }
})();

let layoutTimer;
window.addEventListener("resize", () => {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => {
    if (!state.series) return;
    renderChart();
    renderSparkline(state.report?.current?.days || []);
  }, 180);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeRequestDetail();
});
