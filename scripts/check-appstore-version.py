#!/usr/bin/env python3
"""检查 App Store Connect 中某版本是否已存在 (避免重复上传被拒)

这是 release.yml 上传前的"版本重复"门禁: 如果目标版本号在 ASC 里已经
存在 (任意状态), 再上传同版本号的 build 会被 App Store 拒绝
("版本已经重复")。此脚本在耗时构建之前快速失败, 给出明确指引。

检查两个维度:
  1. appStoreVersions (marketing version, 如 1.5.14) — 若已存在则版本重复
  2. builds (build version, 如 CFBundleVersion) — 若已存在则构建号重复

用法:
  python3 scripts/check-appstore-version.py <IOS|MAC_OS> <vX.Y.Z|版本号>

环境变量 (来自 release.yml 的 appstore 环境 secrets):
  APP_STORE_CONNECT_ISSUER      - App Store Connect API Issuer ID
  APP_STORE_CONNECT_KEY_ID      - API Key ID
  APP_STORE_CONNECT_KEY_PATH    - .p8 私钥文件绝对路径
  APP_STORE_CONNECT_APP_ID      - App 的 numeric ID

退出码:
  0 = 版本在 ASC 中不存在 (可以上传)
  1 = 版本已存在 (重复, 不可上传)
  2 = 参数/环境变量缺失
"""
import sys
import os
import json
import time
import base64
import urllib.request
import urllib.error


def ensure_crypto():
    """确保 cryptography 库可用 (与 submit-appstore-review.py 一致)"""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import hashes
    return serialization, ec, hashes


def generate_jwt(issuer_id, key_id, key_path, serialization, ec, hashes):
    """生成 App Store Connect API JWT (ES256)"""
    with open(key_path, "rb") as f:
        private_key = serialization.load_pem_private_key(f.read(), password=None)

    header = {"alg": "ES256", "kid": key_id, "typ": "JWT"}
    now = int(time.time())
    payload = {
        "iss": issuer_id,
        "iat": now,
        "exp": now + 900,
        "aud": "appstoreconnect-v1",
    }

    def b64(data):
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    header_b64 = b64(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = b64(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}"
    # cryptography 的 EC sign() 返回 DER 编码签名(SEQUENCE{r,s}),
    # 但 JWT / Apple 要求原始 r||s 拼接 (P-256 = 64 字节)。必须转换, 否则验签 401。
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    der_sig = private_key.sign(signing_input.encode(), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der_sig)
    raw_sig = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    sig_b64 = b64(raw_sig)
    return f"{signing_input}.{sig_b64}"


def api_get(path, jwt):
    url = f"https://api.appstoreconnect.apple.com{path}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {jwt}"})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:400]
        print(f"  HTTP {e.code}: {body}")
        if e.code == 401:
            print("ERROR: App Store Connect 拒绝该 JWT —— 密钥无效。请核对：")
            print("  1) App Store Connect → 用户和访问 → 密钥：该 Key ID 状态是否为 Active（被撤销会直接 401）")
            print("  2) GitHub → Settings → Environments → appstore → Environment secrets：")
            print("     APP_STORE_CONNECT_KEY_ID / ISSUER 必须与 APP_STORE_CONNECT_API_KEY(即 .p8) 是同一把钥匙")
            print("     （macos/ios 作业带 environment: appstore，优先取环境级 secret，不是仓库级）")
        else:
            print("ERROR: 查询 App Store Connect 版本失败 (检查 API 权限 / 网络)")
        sys.exit(2)


