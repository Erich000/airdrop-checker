/* visual-only enhancements; never touches app.js state */
(() => {
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 1. count-up for #amount */
  const amountEl = $("amount");
  if (amountEl) {
    let raf = 0;
    let busy = false;
    const fmt = (n, d) => n.toFixed(d);
    const read = () => amountEl.textContent || "";
    let targetText = read();
    const animate = () => {
      if (busy) return;
      const raw = read();
      if (raw === targetText) return;
      targetText = raw;
      busy = true;
      cancelAnimationFrame(raf);
      const target = parseFloat(raw.replace(/[^\d.]/g, ""));
      if (!isFinite(target)) { busy = false; return; }
      const decimals = (raw.split(".")[1] || "").length;
      if (reduce || target === 0) { amountEl.textContent = fmt(target, decimals); busy = false; return; }
      const from = 0;
      const start = performance.now();
      const dur = 620;
      const tick = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        amountEl.textContent = fmt(from + (target - from) * eased, decimals);
        if (p < 1) raf = requestAnimationFrame(tick);
        else { amountEl.textContent = raw; busy = false; }
      };
      raf = requestAnimationFrame(tick);
    };
    new MutationObserver(animate).observe(amountEl, { childList: true, characterData: true, subtree: true });
  }

  /* 2. entrance class once allocation is shown */
  const allocation = $("allocation");
  const result = $("result");
  if (allocation && result) {
    const mark = () => {
      if (!allocation.hidden && !allocation.classList.contains("is-in")) {
        allocation.classList.add("is-in");
        buildLive();
      }
    };
    new MutationObserver(mark).observe(allocation, { attributes: true, attributeFilter: ["hidden"] });
    new MutationObserver(mark).observe(result, { attributes: true, attributeFilter: ["hidden"] });
    mark();
  }

  /* 3. busy state on claim button */
  const claim = $("claim-button");
  if (claim) {
    let timer = 0;
    claim.addEventListener("click", () => {
      claim.classList.add("is-busy");
      clearTimeout(timer);
      timer = setTimeout(() => claim.classList.remove("is-busy"), 8000);
    });
    const status = $("claim-status");
    if (status) {
      new MutationObserver(() => {
        if (/sent|view on/i.test(status.textContent || "")) claim.classList.remove("is-busy");
      }).observe(status, { childList: true, characterData: true, subtree: true });
    }
  }

  /* 3b. copy address */
  const copyBtn = $("copy-address");
  const addrOut = $("result-address");
  if (copyBtn && addrOut) {
    copyBtn.addEventListener("click", async () => {
      const text = addrOut.textContent.trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); ta.remove();
      }
      const old = copyBtn.textContent;
      copyBtn.textContent = "Copied";
      setTimeout(() => { copyBtn.textContent = old; }, 1400);
    });
  }

  /* 3c. humanise sub-cent estimates */
  const fix = (el) => {
    if (!el) return;
    const t = el.textContent;
    const m = t.match(/[$]0(?:\.0+)?(?!\d)/);
    if (m && t.trim()) {
      const next = t.replace(m[0], "<$0.01");
      if (next !== t && !el.dataset.fixed) {
        el.dataset.fixed = "1";
        el.textContent = next;
        setTimeout(() => { el.dataset.fixed = ""; }, 900);
      }
    }
  };
  ["estimate", "claim-sub"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    fix(el);
    new MutationObserver(() => fix(el)).observe(el, { childList: true, characterData: true, subtree: true });
  });

  /* 4. decorative live claims strip */
  let built = false;
  function buildLive() {
    const box = $("live-claims");
    const addrEl = $("result-address");
    if (!box || built) return;
    const seed = (addrEl?.textContent || "anon").replace(/[^a-z0-9]/gi, "");
    if (!seed) return;
    const pick = (i, mod) => seed.charCodeAt(i % seed.length) % mod;
    const base58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const frag = (i) => {
      let s = "";
      for (let k = 0; k < 4; k++) s += base58[pick(i * 3 + k, base58.length)];
      return s;
    };
    const times = ["just now", "12s ago", "41s ago", "2m ago", "6m ago", "11m ago"];
    const rows = times.map((t, i) => {
      const el = document.createElement("span");
      el.className = "live-item";
      const amt = (0.02 + pick(i + 5, 90) / 1000).toFixed(4);
      el.innerHTML = `<i></i>${frag(i)}…${frag(i + 9)} · <b>${amt} SOL</b> · ${t}`;
      return el;
    });
    const label = document.createElement("span");
    label.className = "live-label";
    label.textContent = "LIVE";
    box.replaceChildren(label, ...rows);
    built = true;
  }
})();
