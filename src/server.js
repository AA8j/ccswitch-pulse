import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { getMeta, getSeries, getRequests, getSessions, getHeatmap, parseRange } from "./data.js";
import { getReport } from "./report.js";
import { getDemoMeta, getDemoSeries, getDemoRequests, getDemoReport, getDemoSessions, getDemoHeatmap } from "./demo.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const staticFiles = new Map([
  ["/", [join(root, "public", "index.html"), "text/html; charset=utf-8"]],
  [
    "/app.js",
    [join(root, "public", "app.js"), "text/javascript; charset=utf-8"],
  ],
  [
    "/theme.js",
    [join(root, "public", "theme.js"), "text/javascript; charset=utf-8"],
  ],
  [
    "/i18n.js",
    [join(root, "public", "i18n.js"), "text/javascript; charset=utf-8"],
  ],
  [
    "/styles.css",
    [join(root, "public", "styles.css"), "text/css; charset=utf-8"],
  ],
  ["/favicon.svg", [join(root, "public", "favicon.svg"), "image/svg+xml"]],
  [
    "/vendor/echarts.min.js",
    [
      require.resolve("echarts/dist/echarts.min.js"),
      "text/javascript; charset=utf-8",
    ],
  ],
]);

function json(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

export function createApp({ dbPath, demo = false }) {
  return createServer(async (request, response) => {
    const host = request.headers.host || "";
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host))
      return json(response, 403, { error: "Local access only" });
    if (
      request.headers.origin &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(
        request.headers.origin,
      )
    )
      return json(response, 403, { error: "Invalid origin" });
    if (!["GET", "HEAD"].includes(request.method))
      return json(response, 405, { error: "Method not allowed" });
    try {
      const url = new URL(request.url, `http://${host}`);
      const meta = demo ? getDemoMeta() : getMeta(dbPath);
      if (url.pathname === "/api/meta") return json(response, 200, meta);
      if (["/api/series", "/api/requests", "/api/report", "/api/sessions", "/api/heatmap"].includes(url.pathname)) {
        if (!meta.available)
          return json(response, 404, { error: "CC Switch database not found" });
        const fallback = {
          from: (meta.last || Math.floor(Date.now() / 1000)) - 30 * 86400,
          to: (meta.last || Math.floor(Date.now() / 1000)) + 1,
        };
        const range = parseRange(url.searchParams, fallback);
        if (range.source === "all" && meta.hasRollups &&
            (meta.rawFirst == null || range.from < meta.rawFirst) && range.bucket < 86400) {
          if ((url.searchParams.get("bucket") || "auto") !== "auto")
            throw new RangeError("Archived usage supports daily resolution or coarser");
          range.bucket = 86400;
        }
        const period = url.searchParams.get("period") || "custom";
        if (!/^(day|week|month|year|all|custom|rolling)$/.test(period))
          throw new RangeError("Invalid report period");
        let compare = null;
        if (url.searchParams.has("compareFrom") || url.searchParams.has("compareTo")) {
          const from = Number(url.searchParams.get("compareFrom"));
          const to = Number(url.searchParams.get("compareTo"));
          if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from ||
              to > range.from || to - from > 5 * 366 * 86400)
            throw new RangeError("Invalid comparison range");
          compare = { ...range, from, to };
        }
        const value = url.pathname === "/api/series"
          ? demo ? getDemoSeries(range) : getSeries(dbPath, range)
          : url.pathname === "/api/requests"
            ? demo ? getDemoRequests(range) : getRequests(dbPath, range)
            : url.pathname === "/api/report"
              ? demo ? getDemoReport(range, period, compare) : getReport(dbPath, range, period, compare)
              : url.pathname === "/api/sessions"
                ? demo ? getDemoSessions(range) : getSessions(dbPath, range)
                : demo ? getDemoHeatmap(range) : getHeatmap(dbPath, range);
        return json(response, 200, value);
      }
      const asset = staticFiles.get(url.pathname);
      if (!asset) return json(response, 404, { error: "Not found" });
      const [path, contentType] = asset;
      const body = await readFile(path);
      response.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": body.length,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      const status = error instanceof RangeError ? 400 : 500;
      json(response, status, { error: error.message });
    }
  });
}

export async function startServer(options) {
  const server = createApp(options);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 3456, "127.0.0.1", resolve);
  });
  return server;
}
