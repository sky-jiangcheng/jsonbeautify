# Tauri + 静态前端项目优化清单

本文档总结 JSON 格式化工具项目在开发、CI/CD、安全、UI 等方面踩过的坑和最终方案，可直接复用到其他类似项目。

---

## 1. CI/CD：GitHub Actions 多平台 Release 构建

### 1.1 权限配置

Release 构建需要上传产物到 Release，必须显式声明权限：

```yaml
permissions:
  contents: write   # 允许创建 Release 和上传 assets
```

遗漏此项会导致 `tauri-action` 上传产物时 403。

### 1.2 Linux 系统依赖

ubuntu runner 缺少 Tauri 编译依赖，需手动安装：

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libglib2.0-dev
```

常见遗漏：`libglib2.0-dev`、`librsvg2-dev`（图标生成需要）、`patchelf`（AppImage 需要）。

### 1.3 macOS 多架构

macOS 需要同时支持 Intel 和 Apple Silicon：

```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
npx tauri icon src-tauri/icons/icon.png   # CI 中需重新生成 .icns
```

Tauri action 参数：`--target universal-apple-darwin --bundles dmg,app`

### 1.4 Windows 打包策略

Wix 工具链（MSI）极不稳定，频繁报错。**推荐仅使用 NSIS**：

```yaml
args: --bundles nsis
```

NSIS 产物为 `.exe` 安装包，满足绝大多数分发场景。如需 MSI，建议在本地 Windows 环境手动构建。

### 1.5 资源缓存

`npm ci` 优于 `npm install`（更快、确定性构建）。Node 版本锁定为 20（Tauri v2 兼容性最佳）。

### 1.6 完整模板

```yaml
name: Release Build

on:
  push:
    tags: ['v*']
  workflow_dispatch:

permissions:
  contents: write

