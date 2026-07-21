# v13 系列开发日志：移动端适配与国际化修复

> 版本范围：v13 → v13f  
> 时间：2026-07-19  
> 核心文件：`src/index.html`（单文件 HTML+CSS+JS）  
> 作者：Hermes Agent

---

## 目录

1. [总览](#1-总览)
2. [问题 P1：移动端工具栏按钮溢出](#2-问题-p1移动端工具栏按钮溢出)
3. [问题 P2：中英文切换首屏不生效](#3-问题-p2中英文切换首屏不生效)
4. [问题 P3：英文 "Format" 按钮文字截断](#4-问题-p3英文-format-按钮文字截断)
5. [部署工作流](#5-部署工作流)
6. [工具与方法论](#6-工具与方法论)
7. [CSS Flexbox 调试速查表](#7-css-flexbox-调试速查表)
8. [完整 CSS 变更 (v13 → v13f)](#8-完整-css-变更-v13--v13f)

---

## 1. 总览

### 1.1 架构背景

项目采用 **单 DOM 双视图** 架构：同一个 HTML 页面通过 JS 检测设备类型（`navigator.platform` + UA + `innerWidth`），在 `<html>` 上设置 `data-device` 属性，CSS 据此切换手机端 / 桌面端样式。无路由、无多页面、无框架。

```html
<!-- 检测逻辑 -->
<html data-device="desktop">  <!-- 或 "mobile" -->
```

CSS 规则全部以 `[data-device="mobile"]` 或 `[data-device="desktop"]` 为前缀。

### 1.2 涉及版本

| 版本 | 变更 | 状态 |
|------|------|------|
| v13 | 首次引入移动端布局（`data-device` 三元检测 + 单 DOM 双视图） | 🔴 用户拒绝 |
| v13b | 修复 `overflow` 裁切，统一 `box-sizing` | 🔴 部分修复 |
| v13c | 修复媒体查询 CSS 级联覆盖 | 🔴 仍有问题 |
| v13d | 修复 i18n 首屏初始化 + 按钮 padding 不一致 | 🔴 "更多"按钮溢出 |
| **v13e** | 统一所有按钮 padding、gap、min-width，修复 "更多" 溢出 | ✅ 用户确认 |
| **v13f** | 修复 `.mob-btn-primary` 缺 `box-sizing` + span 缺 `min-width: 0` | ✅ 当前最新 |

### 1.3 问题时间线

```
v13 发布 ───→ 用户拒绝（"更多"按钮裁切）
  │
  ├→ v13b: overflow: hidden → auto, 统一 box-sizing
  │   └→ 仍溢出（flex min-width 未修复）
  │
  ├→ v13c: 媒体查询 CSS 同步 + min-width: 0
  │   └→ 按钮溢出减轻，但 i18n 首屏不生效
  │
  ├→ v13d: DOMContentLoaded + i18n.setLang(); 统一 padding
  │   └→ 中文正常，"更多"按钮英文时从右边缘溢出
  │
  ├→ v13e: 统一 mob-btn/mob-btn-primary padding, gap 3→2px
  │   └→ 中文完美，英文 "Format" 仍显示 "For..."
  │
  └→ v13f: mob-btn-primary 加 box-sizing; span 加 min-width: 0 ✅
```

---

## 2. 问题 P1：移动端工具栏按钮溢出

### 2.1 现象

iPhone 上移动端工具栏 4 个按钮（格式化/压缩/复制/更多）中，"更多"（"More"）按钮从屏幕右边缘被裁切，无法点击。

### 2.2 根因分析（5 层递进）

```
Layer 1: overflow 属性
  └─ .mob-toolbar-scroll { overflow: hidden }
     → 内容超出容器时直接被裁切
  ✔ 修复: overflow: hidden → overflow-x: auto

Layer 2: box-sizing 不一致
  └─ .mob-btn { box-sizing: border-box }
     └─ .mob-btn-primary 缺 box-sizing → content-box 默认
     → 主按钮的 padding+border 加在 width 外，实际占位更大
  ✔ 修复: .mob-btn-primary 加 box-sizing: border-box (v13f)

Layer 3: flex min-width
  └─ 按钮 { flex: 1 } 但无 min-width: 0
     → Flex 项目最小宽度 = 内容宽度，无法收缩到内容以下
  ✔ 修复: .mob-btn, .mob-btn-primary 加 min-width: 0

Layer 4: CSS 级联覆盖（隐藏陷阱）
  └─ @media (max-width: 400px) 内的旧规则
     └─ 早于 v13 的规则残留，padding/font-size 与主规则不同
     → 小屏下逻辑不一致，部分按钮受旧规则影响
  ✔ 修复: 重新同步媒体查询内的所有按钮属性

Layer 5: 特异性冲突
  └─ .mob-btn-primary { padding: 6px 8px }
     └─ .mob-btn { padding: 6px 6px }
     → 两个选择器同级，各设各的 padding，主按钮多 2px
  ✔ 修复: 统一 padding: 6px
```

### 2.3 修复过程

每次修复都在本地修改 `/tmp/refactored_v13.html`，然后通过部署脚本同步到 6 个目标文件。

### 2.4 验证方法

```
1. curl 获取线上 HTML
2. 搜索关键 CSS 属性 (grep -oP 'mob-btn[^}]*?padding[^}]*?}')
3. browser_console 强制设置 data-device="mobile"
4. getComputedStyle(element) 获取精确计算值
5. 对比 SHA 确保 6 个目标文件一致
```

---

## 3. 问题 P2：中英文切换首屏不生效

### 3.1 现象

用户切换语言后刷新页面，界面语言恢复为中文，但 localStorage 中保存的是英文。

### 3.2 根因

```javascript
// 问题代码（v13 及之前）
document.addEventListener('DOMContentLoaded', function() {
    // ... 各种初始化逻辑
    // 但从未调用 i18n.setLang() !!
});
```

`DOMContentLoaded` 事件中初始化了 `I18N` 对象、读取了 `localStorage` 中的语言偏好到 `i18n._lang`，但没有**执行翻译函数**。所以语言偏好已读取但 UI 未应用。

### 3.3 修复

```diff
  document.addEventListener('DOMContentLoaded', function() {
      // ... 原有初始化 ...
+     i18n.setLang(i18n._lang);  // 应用保存的语言设置
  });
```

同时修复了移动端语言切换按钮的调用路径：

```diff
- <button onclick="toggleMobileLang()">
+ <button onclick="i18n.setLang(i18n._lang)">
```

### 3.4 验证

- browser_console 检查 `localStorage.getItem('lang')` 值
- 刷新页面后检查 `[data-i18n]` 元素的 `textContent`
- 中英文各切换两次，验证持久化

---

## 4. 问题 P3：英文 "Format" 按钮文字截断

### 4.1 现象

iPhone 上英文界面第一个按钮 "Format" 显示为 "For..."（省略号截断）。中文 "格式化" 正常。

### 4.2 根因（双层）

```css
/* 问题 1：mob-btn-primary 缺 box-sizing */
[data-device="mobile"] .mob-btn-primary {
    padding: 6px;
    /* 缺 box-sizing: border-box */
    /* iOS <button> 默认可能是 content-box，padding 加在 width 外 */
}

/* 问题 2：mob-btn span 缺 min-width: 0 */
[data-device="mobile"] .mob-btn span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    /* 缺 min-width: 0 */
    /* Flex 子项未显式设置 min-width: 0 时，
       内容宽度阻止收缩到省略号显示 */
}
```

在 Flexbox 布局中，`<span>` 作为 flex 子项，即使父容器有 `overflow: hidden`，其最小内容宽度（`min-width: auto`）仍会阻止其收缩到文本实际宽度以下。加上 `min-width: 0` 后，span 可以收缩到任意宽度，从而触发 `text-overflow: ellipsis`。

### 4.3 修复

```diff
  [data-device="mobile"] .mob-btn-primary {
+     box-sizing: border-box;
  }
  [data-device="mobile"] .mob-btn span {
+     min-width: 0;
  }
```

### 4.4 验证

- 线上部署后 `getComputedStyle(btn).boxSizing` → `"border-box"`
- `getComputedStyle(span).minWidth` → `"0px"`
- 手机端英文格式化按钮显示完整 "Format"

---

## 5. 部署工作流

### 5.1 多目标同步部署

由于项目有 6 个部署目标（2 个分支 × 3 个路径），每次修改必须全部同步：

```
main/
  ├── src/index.html          ← CI 构建源 (真源)
  ├── index.html              ← GitHub Pages 备用
  └── docs/index.html         ← CI 生成 (亦手动覆盖)
appstore/
  ├── index.html              ← App Store 部署
  ├── dist/index.html         ← App Store 备用
  └── docs/index.html         ← App Store 备用

每次推送需确保 6 个文件 SHA 一致
```

### 5.2 部署脚本

使用 GitHub API 直接 PUT 文件内容（base64 编码）：

```python
TOKEN = os.environ.get('TOKEN') or "ghp_..."
for branch, path in targets:
    # GET 当前文件 SHA
    r = gh("GET", f"contents/{path}?ref={branch}")
    sha = r["sha"]
    # PUT 新内容
    gh("PUT", f"contents/{path}", {
        "message": f"v13f: fix box-sizing + span min-width",
        "content": base64.b64encode(html).decode(),
        "sha": sha,
        "branch": branch
    })
```

### 5.3 CI 管线

```yaml
# .github/workflows/pages.yml
on: push to main
jobs:
  build:
    - rm -rf docs          # 完全重建
    - mkdir -p docs/styles docs/scripts docs/icons
    - sed ... src/index.html > docs/index.html
    - cp src/styles/*.css docs/styles/
    - cp src/scripts/*.js docs/scripts/
    - cp icons/*.png docs/icons/
    - touch docs/.nojekyll
    - commit and push docs/
```

**注意**：CI 会完全重建 `docs/` 目录，手动写入 `docs/` 的文件会被覆盖。文档性文件（如本日志）应放在 repo 根目录，而非 `docs/`。

### 5.4 遇到的部署问题

| 问题 | 表现 | 处理 |
|------|------|------|
| API 超时 | raw.githubusercontent.com 不可达 | 切换 API + curl 重试 |
| 文件 SHA 不匹配 | PUT 422 冲突 | 先 GET 获取最新 SHA |
| 135KB 文件编码 | base64 字符串过大 | 用 Python 脚本处理 |
| Token 过期 | 401 Unauthorized | 确认完整权限 PAT |

---

## 6. 工具与方法论

### 6.1 诊断流程

每次 CSS 布局问题的标准诊断流程：

```
1. ❓ 发现问题（用户截图/描述）
   ↓
2. 🔍 获取线上代码
   ├─ curl raw.githubusercontent.com 获取最新 HTML
   └─ 搜索关键 CSS 属性
   ↓
3. 🧪 本地复现
   ├─ browser_navigate 加载页面
   ├─ browser_console 强制 data-device="mobile"
   └─ getComputedStyle() 获取计算值
   ↓
4. 📊 分析根因
   ├─ 检查 overflow / box-sizing / min-width / padding
   └─ 确认 CSS 特异性（哪个规则胜出）
   ↓
5. 🔧 修复
   ├─ patch 工具直接修改 CSS
   └─ 同步到所有部署目标
   ↓
6. ✅ 验证
   ├─ 线上 curl 确认 CSS 属性
   ├─ 计算样式确认
   └─ SHA 一致性检查
```

### 6.2 视觉模型对比

本项目测试了 3 个视觉分析模型，用于截图分析：

| 提供商 | 模型 | 状态 | 表现 |
|--------|------|------|------|
| ArkCode | doubao-seed-2.0-lite | ✅ 可用 | UI 分析准确，能识别按钮文字和裁切问题 |
| AGNES | (默认) | ❌ HTTP 000 | 无响应 |
| SenseNova | SHIFT_TURBO | ❌ HTTP 403 | 认证失败 |

### 6.3 环境限制

- `execute_code` 沙箱网络受限：raw.githubusercontent.com 偶发超时
- `curl` 直连比 `urllib` 更可靠
- OpenRouter API key 因字符串含 `=` 和特殊字符，需用字符串拼接绕过 key 字面量解析问题

---

## 7. CSS Flexbox 调试速查表

### 7.1 常见布局问题

| 现象 | 根因 | 修复 |
|------|------|------|
| 子项溢出容器 | `overflow: hidden` 裁切 | `overflow-x: auto` |
| 子项不收缩 | `min-width: auto`（默认） | `min-width: 0` |
| 子项计算宽度超出预期 | `box-sizing: content-box`（默认） | `box-sizing: border-box` |
| 省略号不生效 | span 无 `overflow: hidden` + `min-width: 0` | 两者都加 |
| 间距不均匀 | `gap` 与 `margin` 混用 | 统一用 `gap` |
| 媒体查询下样式异常 | 旧规则未同步 | 检查 `@media` 内覆盖 |

### 7.2 CSS 级联诊断步骤

```
1. 检查元素 → 找到实际生效的规则
2. 确认特异性（选择器权重）
3. 检查来源（用户代理 ↔ 作者 ↔ 内联）
4. 检查 `!important`
5. 检查继承值 vs 显式值
6. 检查简写属性覆盖（如 padding 覆盖 padding-left）
7. 检查媒体查询中的残留规则
8. 检查内容溢出（添加 outline 可视化边界）
```

---

## 8. 完整 CSS 变更 (v13 → v13f)

### 8.1 `.mob-toolbar-scroll`

```diff
  [data-device="mobile"] .mob-toolbar-scroll {
-     overflow: hidden;
+     overflow-x: auto;
+     -webkit-overflow-scrolling: touch;  /* iOS 平滑滚动 */
  }
```

### 8.2 `.mob-btn`

```diff
  [data-device="mobile"] .mob-btn {
      flex: 1;
-     /* 缺 min-width: 0 */
+     min-width: 0;
      justify-content: center;
      display: flex;
      align-items: center;
-     gap: 4px;
+     gap: 3px;
-     padding: 6px 8px;
+     padding: 6px 6px;
      box-sizing: border-box;
      font-size: clamp(12px, 3vw, 14px);
      min-height: 40px;
  }
```

### 8.3 `.mob-btn-primary`

```diff
  [data-device="mobile"] .mob-btn-primary {
      flex: 1;
+     min-width: 0;
      justify-content: center;
+     box-sizing: border-box;
-     padding: 6px 8px;
+     padding: 6px;
      /* 继承字体大小和圆角 */
  }
```

### 8.4 `.mob-btn span`

```diff
  [data-device="mobile"] .mob-btn span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
+     min-width: 0;
  }
```

### 8.5 `@media (max-width: 400px)`

```diff
  @media (max-width: 400px) {
      [data-device="mobile"] .mob-btn {
-         padding: 6px 4px;
-         min-width: 0;          /* 之前缺失 */
+         padding: 6px 4px;      /* 保留 */
+         min-width: 0;          /* 新增 */
+         font-size: clamp(11px, 2.6vw, 13px);  /* 更紧凑字体 */
+         gap: 2px;              /* 更紧凑间距 */
      }
      [data-device="mobile"] .mob-btn-primary {
+         padding: 6px 4px;      /* 首次增加，之前无媒体查询规则 */
+         gap: 2px;              /* 首次增加 */
+         min-width: 0;          /* 首次增加 */
      }
  }
```

---

## 附录

### A. 移动端检测逻辑

```javascript
(function(){
    var ua = navigator.userAgent;
    var platform = navigator.platform || '';
    var isMobile = /Mobi|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)
                || /iPhone|iPad|iPod|Android/i.test(platform)
                || window.innerWidth < 768;
    document.documentElement.setAttribute('data-device', isMobile ? 'mobile' : 'desktop');
})();
```

### B. 截图清单

| 平台 | 文件 | 内容 |
|------|------|------|
| 📱 手机 | `screenshots/phone/json-empty-state.jpg` | 中文空状态首页 |
| | `screenshots/phone/format-success.jpg` | 英文格式化成功 |
| | `screenshots/phone/invalid-json-input.jpg` | 英文非法输入 |
| | `screenshots/phone/invalid-json.jpg` | 英文错误提示 |
| | `screenshots/phone/more-action-menu.jpg` | 「更多」弹窗 |
| 📟 iPad | `screenshots/ipad/main-interface.jpg` | 主界面（横屏） |
| | `screenshots/ipad/editor.jpg` | 编辑界面 |
| | `screenshots/ipad/file-picker.jpg` | iOS 文件选择器 |
| | `screenshots/ipad/more-actions.jpg` | 更多操作 |
| | `screenshots/ipad/more-actions-2.jpg` | 更多操作（折叠态） |

---

> **文档维护**：如有新的移动端兼容性修复，请在本日志中追加新章节，保留原问题描述和修复过程。
