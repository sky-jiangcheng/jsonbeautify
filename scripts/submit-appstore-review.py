#!/usr/bin/env python3
"""
提交 App 到 App Store 审核
用法: python3 submit-appstore-review.py IOS|MAC_OS

环境变量:
  APP_STORE_CONNECT_ISSUER  - App Store Connect API Issuer ID
  APP_STORE_CONNECT_KEY_ID     - API Key ID
  APP_STORE_CONNECT_KEY_PATH   - .p8 私钥文件路径
  APP_STORE_CONNECT_APP_ID     - App 的 numeric ID (App Store Connect URL 里 apps/ 后面的数字)
  APP_VERSION                  - 版本号 (如 1.4.0)
  MAX_WAIT_MINUTES             - 等待构建处理的最大分钟数 (默认 25)
"""
import sys
import os
import json
import time
import base64
import urllib.request
import urllib.error


def ensure_crypto():
    """确保 cryptography 库可用"""
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import hashes
        return serialization, ec, hashes
    except ImportError:
        print("Installing cryptography library...")
        import subprocess
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "cryptography", "-q"],
            stdout=subprocess.DEVNULL,
        )
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

    # cryptography 的 EC sign() 返回 DER 编码签名(SEQUENCE{r,s}),
    # 但 JWT / Apple 要求原始 r||s 拼接 (P-256 = 64 字节)。必须转换, 否则验签 401。
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    der_sig = private_key.sign(
        signing_input.encode(), ec.ECDSA(hashes.SHA256())
    )
    r, s = decode_dss_signature(der_sig)
    raw_sig = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    sig_b64 = b64(raw_sig)

    return f"{signing_input}.{sig_b64}"


def api_request(method, path, jwt, body=None):
    """调用 App Store Connect API"""
    url = f"https://api.appstoreconnect.apple.com{path}"
    headers = {
        "Authorization": f"Bearer {jwt}",
        "Content-Type": "application/json",
    }

    data = None
    if body:
        data = json.dumps(body).encode()

    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = resp.read().decode()
            return json.loads(resp_body) if resp_body else {}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"  HTTP {e.code}: {error_body[:500]}")
        raise


def wait_for_build(app_id, jwt_factory, platform, max_wait_minutes):
    """等待构建处理完成，返回可用的 build id 和 version"""
    print(f"\n=== 等待构建处理 (最多 {max_wait_minutes} 分钟) ===")
    jwt = jwt_factory()
    build_id = None
    build_version = None
    deadline = time.time() + max_wait_minutes * 60
    check_count = 0

    while time.time() < deadline:
        if check_count % 12 == 0:  # 每 2 分钟刷新一次 JWT
            jwt = jwt_factory()

        try:
            resp = api_request(
                "GET",
                f"/v1/apps/{app_id}/builds?sort=-uploadedDate&limit=10",
                jwt,
            )
        except urllib.error.HTTPError:
            print("  查询构建失败，稍后重试...")
            time.sleep(15)
            check_count += 1
            continue

        builds = resp.get("data", [])
        if check_count == 0:
            print(f"  找到 {len(builds)} 个构建:")
            for b in builds[:5]:
                attrs = b.get("attributes", {})
                print(
                    f"    - version={attrs.get('version')} "
                    f"processing={attrs.get('processingState')} "
                    f"uploaded={attrs.get('uploadedDate', '')[:19]}"
                )

        for b in builds:
            attrs = b.get("attributes", {})
            if attrs.get("processingState") == "VALID":
                build_id = b.get("id")
                build_version = attrs.get("version")
                break

        if build_id:
            break

        elapsed = int(time.time() - (deadline - max_wait_minutes * 60))
        print(f"  构建处理中... 已等待 {elapsed}s")
        time.sleep(15)
        check_count += 1

    return build_id, build_version, jwt


def get_or_create_version(app_id, jwt, platform, version_string):
    """获取或创建 App Store 版本"""
    print(f"\n=== 获取 App Store 版本 {version_string} ===")
    resp = api_request(
        "GET",
        f"/v1/apps/{app_id}/appStoreVersions"
        f"?filter[versionString]={version_string}&filter[platform]={platform}",
        jwt,
    )
    versions = resp.get("data", [])

    if versions:
        version_id = versions[0].get("id")
        state = versions[0].get("attributes", {}).get("appStoreState", "")
        print(f"  版本已存在 (id={version_id}, state={state})")
        return version_id, state

    # 创建新版本
    print(f"  版本不存在，创建新版本 {version_string}...")
    body = {
        "data": {
            "type": "appStoreVersions",
            "attributes": {
                "platform": platform,
                "versionString": version_string,
            },
            "relationships": {
                "app": {"data": {"type": "apps", "id": app_id}},
            },
        }
    }
    resp = api_request("POST", "/v1/appStoreVersions", jwt, body)
    version_id = resp.get("data", {}).get("id")
    print(f"  已创建版本 (id={version_id})")
    return version_id, "PREPARE_FOR_SUBMISSION"


