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

    # 超时未匹配到目标版本: 直接失败, 绝不退而使用旧 build 提审。
    # 旧 build 提审要么必然 409 (1.5.58 的失败根因), 要么会把缺少
    # NSCameraUsageDescription 的陈旧包送审上架。
    if not build_id:
        print(f"\nERROR: {max_wait} 分钟内未出现版本为 {target_version} 的 VALID 构建")
        print("常见原因: Apple 摄取延迟 (可稍后手动提审) 或构建未通过摄取 (查 ASC 通知邮件)")
        try:
            resp = api_request("GET", f"/v1/apps/{app_id}/builds?limit=10", jwt)
            print("ASC 当前最新构建:")
            for b in resp.get("data", []):
                attrs = b.get("attributes", {})
                print(
                    f"    - version={attrs.get('version')} "
                    f"processing={attrs.get('processingState')} "
                    f"uploaded={attrs.get('uploadedDate', '')[:19]}"
                )
        except urllib.error.HTTPError:
            print("  (构建列表查询失败, 请到 App Store Connect 手动确认)")
        return None, None, jwt

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


def find_review_submission(app_id, version_id, jwt):
    """查找该版本关联的 reviewSubmission (ASC API 1.7+ 新提审流程)。

    旧的 appStoreVersionSubmissions 已废弃: 撤审(developer reject)后用旧端点重提
    必 403 ("does not allow 'CREATE'. Allowed operation is: DELETE")，且其
    related-resource GET 返回的 404 会拿 version id 冒充 submission id，永远查不到
    真实 submission。新流程通过 reviewSubmissions / reviewSubmissionItems 操作。
    返回 (submission_id, state)；找不到返回 (None, None)。
    """
    try:
        resp = api_request(
            "GET", f"/v1/reviewSubmissions?filter[app]={app_id}&limit=10", jwt
        )
    except urllib.error.HTTPError as e:
        print(f"  查询 reviewSubmissions 失败: HTTP {e.code}")
        return None, None
    for rs in resp.get("data", []):
        rs_id = rs.get("id")
        state = rs.get("attributes", {}).get("state", "")
        if state in ("COMPLETE", "CANCELING"):
            continue
        try:
            items = api_request(
                "GET", f"/v1/reviewSubmissions/{rs_id}/items?limit=20", jwt
            )
        except urllib.error.HTTPError:
            continue
        for item in items.get("data", []):
            linked = (
                item.get("relationships", {})
                .get("appStoreVersion", {})
                .get("data")
                or {}
            )
            if linked.get("id") == version_id:
                return rs_id, state
    return None, None


def cancel_review_submission(app_id, version_id, jwt):
    """撤下正在审核的 submission (developer reject, 新流程)。"""
    rs_id, state = find_review_submission(app_id, version_id, jwt)
    if not rs_id:
        print("  未找到 reviewSubmission (可能已撤审)")
        return
    if state not in ("WAITING_FOR_REVIEW", "IN_REVIEW", "READY_FOR_REVIEW"):
        print(f"  submission 状态 {state}, 无需撤审")
        return
    patch_body = {
        "data": {
            "type": "reviewSubmissions",
            "id": rs_id,
            "attributes": {"canceled": True},
        }
    }
    try:
        api_request("PATCH", f"/v1/reviewSubmissions/{rs_id}", jwt, patch_body)
        print(f"  已撤审 (canceled submission {rs_id})")
    except urllib.error.HTTPError as e:
        print(f"  撤审失败: HTTP {e.code}")


def supersede_version(app_id, jwt, platform, version_id, old_ver, new_ver):
    """撤下正在审核中的旧版本 (developer reject), 把唯一可编辑位让给新版本。

    Apple 规则: 同平台同时只能有一个"可编辑/在审"版本, 在审版本会阻塞新版本创建 (409)。
    流程: cancel reviewSubmission 撤审 -> 等状态脱离审核队列 ->
    优先 PATCH versionString 复用版本位 (保留已填的元数据);
    改号失败则 DELETE 旧版本重建 (元数据丢失, 但 versionString 干净)。
    """
    print(f"\n=== 版本 {old_ver} 审核中, 撤审并由 {new_ver} 取代 (supersede) ===")
    cancel_review_submission(app_id, version_id, jwt)

    # 等待状态脱离审核队列 (WAITING_FOR_REVIEW -> DEVELOPER_REJECTED)
    state = ""
    for _ in range(10):
        try:
            resp = api_request("GET", f"/v1/appStoreVersions/{version_id}", jwt)
            state = (
                resp.get("data", {}).get("attributes", {}).get("appStoreState", "")
            )
        except urllib.error.HTTPError:
            pass
        if state and state not in ("WAITING_FOR_REVIEW", "IN_REVIEW"):
            break
        time.sleep(3)
    print(f"  版本 {old_ver} 当前状态: {state}")

    # 优先复用版本位: 改 versionString, 保留该版本上已填的元数据
    patch_body = {
        "data": {
            "type": "appStoreVersions",
            "id": version_id,
            "attributes": {"versionString": new_ver},
        }
    }
    try:
        api_request("PATCH", f"/v1/appStoreVersions/{version_id}", jwt, patch_body)
        print(f"  已复用版本位并改号为 {new_ver}")
        return version_id, state
    except urllib.error.HTTPError as e:
        print(f"  改号失败 (HTTP {e.code}), 删除旧版本重建...")

    try:
        api_request("DELETE", f"/v1/appStoreVersions/{version_id}", jwt)
        print("  已删除旧版本, 等待 15s 供 Apple API 传播...")
        time.sleep(15)
    except urllib.error.HTTPError as e:
        print(f"  删除旧版本失败 (HTTP {e.code}), "
              f"退回复用旧版本位 (商店版本号将保持 {old_ver})")
        return version_id, state
    return create_version(app_id, jwt, platform, new_ver)


