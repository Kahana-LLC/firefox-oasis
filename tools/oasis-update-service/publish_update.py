#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import sys
from urllib.request import Request, urlopen


def request_json(method, url, payload, admin_token):
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
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


def main():
    parser = argparse.ArgumentParser(
        description="Register artifact metadata and optionally move a ring pointer"
    )
    parser.add_argument("--service", required=True)
    parser.add_argument("--admin-token", default=os.environ.get("OASIS_ADMIN_TOKEN"))
    parser.add_argument("--product", default="Firefox")
    parser.add_argument("--version")
    parser.add_argument("--build-id")
    parser.add_argument("--build-target")
    parser.add_argument("--locale", default="en-US")
    parser.add_argument("--mar-url")
    parser.add_argument("--mar-path")
    parser.add_argument("--mar-size", type=int)
    parser.add_argument("--hash-function", default="sha512")
    parser.add_argument("--hash-value")
    parser.add_argument("--display-version")
    parser.add_argument("--app-version")
    parser.add_argument("--platform-version")
    parser.add_argument("--ring")
    parser.add_argument("--actor", default="github-actions")
    parser.add_argument("--reason", default="ring update")
    args = parser.parse_args()

    if not args.admin_token:
        print("missing --admin-token (or OASIS_ADMIN_TOKEN)", file=sys.stderr)
        sys.exit(2)

    should_register_artifact = bool(args.mar_url or args.mar_path)
    if should_register_artifact:
        required = {
            "--version": args.version,
            "--build-id": args.build_id,
            "--build-target": args.build_target,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            print(
                "missing required artifact args: " + ", ".join(missing),
                file=sys.stderr,
            )
            sys.exit(2)

    if args.ring and not args.version:
        print("--version is required when --ring is provided", file=sys.stderr)
        sys.exit(2)

    mar_size = args.mar_size
    hash_value = args.hash_value
    if args.mar_path:
        if not os.path.exists(args.mar_path):
            print("mar path does not exist", file=sys.stderr)
            sys.exit(2)
        mar_size, hash_value = hash_file(args.mar_path, args.hash_function)
    if should_register_artifact and not args.mar_url:
        print("--mar-url is required when registering an artifact", file=sys.stderr)
        sys.exit(2)
    if should_register_artifact and (mar_size is None or hash_value is None):
        print(
            "mar size and hash value are required (or provide --mar-path)",
            file=sys.stderr,
        )
        sys.exit(2)

    if should_register_artifact:
        artifact_payload = {
            "product": args.product,
            "version": args.version,
            "build_id": args.build_id,
            "build_target": args.build_target,
            "locale": args.locale,
            "mar_url": args.mar_url,
            "mar_size": mar_size,
            "hash_function": args.hash_function,
            "hash_value": hash_value,
            "display_version": args.display_version or args.version,
            "app_version": args.app_version or args.version,
            "platform_version": args.platform_version or args.version,
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
        print("registered artifact:")
        print(json.dumps(payload["artifact"], indent=2))

    if args.ring:
        ring_payload = {
            "target_version": args.version,
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
        print("updated ring pointer:")
        print(json.dumps(payload, indent=2))

    if not should_register_artifact and not args.ring:
        print("nothing to do: provide artifact args and/or --ring", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
