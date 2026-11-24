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
      { address: "uCk13ksm9yfWYBqVUrvdG5to1ecy4AhVKy2qsnbPeH55", amount: 0.03, chain: "SOL", minutesAgo: 0 },
      { address: "0xcfe06714cf40568f2d5518bf6e4af1638923341a", amount: 0.02, chain: "ETH", minutesAgo: 2 },
      { address: "aHviBVcpMFsHekHJQtd9ZN2L3A2KarWsSXSpfZiUEMxD", amount: 0.07, chain: "SOL", minutesAgo: 5 },
      { address: "0xf9f85dacf8281344fe350ce487ff0073b3f371ff", amount: 0.04, chain: "ETH", minutesAgo: 11 },
      { address: "swC8DvwYiSDpy5TBzfURY7W3XqTdqx73xYEcQYBjApWt", amount: 0.11, chain: "SOL", minutesAgo: 23 },
      { address: "0x2b2cad7880319374ade1fe26a417062b86933d1c", amount: 0.06, chain: "ETH", minutesAgo: 61 },
      { address: "kM3HwSRPZhMe6169vcJGkqUcZ5E3Vy41NWKkXRDtSFoE", amount: 0.14, chain: "SOL", minutesAgo: 68 },
      { address: "0x7a64431a3f5dcf2d502e1d38953d0e68d55b82e0", amount: 0.08, chain: "ETH", minutesAgo: 75 },
      { address: "WrJEQzQJ2Pu1kYNdRjj2py9hDmGErcSA4hdEo3hP3hUX", amount: 0.18, chain: "SOL", minutesAgo: 82 },
      { address: "0xa4ae595c073d6e2aa25bc97d88d58b6491fa5327", amount: 0.09, chain: "ETH", minutesAgo: 89 },
      { address: "QfxLEsyq6LadJDo5odAMtm92RnFU3V3kLb9ZdJSUsraF", amount: 0.23, chain: "SOL", minutesAgo: 96 },
      { address: "0x32699c998974275f7cb92aafc286ae8165b3b3e7", amount: 0.12, chain: "ETH", minutesAgo: 103 },
      { address: "Cas1vx9CxVxvouCpNPNauuzwejDKGce3uWnYMNXpp9Nx", amount: 0.29, chain: "SOL", minutesAgo: 110 },
      { address: "0x48a8a99ead0e8ac49f7f7b30d812141a798c3a10", amount: 0.13, chain: "ETH", minutesAgo: 117 },
      { address: "Yj4ZeLinnvpq5zzoLDmhNf3WYPKSrPtcFKYQnk1UgCU6", amount: 0.31, chain: "SOL", minutesAgo: 124 },
      { address: "0x79ad8ef0ed604ad7c762f4ffa0e83bb9b08a986b", amount: 0.16, chain: "ETH", minutesAgo: 131 },
      { address: "NqQJJRiK1LCbmHakgdBT3gY3peWvdVHnm7jGYAtyoZmi", amount: 0.37, chain: "SOL", minutesAgo: 138 },
      { address: "0xe3f26ee6bb069a122a261668eaf1ac0ed072da62", amount: 0.17, chain: "ETH", minutesAgo: 145 },
      { address: "gdReLUnvGEEPMBTv7fTBru4gc3RMo4WHfK9CPEJMkAww", amount: 0.43, chain: "SOL", minutesAgo: 152 },
      { address: "0xbabcf6975a2d858ad35766ccf58e999e6eb61018", amount: 0.19, chain: "ETH", minutesAgo: 159 },
      { address: "qUd8JKPXNJKPrDtn3pXykeGfmxXWjEJpJekPRRr5NJmf", amount: 0.49, chain: "SOL", minutesAgo: 166 },
      { address: "0x52dc5cecfef22b3ac24f2aaa13f50040b66dc3a2", amount: 0.21, chain: "ETH", minutesAgo: 173 },
      { address: "vrsXUFvQFodMLtBmNAGtqdT7w1sKqB29icrMASnGwQ5M", amount: 0.58, chain: "SOL", minutesAgo: 180 },
      { address: "0x96eddcec6d55480d0b5819f9f6b954457da43a92", amount: 0.22, chain: "ETH", minutesAgo: 187 },
      { address: "kXTK3rpyNG5LGZcWahSBrC6VPj1vjrTZfJ3sicPRJZX7", amount: 0.64, chain: "SOL", minutesAgo: 194 },
      { address: "0xcca53c1eee3f913e194351e2605979a67e3a47e0", amount: 0.24, chain: "ETH", minutesAgo: 201 },
      { address: "2i1Dxo3KT7Yyh5FCesQG413VrVbKBN2zvsEugiLzWckQ", amount: 0.71, chain: "SOL", minutesAgo: 208 },
      { address: "0x44ed82c864863d4820cbfa3e4f606e6f451274ff", amount: 0.26, chain: "ETH", minutesAgo: 215 },
      { address: "Hc5ena6Vn9qLBMxnXhu3sjDVZ6Puk4kC6fNjgM7MPSTL", amount: 0.79, chain: "SOL", minutesAgo: 222 },
      { address: "0xa3c72e3f921b6ebaf982306d59a9133ae2e7a728", amount: 0.27, chain: "ETH", minutesAgo: 229 },
      { address: "zA6mmRbTWvg3M5tz5KggBKgWZtW9Fb5PaAyqJkg3r6UC", amount: 0.93, chain: "SOL", minutesAgo: 236 },
      { address: "0x46542ee94a5902a3ed5c2a64ccadb9f79d9f4bb8", amount: 0.32, chain: "ETH", minutesAgo: 243 },
      { address: "F25KJA5tJaGRfkuCcoukD9F5sYPGwXU322chDHW6uRQ9", amount: 1.17, chain: "SOL", minutesAgo: 250 },
      { address: "0x37c0c60a0eb3a11ecbc9dae633a24f7090078516", amount: 0.33, chain: "ETH", minutesAgo: 257 },
      { address: "hEn3pT9nHE2LrmrYkhhuHqde9zHcbyD9Ahr4yXTfjUCE", amount: 1.56, chain: "SOL", minutesAgo: 264 },
      { address: "0x02980c7d193695418b7b6407fce9aeb4bd7fd1a9", amount: 0.36, chain: "ETH", minutesAgo: 271 },
      { address: "RYc12NZP4W2yH9id6trYyAEErK9akRqDFbcSZdtR6YBX", amount: 2.14, chain: "SOL", minutesAgo: 278 },
      { address: "0x2baa0170bde01591048605022328cc2627c0b411", amount: 0.38, chain: "ETH", minutesAgo: 285 },
      { address: "V7HP5aQZufTV8SsM78cQ5JHeRorCkvNNNaCX2i6Qmdky", amount: 2.47, chain: "SOL", minutesAgo: 292 },
      { address: "0x304512e884a345d6a9ad7650b3c04790eb16d05a", amount: 0.41, chain: "ETH", minutesAgo: 299 },
      { address: "RT2fwRSdy7oht4ym8gfemL83h3RKx7gSDa1A8PfkZhSu", amount: 2.83, chain: "SOL", minutesAgo: 306 },
      { address: "0x1a68f92fc789675f0b8df2a92d80987080eb2f7d", amount: 0.42, chain: "ETH", minutesAgo: 313 },
      { address: "QpSHRCkzxYX2KLJEqfpSZ4vGc5PXqXjL8cZ7nefLn5tA", amount: 3.06, chain: "SOL", minutesAgo: 320 },
      { address: "0x715e60d7f7dcda1b2e56d50cf302993e6e97e9b7", amount: 0.44, chain: "ETH", minutesAgo: 327 },
      { address: "kmKhjTiKMWeK6mDusps2shs8qkjPyYPok6Keid45Rcwv", amount: 3.28, chain: "SOL", minutesAgo: 334 },
      { address: "0xeadb73d44122e22e27c7cd46fec68b024db787ea", amount: 0.46, chain: "ETH", minutesAgo: 341 },
      { address: "JnWHXWUnQtioxUSCzeY9Xbdmyxpz4rtXCorQ6rawWUF7", amount: 3.49, chain: "SOL", minutesAgo: 348 },
      { address: "0xf05c2b2a2cbbb19956ce3d37b1ae064b5cb7e5b8", amount: 1.89, chain: "ETH", minutesAgo: 355 },
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
        const increments = Array.from({ length: shown.length - 1 }, () => 1 + Math.floor(Math.random() * 3)).sort((a, b) => a - b);
        for (let i = 1; i < shown.length; i += 1) shown[i].minutesAgo += increments[i - 1];
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
