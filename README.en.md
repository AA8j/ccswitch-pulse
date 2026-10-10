# CCSwitch Pulse

[简体中文](./README.md) · A local model usage dashboard for CC Switch

See model usage on a timeline. Compare calls, tokens, and estimated cost across models, then replay the chart from any point in time. The UI is designed for desktop browsers. The app opens the CC Switch SQLite database **read-only** and listens on `127.0.0.1` by default.

## Features

- Custom time ranges with 5-minute, 15-minute, hourly, daily, and weekly buckets.
- Multi-model line, grouped bar, and stacked bar charts; switch between calls, tokens, and estimated cost.
- Scrub to any playback start, play or pause, step between buckets, adjust speed, and watch the current-bucket ranking.
- Filter proxy requests and imported session usage; switch between actual and requested model names.
- Summary cards, peak highlights, recent requests, and aggregated CSV export.
- Deterministic demo data for contributors without a CC Switch database.

## One-command run: GitHub + npx

After publishing this repository on your own GitHub account, replace `YOUR_GITHUB_USER` and run:

```bash
npx -y github:YOUR_GITHUB_USER/ccswitch-pulse
```

You do **not** need to publish to the npm registry. The root `package.json` declares one `bin` entry, allowing npx to install and run the CLI directly from GitHub. You can pin a Git tag with `github:YOUR_GITHUB_USER/ccswitch-pulse#v0.1.0`. The GitHub command will work only after the repository is uploaded; local commands are below.

**Requirements:** Node.js **24.6 or newer**, npm/npx, and a local CC Switch usage database. Older Node 24 releases may print one `ExperimentalWarning` for the built-in SQLite module; read-only operation still works.

The CLI reads `~/.cc-switch/cc-switch.db` by default, opens the local dashboard in your browser, and stops with `Ctrl+C`. Select a database explicitly:

```bash
npx -y github:YOUR_GITHUB_USER/ccswitch-pulse --db /path/to/cc-switch.db
```

Preview the UI with sample data:

```bash
npx -y github:YOUR_GITHUB_USER/ccswitch-pulse --demo
```

Other options: `--port 3456`, `--no-open`, `--help`, and the `CC_SWITCH_DB` environment variable.

## Develop locally

```bash
git clone https://github.com/YOUR_GITHUB_USER/ccswitch-pulse.git
cd ccswitch-pulse
npm ci
npm start
```

Before uploading the repository, run `npm ci && npm start` in the project directory, or `npm start -- --demo`. Verify changes with:

```bash
npm test
npm run pack:check
```

The front end needs no build step. Static assets and the locally installed ECharts distribution are served by the Node process; no external CDN is needed.

## Architecture

```text
bin/ccswitch-pulse.js    CLI parsing, startup, browser launch
src/data.js              Read-only SQLite access and aggregate queries
src/demo.js              Reproducible sample data
src/server.js            Loopback HTTP API and static assets
public/                  Web UI, interactions, and design system
test/                    Aggregation, filtering, and read-only tests
.github/workflows/ci.yml GitHub Actions checks
```

`GET /api/meta` provides available dates and data sources. `GET /api/series` returns model-by-time aggregates. `GET /api/requests` returns a limited set of recent usage fields. There is no database mutation endpoint, and the API does not expose prompts, responses, error payloads, or session content.

## Data definitions and privacy

- **Calls:** number of `proxy_request_logs` rows in the selected range; empty time buckets are filled with zero in the chart.
- **Actual model:** `model`. **Requested model:** `request_model`, falling back to `model` when absent.
- **Tokens:** input + output + cache read + cache creation. **Cost:** the estimated USD value already recorded by CC Switch, not a provider invoice.
- Proxy logs and imported CLI session usage expose different signals. The dashboard keeps a source filter and does not interpret imported records as measured HTTP success rates.
- The server binds to `127.0.0.1` and opens SQLite read-only. Never commit your database, WAL files, or personal request logs. `.gitignore` excludes database files.

CC Switch owns its database format; this project is not affiliated with its maintainers. Schema changes may require updates to `src/data.js`.

## Open-source checklist

The repository includes an MIT license, tests, and CI. Before sharing: replace `YOUR_GITHUB_USER`, add screenshots, create a `v0.1.0` Git tag, and test the npx command on a machine without a local checkout. **This project has not been uploaded to GitHub yet.**

## License

MIT
