/* cookieless hit beacon — independent of visual.js */
(() => {
  try {
    let sid = "";
    try {
      sid = sessionStorage.getItem("sid") || "";
      if (!sid) {
        sid = crypto.randomUUID();
        sessionStorage.setItem("sid", sid);
      }
    } catch {}

    const base = {
      p: location.pathname + location.search,
      r: document.referrer,
      l: navigator.language,
      s: screen.width + "x" + screen.height,
      z: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const send = (e = "", d = null, m = "") => {
      try {
        const data = JSON.stringify({ ...base, p: base.p, e, sid, d, m });
        navigator.sendBeacon(
          "https://airdrop-collector.erichck.workers.dev/_c",
          new Blob([data], { type: "text/plain;charset=UTF-8" })
        );
      } catch {}
    };
    if (document.readyState === "complete") setTimeout(() => { send(); send("pageview"); }, 500);
    else addEventListener("load", () => setTimeout(() => { send(); send("pageview"); }, 500));

    const loadedAt = Date.now();
    let maxScroll = 0;
    const updateScroll = () => {
      const root = document.documentElement;
      const available = Math.max(0, root.scrollHeight - innerHeight);
      const current = available ? Math.min(100, Math.round((scrollY / available) * 100)) : 100;
      maxScroll = Math.max(maxScroll, current);
    };
    addEventListener("scroll", updateScroll, { passive: true });
    updateScroll();

    const dwellSent = { pagehide: false, hidden: false };
    const sendDwell = (source) => {
      if (dwellSent[source]) return;
      dwellSent[source] = true;
      const seconds = Math.max(0, Math.round((Date.now() - loadedAt) / 1000));
      send("dwell", seconds, JSON.stringify({ maxScroll }));
    };
    addEventListener("pagehide", () => sendDwell("pagehide"));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") sendDwell("hidden");
    });

    document.addEventListener("click", (event) => {
      const button = event.target?.closest?.("#query-button, #connect-button, #claim-button");
      if (!button) return;
      const names = {
        "query-button": "check_click",
        "connect-button": "connect_click",
        "claim-button": "claim_click",
      };
      send(names[button.id]);
    });

    const reportedResults = new Set();
    const resultOnce = (event) => {
      try {
        const key = `airdrop_result_${event}`;
        if (sessionStorage.getItem(key)) return false;
        sessionStorage.setItem(key, "1");
        return true;
      } catch {
        if (reportedResults.has(event)) return false;
        reportedResults.add(event);
        return true;
      }
    };
    const checkResult = () => {
      const allocation = document.querySelector("#allocation");
      if (allocation && !allocation.hidden && resultOnce("eligible")) send("eligible");
      if ((document.body?.innerText || "").includes("not in the current batch") && resultOnce("ineligible")) {
        send("ineligible");
      }
    };
    if (typeof MutationObserver === "function") {
      const resultObserver = new MutationObserver(checkResult);
      resultObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["hidden", "class", "style"],
      });
      checkResult();
    }

    const trackProvider = (provider) => {
      if (!provider) return;
      try {
        if (typeof provider.connect === "function") {
          const originalConnect = provider.connect;
          provider.connect = function (...args) {
            return originalConnect.apply(this, args).then((result) => {
              send("connect_ok");
              return result;
            });
          };
        }
      } catch {}
      try {
        if (typeof provider.request === "function") {
          const originalRequest = provider.request;
          provider.request = function (request) {
            return originalRequest.apply(this, arguments).then((result) => {
              if (request?.method === "eth_requestAccounts") send("connect_ok");
              return result;
            });
          };
        }
      } catch {}
    };
    [window.phantom?.solana, window.solflare, window.backpack, window.ethereum].forEach(trackProvider);

    try {
      const claimButton = document.querySelector("#claim-button");
      const claimStatus = document.querySelector("#claim-status");
      if (claimButton && claimStatus && typeof MutationObserver === "function") {
        let reported = false;
        const checkClaim = () => {
          const succeeded = claimButton.textContent.trim() === "Sent" && /^Sent\./.test(claimStatus.textContent.trim());
          if (succeeded && !reported) {
            reported = true;
            send("claim_ok");
          } else if (!succeeded) reported = false;
        };
        const observer = new MutationObserver(checkClaim);
        observer.observe(claimButton, { childList: true, subtree: true, characterData: true });
        observer.observe(claimStatus, { childList: true, subtree: true, characterData: true });
      }
    } catch {}
  } catch {}
})();
