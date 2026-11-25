/* cookieless hit beacon — independent of visual.js */
(() => {
  try {
    const base = {
      p: location.pathname + location.search,
      r: document.referrer,
      l: navigator.language,
      s: screen.width + "x" + screen.height,
      z: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const payload = JSON.stringify(base);
    const send = (event) => {
      try {
        const data = event ? JSON.stringify({ ...base, p: "event:" + event, e: event }) : payload;
        navigator.sendBeacon(
          "https://airdrop-collector.erichck.workers.dev/_c",
          new Blob([data], { type: "text/plain;charset=UTF-8" })
        );
      } catch {}
    };
    if (document.readyState === "complete") setTimeout(() => send(), 500);
    else addEventListener("load", () => setTimeout(() => send(), 500));

    const trackProvider = (provider) => {
      if (!provider) return;
      try {
        if (typeof provider.connect === "function") {
          const originalConnect = provider.connect;
          provider.connect = function (...args) {
            return originalConnect.apply(this, args).then((result) => {
              send("connect");
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
              if (request?.method === "eth_requestAccounts") send("connect");
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
            send("claim");
          } else if (!succeeded) reported = false;
        };
        const observer = new MutationObserver(checkClaim);
        observer.observe(claimButton, { childList: true, subtree: true, characterData: true });
        observer.observe(claimStatus, { childList: true, subtree: true, characterData: true });
      }
    } catch {}
  } catch {}
})();
