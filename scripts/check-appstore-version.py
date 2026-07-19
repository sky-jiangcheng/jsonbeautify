#!/usr/bin/env python3
"""检查 App Store Connect 中某版本是否已存在 (避免重复上传被拒)

这是 release.yml 上传前的"版本重复"门禁: 如果目标版本号在 ASC 里已经
存在 (任意状态), 再上传同版本号的 build 会被 App Store 拒绝
("版本已经重复")。此脚本在耗时构建之前快速失败, 给出明确指引。

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
        "exp": now + 1200,
        "aud": "appstoreconnect-v1",
    }

    def b64(data):
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    header_b64 = b64(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = b64(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}"
    signature = private_key.sign(signing_input.encode(), ec.ECDSA(hashes.SHA256()))
    sig_b64 = b64(signature)
    return f"{signing_input}.{sig_b64}"


def api_get(path, jwt):
    url = f"https://api.appstoreconnect.apple.com{path}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {jwt}"})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode()[:300]}")
        raise


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

    _, ec, hashes = ensure_crypto()
    from cryptography.hazmat.primitives import serialization
    jwt = generate_jwt(issuer, key_id, key_path, serialization, ec, hashes)

    try:
        resp = api_get(
            f"/v1/apps/{app_id}/appStoreVersions"
            f"?filter[versionString]={version}&filter[platform]={platform}",
            jwt,
        )
    except urllib.error.HTTPError:
        print("ERROR: 查询 App Store Connect 版本失败 (检查 API 密钥/权限)")
        sys.exit(2)

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

    print(f"✅ App Store Connect 中不存在 {platform} 版本 {version}, 可以上传。")
    sys.exit(0)


if __name__ == "__main__":
    main()
