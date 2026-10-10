<p align="center">
  <img src="public/favicon.svg" alt="CCSwitch Pulse" width="58" height="58" />
</p>
<h1 align="center">CCSwitch Pulse</h1>
<p align="center"><strong>把每一次模型调用，放回时间里。</strong></p>
<p align="center">一个为 CC Switch 打造的本地 Web 看板：看趋势、比模型、回放用量变化。</p>
<p align="center">
  <a href="README.en.md">English</a> ·
  <a href="#一分钟开始">快速开始</a> ·
  <a href="#它能做什么">功能</a> ·
  <a href="#数据与隐私">数据与隐私</a>
</p>

![CCSwitch Pulse 深色主题演示截图](docs/images/dashboard-dark-zh.png)

> 截图来自内置的**合成演示数据**，不包含个人调用记录。界面面向桌面浏览器；支持日间、夜间主题及中文、English 切换，选择会保存在本机浏览器中。

## 一分钟开始

项目上传到你的 GitHub 仓库后，把 `YOUR_GITHUB_USER` 换成实际账号，用户即可运行：

```bash
npx -y github:YOUR_GITHUB_USER/ccswitch-pulse
```

命令会安装依赖、读取默认位置 `~/.cc-switch/cc-switch.db`，并在浏览器打开本地看板。按 `Ctrl+C` 结束服务。**当前仓库尚未上传到 GitHub**，所以上面的远程命令要等发布后才能使用。

想先体验界面，无需准备数据库：

```bash
npx -y github:YOUR_GITHUB_USER/ccswitch-pulse --demo
```

已有本地源码时，直接在项目目录运行 `npm ci && npm start`；预览演示数据运行 `npm start -- --demo`。

**环境要求：**Node.js 24.6+、npm/npx、桌面浏览器。正式数据模式需要本机 CC Switch 的 SQLite 用量数据库；演示模式不需要。无需发布到 npm 仓库：项目根目录只有一个 CLI `bin` 入口，支持 GitHub 包地址直接运行。

## 它能做什么

| 想看清的问题 | 看板里的操作 |
| --- | --- |
| 哪些模型在什么时候用得最多？ | 选时间范围和粒度，比较多模型折线图、分组柱状图或堆叠柱状图。 |
| 用量高峰是突然出现的吗？ | 拖到任意时间点，点击播放；图表、当前时段排行和进度会一起前进。支持暂停、逐格移动和 0.5×–4× 调速。 |
| 调用量、Token 和费用的趋势一样吗？ | 一键切换三个指标，并按数据来源、实际模型或请求模型筛选。 |
| 想带走分析结果？ | 查看概览卡片、峰值提示、最近调用，导出所选区间的聚合 CSV。 |

**为长时间使用设计：**浅色适合白天，深色适合夜晚；中英文界面随时切换。图表、控件、提示和时间轴标签会同步更新，筛选与回放进度不会因切换而重置。

<details>
<summary><strong>看看日间主题</strong></summary>
<br />

![CCSwitch Pulse 日间主题演示截图](docs/images/dashboard-light-zh.png)

</details>

## 使用方式

指定其他数据库路径：

```bash
npx -y github:YOUR_GITHUB_USER/ccswitch-pulse --db /path/to/cc-switch.db
```

常用选项：

| 选项 | 作用 |
| --- | --- |
| `--demo` | 使用合成数据预览，不读取数据库。示例模型标签和费用都不代表真实厂商数据。 |
| `--db PATH` | 指定 CC Switch SQLite 数据库；也可设环境变量 `CC_SWITCH_DB`。 |
| `--port N` | 指定本地端口，默认 `3456`；`0` 表示自动选择可用端口。 |
| `--no-open` | 启动服务，但不自动打开浏览器。 |
| `--help` | 查看 CLI 帮助。 |

服务仅监听 `127.0.0.1`。如果默认端口被占用，可用 `--port 0`；终端会打印实际访问地址。

## 数据与隐私

- **只读数据库：**通过 Node 内置 SQLite 以只读方式打开 CC Switch 数据库；HTTP 接口只提供 `GET` 查询，不提供修改入口。
- **留在本机：**看板服务默认只绑定 `127.0.0.1`；ECharts 从本机安装的依赖提供，没有外部 CDN。API 不返回提示词、回复内容、错误正文或会话内容。
- **统计口径：**“调用量”是选中范围内 `proxy_request_logs` 的记录数；空时间段会在图上补零。Token 为输入、输出、缓存读取与缓存创建之和。费用取 CC Switch 记录的美元估算值，**不是供应商账单**。
- **模型与来源：**“实际模型”读取 `model`；“请求模型”优先使用 `request_model`，为空时回退。代理请求和会话导入可分别筛选；看板不会把导入记录的状态码解释成真实 HTTP 成功率。
- **开源安全：**`.gitignore` 排除数据库、WAL、SHM 文件。发布前仍请检查提交内容，避免把个人调用日志带入仓库。

本项目与 CC Switch 官方无关联。其数据库表结构若更新，可能需要同步调整 `src/data.js`。

## 本地开发

```bash
git clone https://github.com/YOUR_GITHUB_USER/ccswitch-pulse.git
cd ccswitch-pulse
npm ci
npm start -- --demo
```

页面无需前端构建。运行 `npm test` 验证聚合、筛选和只读约束；运行 `npm run pack:check` 检查可分发内容。项目包含 MIT 许可证和 GitHub Actions CI。

```text
bin/ccswitch-pulse.js  CLI 参数、启动与打开浏览器
src/data.js            SQLite 只读查询、参数校验、聚合
src/demo.js            随时间移动的合成演示数据
src/server.js          本地 HTTP 服务与静态资源
public/                页面、图表、日夜主题和双语界面
test/                  数据行为测试
```

API 分为 `GET /api/meta`、`GET /api/series`、`GET /api/requests`。如果要适配其他 CC Switch 数据库版本，通常从 `src/data.js` 开始。

## 常见问题

<details>
<summary>页面提示找不到数据库？</summary>

确认 CC Switch 已产生用量记录，并检查 `~/.cc-switch/cc-switch.db` 是否存在。数据库在其他位置时使用 `--db PATH`；只看界面时使用 `--demo`。

</details>

<details>
<summary>启动时出现 SQLite ExperimentalWarning？</summary>

这是当前 Node 24 内置 SQLite 的提示；项目仍以只读方式查询。请使用 Node.js 24.6 或更新版本。

</details>

<details>
<summary>为什么费用与账单不同？</summary>

看板展示 CC Switch 数据库已经记录的估算美元费用。模型价格、折扣、缓存计费及供应商结算方式可能不同，账单以供应商为准。

</details>

## 准备发布到 GitHub

1. 创建公开仓库 `ccswitch-pulse`，将本项目的 Git 提交推送到仓库。
2. 把两份 README 中的 `YOUR_GITHUB_USER` 替换为实际 GitHub 用户名；可将深色截图设为仓库 Social preview。
3. 在无本地源码的环境运行 `npx -y github:YOUR_GITHUB_USER/ccswitch-pulse --demo`，确认 GitHub 安装路径和浏览器启动正常。
4. 首次发布可创建 `v0.1.0` 标签；用户需要固定版本时可执行 `npx -y github:YOUR_GITHUB_USER/ccswitch-pulse#v0.1.0`。

欢迎提交 issue 和 pull request，尤其是不同 CC Switch 数据库版本的兼容反馈。

## License

MIT