def associate_build(version_id, build_id, build_version, jwt):
    """关联构建到版本"""
    print(f"\n=== 关联构建 {build_version} 到版本 ===")
    # 检查当前关联
    try:
        resp = api_request(
            "GET", f"/v1/appStoreVersions/{version_id}/build", jwt
        )
        current = resp.get("data")
        if current and current.get("id") == build_id:
            print("  构建已关联，跳过")
            return
    except urllib.error.HTTPError:
        pass

    body = {
        "data": {
            "type": "appStoreVersions",
            "id": version_id,
            "relationships": {
                "build": {
                    "data": {"type": "builds", "id": build_id}
                }
            },
        }
    }
    api_request("PATCH", f"/v1/appStoreVersions/{version_id}", jwt, body)
    print(f"  已关联构建 {build_version}")


def submit_for_review(version_id, jwt):
    """提交审核"""
    print("\n=== 提交审核 ===")
    body = {
        "data": {
            "type": "appStoreVersionSubmissions",
            "relationships": {
                "appStoreVersion": {
                    "data": {
                        "type": "appStoreVersions",
                        "id": version_id,
                    }
                }
            },
        }
    }
    try:
        resp = api_request(
            "POST", "/v1/appStoreVersionSubmissions", jwt, body
        )
        sub_id = resp.get("data", {}).get("id")
        print(f"  已提交审核! (submission id={sub_id})")
        return True
    except urllib.error.HTTPError as e:
        if e.code == 409:
            print("  版本已在审核中或已提交，跳过")
            return True
        raise


def main():
    platform = sys.argv[1] if len(sys.argv) > 1 else "IOS"
    if platform not in ("IOS", "MAC_OS"):
        print(f"ERROR: 无效平台 {platform}，应为 IOS 或 MAC_OS")
        sys.exit(1)

    issuer_id = os.environ.get("APP_STORE_CONNECT_ISSUER", "")
    key_id = os.environ.get("APP_STORE_CONNECT_KEY_ID", "")
    key_path = os.environ.get("APP_STORE_CONNECT_KEY_PATH", "")
    app_id = os.environ.get("APP_STORE_CONNECT_APP_ID", "")
    version_string = os.environ.get("APP_VERSION", "")
    max_wait = int(os.environ.get("MAX_WAIT_MINUTES", "25"))

    missing = []
    if not issuer_id:
        missing.append("APP_STORE_CONNECT_ISSUER")
    if not key_id:
        missing.append("APP_STORE_CONNECT_KEY_ID")
    if not key_path:
        missing.append("APP_STORE_CONNECT_KEY_PATH")
    if not app_id:
        missing.append("APP_STORE_CONNECT_APP_ID")
    if not version_string:
        missing.append("APP_VERSION")

    if missing:
        print(f"ERROR: 缺少环境变量: {', '.join(missing)}")
        sys.exit(1)

    print(f"平台: {platform}")
    print(f"App ID: {app_id}")
    print(f"版本: {version_string}")

    serialization, ec, hashes = ensure_crypto()

    def jwt_factory():
        return generate_jwt(issuer_id, key_id, key_path, serialization, ec, hashes)

    # 1. 等待构建处理
    build_id, build_version, jwt = wait_for_build(
        app_id, jwt_factory, platform, max_wait
    )
    if not build_id:
        print(f"\nERROR: {max_wait} 分钟内未找到处理完成的构建")
        print("请在 App Store Connect 后台确认构建已上传并处理完成")
        sys.exit(1)
    print(f"  构建就绪: {build_version} (id={build_id})")

    # 2. 获取/创建版本
    version_id, state = get_or_create_version(app_id, jwt, platform, version_string)

    # 如果已经在审核中，跳过
    if state in ("WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_DEVELOPER_RELEASE"):
        print(f"\n版本状态为 {state}，已在审核流程中，跳过提交")
        print("如需重新提交，请先在 App Store Connect 拒绝当前审核")
        return

    if state == "READY_FOR_SALE":
        print(f"\n版本已上架，无需提交审核")
        return

    # 3. 关联构建
    associate_build(version_id, build_id, build_version, jwt)

    # 4. 提交审核
    submit_for_review(version_id, jwt)

    print("\n✅ 完成! 请到 App Store Connect 查看审核状态")
    print(f"   https://appstoreconnect.apple.com/apps/{app_id}/appstore/ios/versions/submission")


if __name__ == "__main__":
    main()
