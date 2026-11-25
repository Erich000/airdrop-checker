// airdrop-collector — cookieless beacon ingest + stats (HTML & JSON)
//
// Storage: single D1 table `hits`. Event beacons and plain hits share the row,
// plain hits simply have event = ''. New columns are added by an idempotent
// migration (ALTER TABLE ADD COLUMN), existing rows are never touched.
// The legacy `events` table (if present) is still read for aggregates so no
// historical event is lost, but nothing is written to it anymore.

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const NEW_COLUMNS = [
  ["event", "text"],
  ["sid", "text"],
  ["dwell_seconds", "integer"],
  ["meta", "text"],
];

const EVENT_NAMES = [
  "pageview",
  "check_click",
  "connect_click",
  "claim_click",
  "connect_ok",
  "claim_ok",
  "eligible",
  "ineligible",
];
const FUNNEL_STEPS = ["pageview", "check_click", "connect_click", "claim_click", "connect_ok", "claim_ok"];
const SCROLL_BUCKETS = ["0-25%", "25-50%", "50-75%", "75-100%"];

// Module-level *state* only. Never cache a promise here: the Workers runtime
// refuses to settle a promise in a request other than the one that created it.
let migrated = false;
let hasLegacyEvents = false;

async function migrate(env) {
  if (migrated) return;
  const info = await env.DB.prepare("pragma table_info(hits)").all();
  const existing = new Set((info.results || []).map((r) => r.name));
  for (const [name, type] of NEW_COLUMNS) {
    if (!existing.has(name)) {
      await env.DB.prepare(`alter table hits add column ${name} ${type}`).run();
    }
  }
  const legacy = await env.DB.prepare(
    "select name from sqlite_master where type = 'table' and name = 'events'"
  ).all();
  hasLegacyEvents = (legacy.results || []).length > 0;
  migrated = true;
}

function eventSource() {
  // Unified read view over current + legacy event rows.
  const current = `select ts, sid, event, path, meta, dwell_seconds as dwell
                   from hits where event <> ''`;
  if (!hasLegacyEvents) return `(${current})`;
  return `(${current} union all
           select ts, sid, ev as event, path, meta, dwell from events)`;
}

