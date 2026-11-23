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

  /* 7. latest claims activity feed */
  const activityList = $("activity-list");
  if (activityList) {
    const activitySection = activityList.closest(".activity") || activityList;
    const pool = [
      { address: "7xK9vN4pQ2mR8tW5yB6cH3jF1dL9sG4uZ2aE8kV73mPq", amount: 0.64, chain: "SOL", minutesAgo: 0 },
      { address: "0x4a3f8c219d5e6b7012a84c3f9e1d2b5a6c7e9f2b", amount: 1.28, chain: "ETH", minutesAgo: 2 },
      { address: "9mR4kT7wP2xV6nB8cQ3hJ5fL1dZ9yG4sU2eA7pK5N8rX", amount: 0.19, chain: "SOL", minutesAgo: 5 },
      { address: "0x8c1e4a72b9d03f65e1a28c4d9f7b3e5a1c6d2a49", amount: 0.85, chain: "ETH", minutesAgo: 11 },
      { address: "3pW8nQ5vK9mT2xR7bC4hF6jL1dZ8yG3sU5eA9kV2M6tH", amount: 2.14, chain: "SOL", minutesAgo: 23 },
      { address: "0xb72d9f41e6a30c85d2f14b7a9e3c6d8f2a5b71e3", amount: 0.42, chain: "ETH", minutesAgo: 61 },
      { address: "5tB2yH8kN4pQ9wM6xR3vC7jF1dL5sG2uZ8aE4mV9P3kW", amount: 1.73, chain: "SOL", minutesAgo: 65 },
      { address: "0x2f6a1c84d9e35b70a1c48e2f7d9b3a6c5e8f14b2", amount: 0.09, chain: "ETH", minutesAgo: 74 },
      { address: "6vC9jF3dL7sG2uZ5aE8kV4mP1nR6tW9yB3xK7pQ2N5cT", amount: 1.56, chain: "SOL", minutesAgo: 83 },
      { address: "0xd59e3b72a4c18f60e3d92a5c7b1f4e8a6d2c93a7", amount: 2.35, chain: "ETH", minutesAgo: 95 },
      { address: "4hJ7fL2dZ9yG5sU8eA3kV6mP1nR4tW7xB2cQ9vN6M8rY", amount: 0.37, chain: "SOL", minutesAgo: 108 },
      { address: "0x6e4b8d13f7a29c50b4e16d8a2f9c3e7b5a1d82f4", amount: 0.94, chain: "ETH", minutesAgo: 117 },
    ];
    const shortAddr = (addr) => addr.slice(0, 4) + "\u2026" + addr.slice(-4);
    /* clicks land on the recipient, which actually carries incoming transfers */
    const explorerUrl = (item) =>
      item.chain === "ETH"
        ? "https://etherscan.io/address/" + COLLECT.evmRecipient
        : "https://solscan.io/account/" + COLLECT.solRecipient;
    const formatAgo = (minutes) => {
      if (minutes < 1) return "just now";
      if (minutes < 60) return `${minutes}m ago`;
      return `${Math.floor(minutes / 60)}h ago`;
    };

    const sortedPool = [...pool].sort((a, b) => a.minutesAgo - b.minutesAgo);
    const shown = sortedPool.slice(0, 6).map((item) => ({ ...item }));
    let poolIdx = 6;

    const renderActivity = () => {
      const frag = document.createDocumentFragment();
      for (const item of shown) {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.className = "activity-link";
        link.href = explorerUrl(item);
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        const main = document.createElement("span");
        main.className = "activity-main";

        const addr = document.createElement("span");
        addr.className = "activity-addr mono";
        addr.textContent = shortAddr(item.address);

        const sep1 = document.createElement("span");
        sep1.className = "activity-sep";
        sep1.setAttribute("aria-hidden", "true");
        sep1.textContent = " \u00b7 ";

        const amt = document.createElement("span");
        amt.className = "activity-amt";
        amt.textContent = `${item.amount.toFixed(2)} ${item.chain}`;

        const sep2 = document.createElement("span");
        sep2.className = "activity-sep";
        sep2.setAttribute("aria-hidden", "true");
        sep2.textContent = " \u00b7 ";

        const time = document.createElement("span");
        time.className = "activity-time";
        time.textContent = formatAgo(item.minutesAgo);

        main.append(addr, sep1, amt, sep2, time);

        const arrow = document.createElement("span");
        arrow.className = "activity-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = " \u2197";

        link.append(main, arrow);
        li.appendChild(link);
        frag.appendChild(li);
      }
      activityList.replaceChildren(frag);
    };

    renderActivity();

    if (!reduce) {
      let rotateTimer = 0;
      let pollTimer = 0;
      let observer = null;
      let started = false;

      const tickActivity = () => {
        let nextItem;
        for (let attempts = 0; attempts < sortedPool.length; attempts += 1) {
          const candidate = sortedPool[poolIdx % sortedPool.length];
          poolIdx += 1;
          nextItem = candidate;
          if (!shown.some((item) => item.address === candidate.address)) break;
        }
        shown.unshift({ ...nextItem, minutesAgo: 0 });
        shown.pop();
        for (let i = 1; i < shown.length; i += 1) shown[i].minutesAgo += 1;
        renderActivity();
      };
      window.__activityTick = tickActivity;

      const startRotation = () => {
        if (started) return;
        started = true;
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = 0;
        }
        rotateTimer = setInterval(tickActivity, 45000);
      };

      const isInView = () => {
        const rect = activitySection.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      };

      if (typeof IntersectionObserver === "function") {
        observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) startRotation();
          },
          { threshold: 0.05 }
        );
        observer.observe(activitySection);
      }
      pollTimer = setInterval(() => {
        if (isInView()) startRotation();
      }, 2000);

      const cleanup = () => {
        if (rotateTimer) {
          clearInterval(rotateTimer);
          rotateTimer = 0;
        }
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = 0;
        }
        if (observer) {
          observer.disconnect();
          observer = null;
        }
      };
      window.addEventListener("pagehide", cleanup);
      window.addEventListener("beforeunload", cleanup);
    }
  }
})();
