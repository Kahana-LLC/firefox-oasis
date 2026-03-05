#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(
        description="Write AppUpdateURL enterprise policy into a packaged Oasis app bundle"
    )
    parser.add_argument("--app-bundle", required=True)
    parser.add_argument("--app-update-url", required=True)
    args = parser.parse_args()

    app_bundle = Path(args.app_bundle).resolve()
    policies_path = (
        app_bundle / "Contents" / "Resources" / "distribution" / "policies.json"
    )
    policies_path.parent.mkdir(parents=True, exist_ok=True)

    content = {}
    if policies_path.exists():
        with policies_path.open("r", encoding="utf-8") as fh:
            content = json.load(fh)

    policies = content.get("policies", {})
    policies["AppUpdateURL"] = args.app_update_url
    content["policies"] = policies

    with policies_path.open("w", encoding="utf-8") as fh:
        json.dump(content, fh, indent=2)
        fh.write("\n")

    print(str(policies_path))


if __name__ == "__main__":
    main()