def main():
    platform = sys.argv[1] if len(sys.argv) > 1 else "IOS"
    version = (sys.argv[2] if len(sys.argv) > 2 else os.environ.get("APP_VERSION", "")).lstrip("v")

    if platform not in ("IOS", "MAC_OS"):
        print(f"ERROR: 平台应为 IOS 或 MAC_OS, 收到 {platform}")
        sys.exit(2)

    issuer = os.environ.get("APP_STORE_CONNECT_ISSUER", "")
    key_id = os.environ.get("APP_STORE_CONNECT_KEY_ID", "")
    key_path = os.environ.get("APP_STORE_CONNECT_KEY_PATH", "")
    app_id = os.environ.get("APP_STORE_CONNECT_APP_ID", "")

    missing = [
        n for n, v in [
            ("APP_STORE_CONNECT_ISSUER", issuer),
            ("APP_STORE_CONNECT_KEY_ID", key_id),
            ("APP_STORE_CONNECT_KEY_PATH", key_path),
            ("APP_STORE_CONNECT_APP_ID", app_id),
        ] if not v
    ]
    if missing:
        print(f"ERROR: 缺少环境变量: {', '.join(missing)}")
        sys.exit(2)
    if not version:
        print("ERROR: 未提供版本号")
        sys.exit(2)

    print(f"平台: {platform}")
    print(f"App ID: {app_id}")
    print(f"版本: {version}")

    # ---- 诊断输出 (定位 401 根因，确认 secret 解码无误) ----
    print(f"[DIAG] ISSUER   = {issuer[:8]}...{issuer[-4:]}" if len(issuer) > 12 else f"[DIAG] ISSUER   = {issuer}")
    print(f"[DIAG] KEY_ID   = {key_id}")
    if os.path.isfile(key_path):
        sz = os.path.getsize(key_path)
        with open(key_path) as kf:
            first_line = kf.readline().strip()
        print(f"[DIAG] KEY_FILE = {key_path}  size={sz}B  head={first_line}")
    else:
        print(f"[DIAG] KEY_FILE MISSING: {key_path}")

    _, ec, hashes = ensure_crypto()
    from cryptography.hazmat.primitives import serialization
    jwt = generate_jwt(issuer, key_id, key_path, serialization, ec, hashes)
    # 打印 JWT 的 header+payload (不含签名), 确认 issuer/kid 嵌入正确
    jwt_head, jwt_payload, _ = jwt.split(".", 2)
    import base64 as b64mod
    def b64d(s):
        s += "=" * (4 - len(s) % 4)
        return b64mod.urlsafe_b64decode(s)
    hdr = json.loads(b64d(jwt_head))
    pld = json.loads(b64d(jwt_payload))
    print(f"[DIAG] JWT header kid={hdr.get('kid')} alg={hdr.get('alg')}")
    print(f"[DIAG] JWT payload iss={pld.get('iss')[:8]}... exp-iat={pld.get('exp',0)-pld.get('iat',0)}s")
    # ---- 诊断结束 ----

    # 1. 检查 marketing version (appStoreVersions) 是否已存在
    resp = api_get(
        f"/v1/apps/{app_id}/appStoreVersions"
        f"?filter[versionString]={version}&filter[platform]={platform}",
        jwt,
    )

    versions = resp.get("data", [])
    if versions:
        for v in versions:
            attrs = v.get("attributes", {})
            print(
                f"  已存在版本: versionString={attrs.get('versionString')} "
                f"state={attrs.get('appStoreState')}"
            )
        print(f"\n❌ App Store Connect 中已存在 {platform} 版本 {version}, 不可重复上传!")
        print("   请 bump 到一个新的版本号后, 重新打 tag。")
        sys.exit(1)

    # 2. 检查 build version (builds) 是否已存在
    #    CFBundleVersion (如 "2") 与 marketing version (如 "1.5.14") 不同,
    #    但 App Store 也按 marketing version 关联 build。这里查 builds 列表,
    #    若有 processingState=VALID 的 build 且 version 等于本次上传的版本号,
    #    说明该构建号已被占用, 上传会被拒。
    print(f"\n--- 检查构建版本 {version} 是否已上传 ---")
    try:
        builds_resp = api_get(
            f"/v1/apps/{app_id}/builds?limit=20",
            jwt,
        )
        builds = builds_resp.get("data", [])
        dup_builds = [
            b for b in builds
            if b.get("attributes", {}).get("version") == version
        ]
        if dup_builds:
            for b in dup_builds:
                attrs = b.get("attributes", {})
                print(
                    f"  已存在构建: version={attrs.get('version')} "
                    f"processing={attrs.get('processingState')} "
                    f"uploaded={attrs.get('uploadedDate', '')[:19]}"
                )
            print(f"\n❌ 构建版本 {version} 已上传过, 不可重复上传!")
            print("   请 bump 到一个新的版本号后, 重新打 tag。")
            sys.exit(1)
    except SystemExit:
        raise
    except Exception as e:
        print(f"  (构建版本检查跳过: {e})")

    print(f"✅ App Store Connect 中不存在 {platform} 版本 {version}, 可以上传。")
    sys.exit(0)


if __name__ == "__main__":
    main()
