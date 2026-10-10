(() => {
  const key = "ccswitch-pulse-language";
  const staticEnglish = {
    "CCSwitch Pulse 首页": "CCSwitch Pulse home",
    主导航: "Main navigation",
    总览: "Overview",
    时间回放: "Timeline replay",
    调用明细: "Recent activity",
    "你的用量数据留在本机。": "Your usage data stays on this device.",
    "看板只读取 CC Switch 数据库。":
      "The dashboard only reads your CC Switch database.",
    "模型使用，": "Your models, ",
    "一目了然。": "in full view.",
    "把每一次调用放回时间里，看清模型选择、用量起伏与那些值得留意的时刻。":
      "Put every call on a timeline. See model choices, usage patterns, and the moments that matter.",
    刷新数据: "Refresh data",
    "导出 CSV": "Export CSV",
    数据筛选: "Data filters",
    快捷时间范围: "Quick date ranges",
    "24 小时": "24 hours",
    "7 天": "7 days",
    "30 天": "30 days",
    全部: "All time",
    起始: "From",
    结束: "To",
    起始时间: "Start time",
    结束时间: "End time",
    应用: "Apply",
    统计口径: "Aggregation options",
    数据来源: "Data source",
    全部来源: "All sources",
    代理请求: "Proxy requests",
    会话导入: "Imported sessions",
    模型口径: "Model field",
    实际模型: "Actual model",
    请求模型: "Requested model",
    时间粒度: "Time bucket",
    智能聚合: "Auto",
    "5 分钟": "5 minutes",
    "15 分钟": "15 minutes",
    每小时: "Hourly",
    每天: "Daily",
    每周: "Weekly",
    用量概览: "Usage overview",
    总调用量: "Total calls",
    所选时间范围内的请求记录: "Requests in this date range",
    活跃模型: "Active models",
    实际出现过的模型数量: "Models used in this range",
    "Token 消耗": "Tokens used",
    "输入、输出与缓存合计": "Input, output, and cache combined",
    估算费用: "Estimated cost",
    "基于 CC Switch 已记录费用": "As recorded by CC Switch",
    模型调用趋势: "Model usage over time",
    观察每个模型在时间轴上的使用变化: "Watch how each model changes over time",
    指标: "Metric",
    调用: "Calls",
    费用: "Cost",
    图表类型: "Chart type",
    折线图: "Line chart",
    分组柱状图: "Grouped bars",
    堆叠柱状图: "Stacked bars",
    不同模型随时间变化的用量图: "Usage by model over time",
    这里还没有用量数据: "No usage data yet",
    "调整筛选条件，或确认 CC Switch 已记录调用。":
      "Adjust the filters or check that CC Switch has recorded calls.",
    显示模型: "Visible models",
    时间回放控制: "Timeline playback controls",
    "拖动进度条，从任意时刻开始": "Drag the slider to start anywhere",
    上一个时段: "Previous bucket",
    下一个时段: "Next bucket",
    回放起点和进度: "Playback start and progress",
    播放速度: "Playback speed",
    当前时段排行: "Ranking at this moment",
    跟随回放实时更新: "Updates as the timeline plays",
    时段调用量: "Calls in bucket",
    区间进度: "Range progress",
    "点击模型名称，可在主图中显示或隐藏":
      "Click a model to show or hide it in the chart",
    值得留意的时刻: "Notable moments",
    最近调用: "Recent calls",
    "最近 24 条": "Latest 24",
    时间: "Time",
    模型: "Model",
    来源: "Source",
    "CCSwitch Pulse · 数据在本地，洞察更清晰。":
      "CCSwitch Pulse · Local data, clearer insights.",
  };
  const messages = {
    zh: {
      toDay: "切换到日间模式",
      toNight: "切换到夜间模式",
      day: "日间模式",
      night: "夜间模式",
      toEnglish: "Switch to English",
      toChinese: "切换到中文",
      dbDemo: "演示数据已连接",
      dbConnected: "CC Switch 已连接",
      dbMissing: "未找到 CC Switch 数据库",
      updated: "最新 {date}",
      waiting: "等待数据",
      allSources: "全部来源",
      sourceProxy: "代理",
      sourceSession: "会话导入",
      sourceUnknown: "未知",
      sourceCount: "{name} · {count}",
      unavailable:
        "未找到 ~/.cc-switch/cc-switch.db。可用 --db 指定数据库路径，或用 --demo 预览界面。",
      loading: "正在读取…",
      loadFailed: "查询失败",
      emptyRange: "这段时间没有记录。试试扩大时间范围或切换数据来源。",
      keepOne: "至少保留一个显示模型",
      currentBucket: "当前时段",
      currentDate: "当前日期",
      rankingTime: "{date} · {period}",
      noBucket: "这个时段没有调用记录",
      rankAria: "{model}，{value}，切换主图显示",
      insightEmptyTitle: "等待更多数据",
      insightEmptyBody: "选一段有调用记录的时间，使用模式会出现在这里。",
      peakTitle: "最高峰时段",
      peakBody: "{date} · {count} 次调用，点击回放进度条可查看相邻变化。",
      leaderTitle: "最常使用模型",
      leaderBody: "{model} · 占所选范围调用量的 {percent}%。",
      definitionTitle: "数据口径",
      definitionBody: "当前为{mode}，来源：{source}。费用为 CC Switch 估算值。",
      noRequests: "暂无调用记录",
      play: "播放",
      pause: "暂停",
      exportEmpty: "暂无可导出的数据",
      exportDone: "已导出当前时间范围的聚合数据",
      invalidRange: "请选择有效的起止时间",
      refreshed: "数据已刷新",
      connectionFailed: "连接失败",
      demo: "DEMO MODE",
      demoHint: "演示数据为合成示例；模型名称与费用不代表真实账单。",
    },
    en: {
      toDay: "Switch to light mode",
      toNight: "Switch to dark mode",
      day: "Light mode",
      night: "Dark mode",
      toEnglish: "Switch to English",
      toChinese: "切换到中文",
      dbDemo: "Demo data connected",
      dbConnected: "CC Switch connected",
      dbMissing: "CC Switch database not found",
      updated: "Latest {date}",
      waiting: "Waiting for data",
      allSources: "All sources",
      sourceProxy: "Proxy",
      sourceSession: "Imported session",
      sourceUnknown: "Unknown",
      sourceCount: "{name} · {count}",
      unavailable:
        "No database at ~/.cc-switch/cc-switch.db. Use --db to select one, or --demo to preview the dashboard.",
      loading: "Loading…",
      loadFailed: "Query failed",
      emptyRange:
        "No calls in this range. Try a longer range or another data source.",
      keepOne: "Keep at least one model visible",
      currentBucket: "Current bucket",
      currentDate: "Current day",
      rankingTime: "{date} · {period}",
      noBucket: "No calls in this bucket",
      rankAria: "{model}, {value}, toggle in main chart",
      insightEmptyTitle: "Waiting for more data",
      insightEmptyBody: "Select a range with calls to see usage patterns here.",
      peakTitle: "Peak usage",
      peakBody:
        "{date} · {count} calls. Scrub the timeline to explore nearby activity.",
      leaderTitle: "Most used model",
      leaderBody: "{model} · {percent}% of calls in this range.",
      definitionTitle: "Data definition",
      definitionBody:
        "Model field: {mode}. Source: {source}. Cost is estimated by CC Switch.",
      noRequests: "No recent calls",
      play: "Play",
      pause: "Pause",
      exportEmpty: "No data to export",
      exportDone: "Aggregated CSV exported for this range",
      invalidRange: "Choose a valid start and end time",
      refreshed: "Data refreshed",
      connectionFailed: "Connection failed",
      demo: "DEMO MODE",
      demoHint:
        "Synthetic demo data. Model labels and costs are illustrative, not real bills.",
    },
  };
  let saved;
  try {
    saved = localStorage.getItem(key);
  } catch {
    // The language can still change for this page.
  }
  let current =
    saved === "zh" || saved === "en"
      ? saved
      : navigator.language?.toLowerCase().startsWith("zh")
        ? "zh"
        : "en";
  document.documentElement.lang = current === "zh" ? "zh-CN" : "en";
  const textNodes = [];
  const attributes = [];
  let captured = false;

  function captureStatic() {
    if (captured) return;
    captured = true;
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const value = node.textContent;
      const phrase = value.trim();
      if (Object.hasOwn(staticEnglish, phrase)) {
        const start = value.indexOf(phrase);
        textNodes.push({
          node,
          zh: phrase,
          before: value.slice(0, start),
          after: value.slice(start + phrase.length),
        });
      }
    }
    for (const element of document.querySelectorAll("[aria-label], [title]")) {
      for (const name of ["aria-label", "title"]) {
        const phrase = element.getAttribute(name);
        if (phrase && Object.hasOwn(staticEnglish, phrase))
          attributes.push({ element, name, zh: phrase });
      }
    }
  }

  function translateStatic() {
    captureStatic();
    for (const { node, zh, before, after } of textNodes)
      if (node.isConnected)
        node.textContent =
          before + (current === "en" ? staticEnglish[zh] : zh) + after;
    for (const { element, name, zh } of attributes)
      if (element.isConnected)
        element.setAttribute(name, current === "en" ? staticEnglish[zh] : zh);
  }

  function t(message, values = {}) {
    return (messages[current][message] || message).replace(
      /\{(\w+)\}/g,
      (_, field) => String(values[field] ?? ""),
    );
  }
  function set(language) {
    if (language !== "zh" && language !== "en") return;
    current = language;
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    try {
      localStorage.setItem(key, language);
    } catch {
      // Keep the selection for this page even when storage is disabled.
    }
    translateStatic();
    window.dispatchEvent(
      new CustomEvent("pulse-language-change", { detail: language }),
    );
  }
  window.pulseI18n = { get: () => current, set, t, translateStatic };
})();
