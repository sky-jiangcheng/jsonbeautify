#!/bin/bash
# macOS App Store 构建与上传脚本
# 使用前请确保 Apple Developer 证书和 Provisioning Profile 已配置

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}[1/5] 检查 macOS 环境...${NC}"
if [[ "$(uname)" != "Darwin" ]]; then
    echo -e "${RED}错误：此脚本必须在 macOS 上运行${NC}"
    exit 1
fi

# 检查必要的工具
command -v npm >/dev/null 2>&1 || { echo -e "${RED}错误：需要安装 Node.js${NC}"; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo -e "${RED}错误：需要安装 Rust${NC}"; exit 1; }

echo -e "${GREEN}[2/5] 检查 App Store 分支...${NC}"
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "appstore" ]; then
    echo "当前分支: $CURRENT_BRANCH，切换到 appstore..."
    git checkout appstore
fi

echo -e "${GREEN}[3/5] 安装依赖...${NC}"
npm ci

echo -e "${GREEN}[4/5] 构建 App Store 版本...${NC}"
npm run tauri build -- --config src-tauri/tauri.appstore.conf.json

echo -e "${GREEN}[5/5] 构建完成！${NC}"

# 查找产物
PKG_PATH=$(find src-tauri/target/release/bundle/macos -name "*.pkg" -type f 2>/dev/null | head -1)
DMG_PATH=$(find src-tauri/target/release/bundle/macos -name "*.dmg" -type f 2>/dev/null | head -1)

if [ -n "$PKG_PATH" ]; then
    echo -e "${GREEN}产物: $PKG_PATH${NC}"
fi
if [ -n "$DMG_PATH" ]; then
    echo -e "${GREEN}产物: $DMG_PATH${NC}"
fi

# 询问是否上传
echo ""
read -p "是否上传到 App Store Connect？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "请输入 Apple ID (邮箱):"
    read APPLE_ID
    echo "请输入 App-Specific Password:"
    read -s APP_PASSWORD

    if [ -n "$PKG_PATH" ]; then
        echo -e "${GREEN}正在上传...${NC}"
        xcrun altool --upload-app \
            -f "$PKG_PATH" \
            -t macos \
            -u "$APPLE_ID" \
            -p "$APP_PASSWORD"
        echo -e "${GREEN}上传完成！请到 https://appstoreconnect.apple.com 完成提审。${NC}"
    else
        echo -e "${RED}未找到 .pkg 产物${NC}"
    fi
fi
