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


class AppStoreAPIError(urllib.error.HTTPError):
    """带 Apple 错误详情的 HTTP 异常，确保 traceback 中可见具体原因"""

    def __init__(self, url, code, msg, hdrs, error_body):
        super().__init__(url, code, msg, hdrs, None)
        self.error_body = error_body
        # 解析 Apple 错误格式, 提取可读信息
        self.apple_errors = []
        try:
            parsed = json.loads(error_body)
            self.apple_errors = parsed.get("errors", [])
        except (json.JSONDecodeError, TypeError):
            pass

    def __str__(self):
        if self.apple_errors:
            details = "; ".join(
                f"{e.get('title', '')}: {e.get('detail', '')}"
                for e in self.apple_errors
            )
            return f"HTTP {self.code} {details}"
        return f"HTTP {self.code}: {self.error_body[:300]}"


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
        raise AppStoreAPIError(e.url, e.code, e.reason, e.headers, error_body) from e


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
        # 等待 Apple API 传播新版本, 否则立即提交可能 403
        print("  等待 30s 供 Apple API 传播...")
        time.sleep(30)
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
    #    额外检查: 跳过有残留 submission 的版本 (会导致 403 "only DELETE")
    def vkey(v):
        s = v.get("attributes", {}).get("versionString", "0")
        try:
            return tuple(int(x) for x in s.split("."))
        except Exception:
            return (0,)

    editable = [v for v in versions
                if v.get("attributes", {}).get("appStoreState") != "READY_FOR_SALE"]
    candidates = editable if editable else versions
    # 按 versionString 降序排列, 优先选最新版本
    candidates = sorted(candidates, key=vkey, reverse=True)

    for chosen in candidates:
        vid = chosen.get("id")
        st = chosen.get("attributes", {}).get("appStoreState", "")
        ver = chosen.get("attributes", {}).get("versionString")
        # 检查是否有残留 submission
        has_submission = False
        try:
            sub_resp = api_request(
                "GET", f"/v1/appStoreVersions/{vid}/appStoreVersionSubmission", jwt
            )
            if sub_resp.get("data"):
                has_submission = True
        except urllib.error.HTTPError as e:
            if e.code != 404:
                has_submission = True  # 出错时保守跳过
        if has_submission:
            print(f"  跳过版本 {ver} (id={vid}, state={st}): 有残留 submission")
            continue
        print(f"  自动选择当前版本 {ver} (id={vid}, state={st})")
        return vid, st

    # 所有可编辑版本都有残留 submission, 创建新版本
    print("  所有可编辑版本都有残留 submission, 创建新版本...")
    return create_version(app_id, jwt, platform, build_version)


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


def preflight_check(version_id, jwt):
    """提交前诊断: 检查版本状态、构建关联、导出合规性等,
    打印诊断信息, 帮助定位 403 的具体原因。"""
    print("\n=== 提交前诊断 ===")
    issues = []

    # 1. 检查版本状态和属性
    try:
        resp = api_request("GET", f"/v1/appStoreVersions/{version_id}", jwt)
        attrs = resp.get("data", {}).get("attributes", {})
        state = attrs.get("appStoreState", "UNKNOWN")
        print(f"  版本状态: {state}")
        print(f"  versionString: {attrs.get('versionString')}")
        print(f"  releaseType: {attrs.get('releaseType')}")
        uses_idfa = attrs.get("usesIdfa")
        if uses_idfa is not None:
            print(f"  usesIdfa: {uses_idfa}")
        # 可提交状态: PREPARE_FOR_SUBMISSION, REJECTED, DEVELOPER_REJECTED
        submittable = ("PREPARE_FOR_SUBMISSION", "REJECTED", "DEVELOPER_REJECTED")
        if state not in submittable:
            issues.append(f"版本状态 {state} 不可提交 (需 PREPARE_FOR_SUBMISSION/REJECTED/DEVELOPER_REJECTED)")
    except urllib.error.HTTPError as e:
        issues.append(f"无法查询版本信息: HTTP {e.code}")

    # 2. 检查构建关联
    try:
        build_resp = api_request(
            "GET", f"/v1/appStoreVersions/{version_id}/build", jwt
        )
        build_data = build_resp.get("data")
        if build_data:
            print(f"  已关联构建: {build_data.get('id')}")
        else:
            issues.append("未关联构建 (需先 associate_build)")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            issues.append(f"无法查询构建关联: HTTP {e.code}")

    # 3. 检查残留 submission
    try:
        sub_resp = api_request(
            "GET", f"/v1/appStoreVersions/{version_id}/appStoreVersionSubmission", jwt
        )
        sub_data = sub_resp.get("data")
        if sub_data:
            print(f"  ⚠️ 存在残留 submission: {sub_data.get('id')}")
            issues.append("存在残留 submission (需先删除)")
        else:
            print("  无残留 submission")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print("  无残留 submission")
        else:
            print(f"  查询 submission 状态: HTTP {e.code}")

    # 4. 检查导出合规性 (export compliance / encryption declaration)
    try:
        enc_resp = api_request(
            "GET", f"/v1/appStoreVersions/{version_id}/appEncryptionDeclaration", jwt
        )
        enc_data = enc_resp.get("data")
        if enc_data:
            print(f"  已有关密声明: {enc_data.get('id')}")
        else:
            print("  ⚠️ 未关联加密声明 (export compliance)")
            issues.append("缺少加密声明 (export compliance) — 这通常是 403 的原因")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print("  ⚠️ 未关联加密声明 (export compliance)")
            issues.append("缺少加密声明 (export compliance) — 这通常是 403 的原因")
        else:
            print(f"  查询加密声明: HTTP {e.code}")

    if issues:
        print("\n  发现以下潜在问题:")
        for i, issue in enumerate(issues, 1):
            print(f"    {i}. {issue}")
    else:
        print("  所有检查通过 ✓")
    return issues


