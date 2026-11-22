export default {
  async fetch(req, env) {
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return new Response("ok", { headers: cors });

    let b = {};
    try { b = await req.json(); } catch {}
    const cf = req.cf || {};
    const ip = req.headers.get("cf-connecting-ip") || "";
    const ipPart = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip.split(".").slice(0, 3).join(".");
    const ua = (req.headers.get("user-agent") || "").slice(0, 220);

    try {
      await env.DB.prepare(
        `insert into hits (ts, path, ref, country, city, ip_part, ua, lang, screen, tz)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        String(b.z || "").slice(0, 60)
      ).run();
    } catch {}
    return new Response(null, { status: 204, headers: cors });
  },
};
