# App Store 审核补料草稿（Guideline 2.1 - Information Needed）

> 用途：把下面内容贴进 App Store Connect → App 信息 → App Review Information → **Notes** 字段。
> 第 1 条（录屏）是视频，需你自己在真机录制后通过 ASC 附件/回复上传。
> 中括号 [ ] 里的内容请按你实际测试的设备/系统改。

---

## 1) Screen recording（需你自行录制上传）
A screen recording captured on a physical device running the latest iOS, starting from app launch and walking through the core flow:
- Paste a sample JSON into the editor
- Tap **Format** (pretty-print)
- Expand / collapse the tree view to inspect structure
- Tap **Minify**
- Trigger and view a validation error on invalid JSON
No login or account is required, so no account flow is shown.

## 2) Devices and OS tested
- iPhone 15 Pro, iOS 18.5   [按你实际测的改]
- iPad Air (M2), iPadOS 18.5   [按你实际测的改]
- MacBook Air (Apple silicon), macOS 15.5  [macOS 包对应改]

## 3) App purpose and target audience
JSON Beautify is an offline JSON formatter, validator, and viewer. Users paste or open JSON and instantly pretty-print, minify, and validate it, with a collapsible tree view for inspection. It removes the pain of reading minified or malformed JSON by hand. Target audience: software developers, QA engineers, and anyone working with JSON APIs or configuration files.

## 4) Setup and access instructions
No account, login, or setup is required. The app is fully functional on first launch. Users paste JSON into the editor (or open a `.json` file) and tap "Format". No demo credentials or sample files are needed.

## 5) External services / tools / platforms used
None. All parsing, formatting, and validation run locally on the device. The app makes no network requests and uses no external APIs, authentication services, payment processors, or third-party data providers. Syntax highlighting is bundled locally (no CDN).

## 6) Regional differences
The app functions identically in all regions. There are no regional feature or content differences.

## 7) Regulated industry / protected material
Not applicable. The app does not operate in a regulated industry and contains no protected third-party material.

---

### 备注（给你自己看的，不要贴进 Notes）
- 第 1 条提到的「账号 / 付费 / 用户内容 / 隐私权限申请」你的 App 都没有，所以无需演示，也不要在 Notes 里硬编。
- 录屏必须从**启动 App**开始，跑完核心功能；Invalid JSON 的报错画面建议录进去，证明功能真实可用。
- Notes 用英文贴最稳（审核员是英文环境）；上面草稿已是英文，直接复制即可。
