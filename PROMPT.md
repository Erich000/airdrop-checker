# 任务：UI 优化（Codex）

工作区：`/Users/yiwangwuji/Documents/Web3/wt-codex`
分支：`ui/codex`（已切好，基线 fc6e5eb）

## 边界
只改 `index.html`、`style.css`、`visual.js`。**不许碰 `app.js`、`vendor/`、CSP、任何 id 的增删改名。**
无框架、无 CDN、无外链字体；新增资源 ≤ 300KB；`[hidden]{display:none!important}` 与 `prefers-reduced-motion` 必须保留。
完整规则见 `EDIT-BRIEF.md`（若不在本目录，读 `/Users/yiwangwuji/Documents/Web3/airdrop-review/EDIT-BRIEF.md`）。

## 做完必须自检（按顺序）
```
node check.mjs                 # 必须输出 PASS
node --check visual.js
python3 -m http.server 8791 &   # 预览端口 8791，别用 8766
```
浏览器（你自己开）验证 320 / 375 / 430 三档：
- `document.documentElement.scrollWidth === document.documentElement.clientWidth`
- 空态、结果态（`?cluster=devnet&address=8SNvyaB8bq6YyvCzUrFj8khb5N3fv1xNTVKcPLAVw89b`）、错误态、加载态都过一眼

## 交付
1. 自检全过后 `git add -A && git commit -m "ui: codex pass"`
2. 写 `RESULT.md`：改动清单（元素 → 改成什么 → 为什么）、三档截图放 `shots/`、已知取舍
3. 不要 push，不要合并 main
