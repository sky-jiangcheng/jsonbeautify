#!/usr/bin/env python3
"""
提交 App 到 App Store 审核
用法: python3 submit-appstore-review.py IOS|MAC_OS

环境变量:
  APP_STORE_CONNECT_ISSUER  - App Store Connect API Issuer ID
  APP_STORE_CONNECT_KEY_ID     - API Key ID
  APP_STORE_CONNECT_KEY_PATH   - .p8 私钥文件路径
  APP_STORE_CONNECT_APP_ID     - App 的 numeric ID (App Store Connect URL 里 apps/ 后面的数字)
  APP_VERSION                  - 构建号 (如 1.5.10)，用于匹配上传的 build
  APP_STORE_VERSION            - [可选] App Store marketing 版本号 (如 1.0)。
                                不设置时自动选择当前可编辑/可提交版本。
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


def wait_for_build(app_id, jwt_factory, platform, target_version, max_wait_minutes):
    """等待目标构建版本处理完成，返回可用的 build id 和 version。

    target_version 是构建号 (如 1.5.10), 与 App Store 的 marketing version (如 1.0) 不同。
    优先匹配 target_version 的 VALID build；超时未匹配则退而使用最新 VALID build 并警告。
    """
    print(f"\n=== 等待构建 {target_version} 处理 (最多 {max_wait_minutes} 分钟) ===")
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
                f"/v1/apps/{app_id}/builds?limit=10",
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

        # 优先匹配目标构建版本
        for b in builds:
            attrs = b.get("attributes", {})
            if attrs.get("processingState") == "VALID" and attrs.get("version") == target_version:
                build_id = b.get("id")
                build_version = attrs.get("version")
                break

        if build_id:
            break

        elapsed = int(time.time() - (deadline - max_wait_minutes * 60))
        print(f"  构建 {target_version} 处理中... 已等待 {elapsed}s")
        time.sleep(15)
        check_count += 1

    # 兜底: 超时未匹配到目标版本时, 选最新的 VALID build 并警告 (避免硬失败)
    if not build_id:
        try:
            resp = api_request("GET", f"/v1/apps/{app_id}/builds?limit=10", jwt)
            for b in resp.get("data", []):
                attrs = b.get("attributes", {})
                if attrs.get("processingState") == "VALID":
                    build_id = b.get("id")
                    build_version = attrs.get("version")
                    print(f"  ⚠️ 未找到目标版本 {target_version} 的 VALID build，"
                          f"退而使用最新 VALID build {build_version}（请确认是否正确）")
                    break
        except urllib.error.HTTPError:
            pass

    return build_id, build_version, jwt


def create_version(app_id, jwt, platform, version_string):
    """创建新的 App Store 版本。注意: 同平台已有可编辑版本时通常会 409,
    调用方应优先复用现有版本 (见 get_submission_version)。"""
    print(f"  创建新版本 {version_string}...")
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
    try:
        resp = api_request("POST", "/v1/appStoreVersions", jwt, body)
        version_id = resp.get("data", {}).get("id")
        print(f"  已创建版本 (id={version_id})")
        return version_id, "PREPARE_FOR_SUBMISSION"
    except urllib.error.HTTPError as e:
        if e.code != 409:
            raise
        # 409: App 已有同平台版本占用了"可编辑"位。重新查询定位真实状态, 不崩栈。
        print(f"\n  ⚠️ 创建版本被拒 (HTTP 409): App 当前状态不允许创建新版本。")
        try:
            resp2 = api_request(
                "GET",
                f"/v1/apps/{app_id}/appStoreVersions"
                f"?filter[platform]={platform}&limit=50",
                jwt,
            )
            existing = resp2.get("data", [])
        except urllib.error.HTTPError:
            existing = []
        if existing:
            print(f"  当前 {platform} 平台已存在以下版本:")
            for v in existing:
                a = v.get("attributes", {})
                print(f"    - versionString={a.get('versionString')} "
                      f"state={a.get('appStoreState')} id={v.get('id')}")
        else:
            print("  未能查询到阻塞版本，请到 App Store Connect 检查 App 状态。")
        sys.exit(1)


def get_submission_version(app_id, jwt, platform, app_store_version, build_version):
    """找到当前可提交的 App Store 版本 (marketing version, 如 '1.0'), 而非 build version。

    关键修复: 以前误把 APP_VERSION (构建号, 如 1.5.10) 当作 App Store 的 versionString
    去查, 永远查不到, 于是每次都尝试创建新版本并 409。现在改为:
      1) 若显式设置 APP_STORE_VERSION (如 1.0) -> 精确匹配;
      2) 否则自动选择当前可编辑/可提交的版本 (排除已上架, 取 versionString 最大者)。
    REJECTED / DEVELOPER_REJECTED / PREPARE_FOR_SUBMISSION 等状态下会落入此路径,
    关联 build 后重新提交即可 (这正是被驳回后重新送审的标准流程)。
    """
    print(f"\n=== 查找 {platform} 当前可提交版本 ===")
    resp = api_request(
        "GET",
        f"/v1/apps/{app_id}/appStoreVersions?filter[platform]={platform}&limit=50",
        jwt,
    )
    versions = resp.get("data", [])
    if not versions:
        if app_store_version:
            return create_version(app_id, jwt, platform, app_store_version)
        print("  未找到任何版本，且未设置 APP_STORE_VERSION，无法继续")
        sys.exit(1)

    # 1) 显式指定 APP_STORE_VERSION -> 精确匹配
    if app_store_version:
        for v in versions:
            if v.get("attributes", {}).get("versionString") == app_store_version:
                vid = v.get("id")
                st = v.get("attributes", {}).get("appStoreState", "")
                print(f"  命中指定版本 {app_store_version} (id={vid}, state={st})")
                return vid, st
        print(f"  未找到指定版本 {app_store_version}，尝试创建...")
        return create_version(app_id, jwt, platform, app_store_version)

    # 2) 自动选择当前可编辑/可提交版本 (排除已上架)
    def vkey(v):
        s = v.get("attributes", {}).get("versionString", "0")
        try:
            return tuple(int(x) for x in s.split("."))
        except Exception:
            return (0,)

    editable = [v for v in versions
                if v.get("attributes", {}).get("appStoreState") != "READY_FOR_SALE"]
    candidates = editable if editable else versions
    chosen = sorted(candidates, key=vkey)[-1]
    vid = chosen.get("id")
    st = chosen.get("attributes", {}).get("appStoreState", "")
    ver = chosen.get("attributes", {}).get("versionString")
    print(f"  自动选择当前版本 {ver} (id={vid}, state={st})")
    return vid, st


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
    """提交审核

    兼容 REJECTED / DEVELOPER_REJECTED 版本的重提:
    Apple 不允许对同一个版本 CREATE 第二个 appStoreVersionSubmission,
    被驳回的版本上会残留旧 submission -> 盲 POST 直接 403
    ("does not allow 'CREATE'. Allowed operation is: DELETE")。
    因此先查并删除已存在的 submission, 再创建新的。
    """
    print("\n=== 提交审核 ===")
    # 1. 查残留 submission (REJECTED 版本可能有)
    try:
        existing = api_request(
            "GET", f"/v1/appStoreVersions/{version_id}/appStoreVersionSubmission", jwt
        )
        old_id = (existing.get("data") or {}).get("id")
    except urllib.error.HTTPError as e:
        old_id = None
        if e.code != 404:
            raise
    if old_id:
        print(f"  发现残留 submission {old_id}, 先删除以支持重新提交...")
        try:
            api_request("DELETE", f"/v1/appStoreVersionSubmissions/{old_id}", jwt)
            print("  已删除旧 submission, 版本回到可编辑状态")
            time.sleep(3)  # 防时序: 删除后短暂等待状态切换
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
    # 2. 创建新 submission
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
    last_err = None
    for attempt in range(3):
        try:
            resp = api_request(
                "POST", "/v1/appStoreVersionSubmissions", jwt, body
            )
            sub_id = resp.get("data", {}).get("id")
            print(f"  已提交审核! (submission id={sub_id})")
            return True
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 409:
                print("  版本已在审核中或已提交，跳过")
                return True
            if e.code == 403 and attempt < 2:
                print(
                    f"  提交被拒 (403), {5 * (attempt + 1)}s 后重试 "
                    f"(残留 submission 可能未完全释放)..."
                )
                time.sleep(5 * (attempt + 1))
                continue
            raise
    raise last_err


def main():
    platform = sys.argv[1] if len(sys.argv) > 1 else "IOS"
    if platform not in ("IOS", "MAC_OS"):
        print(f"ERROR: 无效平台 {platform}，应为 IOS 或 MAC_OS")
        sys.exit(1)
    issuer_id = os.environ.get("APP_STORE_CONNECT_ISSUER", "")
    key_id = os.environ.get("APP_STORE_CONNECT_KEY_ID", "")
    key_path = os.environ.get("APP_STORE_CONNECT_KEY_PATH", "")
    app_id = os.environ.get("APP_STORE_CONNECT_APP_ID", "")
    version_string = os.environ.get("APP_VERSION", "")          # 构建号, 如 1.5.10
    app_store_version = os.environ.get("APP_STORE_VERSION", "")  # marketing version, 如 1.0 (可选)
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
    print(f"构建版本: {version_string}")
    if app_store_version:
        print(f"App Store 版本(marketing): {app_store_version}")

    serialization, ec, hashes = ensure_crypto()

    def jwt_factory():
        return generate_jwt(issuer_id, key_id, key_path, serialization, ec, hashes)
    # 1. 等待目标构建处理
    build_id, build_version, jwt = wait_for_build(
        app_id, jwt_factory, platform, version_string, max_wait
    )
    if not build_id:
        print(f"\nERROR: {max_wait} 分钟内未找到处理完成的构建")
        print("请在 App Store Connect 后台确认构建已上传并处理完成")
        sys.exit(1)
    print(f"  构建就绪: {build_version} (id={build_id})")

    # 2. 获取当前可提交版本 (按 marketing version 而非 build version)
    version_id, state = get_submission_version(
        app_id, jwt, platform, app_store_version, build_version
    )

    # 如果已经在审核中，跳过
    if state in ("WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_DEVELOPER_RELEASE"):
        print(f"\n版本状态为 {state}，已在审核流程中，跳过提交")
        print("如需重新提交，请先在 App Store Connect 拒绝当前审核")
        return
    if state == "READY_FOR_SALE":
        print(f"\n版本已上架，无需提交审核")
        return
    # 被驳回 / 草稿 (REJECTED / DEVELOPER_REJECTED / PREPARE_FOR_SUBMISSION) -> 重新关联 build 并提交
    if state in ("REJECTED", "DEVELOPER_REJECTED", "PREPARE_FOR_SUBMISSION"):
        print(f"\n版本状态为 {state}，将重新关联构建并提交审核")

    # 3. 关联构建
    associate_build(version_id, build_id, build_version, jwt)
    # 4. 提交审核
    submit_for_review(version_id, jwt)

    print("\n✅ 完成! 请到 App Store Connect 查看审核状态")
    print(f"   https://appstoreconnect.apple.com/apps/{app_id}/appstore/{platform.lower()}/versions/submission")


if __name__ == "__main__":
    main()
