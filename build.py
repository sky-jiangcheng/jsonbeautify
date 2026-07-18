#!/usr/bin/env python3
"""
build.py — 从源 index.html 生成 dist/index.html
用法: python3 build.py
"""
import shutil, os

SRC = 'index.html'
DST = 'dist/index.html'

def build():
    if not os.path.exists(SRC):
        print(f"❌ {SRC} not found")
        return 1
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    shutil.copy2(SRC, DST)
    print(f"✅ {DST} ({os.path.getsize(DST)} bytes)")
    return 0

if __name__ == '__main__':
    exit(build())
