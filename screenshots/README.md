# 截图资源

本目录存放 App Store 上架所需的**原始截屏源文件**（纳入版本控制）。

## 目录

| 路径 | 内容 | 状态 |
|---|---|---|
| `phone/` | iPhone 竖屏原始截屏 | ✅ 源 |
| `ipad-portrait/` | iPad 竖屏原始截屏（1620×2160） | ✅ 源 |

## 生成 App Store 交付包

原始图由 `scripts/` 下的脚本处理为目标尺寸包，**生成结果不入库**（已在 `.gitignore` 忽略）：

| 生成包 | 来源 | 说明 |
|---|---|---|
| `appstore-screenshots/` | `phone/` | iPhone 各尺寸（1242×2688 等） |
| `ipad-screenshots/` | `ipad-portrait/` | iPad 竖屏各尺寸（2064×2752 等） |

> 如需重新生成，运行对应脚本即可，无需手工处理图片。

## 相关脚本

- `scripts/gen-ipad-portrait.py` — iPad 竖屏包生成（等比填满 + 温和锐化 + JPEG q95）

## 弃用记录

- `screenshots/ipad/`（600×450 横屏）已被 `ipad-portrait/` 取代，已删除。
