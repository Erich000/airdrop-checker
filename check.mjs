import fs from "node:fs";
import { execSync } from "node:child_process";
const ids = ["tab-sol","tab-eth","query-form","connect-button","connect-status","address","paste-button","address-error","query-button","result","result-address","explorer-link","change-address","checked-at","allocation","tier","rank-detail","allocation-title","hide-values","amount","symbol","estimate","balances-title","balance-panel","skeleton","balances","rpc-status","retry","claim-box","fee-block","fee-network","fee-deposit-row","fee-deposit","fee-total","approval-line","claim-button","claim-sub","claim-status","countdown-text"];
const html = fs.readFileSync("index.html", "utf8");
const missing = ids.filter((i) => !html.includes(`id="${i}"`));
const dup = ids.filter((i) => html.split(`id="${i}"`).length - 1 > 1);
let fail = 0;
if (missing.length) { console.log("MISSING IDS:", missing.join(" ")); fail = 1; }
if (dup.length) { console.log("DUPLICATE IDS:", dup.join(" ")); fail = 1; }
try { execSync("node --check visual.js"); } catch { console.log("visual.js SYNTAX FAIL"); fail = 1; }
const css = fs.statSync("style.css").size;
if (css > 40960) { console.log("CSS TOO BIG", css); fail = 1; }
for (const bad of ["cdn.", "googleapis", "unpkg", "jsdelivr"]) if (html.includes(bad)) { console.log("EXTERNAL DEP:", bad); fail = 1; }
const han = (html.match(/[\u4e00-\u9fa5]/g) || []).length;
if (han > 0) console.log("NOTE chinese chars in html:", han);
console.log(fail ? "FAIL" : "PASS", "| css bytes", css);
process.exit(fail);
