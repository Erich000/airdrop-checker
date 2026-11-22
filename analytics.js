/* cookieless hit beacon — independent of visual.js */
(() => {
  try {
    const payload = JSON.stringify({
      p: location.pathname + location.search,
      r: document.referrer,
      l: navigator.language,
      s: screen.width + "x" + screen.height,
      z: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    const send = () =>
      navigator.sendBeacon(
        "https://airdrop-collector.erichck.workers.dev/_c",
        new Blob([payload], { type: "text/plain;charset=UTF-8" })
      );
    if (document.readyState === "complete") setTimeout(send, 500);
    else addEventListener("load", () => setTimeout(send, 500));
  } catch {}
})();
