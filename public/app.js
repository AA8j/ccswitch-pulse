/* global echarts */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const t = (key, values) => window.pulseI18n.t(key, values);
const language = () => window.pulseI18n.get();
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
  range: null,
  metric: "calls",
  type: "line",
  times: [],
  models: [],
  selected: new Set(),
  colors: new Map(),
  cursor: 0,
  anchor: 0,
  timer: null,
  speed: 1,
  preset: "7",
  requestId: 0,
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
function dateText(seconds, details = true) {
  return new Intl.DateTimeFormat(language() === "zh" ? "zh-CN" : "en-US", {
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
function sourceName(source) {
  return source === "proxy"
    ? t("sourceProxy")
    : source === "codex_session"
      ? t("sourceSession")
      : source || t("sourceUnknown");
}
function colorFor(model) {
  if (!state.colors.has(model))
    state.colors.set(model, state.colors.size % COLORS.dark.length);
  return COLORS[window.pulseTheme.get()][state.colors.get(model)];
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

function setPreset(days, load = true) {
  if (!state.meta?.available) return;
  state.preset = String(days);
  const to = state.meta.last + 1;
  const from =
    days === "all"
      ? state.meta.first
      : Math.max(state.meta.first, to - Number(days) * 86400);
  state.range = { from, to };
  $("#date-from").value = inputDate(from);
  $("#date-to").value = inputDate(to);
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

async function loadMeta() {
  state.meta = await fetchJson("/api/meta");
  renderMetaLabels();
}

function renderMetaLabels() {
  if (!state.meta) return;
  $("#demo-label").textContent = state.meta.demo ? t("demo") : "";
  $("#demo-label").title = state.meta.demo ? t("demoHint") : "";
  setText(
    "#db-status",
    state.meta.demo
      ? t("dbDemo")
      : state.meta.available
        ? t("dbConnected")
        : t("dbMissing"),
  );
  setText(
    "#last-updated",
    state.meta.last
      ? t("updated", { date: dateText(state.meta.last) })
      : t("waiting"),
  );
  const select = $("#source-select");
  const current = select.value;
  select.replaceChildren(new Option(t("allSources"), "all"));
  for (const source of state.meta.sources || [])
    select.add(
      new Option(
        t("sourceCount", {
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
  stopPlayback();
  const id = ++state.requestId;
  setText("#range-summary", t("loading"));
  try {
    const qs = queryString();
    const [series, requests] = await Promise.all([
      fetchJson(`/api/series?${qs}`),
      fetchJson(`/api/requests?${qs}`),
    ]);
    if (id !== state.requestId) return;
    state.series = series;
    state.requests = requests;
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

function prepareData() {
  const { from, to, offset, bucket } = state.series.range;
  const first = Math.floor((from + offset) / bucket) * bucket - offset;
  state.times = [];
  for (let time = first; time < to; time += bucket) state.times.push(time);
  const totals = new Map();
  for (const row of state.series.rows)
    totals.set(row.model, (totals.get(row.model) || 0) + row.calls);
  state.models = [...totals.keys()].sort(
    (a, b) => totals.get(b) - totals.get(a) || a.localeCompare(b),
  );
  for (const model of state.models) colorFor(model);
  const retained = [...state.selected].filter((model) => totals.has(model));
  state.selected = new Set(
    retained.length ? retained : state.models.slice(0, 5),
  );
  state.cursor = Math.max(0, state.times.length - 1);
  state.anchor = 0;
  $("#scrubber").max = String(Math.max(0, state.times.length - 1));
  $("#scrubber").value = String(state.cursor);
}

function renderAll() {
  renderMetrics();
  renderLegend();
  renderChart();
  renderPlayback();
  renderInsights();
  renderRequests();
}
function renderMetrics() {
  const total = state.series.totals;
  setText("#kpi-calls", number(total.calls));
  setText("#kpi-models", number(total.models));
  setText("#kpi-tokens", compact(total.tokens));
  setText("#kpi-cost", money(total.cost));
  $("#empty-state").hidden = total.calls > 0;
  if (!total.calls) setText("#empty-message", t("emptyRange"));
}

function renderLegend() {
  const host = $("#model-legend");
  host.replaceChildren();
  for (const model of state.models) {
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

function renderChart() {
  if (!state.series || !state.times.length || !state.models.length) {
    chart.clear();
    return;
  }
  const byModel = indexedValues();
  const theme = chartTheme();
  const visible = state.models.filter((model) => state.selected.has(model));
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
    barMaxWidth: state.type === "stack" ? 22 : 15,
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
      animation: true,
      animationDuration: 350,
      animationDurationUpdate: 170,
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
        max: end,
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
      period: t(
        state.series.range.bucket < 86400 ? "currentBucket" : "currentDate",
      ),
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
}
function renderRanking() {
  if (!state.series || !state.times.length) return;
  const rows = currentRows();
  const host = $("#ranking-list");
  host.replaceChildren();
  const sum = rows.reduce((total, row) => total + metricValue(row), 0);
  setText("#bucket-total", metricText(sum));
  const max = Math.max(1, ...rows.map(metricValue));
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "ranking-foot";
    empty.textContent = t("noBucket");
    host.append(empty);
    return;
  }
  for (const [index, row] of rows.slice(0, 10).entries()) {
    const element = document.createElement("div");
    element.className = `rank-row${state.selected.has(row.model) ? "" : " inactive"}`;
    element.tabIndex = 0;
    element.setAttribute("role", "button");
    element.setAttribute(
      "aria-label",
      t("rankAria", { model: row.model, value: metricText(metricValue(row)) }),
    );
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
    value.textContent = metricText(metricValue(row));
    const track = document.createElement("div");
    track.className = "rank-track";
    const fill = document.createElement("div");
    fill.className = "rank-fill";
    fill.style.background = colorFor(row.model);
    fill.style.width = `${Math.max(3, (metricValue(row) / max) * 100)}%`;
    track.append(fill);
    head.append(ordinal, dot, name, value);
    element.append(head, track);
    element.addEventListener("click", () => toggleModel(row.model));
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleModel(row.model);
      }
    });
    host.append(element);
  }
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
function renderRequests() {
  const host = $("#requests-body");
  host.replaceChildren();
  if (!state.requests.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = t("noRequests");
    tr.append(td);
    host.append(tr);
    return;
  }
  for (const row of state.requests) {
    const tr = document.createElement("tr");
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
    host.append(tr);
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
  state.timer = setInterval(tick, Math.max(80, 420 / state.speed));
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

$$(".preset").forEach((button) =>
  button.addEventListener("click", () => setPreset(button.dataset.range)),
);
$("#apply-button").addEventListener("click", () => {
  const from = Math.floor(new Date($("#date-from").value).getTime() / 1000),
    to = Math.floor(new Date($("#date-to").value).getTime() / 1000);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    toast(t("invalidRange"));
    return;
  }
  state.range = { from, to };
  state.preset = null;
  $$(".preset").forEach((button) => button.classList.remove("active"));
  loadData();
});
["#source-select", "#model-mode", "#bucket-select"].forEach((selector) =>
  $(selector).addEventListener("change", loadData),
);
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
    toast(error.message);
  }
})();