def ensure_export_compliance(version_id, app_id, build_id, jwt):
    """尝试自动处理导出合规性: 为不含加密的 app 创建加密声明并关联到版本。
    仅当版本缺少加密声明时才执行。"""
    # 先检查是否已有加密声明
    try:
        resp = api_request(
            "GET", f"/v1/appStoreVersions/{version_id}/appEncryptionDeclaration", jwt
        )
        if resp.get("data"):
            print("  已有关密声明, 跳过")
            return
    except urllib.error.HTTPError as e:
        if e.code != 404:
            print(f"  查询加密声明失败 (HTTP {e.code}), 尝试继续创建...")

    print("  创建加密声明 (JSON 格式化工具, 仅使用平台标准加密)...")
    body = {
        "data": {
            "type": "appEncryptionDeclarations",
            "attributes": {
                "appDescription": "JSON formatting and validation tool",
                "availableOnFrenchStore": True,
                "containsProprietaryCryptography": False,
                "containsThirdPartyCryptography": False,
            },
            "relationships": {
                "app": {
                    "data": {"type": "apps", "id": app_id}
                },
            },
        }
    }
    try:
        resp = api_request("POST", "/v1/appEncryptionDeclarations", jwt, body)
        decl_id = resp.get("data", {}).get("id")
        print(f"  已创建加密声明 (id={decl_id})")
        # 关联到 appStoreVersion (通过版本关系端点, 非 build)
        try:
            patch_body = {
                "data": {
                    "type": "appStoreVersions",
                    "id": version_id,
                    "relationships": {
                        "appEncryptionDeclaration": {
                            "data": {
                                "type": "appEncryptionDeclarations",
                                "id": decl_id,
                            }
                        },
                    },
                }
            }
            api_request("PATCH", f"/v1/appStoreVersions/{version_id}", jwt, patch_body)
            print(f"  已关联加密声明到版本")
        except urllib.error.HTTPError as e:
            print(f"  ⚠️ 关联加密声明失败 (非致命): {e}")
    except urllib.error.HTTPError as e:
        print(f"  ⚠️ 创建加密声明失败: {e}")
        print("  (非致命, 可在 App Store Connect 手动填写)")


def delete_submission(version_id, jwt, max_retries=3):
    """查找并删除残留的 appStoreVersionSubmission。

    处理 Apple API 的时序问题: GET 找到 submission, 但 DELETE 可能返回 404,
    同时 POST 仍报 403 "Allowed operation is: DELETE"。
    尝试多种删除方式: 按 ID 删除, 通过版本关系端点删除。
    """
    for retry in range(max_retries):
        # 查找残留 submission
        old_id = None
        try:
            existing = api_request(
                "GET", f"/v1/appStoreVersions/{version_id}/appStoreVersionSubmission", jwt
            )
            old_id = (existing.get("data") or {}).get("id")
        except urllib.error.HTTPError as e:
            if e.code != 404:
                print(f"  查询 submission 异常: HTTP {e.code}")

        if not old_id:
            # GET 返回 404, 但可能 submission 仍存在 (Apple API 不一致)
            # 尝试直接通过版本关系端点删除
            if retry == 0:
                print("  GET 未找到 submission, 尝试通过版本关系端点清理...")
            try:
                api_request(
                    "DELETE",
                    f"/v1/appStoreVersions/{version_id}/appStoreVersionSubmission",
                    jwt,
                )
                print("  通过版本关系端点删除 submission 成功")
                time.sleep(5)
                return
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    # 确实没有 submission
                    return
                if e.code == 405:
                    # Method not allowed, 此端点不支持 DELETE
                    print("  版本关系端点不支持 DELETE, 尝试其他方式...")
                else:
                    print(f"  版本关系端点删除: HTTP {e.code}")
                # 等待后重试 (submission 可能正在传播)
                if retry < max_retries - 1:
                    print(f"  等待 15s 后重试...")
                    time.sleep(15)
            continue

        print(f"  发现残留 submission {old_id} (第 {retry + 1} 次尝试删除)...")
        try:
            api_request("DELETE", f"/v1/appStoreVersionSubmissions/{old_id}", jwt)
            print("  已删除旧 submission, 版本回到可编辑状态")
            time.sleep(5)
            return
        except urllib.error.HTTPError as e:
            if e.code == 404:
                # Apple API 时序问题: submission 存在但 DELETE 返回 404
                # 尝试通过版本关系端点删除
                print(f"  DELETE by ID 返回 404, 尝试版本关系端点...")
                try:
                    api_request(
                        "DELETE",
                        f"/v1/appStoreVersions/{version_id}/appStoreVersionSubmission",
                        jwt,
                    )
                    print("  通过版本关系端点删除成功")
                    time.sleep(5)
                    return
                except urllib.error.HTTPError as e2:
                    if e2.code != 404 and e2.code != 405:
                        print(f"  版本关系端点: HTTP {e2.code}")
                # 等待后重新 GET
                print(f"  等待 15s 后重试...")
                time.sleep(15)
                continue
            raise

    print("  ⚠️ 多次删除残留 submission 失败, 继续尝试提交...")


