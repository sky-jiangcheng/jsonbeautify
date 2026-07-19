# JSON 格式化工具

一个现代化的 JSON 格式化与验证工具，纯前端单文件实现，支持桌面端、iOS 与网页端。

**在线使用**: https://sky-jiangcheng.github.io/jsonbeautify/

## 截图

### 手机端 (Phone)

| 首页空状态 | 格式化结果 | 非法输入 |
|------------|-----------|----------|
| ![空状态](screenshots/phone/json-empty-state.jpg) | ![格式化成功](screenshots/phone/format-success.jpg) | ![非法输入](screenshots/phone/invalid-json-input.jpg) |

| 错误提示 | 更多操作 |
|----------|---------|
| ![错误提示](screenshots/phone/invalid-json.jpg) | ![更多操作](screenshots/phone/more-action-menu.jpg) |

### iPad (竖屏)

| 界面 1 | 界面 2 | 界面 3 | 界面 4 |
|--------|---------|---------|---------|
| ![screen-01](screenshots/ipad-portrait/screen-01.png) | ![screen-02](screenshots/ipad-portrait/screen-02.png) | ![screen-03](screenshots/ipad-portrait/screen-03.png) | ![screen-04](screenshots/ipad-portrait/screen-04.png) |

> 截图源文件见 `screenshots/`。App Store 交付包（`appstore-screenshots/`、`ipad-screenshots/`）由 `scripts/` 下脚本生成，详见 [screenshots/README.md](screenshots/README.md)。

## 功能

### JSON 处理
- **格式化** — 2 空格缩进，语法高亮，可交互的 collapsible 树形视图
- **压缩** — 单行紧凑输出
- **转义** — JSON 字符串转义/反转义
- **自动修复** — 缺失括号时自动补全，未加引号的键名自动修复
- **实时验证** — 红/绿灯指示 JSON 有效性（400ms 防抖）

### 交互式 JSON 树
- 对象/数组节点可展开/折叠（`▼` / `▶` 切换）
- 折叠时显示节点摘要（`{3 键}` / `[5 项]`）
- 行号列同步滚动

### 列表/详情视图
- 数组类型 JSON 自动切换为左右分栏模式
- 左侧列表项带预览摘要，点击切换右侧详情
- 列表面板可折叠

### JSON 对比
- 结构化递归比对（非文本行比对），按键/索引匹配
- 差异高亮：绿色 = 新增，红色 = 删除，黄色 = 修改
- 左右双树独立渲染，保留展开/折叠交互
- 滚动同步，支持交换左右

### 历史记录
- 格式化后可保存到本地历史（localStorage）
- 点击加载历史记录并自动格式化
- 最多同时选中 2 条进行对比
- 侧边栏可折叠

### 主题切换
- 暗色模式（GitHub Dark）
- 亮色模式（GitHub Light）
- 偏好存入 localStorage，刷新保持

### 快捷键

| 快捷键 | 操作 |
|--------|------|
| `Ctrl+Enter` | 格式化 |
| `Ctrl+S` | 保存到历史 |
| `Ctrl+D` | 下载 JSON 文件 |
| `Escape` | 关闭弹窗/对比视图 |

macOS 上使用 `Cmd` 替代 `Ctrl`。

### 拖放
支持拖拽 `.json` 文件到输入区域自动加载并格式化。

## 桌面应用与 iOS (Tauri + Capacitor)

支持打包为原生桌面应用与 iOS App。推送 `v*` tag 后由 CI（`release.yml`）自动构建并上架：
- **桌面端**：macOS / Windows / Linux 安装包
- **App Store**：macOS App Store 与 iOS App Store 上架构建

[![Deploy Status](https://github.com/sky-jiangcheng/jsonbeautify/actions/workflows/pages.yml/badge.svg)](https://github.com/sky-jiangcheng/jsonbeautify/actions/workflows/pages.yml)

### 本地构建

**依赖**:
- [Rust](https://rustup.rs/)
- [Node.js](https://nodejs.org/)
- Linux: `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libglib2.0-dev librsvg2-dev`
- macOS: Xcode Command Line Tools
- Windows: Microsoft Visual Studio C++ Build Tools + WebView2

**构建**:
```bash
npm install
npm run build
```

产物在 `src-tauri/target/release/bundle/` 目录。

## 技术栈

- 纯 HTML/CSS/JavaScript，无框架依赖
- 语法高亮: highlight.js
- 存储: localStorage
- 桌面端: Tauri v2 (Rust)
- iOS 端: Capacitor / Tauri iOS

## 部署

纯静态站点，部署到任意托管服务：

```bash
# 本地预览 (由 src/index.html 提供)
npm run preview
```

已部署于 GitHub Pages: https://sky-jiangcheng.github.io/jsonbeautify/

> 部署源 `docs/` 由 CI（`pages.yml`）从 `src/index.html` 自动生成，无需手动维护。

## 文件结构

```
src/index.html               — Web 应用唯一源码真源 (HTML + CSS + JS 单文件)
src/                        — Web 静态资源 (CSS / JS)
scripts/                    — 构建与工具脚本 (build.js, bump-version.js, check-versions.js, 截图生成等)
src-tauri/                 — Tauri v2 桌面应用 (Rust, macOS/Windows/Linux)
ios/                       — iOS 工程 (Capacitor / Tauri iOS)
capacitor.config.json       — iOS / Capacitor 配置
docs/                       — GitHub Pages 部署源 (由 src/index.html 经 CI 生成)
screenshots/               — 截图源文件 (phone/ 与 ipad-portrait/) 及说明 README
appstore-screenshots/       — iPhone 截屏交付包 (gitignore, 由脚本生成)
ipad-screenshots/          — iPad 截屏交付包 (gitignore, 由脚本生成)
.github/workflows/          — CI/CD (GitHub Pages 部署 + Release / App Store 上架)
CONTRIBUTING.md            — 项目规范 (目录归属 / 构建链路 / 版本 / 提交约定)
LICENSE                     — MIT 许可证
```

> 注意：`src/index.html` 是网页唯一真源；`docs/index.html` 与 `dist/` 均为 CI / 构建生成产物，请勿手动编辑。

## 开发规范

项目约定（目录归属、构建链路、资源单一真源、版本一致性与提交规范）见 **[CONTRIBUTING.md](CONTRIBUTING.md)**。
