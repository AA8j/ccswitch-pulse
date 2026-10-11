import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server.js";

async function withServer(callback) {
  const server = createApp({ demo: true });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("serves demo API and protects local-only boundaries", async () => {
  await withServer(async (base) => {
    const metaResponse = await fetch(`${base}/api/meta`);
    assert.equal(metaResponse.status, 200);
    const meta = await metaResponse.json();
    assert.equal(meta.demo, true);
    assert.equal(meta.sources.length, 2);

    const pageResponse = await fetch(`${base}/`);
    assert.equal(pageResponse.status, 200);
    assert.match(pageResponse.headers.get("content-security-policy"), /frame-ancestors 'none'/);

    const postResponse = await fetch(`${base}/api/meta`, { method: "POST" });
    assert.equal(postResponse.status, 405);

    const originResponse = await fetch(`${base}/api/meta`, {
      headers: { Origin: "https://example.com" },
    });
    assert.equal(originResponse.status, 403);
  });
});
