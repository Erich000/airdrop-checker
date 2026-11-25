var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var PAGE = /* @__PURE__ */ __name((rows) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>airdrop-checker stats</title>
<style>body{background:#0b0e10;color:#dbe7e3;font:13px/1.5 ui-monospace,Menlo,monospace;margin:0;padding:20px}
h1{font:600 14px ui-sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8fd9b6}
table{border-collapse:collapse;width:100%;margin:12px 0 26px}td,th{border-bottom:1px solid #26332e;padding:5px 8px;text-align:left}
th{color:#8b9ba2;font-weight:500;text-transform:uppercase;font-size:10.5px;letter-spacing:.08em}
</style><h1>airdrop-checker \xB7 hits</h1>${rows}`, "PAGE");
let eventsReady;
const ensureEvents = (env) => {
  if (!eventsReady) {
    eventsReady = env.DB.prepare(
      `create table if not exists events (
        ts text, sid text, ev text, path text, country text, meta text, dwell integer
      )`
    ).run();
  }
  return eventsReady;
};
var src_default = {
  async fetch(req, env) {
    const ready = ensureEvents(env);
    ready.catch(() => {});
    const url = new URL(req.url);
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type"
    };
    if (url.pathname === "/stats") {
      if (url.searchParams.get("k") !== env.STATS_KEY)
        return new Response("forbidden", { status: 403 });
      await ready;
      const q = /* @__PURE__ */ __name(async (sql) => (await env.DB.prepare(sql).all()).results || [], "q");
      const total = (await q("select count(*) c from hits"))[0].c;
      const days = await q("select substr(ts,1,10) d, count(*) c from hits group by d order by d desc limit 14");
      const hours = await q("select substr(ts,12,2) h, count(*) c from hits group by h order by h");
      const countries = await q("select country, count(*) c from hits group by country order by c desc limit 15");
      const refs = await q("select ref, count(*) c from hits group by ref order by c desc limit 15");
      const paths = await q("select path, count(*) c from hits group by path order by c desc limit 15");
      const funnelEvents = ["pageview", "check_click", "eligible", "ineligible", "connect_click", "connect_ok", "claim_click", "claim_ok"];
      const funnelCounts = await q(`select ev, count(distinct sid) c from events
        where ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')
          and ev in ('pageview','check_click','eligible','ineligible','connect_click','connect_ok','claim_click','claim_ok')
        group by ev`);
      const funnel = funnelEvents.map((ev) => funnelCounts.find((r) => r.ev === ev) || { ev, c: 0 });
      const dwell = await q("select path, round(avg(dwell), 1) avg_seconds, count(*) samples from events where ev = 'dwell' and dwell is not null group by path order by samples desc, path");
      const table = /* @__PURE__ */ __name((title, cols, list, map) => `<h2>${title}</h2><table><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>` + list.map((r) => `<tr>${map(r).map((v) => `<td>${v ?? ""}</td>`).join("")}</tr>`).join("") + `</table>`, "table");
      const html = PAGE(
        `<p>total hits: <b>${total}</b> \xB7 utc</p>` + table("by day", ["day", "hits"], days, (r) => [r.d, r.c]) + table("by hour (utc)", ["hour", "hits"], hours, (r) => [r.h, r.c]) + table("countries", ["country", "hits"], countries, (r) => [r.country, r.c]) + table("referrers", ["ref", "hits"], refs, (r) => [r.ref || "(direct)", r.c]) + table("paths", ["path", "hits"], paths, (r) => [r.path, r.c]) + table("funnel (7 days, distinct sid)", ["event", "sessions"], funnel, (r) => [r.ev, r.c]) + table("dwell", ["path", "avg seconds", "samples"], dwell, (r) => [r.path, r.avg_seconds, r.samples])
      );
      return new Response(html, { headers: { "content-type": "text/html;charset=utf-8", "cache-control": "no-store" } });
    }
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST")
      return new Response("ok", { headers: cors });
    let b = {};
    try {
      b = await req.json();
    } catch {
    }
    const cf = req.cf || {};
    const ip = req.headers.get("cf-connecting-ip") || "";
    const ipPart = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip.split(".").slice(0, 3).join(".");
    const ua = (req.headers.get("user-agent") || "").slice(0, 220);
    if (b.e) {
      try {
        await ready;
        const dwell = Number.parseInt(b.d, 10);
        await env.DB.prepare(
          `insert into events (ts, sid, ev, path, country, meta, dwell)
           values (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          (/* @__PURE__ */ new Date()).toISOString(),
          String(b.sid || "").slice(0, 100),
          String(b.e || "").slice(0, 60),
          String(b.p || "").slice(0, 300),
          cf.country || "",
          String(b.m || "").slice(0, 300),
          b.e === "dwell" && Number.isFinite(dwell) ? dwell : null
        ).run();
      } catch {
      }
    } else {
      try {
        await env.DB.prepare(
          `insert into hits (ts, path, ref, country, city, ip_part, ua, lang, screen, tz)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          (/* @__PURE__ */ new Date()).toISOString(),
          String(b.p || "").slice(0, 300),
          String(b.r || "").slice(0, 300),
          cf.country || "",
          cf.city || "",
          ipPart,
          ua,
          String(b.l || "").slice(0, 12),
          String(b.s || "").slice(0, 24),
          String(b.z || "").slice(0, 60)
        ).run();
      } catch {
      }
    }
    return new Response(null, { status: 204, headers: cors });
  }
};
export {
  src_default as default
};
//# sourceMappingURL=index.js.map
