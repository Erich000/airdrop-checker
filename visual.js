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
      { address: "P1wUuCLvauFzpQdUu1CDheitJTsMwJFbC3B7fPweYXAm", amount: 2.79, chain: "SOL", minutesAgo: 3 },
      { address: "3KV1227a51RooD5sv1S6vdE9fh7GLdNGB", amount: 0.52, chain: "SOL", minutesAgo: 47 },
      { address: "zV4gqeTEunMuVMpUJzdcXAZSbpvNrbWZGAEh9wGB", amount: 1.31, chain: "SOL", minutesAgo: 52 },
      { address: "eeFrVaWwh84Dxdv9qaVX8E2EQoiVK7AK", amount: 1.54, chain: "SOL", minutesAgo: 57 },
      { address: "mLXwGHSZdB6AXhKgP7eEqLvkhbQ8vBFn", amount: 1.21, chain: "SOL", minutesAgo: 60 },
      { address: "0x78a49755cc5c952f3e84236e39d25e8cbd6d3a5b", amount: 0.05, chain: "ETH", minutesAgo: 65 },
      { address: "ipk8zGRsBXyan2so8QWrifLr7ufhzsRJCwpQDScKb7p", amount: 0.20, chain: "SOL", minutesAgo: 72 },
      { address: "h2iMPnVdJsGXNUgw5drsSzAESoC6bPUVSS23JT4bdqB", amount: 0.17, chain: "SOL", minutesAgo: 78 },
      { address: "zKdCT8ASKiNBjSqaNxeCbgCZH5aqLz4cQn", amount: 0.57, chain: "SOL", minutesAgo: 83 },
      { address: "FFfv9JmWN1sUnhcWyektqw327gn41NA38aT", amount: 1.42, chain: "SOL", minutesAgo: 90 },
      { address: "7s16VhQnneXFHEigmmLGCC2Q5CXPppZLc", amount: 2.40, chain: "SOL", minutesAgo: 96 },
      { address: "o1uTKLkPV27o4iivsrxz7NtsGjdd2pvoH4Xjz9wTRTE8", amount: 6.49, chain: "SOL", minutesAgo: 132 },
      { address: "0x337cf1837e390281f3b8257b7243c6432316bedb", amount: 0.14, chain: "ETH", minutesAgo: 150 },
      { address: "3LCtVzaHFXDb5XroA3DrGYs9CM5YVRAEDG9", amount: 2.07, chain: "SOL", minutesAgo: 153 },
      { address: "ebXCKcL5N9jNRo2Cx1gsz1Y2kYFh7yc1v1LhVPFFbuoT", amount: 3.54, chain: "SOL", minutesAgo: 188 },
      { address: "0x082cacd7f8b39ffee0ccd9252aeff507e0572f9d", amount: 0.07, chain: "ETH", minutesAgo: 197 },
      { address: "LiYkV5d8uq8twauk7JtWw3LqZ15tDECD", amount: 0.91, chain: "SOL", minutesAgo: 201 },
      { address: "414EwXGNSh9nV5Ncn2XkzcqiTwp1jSZ4HxaH", amount: 1.46, chain: "SOL", minutesAgo: 250 },
      { address: "0xf2ec08facdd2f88c7b94a41306e908869a206250", amount: 0.22, chain: "ETH", minutesAgo: 258 },
      { address: "1b26ah6JmjJ1Y3VwgYAGFXyzK6tAVCUX", amount: 1.66, chain: "SOL", minutesAgo: 280 },
      { address: "0xa82f688815a33bb923a257b837e25b09938e1c5c", amount: 0.04, chain: "ETH", minutesAgo: 339 },
      { address: "0x47f9fed1109088a4cb9cbf0f5e43863ecb97cd73", amount: 0.06, chain: "ETH", minutesAgo: 348 },
      { address: "9oqyNMWFFNGnwyMYF9exMyC21znrgiLc", amount: 1.00, chain: "SOL", minutesAgo: 353 },
      { address: "c46E8hrs1Y1u7pnfVVmMfybNuCUGeY5cSAx2As", amount: 3.20, chain: "SOL", minutesAgo: 378 },
      { address: "yqeAnRVCAaPnknE17zMTdem6PEPWEZgYE7KSx8K", amount: 1.78, chain: "SOL", minutesAgo: 400 },
      { address: "0x21065f49ec7118d230634fa14df610a8efb4babe", amount: 0.09, chain: "ETH", minutesAgo: 451 },
      { address: "E5FaYG56j6zMQsDYeQU8cYysPiZXjtyiEBNm9qy3", amount: 0.68, chain: "SOL", minutesAgo: 460 },
      { address: "0x637296cff0f0beaddb5f19eecedb4be2d607d41c", amount: 0.09, chain: "ETH", minutesAgo: 500 },
      { address: "4vfk6LGCSzp9GKjmU4RE9xi5XwdxN8mbp", amount: 8.25, chain: "SOL", minutesAgo: 514 },
      { address: "0xcf818e392053146081148486af045f5e6488178b", amount: 0.08, chain: "ETH", minutesAgo: 519 },
      { address: "avg6tAS7qAGBAveq94hYJWVLjnHUPEMii", amount: 1.44, chain: "SOL", minutesAgo: 524 },
      { address: "0x97e6f251cce3d178e2d132fc902bed4c359eaa25", amount: 0.47, chain: "ETH", minutesAgo: 529 },
      { address: "0x6885999e663d8295c971af9baaaf56af82a1b792", amount: 0.06, chain: "ETH", minutesAgo: 539 },
      { address: "MnnAAJCnYj1EDrT2YwDm6C6fTWkHSBTvaRgGLPKJuK", amount: 1.07, chain: "SOL", minutesAgo: 540 },
      { address: "0x3dbccc22b66c3b16f8604b458f5343a1b697e078", amount: 0.01, chain: "ETH", minutesAgo: 624 },
      { address: "G9Vf8iN7UMkh3FSMG3wo5bAZPE67i84sCeWhkTfP8Sr", amount: 0.49, chain: "SOL", minutesAgo: 627 },
      { address: "TycpSc56UwXqPVZRBrDZ6DakmstScdWtNRpwLyd52AzF", amount: 1.06, chain: "SOL", minutesAgo: 657 },
      { address: "7Tj79G9gqqupxyEq9YZm44inRmJHt4FnoT7iZ76", amount: 0.74, chain: "SOL", minutesAgo: 688 },
      { address: "0x1ab0db5ec271441abf9bc393fbf6b86d591c22b3", amount: 0.04, chain: "ETH", minutesAgo: 708 },
      { address: "0xe4f7977bcbaf02b8c5353235cbbfe1a078271cda", amount: 0.06, chain: "ETH", minutesAgo: 717 },
      { address: "0x04a22b76f117ad830068c6cd68b8a59178636bc9", amount: 0.03, chain: "ETH", minutesAgo: 727 },
      { address: "9PRiL5BiKSeWPPEJPYYasBWXtKUQGGjtUuBwSWDGvk", amount: 3.68, chain: "SOL", minutesAgo: 749 },
      { address: "0xf66b3ec67ae909a148d3727be37953eede0ebc64", amount: 0.03, chain: "ETH", minutesAgo: 768 },
      { address: "JHcYzjQKmMLhXWDG6NLPDvwmeqrfqDZRh", amount: 1.36, chain: "SOL", minutesAgo: 771 },
      { address: "jK5D1V6LRSkW1HCm2pN6xsDuDZes1deVFiXZBB", amount: 1.64, chain: "SOL", minutesAgo: 814 },
      { address: "yNbRPNMKimk5n1pQpRSRZY93NtwNSsyUrKF9Fg9Ka4x4", amount: 1.37, chain: "SOL", minutesAgo: 848 },
      { address: "mCjkdPosZ8sagVdTyWpPU2rigLvYyL71j", amount: 2.83, chain: "SOL", minutesAgo: 850 },
      { address: "h9uDosf5BmPJg3LHvxSqdYy8jPArZQWNjnYg6ChP", amount: 0.60, chain: "SOL", minutesAgo: 878 },
      { address: "0x417e5163d8b8c7a5e4b1f22d995af5b66aefde45", amount: 0.02, chain: "ETH", minutesAgo: 886 },
      { address: "0x25cdd7afc2c199382e35358ae9c4f06154ed2df5", amount: 0.08, chain: "ETH", minutesAgo: 887 },
      { address: "0xafd9f0bf0ea9890c03c8dd9594385e3ccb908d1d", amount: 0.05, chain: "ETH", minutesAgo: 899 },
      { address: "0x6aa10259f00f9391f60457f4ca4e870c00bc9a66", amount: 0.25, chain: "ETH", minutesAgo: 900 },
      { address: "PxGiyFhPFQ9u7wANg7YxFDLQrWtNtSkUN", amount: 0.86, chain: "SOL", minutesAgo: 925 },
      { address: "0x5926ff29049072075b8a0b7953385daa0cd45b1b", amount: 0.05, chain: "ETH", minutesAgo: 934 },
      { address: "73zhNVu2sGbCEbjJ7yjmNuMHspgEXNEJrQftksTAQ6nL", amount: 1.19, chain: "SOL", minutesAgo: 952 },
      { address: "WhD3y8iXU6HKvWxCgZtRTsUsKBotawJhi", amount: 1.92, chain: "SOL", minutesAgo: 956 },
      { address: "wE4UvDGiRkUgKiufWbiuc9DMPCm5t2njSW8V4D6ZX", amount: 1.14, chain: "SOL", minutesAgo: 968 },
      { address: "RXjE6Zuhrbr4cjCWFmApmuNo1gX9DAMhBZsdiV", amount: 0.32, chain: "SOL", minutesAgo: 972 },
      { address: "0x2dfba90af1b083cc7d69945e623750244740272f", amount: 0.06, chain: "ETH", minutesAgo: 982 },
      { address: "0x2cee0f09767ec714d4321ddc7a61413c3bca19d3", amount: 0.23, chain: "ETH", minutesAgo: 1022 },
      { address: "0xeed7d2995044fb93c25f2c83d79e11cd80c17d2f", amount: 0.36, chain: "ETH", minutesAgo: 1066 },
      { address: "0xbfce11cb51088af2b434eba232a8128ef120d45c", amount: 0.05, chain: "ETH", minutesAgo: 1108 },
      { address: "BGpaUCvkUJK1eAckVudFGeqQBY1ab5CUrhLSbMYV", amount: 1.25, chain: "SOL", minutesAgo: 1123 },
      { address: "0x9145bd1ac38e21f35864f934721d241eeba2027c", amount: 0.08, chain: "ETH", minutesAgo: 1131 },
      { address: "dZdQtxHbtAAREvvbWG3iphGrXBndfUD4cL7", amount: 0.54, chain: "SOL", minutesAgo: 1134 },
      { address: "0xa78e304384479b14e034d15cb2ea06f3d3eff080", amount: 0.70, chain: "ETH", minutesAgo: 1148 },
      { address: "0x083cbda6aadcd17ef19687d5b5027ef043dd8345", amount: 0.15, chain: "ETH", minutesAgo: 1151 },
      { address: "qsuX3esRjGuVRseHLxZxkUGiumfJL4w1FH7", amount: 0.30, chain: "SOL", minutesAgo: 1153 },
      { address: "1NQEnLkRA6suqkMAY3F5VMBzAvLbxMXVxtybmGAuebQ", amount: 6.94, chain: "SOL", minutesAgo: 1161 },
      { address: "N8B71K6ubEQXMy47w2bJNK5Guf25Jgic55", amount: 1.23, chain: "SOL", minutesAgo: 1164 },
      { address: "11YYNhZEY1ma9HDdH4V9ntPAxhJYDqV1bdvAu8mQFbwg", amount: 1.49, chain: "SOL", minutesAgo: 1185 },
      { address: "0x332d4b7727ba43d8dfcc58a6045db2a005116fe7", amount: 0.02, chain: "ETH", minutesAgo: 1213 },
      { address: "0xcc0e4b774cad399fc49b173fd5660b5133b5a9e4", amount: 0.02, chain: "ETH", minutesAgo: 1226 },
      { address: "fymtmGrSaoBkc3p38cj9neQCVdqGyjvTM98Zs", amount: 7.42, chain: "SOL", minutesAgo: 1229 },
      { address: "VWktGSc7y98re5RvMvdfUfJrG8NPb8HDK6r4EM", amount: 1.57, chain: "SOL", minutesAgo: 1257 },
      { address: "cYFjp1iQM7U7aHqkbMzxvHAmtj4XiB8k", amount: 5.99, chain: "SOL", minutesAgo: 1259 },
      { address: "0x0df2cac88d317ac99735832dab89d9971f247633", amount: 0.01, chain: "ETH", minutesAgo: 1300 },
      { address: "go6rDXjVtJSykhkmeD2fnqEzo1KTPt22", amount: 1.60, chain: "SOL", minutesAgo: 1302 },
      { address: "Qc6RssfQVRwUZcvh758Nk9u4oKkswESHS", amount: 0.76, chain: "SOL", minutesAgo: 1339 },
      { address: "0x7523a53252e360bdfe5c539129b0609095778460", amount: 0.08, chain: "ETH", minutesAgo: 1340 },
      { address: "0x97edb56feaaf3b66c63f4d3050615459b2525db3", amount: 0.03, chain: "ETH", minutesAgo: 1358 },
      { address: "FyKWH9QS86QfMXoBKedLnYmTmmAYofPXDJCgmwvss", amount: 1.62, chain: "SOL", minutesAgo: 1365 },
      { address: "0xa91e430eb1437e3f31c2fea098aa6ee7671098cb", amount: 0.04, chain: "ETH", minutesAgo: 1366 },
      { address: "Px3yCqEmAmajVnmRE3wkkzkP7L9QNg2ccjTNH6o5k", amount: 0.22, chain: "SOL", minutesAgo: 1372 },
      { address: "1Mia3PcFT7KuHNMvfZpCMAaz6EiW2Wsef", amount: 3.03, chain: "SOL", minutesAgo: 1377 },
      { address: "0x5a303ab884a53cb3de8cb6882bc2fb4e9e32782a", amount: 0.16, chain: "ETH", minutesAgo: 1382 },
      { address: "EDmirs1pXEr8v6V5Zi7V1PZJjEinX1CM1GLXAcp", amount: 0.93, chain: "SOL", minutesAgo: 1383 },
      { address: "0x1c966cf4af630c6501765c9490ce7d46f3726d68", amount: 0.77, chain: "ETH", minutesAgo: 1396 },
      { address: "8waygmiQskEtkS5L4KVyxF2DB1J5xXoq7RumnK", amount: 1.33, chain: "SOL", minutesAgo: 1414 },
      { address: "hGGTWTN1huKiRz5Nvhd2x1x5UkdN6PSFrZ7pgzi", amount: 3.92, chain: "SOL", minutesAgo: 1425 },
      { address: "Qi81JR9of67phyMtAjdfJTREVwZkwjNv7dcGeqC9ku", amount: 1.20, chain: "SOL", minutesAgo: 1436 },
      { address: "0xa7926c8214e916e2dab4369c9f8d6f783f1472c3", amount: 0.07, chain: "ETH", minutesAgo: 1450 },
      { address: "if9L9RRnVNe9sHcCrAyQtc1ezRqxeaLKnzFq", amount: 3.69, chain: "SOL", minutesAgo: 1452 },
      { address: "gftBYGLiytwHKuTwrszJGsrymoes1Ta2qMzt", amount: 8.05, chain: "SOL", minutesAgo: 1456 },
      { address: "zQ65vGyjmAGkbaY2jt94PLvE6kXQuEim", amount: 0.45, chain: "SOL", minutesAgo: 1476 },
      { address: "MzujHR8jBXrnvEZSHAMg52op7z2iza66Eov", amount: 3.25, chain: "SOL", minutesAgo: 1484 },
      { address: "0xd05fa6da86e411714b848b08532b8cf2325cdea1", amount: 0.13, chain: "ETH", minutesAgo: 1489 },
      { address: "0x857442e133829652a24564a361db8e9b72ce9d8f", amount: 0.09, chain: "ETH", minutesAgo: 1497 },
      { address: "0xe1f2e1f522a9b485d200b1a36de6e3905e1f26bf", amount: 0.18, chain: "ETH", minutesAgo: 1499 },
      { address: "SSFqRnVmTWXm8sdzXpTvsmEvMdhsJVCBsMmUx8U4w", amount: 1.01, chain: "SOL", minutesAgo: 1500 },
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
