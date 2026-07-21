# 里程碑：图标清理 + 目录整理

> 建立于 2026-07-21。跟踪本轮图标配置修复和项目目录规范化工作。
> 对应优化文档：`optimization-guide.md` §7.8–§7.11、`CONTRIBUTING.md` §1。

## 背景

v1.5.12 之前项目存在以下问题：

1. **图标目录混乱**——`src-tauri/icons/` 和 `src-tauri/icons/ios/` 下有大量重复文件（不同命名规范、`-1` 后缀副本），源文件不明确
2. **`tauri.appstore.conf.json` 图标配置缺失**——只列了 3 个图标，缺少 macOS App Store 必需的完整尺寸（特别是 `512x512@2x.png`），可能导致 ICNS 不完整、App Store 报错 90236
3. **iOS Info.plist 版本号不同步**——`bump-version.js` 漏改 `ios/App/App/Info.plist`，CI 构建的 IPA 版本号可能滞后
4. **根目录文档散乱**——`APP_REVIEW_RESPONSE.md`、`DEVLOG-v13.md`、`PRIVACY.md` 散落在根目录，无统一归档位置
5. **根目录 `.nojekyll` 多余**——Pages 从 `docs/` 部署，根目录不需要

## 修复清单

### ✅ 已完成（代码侧）

| 项 | 说明 |
|---|---|
| 重新生成全套图标 | 使用 `npx tauri icon src-tauri/app-icon-source.png` 从权威源生成，删除旧重复文件 |
| 补充 `AppIcon-1024.png` | `generate-icons.js` 从 SVG 生成，用于 ASC App 级图标上传 |
| 补充 `512x512@2x.png` | 1024×1024，macOS App Store ICNS 必需；同时补入 `generate-icons.js` |
| 清理 iOS 重复图标 | 删除所有 `-1` 后缀副本（`AppIcon-20x20@2x-1.png` 等 3 个） |
| 修复 `tauri.appstore.conf.json` | 补全 10 个图标路径（与主配置一致），含 `512x512@2x.png` |
| 同步 iOS Info.plist 版本 | `CFBundleShortVersionString` 从 `1.5.11` → `1.5.12` |
| 文档归档 | `APP_REVIEW_RESPONSE.md` / `DEVLOG-v13.md` / `PRIVACY.md` 移至 `.monkeycode/docs/` |
| 删除多余 `.nojekyll` | 根目录不再需要，`docs/` 由 CI 生成时写入 |
| 更新 README.md | 文件结构章节同步新目录布局 |
| 更新 CONTRIBUTING.md | §1 目录表新增 `.monkeycode/docs/` 行 |

### ⬜ 待办（用户操作）

- [ ] **推送代码到远程**：本地 main 已合并，执行 `git push origin main`
- [ ] **在 GitHub 创建议程里程碑**（可选）：标题「图标清理 + 目录整理」，关联本里程碑文档
- [ ] **上传 ASC App 级图标**：App Store Connect → App Information → 上传 `src-tauri/icons/ios/AppIcon-1024.png`（修 TestFlight/商店列表显示的默认环图标）
- [ ] **验证 1.5.12 构建图标**：下版 CI 构建后，TestFlight 装机构验证桌面图标是否为蓝J

## 完成定义（Definition of Done）

- 根目录无散乱文档，项目文档统一归档 `.monkeycode/docs/`
- `tauri.appstore.conf.json` 图标列表完整且文件均存在
- iOS Info.plist 版本号与其他三处一致
- CI 构建出的 macOS/iOS 包图标均为蓝J，无默认环图标
- ASC 后台 App 级图标已上传，TestFlight 列表显示蓝J

## 在 GitHub 建 Issue Milestone（可选）

打开 `https://github.com/sky-jiangcheng/jsonbeautify/milestones/new`，填：

- **Title**：`图标清理 + 目录整理`
- **Description**（可粘）：
  ```
  根治图标目录混乱、App Store 配置缺失、版本号不同步、根目录文档散乱问题。
  代码侧已完成：重新生成图标、修复 appstore 配置、同步 Info.plist 版本、归档文档。
  详见 .monkeycode/docs/milestone-2026-07-icon-cleanup.md
  ```
- **Due date**：按需（建议 3 天内完成推送 + ASC 图标上传验证）。
