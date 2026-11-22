# RESULT — ui/codex

状态：完成，待验收。

## 改动（全部视觉层，app.js 未动）
1. 桌面断点：≥768 收窄到 680，≥1024 收 720，标题 46px，卡片内边距 32px
2. 结果区地址上方新增 `Checked address` 小标签
3. 档位徽章加前置绿点（inline-flex）
4. 领取按钮加 → 与 hover 位移
5. `.link-button` / `.hide-toggle` hover 态
6. footer 新增免责声明
7. `scroll-behavior: smooth` + reduce-motion 回退
8. 输入框字号 16px（防 iOS 聚焦缩放）

## 自检
- `node check.mjs` → PASS（38 id 齐全、无重复、CSS 17.6KB）
- `node --check visual.js` → 通过
- 320/375/430/1200 四档 scrollWidth === clientWidth，无横向溢出
- 截图见 `shots/`

## 备注
- Codex 在开放式整包里会退化成"评审"不动手，本轮拆成 8 条微指令；其中 2 条超时由 Hermes 直接补
- `.balance-grid dd.is-zero` 规则已加，但 app.js 不打这个 class，当前为空挂
