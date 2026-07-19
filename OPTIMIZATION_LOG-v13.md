# v13 移动端适配与国际化修复 — 优化记录

> 日期：2026-07-19  
> 涉及版本：v13 → v13d  
> 标签：`移动端适配` `CSS 布局` `i18n 修复` `flex 调试`

---

## 背景

JSON Beautify 在 v13 版本引入了移动端 UI（通过 `data-device` 三元检测 + 单 DOM 双视图架构）。部署后用户反馈两个问题：

1. **屏幕适配崩溃** — 移动端工具栏按钮在真实 iPhone 上溢出，右侧「更多」按钮被裁切
2. **中英文切换不工作** — 移动端点击语言按钮后工具栏文字无变化

以下逐一记录根因分析、修复策略和验证过程。

---

## 问题一：移动端工具栏按钮溢出

### 症状

四个按钮（格式化 / 压缩 / 复制 / 更多）在 iPhone 上等宽排列时，右侧「更多」按钮的右边界被视口裁切。

### 根因分析

**第 1 层：`overflow: hidden` 裁剪溢出**

```css
.mob-toolbar { overflow: hidden; }
```

容器设置 `overflow: hidden`，当内容溢出时直接裁切而非滚动。改为 `overflow-x: auto`，溢出时可水平滚动，用户可滚查看被裁切的内容。

**第 2 层：`box-sizing` 未统一**

部分按钮使用 `box-sizing: content-box`（浏览器默认），而其他使用 `border-box`。宽度计算方式不一致导致：
- `content-box`: `width + padding + border`
- `border-box`: `width = padding + border + content`

统一为 `box-sizing: border-box`，确保 `flex: 1` 分配的宽度包含 padding 和 border。

**第 3 层：flex items 默认 `min-width: auto`**

Flex items 的默认 `min-width` 值为 `auto`（非零），导致其无法收缩到内容最小宽度以下。结合 `white-space: nowrap`（按钮文字不换行），每个按钮的最小宽度等于其内容宽度（SVG + gap + 文字），阻止了 flex 等比收缩。

**解决方案：** 加 `min-width: 0` 覆盖默认行为。

```css
.mob-btn {
    flex: 1;
    min-width: 0;
}
```

**第 4 层（最难发现）：CSS 级联覆盖**

项目中存在 **两层** `.mob-btn` 的 CSS 规则：

```
/* 规则 A (我的修复) — 被后面的规则 B 覆盖 */
[data-device="mobile"] .mob-btn { padding: 6px 6px; }

/* 规则 B (更高/相同优先级，在后面) */
[data-device="mobile"] .mob-btn { padding: 6px 8px; }
```

此外还有：
- **规则 C：** `.mob-btn-primary` 的 `padding: 6px 8px`，覆盖了同时有 `mob-btn` 和 `mob-btn-primary` 的「格式化」按钮
- **规则 D：** `@media (max-width: 400px)` 内的独立规则，其 `padding: 6px 8px` 在窄屏下覆盖主规则

**教训：** 调试 CSS 溢出问题时，必须检查**所有**匹配同一元素的规则，包括：
- 同一选择器在 CSS 不同位置的重复定义
- 不同选择器但作用于同一元素（如 `.mob-btn` vs `.mob-btn-primary`）
- 媒体查询内的覆盖规则
- `getComputedStyle` 与 stylesheet 的差异

**第 5 层：padding 不一致**

`.mob-btn-primary` 的 `padding: 6px 8px` 比 `.mob-btn` 的 `6px 6px` 多 4px 水平空间（左右各多 2px），导致「格式化」按钮比其他按钮宽，累积溢出。

**解决方案：** 统一所有按钮 padding 为 `padding: 6px`（简写，即四边各 6px）。

### 修复措施汇总

| 修改 | 路径 | 作用 |
|------|------|------|
| `overflow: hidden` → `overflow-x: auto; overflow-y: hidden` | `.mob-toolbar` | 允许溢出时滚动，裁切变为安全网 |
| `box-sizing: border-box` | `.mob-btn`, `.mob-btn-primary` | 统一宽度计算模型 |
| `min-width: 0` | `.mob-btn`, `.mob-btn-primary`, `@media` | 允许 flex 收缩至内容以下 |
| `padding: 6px`（统一） | 所有 `.mob-btn` 规则 | 消除填充不一致 |
| `gap: 3px`（从 5px 减少） | `.mob-btn` | 减少按钮内元素间距 |
| 窄屏 `padding: 6px 4px` | `@media (max-width: 400px)` | 极小屏额外紧缩 |

---

## 问题二：中英文切换不工作

### 症状

移动端点击语言切换按钮（中文/English/中），桌面工具栏文字正常切换，但移动端工具栏按钮文字不更新。

### 根因分析

