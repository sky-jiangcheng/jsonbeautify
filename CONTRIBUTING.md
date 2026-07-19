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

### 6.1 🔴 App Store Connect API 鉴权（核心坑：JWT 签名格式）

`release.yml` 上架 macOS/iOS 时，`scripts/check-appstore-version.py` 与 `scripts/submit-appstore-review.py` 会调用 Apple App Store Connect API，用 **ES256 JWT** 鉴权。

**坑**：Python `cryptography` 的 `private_key.sign(...)` 返回的是 **DER 编码**的 ECDSA 签名，但 Apple **要求 raw `r‖s` 拼接（P-256 = 64 字节）**。若直接把 DER base64 塞进 JWT，Apple 验签失败 → `HTTP 401 NOT_AUTHORIZED`，且报错文案只说「凭证缺失或无效」，**完全不提示是签名格式问题**，极易误判成「密钥被撤销 / ISSUER 填错 / Key ID 不对」。

**正确写法**（签名后必须做 DER→raw 转换，自 v1.5.5 起已修正）：

```python
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

der_sig = private_key.sign(signing_input.encode(), ec.ECDSA(hashes.SHA256()))
r, s = decode_dss_signature(der_sig)
raw_sig = r.to_bytes(32, "big") + s.to_bytes(32, "big")   # 64 字节 raw
sig_b64 = b64u(raw_sig)
jwt = f"{signing_input}.{sig_b64}"
```

> 历史上 1.5.0~1.5.4 连续多版被 401 卡住，反复怀疑密钥/Issuer 配置，最终定位是脚本漏了上面这步转换——**与密钥是否有效无关**。

### 6.2 ASC API 不支持的参数（`sort` / 400 PARAMETER_ERROR）

**症状**：`submit-appstore-review.py` 的「等待构建处理」步骤反复报 HTTP 400：

```json
{"code": "PARAMETER_ERROR.ILLEGAL", "detail": "The parameter 'sort' can not be used with this request"}
```

**根因**：`/v1/builds` 端点**不支持 `sort` 查询参数**。Apple 的 `filter` 和 `include` 可用，但 `sort` 不行。

**修法**：去掉 `?sort=-uploadedDate`，在 Python 端排序返回结果即可。

### 6.3 如何区分「密钥问题」还是「代码问题」（401 调试法）

CI 报 401 时，**先本地验证凭证本身**，避免盲改 GitHub secret：

1. 用 `openssl` 对 `.p8` 签名（openssl 默认输出 raw，无需 DER 转换），生成 JWT 后 `curl https://api.appstoreconnect.apple.com/v1/apps`；返回 **200** 即证明 `Key ID + Issuer + .p8` 三者有效且匹配 → 401 必是代码侧签名格式问题。
2. `check-appstore-version.py` 内置 `[DIAG]` 打印（ISSUER / KEY_ID / KEY_FILE 头 / JWT payload），CI 日志里可直接核对这些参数是否被正确读取、文件路径是否完整。

### 6.4 `appstore` 环境 secret 配置

`release.yml` 的 `macos-appstore` / `ios` 作业带 `environment: appstore`，**优先取环境级 secret**（不是仓库级）。

必填三项（须同源：即**同一把** ASC 钥匙）：

| Secret | 值 | 来源 |
|---|---|---|
| `APP_STORE_CONNECT_KEY_ID` | 例 `VAYNC6SYBD` | `.p8` 文件名中的 Key ID |
| `APP_STORE_CONNECT_API_KEY` | `.p8` 文件 base64 | 本地私钥 |
| `APP_STORE_CONNECT_ISSUER` | UUID | ASC → 用户和访问 → 集成 → App Store Connect API 顶部 |

其余（`APP_STORE_CONNECT_APP_ID_IOS` / `_MAC`、证书、`IOS_PROVISIONING_PROFILE`）同属账号，勿随意改动。

> 注意区分三个 ID：`App ID`（纯数字，App 自身）、`Issuer ID`（UUID，密钥页顶部）、`Key ID`（字母数字，钥匙文件名）——401 调试时别搞混。

### 6.5 创建 App Store 版本报 409（App 当前状态不允许）

`submit-appstore-review.py` 的 `get_or_create_version` 早期用 `filter[versionString]=X&filter[platform]=IOS` 组合查询，再决定创建。v1.5.6 的 `ios` job 在此踩到：

```
HTTP 409: {"code":"ENTITY_ERROR.RELATIONSHIP.INVALID",
 "detail":"You cannot create a new version of the App in the current state.",
 "source":{"pointer":"/data/relationships/app"}}
```

**含义**：该 App 在 **iOS 平台已有一个处于"可编辑"状态的版本**占着位（版本号往往不是我们要提交的 X，所以按 X 过滤查不到），于是 POST 创建被 ASC 拒绝。

**排查要点**（能到这一步说明 401 已过了，不是密钥/签名问题；也不是 `sort` 参数问题——那是 400）：
- 用 `filter[versionString]+filter[platform]` 组合有时漏查已存在版本 → 误判"不存在" → 再去 POST → 409。
- 也可能是 ASC 里确实存在一个**别的版本号**（如 1.5.5）占着 iOS 可编辑位（手动建的、或历史 job 残留）。

**修复（见 `scripts/submit-appstore-review.py` 的 `get_or_create_version` 注释）**：
1. `get_or_create_version` 改为**只按 `filter[platform]` 列出该平台全部版本，客户端精确匹配 `versionString`**（不再用 versionString 过滤）。
2. 若仍要 POST 创建，捕获 409：重新查询并**列出当前该平台所有版本及其 state**，明确报出"阻塞版本（versionString / state）"，而不是抛栈崩溃。
3. 重查时若发现目标版本号其实已存在（刚被并行 job / 手动创建，或之前漏查），直接复用，继续关联构建 + 提交审核。

**本地排障（无需重跑整条 CI）**：ASC 网页 → App → iOS → 查看当前版本列表：
- 若目标版本号（如 1.5.6）已存在且处于 `PREPARE_FOR_SUBMISSION` 等可编辑态 → 多半只是过滤器漏查，**直接手动点 Submit for Review** 即可，不必重建。
- 若存在一个**别的版本号**占着可编辑位 → 先在 ASC 里把它「拒绝 / 删除」，再重跑 CI 的 `ios` job（注意：需先把本修复提交进**触发 CI 的 ref**，否则重跑用的还是旧脚本）。