jobs:
  linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install system dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libglib2.0-dev
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - uses: tauri-apps/tauri-action@v0
        env: { GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "${{ github.ref_name }}"
          releaseDraft: false
          prerelease: false
          args: --bundles deb,rpm,appimage

  macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - run: rustup target add x86_64-apple-darwin aarch64-apple-darwin
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx tauri icon src-tauri/icons/icon.png
      - uses: tauri-apps/tauri-action@v0
        env: { GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "${{ github.ref_name }}"
          releaseDraft: false
          prerelease: false
          args: --target universal-apple-darwin --bundles dmg,app

  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - uses: tauri-apps/tauri-action@v0
        env: { GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "${{ github.ref_name }}"
          releaseDraft: false
          prerelease: false
          args: --bundles nsis
```

---

## 2. Tauri v2 桌面应用

### 2.1 macOS App Store 上架准备

**Entitlements.plist**（`src-tauri/Entitlements.plist`）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
```

**App Store 专用配置**（`src-tauri/tauri.appstore.conf.json`）：在 `tauri.conf.json` 基础上覆盖 identifier（加 `.appstore` 后缀区分），并引用 Entitlements。

### 2.2 图标规范

- **macOS**：图标需预留约 **12% 透明边距**，避免在 Dock 中视觉过大
- **尺寸**：16x16、32x32、64x64、128x128、256x256、512x512（PNG）+ icon.icns + icon.ico
- **生成命令**：`npx tauri icon <source-png>`，CI 中亦需执行
- 源图推荐 1024x1024 PNG

### 2.3 分支策略：免费版 vs 收费版

如果同一代码库需要维护两个分发版本（如开源免费版 + App Store 收费版）：

**分支角色**：
- `main` 分支：免费开源版
- `appstore` 分支：收费版

**推荐策略：共享基础配置 + 合并配置覆盖**

`tauri.conf.json` 在两分支中保持一致（免费版 identifier），`appstore` 分支额外提供 `tauri.appstore.conf.json`，通过 Tauri 的 config merge 机制覆盖差异化字段。

`tauri.appstore.conf.json` 内容：

```json
{
  "identifier": "com.example.app.appstore",
  "bundle": {
    "macOS": {
      "entitlements": "./Entitlements.plist"
    }
  }
}
```

**构建命令区分**：

```bash
# 免费版
npm run tauri build

# 收费版（合并 appstore 配置覆盖 identifier + entitlements）
npm run tauri build -- --config src-tauri/tauri.appstore.conf.json
```

**同步流程**：

```bash
# 在 main 上开发，完成后同步到 appstore
git checkout appstore
git merge main
git push origin appstore
```

**为什么用合并配置而不是直接改 `tauri.conf.json`**：
- main 和 appstore 的 `tauri.conf.json` 保持完全一致，减少合并冲突
- identifier 覆盖逻辑集中在 `tauri.appstore.conf.json` 一个文件中
- 不参与免费版构建，构建产物天然不带 App Store 标记
- 新开发者只需看 `tauri.appstore.conf.json` 就能理解两个版本的全部差异

注意 `tauri.appstore.conf.json` 中的 `identifier` 必须与免费版不同（如加 `.appstore` 后缀），否则 Apple 会视为同一应用。

### 2.4 macOS App Store 上架流程

#### 前置条件（一次性）

**1. Apple Developer Program**
注册 [developer.apple.com](https://developer.apple.com)，年费 $99。

**2. 创建 App ID**
[Apple Developer Account](https://developer.apple.com/account) → Certificates, Identifiers & Profiles → Identifiers → +：
- 类型：App
- Bundle ID：`com.jsonbeautify.desktop.appstore`

**3. 创建分发证书**
Certificates → + → Developer ID Application，用本地 Keychain Access 生成 CSR 上传，下载 `.cer` 安装。

**4. 创建 Provisioning Profile**
Profiles → + → App Store，关联 App ID + 证书，下载后放入 `src-tauri/` 目录，更新 `tauri.appstore.conf.json` 中的 `embedded.provisionprofile` 路径。

**5. App Store Connect 创建 App**
[appstoreconnect.apple.com](https://appstoreconnect.apple.com) → 我的 App → +：
- 平台：macOS
- Bundle ID：上面创建的
- 名称："JSON 格式化工具"

#### 构建与上传

```bash
# 1. 切换到 appstore 分支
git checkout appstore

# 2. 构建（使用合并配置覆盖 identifier + entitlements）
npm run tauri build -- --config src-tauri/tauri.appstore.conf.json

# 3. 产物在 src-tauri/target/release/bundle/macos/
#    使用 Transporter 或 xcrun 上传到 App Store Connect
xcrun altool --upload-app \
  -f src-tauri/target/release/bundle/macos/*.pkg \
  -t macos \
  -u <AppleID> \
  -p <App-Specific-Password>
```

#### App Store Connect 填写元数据

上传后在 App Store Connect 补全：
- 应用截图（macOS 需要 1280x800、1440x900、2560x1600、2880x1800 至少一套）
- 描述、关键词、技术支持 URL、隐私政策 URL
- 定价（选择价格或免费）

#### 提审

所有信息填写完毕后，点击"提交审核"。首次审核通常 1-2 天。

#### 注意事项

- **Entitlements 权限最小化**：只申请应用实际使用的权限（本项目仅需读取/写入用户选择的文件）
- **App Sandbox 强制开启**：`com.apple.security.app-sandbox` 必须为 `true`，这是 App Store 上架的硬性要求
- **CI 无法全自动**：签名证书和 provisionprofile 存储在 CI Secrets 中可实现自动构建，但首次上传和提审仍需人工操作
- **版本号每次递增**：提交新版本前确保 `tauri.conf.json` 和 `Cargo.toml` 中 version 已更新

---

## 3. 前端安全

### 3.1 toast/通知的 XSS 防护

任何将用户可控数据插入 DOM 的 `innerHTML` 操作都是 XSS 向量。常见入口：

| 来源 | 示例 | 风险 |
|------|------|------|
| 用户输入 | 文件名输入框 | 高 |
| localStorage | 历史记录名称 | 中 |
| 文件上传 | 上传文件文件名 | 高 |
| URL 参数 | `?name=xxx` | 中 |

**修复**：对插入 toast/通知的字符串做 HTML 转义：

```javascript
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(msg) {
  toast.innerHTML = escapeHtml(msg);
  // ...
}
```

检查清单：全局搜索 `innerHTML` / `insertAdjacentHTML`，确认每个调用点的数据来源是否可能包含用户输入。

---

## 4. UI/UX 优化

### 4.1 错误提示策略

不要在输入区实时显示详细错误信息（干扰性强）。采用两级策略：

- **输入区**：仅显示红/绿状态指示器（圆点），表示 JSON 有效/无效
- **输出区**：点击"格式化"后，在输出区显示具体错误信息和位置

这避免了用户边输入边看到错误弹跳的焦虑感，同时保证需要时能获取完整诊断信息。

### 4.2 深色/浅色模式对比度

浅色和深色模式需要独立的色值方案，不能简单反色。参考 GitHub 官方配色：

- 浅色：文字 `#1F2328`，背景 `#FFFFFF`，注释 `#6E7781`
- 深色：文字 `#E6EDF3`，背景 `#0D1117`，注释 `#8B949E`

关键检查点：
- 错误/警告色在两种模式下对比度均 >= 4.5:1
- 代码高亮在深色模式下不能过亮（刺眼）或过暗（不可读）
- 使用 Chrome DevTools 的 CSS Overview 面板检查对比度

### 4.3 输入区 debounce 防抖

JSON 验证使用 debounce（本项目 400ms），避免每次按键都触发解析，减少不必要的高亮闪烁。

---

## 5. 版本管理与发布流程

### 5.1 版本号一致性

当前版本号需要同步以下位置：

- `package.json` → `version` 字段
- `src-tauri/tauri.conf.json` → `version` 字段
- `src-tauri/Cargo.toml` → `version` 字段
- `index.html` → 页面显示的版本号
- Git tag → `vX.Y.Z` 格式

建议使用脚本统一更新（`npm version` + sed 批量替换），或 CI 中从 tag 自动注入。

### 5.2 Tag 清理

废弃的 tag（如构建失败的中间版本）应及时删除，避免 Release 列表混乱：

```bash
# 删除远程 tag
git push origin :refs/tags/v1.2.2

# 删除本地 tag
git tag -d v1.2.2
```

**原则**：每个 tag 应对应一个成功的 Release，无对应 Release 的 tag 应清理。

### 5.3 Workflow Badge 与 Trigger 对齐

GitHub Actions badge 显示的是**默认分支（main）**上该 workflow 的最新状态。

如果 workflow 仅在 tag 推送时触发，main 分支上无运行记录，badge 会显示 failed/no status。

**修复方案**：
1. 改用其他常驻运行的 workflow badge（如 GitHub Pages deploy）
2. 或添加 `push: branches: [main]` 触发器 + 条件跳过实际构建

本项目选择了方案 1。

---

## 6. GitHub Pages 部署

### 6.1 纯静态站点部署

使用官方 `actions/configure-pages` + `actions/deploy-pages` 组合：

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: "pages"
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with: { path: '.' }
      - uses: actions/deploy-pages@v4
```

注意 `upload-pages-artifact` 的 `path` 指向站点根目录（本项目即仓库根目录）。

### 6.2 PWA 支持

纯静态项目可添加 PWA 支持，只需 3 个文件：

- `manifest.json`：应用名称、图标、主题色
- `sw.js`：Service Worker（缓存策略）
- `index.html` 中注册：`<link rel="manifest">` + `<script>` 注册 SW

---

## 快速自查清单

开始一个新 Tauri + 静态前端项目时，逐项检查：

- [ ] CI 中 `permissions: contents: write` 已设置
- [ ] Linux 构建安装了全部 5 个系统依赖
- [ ] macOS 构建添加了两个 Rust target + 图标生成步骤
- [ ] Windows 构建仅使用 NSIS
- [ ] 所有 `innerHTML` 调用点已审计、用户输入已转义
- [ ] 深色/浅色模式色值已独立定义（非简单反色）
- [ ] 版本号在 5 个位置保持一致
- [ ] Workflow badge 指向的 workflow 在 main 分支有成功运行
- [ ] 图标预留 12% 边距、多尺寸完整
- [ ] macOS App Store 版本与开源版 identifier 已区分