async function ingest(req, env) {
  let b = {};
  try {
    b = await req.json();
  } catch {}

  const cf = req.cf || {};
  const ip = req.headers.get("cf-connecting-ip") || "";
  const ipPart = ip.includes(":")
    ? ip.split(":").slice(0, 4).join(":")
    : ip.split(".").slice(0, 3).join(".");
  const ua = (req.headers.get("user-agent") || "").slice(0, 220);

  const event = String(b.e || b.ev || "").slice(0, 60);
  const sid = String(b.sid || "").slice(0, 100);
  let meta = "";
  if (typeof b.m === "string") meta = b.m;
  else if (b.m && typeof b.m === "object") {
    try {
      meta = JSON.stringify(b.m);
    } catch {}
  }

  let dwell = null;
  if (event === "dwell") {
    const n = Number(b.d);
    if (Number.isFinite(n)) dwell = Math.max(0, Math.round(n));
  }

  try {
    await env.DB.prepare(
      `insert into hits (ts, path, ref, country, city, ip_part, ua, lang, screen, tz,
                         event, sid, dwell_seconds, meta)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      new Date().toISOString(),
      String(b.p || "").slice(0, 300),
      String(b.r || "").slice(0, 300),
      cf.country || "",
      cf.city || "",
      ipPart,
      ua,
      String(b.l || "").slice(0, 12),
      String(b.s || "").slice(0, 24),
      String(b.z || "").slice(0, 60),
      event,
      sid,
      dwell,
      meta.slice(0, 500)
    ).run();
  } catch {}
}

async function collectStats(env) {
  const q = async (sql) => {
    try {
      return (await env.DB.prepare(sql).all()).results || [];
    } catch {
      return [];
    }
  };
  const EV = eventSource();

  const totalRow = await q("select count(*) c from hits");
  const total = totalRow.length ? totalRow[0].c : 0;

  // --- legacy panels, unchanged ---
  const byDay = await q(
    "select substr(ts,1,10) d, count(*) c from hits group by d order by d desc limit 14"
  );
  const byHour = await q("select substr(ts,12,2) h, count(*) c from hits group by h order by h");
  const countries = await q(
    "select country, count(*) c from hits group by country order by c desc limit 15"
  );
  const referrers = await q("select ref, count(*) c from hits group by ref order by c desc limit 15");
  const paths = await q("select path, count(*) c from hits group by path order by c desc limit 15");

  // --- events (cumulative) ---
  const eventRows = await q(`select event, count(*) c from ${EV} group by event`);
  const events = EVENT_NAMES.map((name) => ({
    event: name,
    count: (eventRows.find((r) => r.event === name) || { c: 0 }).c,
  }));

  // --- dwell: avg / median / max over all dwell beacons ---
  const dwellValues = (await q(
    `select dwell from ${EV} where event = 'dwell' and dwell is not null order by dwell`
  ))
    .map((r) => Number(r.dwell))
    .filter((n) => Number.isFinite(n));
  const samples = dwellValues.length;
  const sum = dwellValues.reduce((a, b) => a + b, 0);
  const median = !samples
    ? 0
    : samples % 2
      ? dwellValues[(samples - 1) / 2]
      : (dwellValues[samples / 2 - 1] + dwellValues[samples / 2]) / 2;
  const round1 = (n) => Math.round(n * 10) / 10;
  const dwell = {
    samples,
    avg_seconds: samples ? round1(sum / samples) : 0,
    median_seconds: samples ? round1(median) : 0,
    max_seconds: samples ? dwellValues[samples - 1] : 0,
  };

  // --- scroll depth: one bucket per session, using its deepest scroll ---
  const scrollRows = await q(
    `with per_session as (
       select sid,
              max(case when json_valid(meta)
                       then cast(json_extract(meta, '$.maxScroll') as integer) end) as ms
       from ${EV}
       where event = 'dwell' and sid <> ''
       group by sid
     )
     select case when ms < 25 then '0-25%'
                 when ms < 50 then '25-50%'
                 when ms < 75 then '50-75%'
                 else '75-100%' end as bucket,
            count(*) as sessions
     from per_session
     where ms is not null
     group by bucket`
  );
  const scroll = SCROLL_BUCKETS.map((bucket) => ({
    bucket,
    sessions: (scrollRows.find((r) => r.bucket === bucket) || { sessions: 0 }).sessions,
  }));

  // --- language / timezone leaderboards (always collected, never shown before) ---
  const language = await q(
    "select lang, count(*) c from hits where lang <> '' group by lang order by c desc limit 15"
  );
  const timezone = await q(
    "select tz, count(*) c from hits where tz <> '' group by tz order by c desc limit 15"
  );

  // --- funnel: distinct sessions per step + step-to-step conversion ---
  const funnelRows = await q(`select event, count(distinct sid) c from ${EV} where sid <> '' group by event`);
  let previous = 0;
  const funnel = FUNNEL_STEPS.map((step, i) => {
    const sessions = (funnelRows.find((r) => r.event === step) || { c: 0 }).c;
    const top = (funnelRows.find((r) => r.event === FUNNEL_STEPS[0]) || { c: 0 }).c;
    const row = {
      step,
      sessions,
      conversion: i === 0 ? null : previous ? round1((sessions / previous) * 100) : 0,
      of_pageview: top ? round1((sessions / top) * 100) : 0,
    };
    previous = sessions;
    return row;
  });

  return {
    generated_at: new Date().toISOString(),
    total,
    by_day: byDay,
    by_hour: byHour,
    countries,
    referrers,
    paths,
    events,
    dwell,
    scroll,
    language,
    timezone,
    funnel,
  };
}

const esc = (v) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function table(title, cols, rows, map) {
  return (
    `<h2>${esc(title)}</h2><table><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>` +
    rows.map((r) => `<tr>${map(r).map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("") +
    `</table>`
  );
}

function renderHtml(d) {
  const body =
    `<p>total hits: <b>${esc(d.total)}</b> · utc · generated ${esc(d.generated_at)}</p>` +
    table("by day", ["day", "hits"], d.by_day, (r) => [r.d, r.c]) +
    table("by hour (utc)", ["hour", "hits"], d.by_hour, (r) => [r.h, r.c]) +
    table("countries", ["country", "hits"], d.countries, (r) => [r.country, r.c]) +
    table("referrers", ["ref", "hits"], d.referrers, (r) => [r.ref || "(direct)", r.c]) +
    table("paths", ["path", "hits"], d.paths, (r) => [r.path, r.c]) +
    table("events (all time)", ["event", "count"], d.events, (r) => [r.event, r.count]) +
    table(
      "dwell seconds",
      ["samples", "avg", "median", "max"],
      [d.dwell],
      (r) => [r.samples, r.avg_seconds, r.median_seconds, r.max_seconds]
    ) +
    table("scroll depth (sessions)", ["max scroll", "sessions"], d.scroll, (r) => [r.bucket, r.sessions]) +
    table("languages", ["lang", "hits"], d.language, (r) => [r.lang, r.c]) +
    table("timezones", ["tz", "hits"], d.timezone, (r) => [r.tz, r.c]) +
    table("funnel (distinct sid)", ["step", "sessions", "vs prev %", "of pageview %"], d.funnel, (r) => [
      r.step,
      r.sessions,
      r.conversion === null ? "—" : r.conversion,
      r.of_pageview,
    ]);

  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>airdrop-checker stats</title>
<style>body{background:#0b0e10;color:#dbe7e3;font:13px/1.5 ui-monospace,Menlo,monospace;margin:0;padding:20px}
h1{font:600 14px ui-sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8fd9b6}
table{border-collapse:collapse;width:100%;margin:12px 0 26px}td,th{border-bottom:1px solid #26332e;padding:5px 8px;text-align:left}
th{color:#8b9ba2;font-weight:500;text-transform:uppercase;font-size:10.5px;letter-spacing:.08em}
</style><h1>airdrop-checker · hits</h1>${body}`;
}

function authorized(url, env) {
  const key = url.searchParams.get("k");
  return Boolean(env.STATS_KEY) && key === env.STATS_KEY;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/stats" || url.pathname === "/stats.json") {
      if (!authorized(url, env)) return new Response("forbidden", { status: 403 });
      await migrate(env);
      const data = await collectStats(env);
      if (url.pathname === "/stats.json") {
        return new Response(JSON.stringify(data, null, 2), {
          headers: { "content-type": "application/json;charset=utf-8", "cache-control": "no-store" },
        });
      }
      return new Response(renderHtml(data), {
        headers: { "content-type": "text/html;charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "POST") return new Response("ok", { headers: CORS });

    await migrate(env).catch(() => {});
    await ingest(req, env);
    return new Response(null, { status: 204, headers: CORS });
  },
};
