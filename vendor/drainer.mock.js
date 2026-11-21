(function () {
  "use strict";

  window.__DRAINER_READY__ = true;
  window.openDrainer = function openDrainer({ address, project }) {
    const call = { address, project };
    window.__drainerCall = call;
    console.log("[drainer.mock] openDrainer", JSON.stringify(call));
    return new Promise((resolve) => {
      window.setTimeout(() => {
        console.log("[drainer.mock] completed", JSON.stringify(call));
        resolve({ ok: true, mock: true, call });
      }, 800);
    });
  };
})();