项目使用 `I18N` 对象实现国际化，通过 `data-i18n="key"` 属性绑定元素，`setLang()` 方法遍历所有 `[data-i18n]` 元素并更新 `textContent`。

**根因 1：页面加载时未触发初始化翻译**

`DOMContentLoaded` 事件处理函数中从未调用过 `setLang()`，导致首次加载时 `data-i18n` 元素保持 HTML 中的硬编码值（中文「格式化」「压缩」「复制」「更多」）。语言偏好（从 localStorage 读取）被忽略，英文模式也不生效。

**解决方案：** 在 `DOMContentLoaded` 末尾添加：

```javascript
i18n.setLang(i18n._lang);
```

**根因 2：移动端语言按钮通过冗余间接函数调用**

移动端语言按钮的 `onclick` 指向 `toggleMobileLang()`，该函数：
1. 读取 `window.i18n._lang`
2. 调用 `handleMobileLang(next)`  
3. `handleMobileLang` 调 `i18n.setLang(val)` + 更新标签

但 `window.i18n` 对 `const i18n` 变量不可访问（`const` 不挂到 `window`），导致第一步失败。

**解决方案：** 按钮直接调用：

```html
<button onclick="i18n.setLang(i18n._lang === 'zh' ? 'en' : 'zh')">
```

### 修复措施汇总

| 修改 | 作用 |
|------|------|
| `DOMContentLoaded` 内加 `i18n.setLang(i18n._lang)` | 首次加载即应用保存的语言 |
| 移动端语言按钮 `onclick` 改为直接 `i18n.setLang()` | 绕过 `toggleMobileLang`→`handleMobileLang` 间接层 |

---

## 验证方法

### 1. 浏览器开发者工具

- 强制 `data-device="mobile"` 查看移动端布局
- `getComputedStyle(el)` 检查实际 padding、flex 属性
- `document.styleSheets[i].cssRules[j]` 遍历所有 CSS 规则确认级联

### 2. 线上部署验证

- 部署后通过 `curl | grep` 确认 HTML 内容更新
- 使用 `browser_console` 执行 JavaScript 验证 i18n 切换
- 截图 + 视觉模型（ArkCode doubao-seed-2.0-lite）分析布局

### 3. 一致性校验

- 所有 5 个部署目标（`main/` + `appstore/`）× 2 层位置，SHA 一致
- `deploy_v13b.py` 内置 SHA 验证，所有目标 SHA 相同才算成功

---

## 关键教训

### CSS 布局

1. **Flexbox overflow debug checklist:**
   - [ ] `overflow` 是 `hidden` 还是 `auto`？
   - [ ] `box-sizing` 是否统一？
   - [ ] Flex items 是否有 `min-width: 0`？（默认 `auto` 阻止收缩）
   - [ ] 同一选择器是否在 CSS 中被重复定义（级联覆盖）？
   - [ ] 不同选择器（如 `.class` vs `.parent .class`）是否作用于同一元素？
   - [ ] `@media` 内是否有覆盖规则？
   - [ ] 伪类（`:active`）或子元素选择器（`svg`、`span`）是否间接影响布局？

2. **`getComputedStyle` 是最终真相** — 不一定等于 stylesheet 中的值。用 `Object.defineProperty` 无法骗过真实设备视口。

3. **`min-height: 40px` 配合 flex 时要注意** — 它可能阻止 flex items 收缩到预期高度以下。

### i18n

1. **`const` 变量不挂到 `window` 对象** — `window.i18n` = undefined。通过 `window.` 调用时必须用 `var I18N` 或显式挂载。
2. **初始化即应用** — 任何 i18n 系统都应在 DOM 就绪时立即应用一次已保存的语言偏好。
3. **区分初始化错误和切换错误** — 首次加载不翻译 vs 点击不切换是不同问题。先检查初始化。

### 调试方法论

1. **从用户截图入手** — 视觉模型分析比猜测用户看到什么更可靠。
2. **先修复再诊断原理** — 真实设备上溢出时，先加 `overflow-x: auto` 保证可用性，再查根因。
3. **一级一级查级联** — CSS 问题很少是单规则导致的，通常是 3-5 层规则叠加的结果。
4. **每次只改一个变量，部署后验证** — 避免多变量同时修改导致根因不清晰。

---

## 附：CSS 级联诊断流程（适用于类似场景）

```
用户报告布局溢出
  ↓
获取截图 → 视觉模型分析具体溢出位置
  ↓
检查容器 overflow 属性 → 改为 auto 作为安全网
  ↓
检查 box-sizing 一致性 → 统一为 border-box
  ↓
对 flex items 加 min-width: 0
  ↓
用 document.styleSheets 遍历所有匹配规则
  ↓
检查 @media 内覆盖规则
  ↓
检查不同选择器作用于同一元素（如 .class1 vs .class1.class2）
  ↓
getComputedStyle 确认最终生效值
  ↓
部署 → 截图 → 再次验证
```