def get_submission_version(app_id, jwt, platform, app_store_version, build_version):
    """找到当前可提交的 App Store 版本 (marketing version, 如 '1.0'), 而非 build version。

    关键修复: 以前误把 APP_VERSION (构建号, 如 1.5.10) 当作 App Store 的 versionString
    去查, 永远查不到, 于是每次都尝试创建新版本并 409。现在改为:
      1) 若显式设置 APP_STORE_VERSION (如 1.0) -> 精确匹配;
      2) 否则自动选择当前可编辑/可提交的版本 (排除已上架, 取 versionString 最大者)。
    REJECTED / DEVELOPER_REJECTED / PREPARE_FOR_SUBMISSION 等状态下会落入此路径,
    关联 build 后重新提交即可 (这正是被驳回后重新送审的标准流程)。
    若旧版本正在审核中 (WAITING_FOR_REVIEW / IN_REVIEW):
      - 版本号 == 本次构建号 -> 已在审核, 幂等退出;
      - 版本号更旧 -> supersede: 撤审腾出可编辑位, 由新版本取代 (developer reject)。
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
    # 按 versionString 降序排列, 优先选最新版本
    candidates = sorted(candidates, key=vkey, reverse=True)

    # 审核队列中的状态: 此期间 Apple 不允许创建新版本 (会 409)
    IN_REVIEW_STATES = ("WAITING_FOR_REVIEW", "IN_REVIEW")

    for chosen in candidates:
        vid = chosen.get("id")
        st = chosen.get("attributes", {}).get("appStoreState", "")
        ver = chosen.get("attributes", {}).get("versionString")
        if st in IN_REVIEW_STATES:
            if ver == build_version:
                print(f"  版本 {ver} 已在审核中, 无需重复提交")
                sys.exit(0)
            # 旧版本在审: 撤审腾位, 由新版本取代 (developer reject)
            return supersede_version(
                app_id, jwt, platform, vid, ver, build_version
            )
        # 可编辑状态 (PREPARE_FOR_SUBMISSION / REJECTED / DEVELOPER_REJECTED 等):
        # 直接复用, 并把 versionString 同步为本次构建号 (撤审复用的旧版本号会滞留)
        print(f"  自动选择当前版本 {ver} (id={vid}, state={st})")
        if ver != build_version:
            patch_body = {
                "data": {
                    "type": "appStoreVersions",
                    "id": vid,
                    "attributes": {"versionString": build_version},
                }
            }
            try:
                api_request("PATCH", f"/v1/appStoreVersions/{vid}", jwt, patch_body)
                print(f"  已将版本号 {ver} 改为 {build_version}")
            except urllib.error.HTTPError as e:
                print(f"  ⚠️ 改号失败 (HTTP {e.code}), 商店版本号保持 {ver}")
        return vid, st

    print("  没有可复用的版本, 创建新版本...")
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


def preflight_check(app_id, version_id, build_id, jwt):
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

    # 3. 检查 reviewSubmission (新流程)
    rs_id, rs_state = find_review_submission(app_id, version_id, jwt)
    if rs_id:
        print(f"  现有 reviewSubmission: {rs_id} (state={rs_state})")
    else:
        print("  无 reviewSubmission (提交时新建)")

    # 4. 检查导出合规性: build 的 usesNonExemptEncryption 属性
    #    (注意: appStoreVersion 没有 appEncryptionDeclaration 关系,
    #     用旧端点查必 404, 千万别据此去创建 appEncryptionDeclarations)
    try:
        build_resp = api_request("GET", f"/v1/builds/{build_id}", jwt)
        enc = build_resp.get("data", {}).get("attributes", {}).get(
            "usesNonExemptEncryption"
        )
        if enc is None:
            print("  ⚠️ 构建未回答出口合规 (usesNonExemptEncryption 为空)")
            issues.append("未设置出口合规 — 提交时由 ensure_export_compliance 处理")
        else:
            print(f"  出口合规已设置: usesNonExemptEncryption={enc}")
    except urllib.error.HTTPError as e:
        issues.append(f"无法查询构建信息: HTTP {e.code}")

    if issues:
        print("\n  发现以下潜在问题:")
        for i, issue in enumerate(issues, 1):
            print(f"    {i}. {issue}")
    else:
        print("  所有检查通过 ✓")
    return issues


def ensure_export_compliance(build_id, jwt):
    """设置构建的出口合规 (export compliance)。

    正确做法: 直接 PATCH build 的 usesNonExemptEncryption 属性。
    千万不要创建 appEncryptionDeclarations —— 每次 CI 都新建会在单 App
    上限 5 个时 409 (STATE_ERROR.APP_ENCRYPTION_DECLARATIONS_LIMIT_REACHED)。
    已设置过的 build 再 PATCH 会 409, 属预期行为, 忽略即可。
    """
    patch_body = {
        "data": {
            "type": "builds",
            "id": build_id,
            "attributes": {"usesNonExemptEncryption": False},
        }
    }
    try:
        api_request("PATCH", f"/v1/builds/{build_id}", jwt, patch_body)
        print("  已设置出口合规 (不含非豁免加密)")
    except urllib.error.HTTPError as e:
        if e.code == 409:
            print("  出口合规已设置过, 跳过")
        else:
            print(f"  ⚠️ 设置出口合规失败 (HTTP {e.code}), 非致命")


def submit_for_review(app_id, version_id, jwt):
    """提交审核 (ASC API 1.7+ 新流程: reviewSubmissions)。

    旧端点 POST /v1/appStoreVersionSubmissions 已废弃, 在"撤审后重提"场景下
    必 403 ("does not allow 'CREATE'. Allowed operation is: DELETE")。
    新流程三步:
      1) 无可复用 submission 时 POST /v1/reviewSubmissions 创建容器;
      2) POST /v1/reviewSubmissionItems 把版本挂进容器 (已存在则跳过);
      3) PATCH submitted=true 送审 (409 "not ready yet" 是 Apple 内部
         传播时序问题, 等待后重试)。
    """
    print("\n=== 提交审核 (reviewSubmissions 新流程) ===")
    rs_id, state = find_review_submission(app_id, version_id, jwt)
    if rs_id and state in ("WAITING_FOR_REVIEW", "IN_REVIEW"):
        print(f"  submission {rs_id} 状态 {state}, 已在审核队列, 跳过")
        return True

    if not rs_id:
        body = {
            "data": {
                "type": "reviewSubmissions",
                "relationships": {
                    "app": {"data": {"type": "apps", "id": app_id}}
                },
            }
        }
        resp = api_request("POST", "/v1/reviewSubmissions", jwt, body)
        rs_id = resp.get("data", {}).get("id")
        print(f"  已创建 reviewSubmission (id={rs_id})")
        item_body = {
            "data": {
                "type": "reviewSubmissionItems",
                "relationships": {
                    "reviewSubmission": {
                        "data": {"type": "reviewSubmissions", "id": rs_id}
                    },
                    "appStoreVersion": {
                        "data": {"type": "appStoreVersions", "id": version_id}
                    },
                },
            }
        }
        try:
            api_request("POST", "/v1/reviewSubmissionItems", jwt, item_body)
            print("  已把版本加入 submission")
        except urllib.error.HTTPError as e:
            if e.code != 409:
                raise
            # 版本已挂在某个 submission 里, 重新查找定位
            print("  版本已在其他 submission 中, 重新定位...")
            rs_id, state = find_review_submission(app_id, version_id, jwt)
            if not rs_id:
                raise
    else:
        print(f"  复用现有 submission {rs_id} (state={state})")

    # submitted=true 送审
    for attempt in range(6):
        patch_body = {
            "data": {
                "type": "reviewSubmissions",
                "id": rs_id,
                "attributes": {"submitted": True},
            }
        }
        try:
            api_request("PATCH", f"/v1/reviewSubmissions/{rs_id}", jwt, patch_body)
            print(f"  已提交审核! (submission id={rs_id})")
            return True
        except urllib.error.HTTPError as e:
            if e.code == 409 and attempt < 5:
                print(f"  尚未就绪 (409), {20 * (attempt + 1)}s 后重试...")
                time.sleep(20 * (attempt + 1))
                continue
            raise
    return False


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

    # 4. 提交前诊断 (检查版本状态、构建关联、出口合规等)
    preflight_check(app_id, version_id, build_id, jwt)

    # 5. 设置出口合规 (PATCH build 的 usesNonExemptEncryption)
    ensure_export_compliance(build_id, jwt)

    # 6. 提交审核 (reviewSubmissions 新流程, 内部已带 409 时序重试)
    submit_for_review(app_id, version_id, jwt)

    print("\n✅ 完成! 请到 App Store Connect 查看审核状态")
    print(f"   https://appstoreconnect.apple.com/apps/{app_id}/appstore/{platform.lower()}/versions/submission")


if __name__ == "__main__":
    main()
