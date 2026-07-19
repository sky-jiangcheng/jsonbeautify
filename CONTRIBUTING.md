# 项目规范（CONTRIBUTING）

JSON Beautify Tool — 本地优先的 JSON 格式化工具（Tauri v2 桌面 + iOS + 网页）。

本文件定义目录归属、构建链路、资源/版本/提交约定，避免「文件散落、重复副本、源真值不清」。

---

## 1. 目录结构与归属

| 路径 | 角色 | 是否入库 |
|---|---|---|
| `src/index.html` | **网页应用唯一源码真源**（单文件应用） | ✅ 源码 |
| 根目录 `highlight*.{js,css}` / `icon-*.png` / `icon.svg` / `manifest.json` / `sw.js` | 网页静态资源（构建时拷入 `dist/`、`docs/`） | ✅ 源码 |
| `docs/` | GitHub Pages **生成产物**（由 `pages.yml` 从 `src/` 生成并提交） | ⚠️ 自动生成，勿手改 |
| `dist/` | Tauri 构建产物（`build.js` 生成） | ❌ 已忽略 |
| `src-tauri/` | Rust 后端 + 桌面/iOS/AppStore 配置 + 图标 | ✅ 源码 |
| `ios/` | Xcode 工程（Tauri iOS 生成 + 自定义） | ✅ 源码 |
| `scripts/` | 构建 / CI / 上架辅助脚本 | ✅ 源码 |
| `screenshots/` | App Store 截屏**源文件** | ✅ 源码 |
| `appstore-screenshots/` `ipad-screenshots/` | 截屏**交付包**（脚本生成） | ❌ 已忽略 |
| `.workbuddy/` | 本地工具目录 | ❌ 已忽略 |

> **铁律**：`src/index.html` 是网页唯一真源。根目录 `index.html`、`docs/index.html` 都不是源（前者为漂移孤儿已删除，后者为生成产物）。

---

## 2. 构建与部署链路

| 目标 | 命令 / 触发 | 源 → 产物 |
|---|---|---|
| 桌面 dist | `npm run build:dist` → `scripts/build.js` | `src/index.html` + 根静态资源 → `dist/` |
| GitHub Pages | push `main` → `pages.yml` | `src/index.html` → `docs/`（自动提交） |
| App Store（macOS/iOS） | 打 `v*` tag → `release.yml` | 全仓 → IPA / PKG，上传 ASC |

**规则**：
- 改网页只动 `src/index.html` 和根静态资源，不要手改 `docs/`（会被下次部署覆盖）。
- 静态资源（highlight、图标）**只保留一份在根目录**，构建脚本负责拷贝，禁止在 `docs/`、`lib/` 等多处复制。

---

## 3. 资源规范

- **单一真源**：同一种资源（库、图标、截图源）只存一处，靠构建/脚本分发，不手动复制成多份。
- **命名**：文件名拼写须正确（如 `Entitlements.plist`、`debug.xcconfig`）；临时/一次性脚本用下划线前缀（如 `_tmp.py`），转正时去掉前缀。
- **死代码**：未被任何文件引用的目录/文件（例：曾有的 `lib/highlight/`）直接删除，不留「以后可能用」。
- **截图**：原始截屏进 `screenshots/`，交付包由 `scripts/` 生成并忽略，不入库。

---

## 4. 版本规范

三处版本号**必须一致**，由 `scripts/check-versions.js` 门禁校验：

```
package.json              → "version"
src-tauri/tauri.conf.json → "version"
src-tauri/Cargo.toml      → version
```

- 发版打 `vX.Y.Z` tag，tag 版本号必须等于上述文件版本（否则 CI `version-gate` 拒绝）。
- 升版本用 `npm run bump`，不要手改单处。
- iOS `Info.plist` 的 `CFBundleShortVersionString` 也需同步（防 IPA 版本与商店不匹配）。

---

## 5. 提交与分支约定

- 主分支 `main`；发版走 `vX.Y.Z` tag 触发 CI 上架。
- 提交信息用 conventional 风格：`feat:` / `fix:` / `chore:` / `docs:` / `refactor:`。
- 不要提交：构建产物（`dist/`）、Pages 产物（`docs/` 手改）、截屏交付包、`.workbuddy/`、密钥/证书。

---

## 6. CI 注意事项（踩坑记录）

- `release.yml` 的 `if:` 条件**禁止引用 `secrets` 上下文**，需用 `env.*`（先在步骤 `env:` 把 secret 转成 env 变量再判）。
- `pages.yml` 每次部署先 `rm -rf docs` 再重建，`docs/` 的内容以 `src/` 为准。
