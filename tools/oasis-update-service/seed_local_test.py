#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.parse import quote


def request_json(method, url, payload, admin_token=None):
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if admin_token:
        req.add_header("Authorization", f"Bearer {admin_token}")
    with urlopen(req) as resp:
        body = resp.read().decode("utf-8")
        return resp.status, json.loads(body)


def hash_file(path, hash_function):
    hasher = hashlib.new(hash_function)
    size = 0
    with open(path, "rb") as fh:
        while True:
            chunk = fh.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            hasher.update(chunk)
    return size, hasher.hexdigest()


def build_update_url(base, product, version, build_id, build_target, locale, channel, os_version, system_capabilities, distribution, distribution_version):
    parts = [
        "update",
        "6",
        product,
        version,
        build_id,
        build_target,
        locale,
        channel,
        os_version,
        system_capabilities,
        distribution,
        distribution_version,
        "update.xml",
    ]
    encoded = "/".join(quote(part, safe="") for part in parts)
    return base.rstrip("/") + "/" + encoded


def main():
    parser = argparse.ArgumentParser(description="Seed local update metadata and print update URL")
    parser.add_argument("--service", default="http://127.0.0.1:8010")
    parser.add_argument("--admin-token", default=os.environ.get("OASIS_ADMIN_TOKEN"))
    parser.add_argument("--product", default="Firefox")
    parser.add_argument("--current-version", required=True)
    parser.add_argument("--target-version", required=True)
    parser.add_argument("--build-id", required=True)
    parser.add_argument("--build-target", required=True)
    parser.add_argument("--locale", default="en-US")
    parser.add_argument("--ring", default="oasis-canary")
    parser.add_argument("--mar-url")
    parser.add_argument("--mar-path")
    parser.add_argument("--mar-size", type=int)
    parser.add_argument("--hash-function", default="sha512")
    parser.add_argument("--hash-value")
    parser.add_argument("--display-version")
    parser.add_argument("--app-version")
    parser.add_argument("--platform-version")
    parser.add_argument("--actor", default="local-test")
    parser.add_argument("--reason", default="local test seed")
    parser.add_argument("--os-version", default="default")
    parser.add_argument("--system-capabilities", default="default")
    parser.add_argument("--distribution", default="default")
    parser.add_argument("--distribution-version", default="default")
    args = parser.parse_args()

    if not args.mar_url and not args.mar_path:
        print("--mar-url or --mar-path required", file=sys.stderr)
        sys.exit(2)

    mar_size = args.mar_size
    hash_value = args.hash_value

    if args.mar_path:
        if not os.path.exists(args.mar_path):
            print("mar path does not exist", file=sys.stderr)
            sys.exit(2)
        mar_size, hash_value = hash_file(args.mar_path, args.hash_function)
        if not args.mar_url:
            args.mar_url = "https://example.invalid/" + os.path.basename(args.mar_path)

    if mar_size is None or hash_value is None:
        print("mar size and hash value required (or provide --mar-path)", file=sys.stderr)
        sys.exit(2)

    artifact_payload = {
        "product": args.product,
        "version": args.target_version,
        "build_id": args.build_id,
        "build_target": args.build_target,
        "locale": args.locale,
        "mar_url": args.mar_url,
        "mar_size": mar_size,
        "hash_function": args.hash_function,
        "hash_value": hash_value,
        "display_version": args.display_version or args.target_version,
        "app_version": args.app_version or args.target_version,
        "platform_version": args.platform_version or args.target_version,
    }

    status, payload = request_json(
        "POST",
        args.service.rstrip("/") + "/admin/artifacts",
        artifact_payload,
        args.admin_token,
    )
    if status >= 400:
        print(json.dumps(payload, indent=2), file=sys.stderr)
        sys.exit(1)

    ring_payload = {
        "target_version": args.target_version,
        "actor": args.actor,
        "reason": args.reason,
    }
    status, payload = request_json(
        "POST",
        args.service.rstrip("/") + f"/admin/rings/{args.ring}",
        ring_payload,
        args.admin_token,
    )
    if status >= 400:
        print(json.dumps(payload, indent=2), file=sys.stderr)
        sys.exit(1)

    update_url = build_update_url(
        args.service,
        args.product,
        args.current_version,
        args.build_id,
        args.build_target,
        args.locale,
        args.ring,
        args.os_version,
        args.system_capabilities,
        args.distribution,
        args.distribution_version,
    )

    print("Seeded ring and artifact.")
    print("Update URL:")
    print(update_url)


if __name__ == "__main__":
    main()
