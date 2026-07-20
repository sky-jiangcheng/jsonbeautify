# 里程碑：App Store 图标 + 提交流程修复

> 建立于 2026-07-20。跟踪本轮（v1.5.7 → 1.5.11）反复踩坑后的彻底修复。
> 对应优化文档：`optimization-guide.md` §7.8–§7.11、`CONTRIBUTING.md` §6.6–§6.7。

## 背景

v1.5.7 起 iOS/macOS 上架连续踩坑，根因层层叠加，修了多轮才触底：

1. **图标始终是默认蓝黄环**——以为是 `bundle.icon` 缺失 / CI 缺 `tauri icon` 步骤（v1.5.9–1.5.10 的理解），实际更深两层：
   - CI 的 `tauri icon` 源用了**输出文件** `icons/icon.png`，应该用权威源 `app-icon-source.png`。
   - TestFlight/ASC 列表显示的是 **App 级图标**（从未在 ASC 后台上传），与 build 内嵌图标是两件事。
2. **提交审核 403**——REJECTED 版本残留 `appStoreVersionSubmission`，盲 POST 被拒。
3. **永远 409**——脚本把构建号当商店版本号查。
4. **版本号 4 处不对齐**——`bump-version.js` 漏改 iOS `Info.plist`。
5. **2.1 信息补充**——Apple 要真机录屏 + Notes（新 App 首次送审正常环节，非 bug）。

## 修复清单

### ✅ 已完成（代码侧）

| 项 | commit | 说明 |
|---|---|---|
| 提交脚本按 marketing version 选版本 | `34ebef5` | 根治「构建号当商店版本号查 → 永远 409」 |
| 提交前删残留 appStoreVersionSubmission | `8083947` | 根治 REJECTED 版本重提 403 |
| CI `tauri icon` 源改 `app-icon-source.png` | `13b6bb4` | 根治「用输出文件当源」设计错误（3 处：行 92/185/506） |
| 版本号 4 处对齐到 1.5.11 | `3adc874` | 含手动同步 iOS `Info.plist`（bump 脚本漏改处） |
| 优化文档沉淀 | 本提交 | `optimization-guide.md` §7.8 深层补充 + §7.9/7.10/7.11；`CONTRIBUTING.md` §6.6/6.7；自查清单更新 |

### ⬜ 待办（用户在 ASC 后台操作，API 不可代劳）

- [ ] **上传 App 级 1024×1024 图标**到 ASC：App Information（或版本 App Store 标签 → Media → App Icon）→ 上传 `src-tauri/icons/ios/AppIcon-1024.png`（1024×1024，alpha 全 255，蓝J，合规）→ 保存。**修 TestFlight/商店列表显示的环。**
- [ ] **验证 1.5.11 build 实际图标**：TestFlight 内部测试装 1.5.11 到 iPhone → 看桌面 App 图标是否蓝J。若仍环，说明 build 真有问题 → 需 1.5.12（CI 修复已就位）。
- [ ] **补 2.1 资料**：真机录屏（启动→粘贴 JSON→Format→折叠树→Minify→故意输错看报错）+ `APP_REVIEW_RESPONSE.md` 的 Notes 贴进 App Review Information。
- [ ] **手动提交审核**：ASC 里 iOS 1.0 / macOS 1.0.0 各点 Submit for Review（脚本 403 已修，但本轮 build 已挂好，UI 手动最快，不必重跑 CI 重建）。

### ⬜ 待办（后续优化，非阻塞）

- [ ] `check-appstore-version.py` 排查是否有同样的 build/marketing version 混淆（与 `submit-appstore-review.py` 同源 bug）。
- [ ] 考虑 CI 自动把新 build 加到 TestFlight 内部测试组（省去手动加组步骤，方便录屏/自测）。
- [ ] 考虑用 ASC API 自动上传 App 级图标（`appStoreVersions/{id}/appStoreVersion` 不直接支持图标，需走 `appMedia` —— 评估收益）。
- [ ] 评估把 iOS `Info.plist` 纳入 `bump-version.js` + `check-versions.js`，彻底消除第 4 处手动同步隐患。

## 完成定义（Definition of Done）

- iOS 1.0 + macOS 1.0.0 均 `WAITING_FOR_REVIEW` 且 2.1 资料齐 → 通过审核 → `READY_FOR_SALE`。
- TestFlight 列表 + App Store 商店页图标均为蓝J。
- 上述「已完成」代码修复随某个发版 tag 走完一次完整 CI 上架链路验证通过。

## 在 GitHub 建 Issue Milestone（gh 未装，网页操作）

打开 `https://github.com/sky-jiangcheng/jsonbeautify/milestones/new`，填：

- **Title**：`App Store 图标 + 提交流程修复`
- **Description**（可粘）：
  ```
  根治 v1.5.7→1.5.11 反复踩坑：图标源用错文件、REJECTED 403、构建号当商店版本号 409、版本号 4 处不对齐。
  代码侧已修（34ebef5 / 8083947 / 13b6bb4 / 3adc874），剩余为 ASC 后台操作 + 2.1 补料。
  详见 .monkeycode/docs/milestone-2026-07-appstore-fix.md
  ```
- **Due date**：按需（建议 1 周内完成 ASC 操作 + 录屏）。

可建 Issue 归到该里程碑：`上传 ASC App 级图标`、`补 2.1 录屏+Notes`、`手动 Submit iOS/macOS`、`修 check-appstore-version.py 同源 bug`。
