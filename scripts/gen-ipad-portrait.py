#!/usr/bin/env python3
# 用新 iPad 竖屏真机截图(1620x2160, 标准3:4)生成 App Store 竖屏规格包
# 源比例与目标竖屏档完全一致(3:4), 仅需 ~1.27x 轻微放大 -> 近无损
import os
from PIL import Image, ImageFilter, ImageEnhance

SRC = "screenshots/ipad-portrait"
OUT = "ipad-screenshots"

# App Store iPad 竖屏两档(3:4), 与源图比例吻合
TARGETS = [
    ("12.9-13-inch-portrait-2064x2752", 2064, 2752),
    ("12.9-inch-portrait-2048x2732",    2048, 2732),
]


def process(src_path, tw, th):
    im = Image.open(src_path).convert("RGB")
    # 比例吻合(3:4), 直接等比放大填满, 无变形无黑边
    im = im.resize((tw, th), Image.LANCZOS)
    # 轻微放大(~1.27x)只需温和锐化, 避免过冲光晕
    im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=110, threshold=2))
    im = ImageEnhance.Contrast(im).enhance(1.05)
    im = ImageEnhance.Sharpness(im).enhance(1.05)
    return im


def main():
    # 清掉旧的横屏软图档 + 旧竖屏档, 只保留新竖屏两档
    if os.path.isdir(OUT):
        for d in os.listdir(OUT):
            p = os.path.join(OUT, d)
            if os.path.isdir(p) and "landscape" in d:
                for x in os.listdir(p):
                    os.remove(os.path.join(p, x))
                os.rmdir(p)
    for fname in sorted(os.listdir(SRC)):
        if not fname.lower().endswith((".png", ".jpg", ".jpeg")):
            continue
        sp = os.path.join(SRC, fname)
        for folder, tw, th in TARGETS:
            d = os.path.join(OUT, folder)
            os.makedirs(d, exist_ok=True)
            out = process(sp, tw, th)
            base = os.path.splitext(fname)[0]
            out.save(
                os.path.join(d, base + ".jpg"),
                "JPEG",
                quality=95,
                subsampling=0,  # 4:4:4 全色度, 文字无彩色镶边
                optimize=True,
            )
            print(f"{folder}/{base}.jpg -> {out.size}")


if __name__ == "__main__":
    main()
    print("done")
