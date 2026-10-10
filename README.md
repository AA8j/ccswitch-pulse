# CCSwitch Pulse

[English](./README.en.md) · 本地运行的 CC Switch 模型用量 Web 看板

把模型调用放在时间轴上：对比不同模型的调用量、Token 和估算费用，并从任意时间点开始回放。界面面向桌面浏览器。项目通过**只读**方式连接 CC Switch 的 SQLite 数据库，默认仅监听 `127.0.0.1`。

## 功能

- 指定时间范围；按 5 分钟、15 分钟、小时、天或周聚合。
- 多模型折线图、分组柱状图和堆叠柱状图；切换调用量、Tokens、估算费用。
- 拖动进度条选择起点，播放、暂停、逐时段移动和调速；同步显示当前时段模型排行。
- 区分代理请求与会话导入；可在“实际模型”和“请求模型”之间切换。
- 汇总卡片、峰值提示、最近调用表和聚合 CSV 导出。
- 内置演示数据，方便贡献者在没有 CC Switch 数据库时开发界面。

## 一键运行：GitHub + npx

项目上传到你自己的 GitHub 仓库后，用户可直接运行（把 `YOUR_GITHUB_USER` 换成实际账号）：

```bash
npx -y github:YOUR_GITHUB_USER/ccswitch-pulse
```

无需发布到 npm。`package.json` 在仓库根目录声明了**唯一**的 `bin` 入口，因此 npx 能从 GitHub 安装并启动 CLI。可以加 Git tag 固定版本，例如 `github:YOUR_GITHUB_USER/ccswitch-pulse#v0.1.0`。这条 GitHub 命令要在仓库上传后才会生效；本地验证方法见下文。

**环境要求：** Node.js **24.6 或更新版本**、npm/npx，以及本机已有 CC Switch 用量数据库。Node 内置 SQLite 在较早的 Node 24 版本会显示一次 `ExperimentalWarning`，不影响只读运行。

CLI 默认读取 `~/.cc-switch/cc-switch.db`，自动在浏览器打开本地看板。按 `Ctrl+C` 停止。自定义数据库路径：

```bash
npx -y github:YOUR_GITHUB_USER/ccswitch-pulse --db /path/to/cc-switch.db
```

体验演示数据：

```bash
npx -y github:YOUR_GITHUB_USER/ccswitch-pulse --demo
```

也支持 `--port 3456`、`--no-open` 和环境变量 `CC_SWITCH_DB`；`--help` 查看全部选项。

## 本地开发

```bash
git clone https://github.com/YOUR_GITHUB_USER/ccswitch-pulse.git
cd ccswitch-pulse
npm ci
npm start
```

仓库上传前，可直接在本目录执行 `npm ci && npm start`，或运行 `npm start -- --demo`。检查：

```bash
npm test
npm run pack:check
```

前端无需构建，所有静态文件直接由本地服务提供；ECharts 从本机安装的依赖目录提供，不依赖外部 CDN。

## 项目结构

```text
bin/ccswitch-pulse.js   CLI 参数、启动与浏览器打开
src/data.js             SQLite 只读访问、参数校验、聚合查询
src/demo.js             可复现的演示数据
src/server.js           本地 HTTP API 与静态资源服务
public/                 Web 界面、交互和样式
test/                   聚合、筛选、只读约束测试
.github/workflows/ci.yml GitHub Actions 检查
```

API：`GET /api/meta` 返回数据范围和来源；`GET /api/series` 返回按模型与时间段聚合的调用量、Tokens、费用；`GET /api/requests` 返回最近调用的有限字段。服务器不提供修改数据库的接口，也不返回请求正文、错误内容或会话内容。

## 统计口径与隐私

- **调用量**是所选范围内 `proxy_request_logs` 的记录数；空时段在图上补零。
- **实际模型**使用 `model`；**请求模型**优先使用 `request_model`，缺失时回退到 `model`。
- **Token 消耗**为输入、输出、缓存读取、缓存创建之和。**费用**取 CC Switch 已记录的估算美元费用，不能当作供应商账单。
- 代理请求与 CLI 会话导入的可观测字段不同，所以看板保留数据来源筛选；目前没有把导入记录的状态码解释为真实 HTTP 成功率。
- 默认只监听 `127.0.0.1`，以只读模式打开数据库。不要把数据库文件、`.db-wal`、`.db-shm` 或个人调用日志提交到 Git 仓库；`.gitignore` 已排除它们。

数据库格式属于 CC Switch，本项目未与其官方关联。未来 CC Switch 若调整表结构，可能需要更新 `src/data.js` 适配。

## 开源准备

仓库已包含 MIT 许可证、测试与 CI。发布前建议：替换 README 中的 `YOUR_GITHUB_USER`、补充截图、在 GitHub 创建 `v0.1.0` tag，然后在一台没有本地源码的机器上验证上面的 npx 命令。**当前项目尚未上传 GitHub。**

## License

MIT