def submit_for_review(version_id, jwt):
    """提交审核

    兼容 REJECTED / DEVELOPER_REJECTED 版本的重提:
    Apple 不允许对同一个版本 CREATE 第二个 appStoreVersionSubmission,
    被驳回的版本上会残留旧 submission -> 盲 POST 直接 403
    ("does not allow 'CREATE'. Allowed operation is: DELETE")。
    因此先查并删除已存在的 submission, 再创建新的。
    """
    print("\n=== 提交审核 ===")
    # 1. 删除残留 submission (REJECTED 版本可能有)
    delete_submission(version_id, jwt)

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
                # 检查是否是 "Allowed operation is: DELETE" 错误
                is_delete_only = False
                if hasattr(e, "apple_errors") and e.apple_errors:
                    for err in e.apple_errors:
                        detail = err.get("detail", "")
                        if "DELETE" in detail:
                            is_delete_only = True
                        print(f"  Apple 错误: {err.get('title', '')} - {detail}")

                if is_delete_only:
                    # 残留 submission 未完全释放, 重新删除后重试
                    print(f"  检测到残留 submission 阻塞, 重新清理后重试...")
                    delete_submission(version_id, jwt)
                    time.sleep(5 * (attempt + 1))
                else:
                    print(f"  提交被拒 (403), {5 * (attempt + 1)}s 后重试...")
                    time.sleep(5 * (attempt + 1))
                continue
            # 最终失败时, 输出 Apple 错误详情
            if hasattr(e, "apple_errors") and e.apple_errors:
                for err in e.apple_errors:
                    print(f"  ❌ Apple 错误: {err.get('title', '')} - {err.get('detail', '')}")
                    if err.get("source"):
                        print(f"     source: {err['source']}")
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

    # 4. 提交前诊断 (检查版本状态、构建关联、导出合规性等)
    preflight_check(version_id, jwt)

    # 5. 尝试自动处理导出合规性 (缺少加密声明是 403 最常见原因)
    ensure_export_compliance(version_id, app_id, build_id, jwt)

    # 6. 提交审核 (如果失败且版本有僵尸 submission, 删除版本后创建新版本重试)
    try:
        submit_for_review(version_id, jwt)
    except urllib.error.HTTPError as e:
        is_zombie = (
            e.code == 403
            and hasattr(e, "apple_errors")
            and any("DELETE" in err.get("detail", "") for err in e.apple_errors)
        )
        if not is_zombie:
            raise
        print("\n⚠️ 版本有僵尸 submission, 删除版本后创建新版本重试...")
        # 删除卡住的版本
        try:
            api_request("DELETE", f"/v1/appStoreVersions/{version_id}", jwt)
            print(f"  已删除版本 {version_id}")
            time.sleep(10)
        except urllib.error.HTTPError as del_e:
            print(f"  删除版本失败: HTTP {del_e.code}")
            raise
        # 创建新版本 (使用 tag 版本号)
        jwt = jwt_factory()
        version_id, state = create_version(app_id, jwt, platform, version_string)
        # 重新关联构建
        associate_build(version_id, build_id, build_version, jwt)
        # 提交审核
        submit_for_review(version_id, jwt)

    print("\n✅ 完成! 请到 App Store Connect 查看审核状态")
    print(f"   https://appstoreconnect.apple.com/apps/{app_id}/appstore/{platform.lower()}/versions/submission")


if __name__ == "__main__":
    main()
