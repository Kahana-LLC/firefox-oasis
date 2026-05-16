#!/usr/bin/env python3
"""Write .DS_Store with a volume-relative background image alias.

Finder capture (finalize/capture scripts) often embeds paths to the host .dmg or
shadow image; those aliases fail when users open the DMG and show a plain white
window. This writer binds background.png on a mounted Oasis volume instead.
"""

from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
CLUSTER_WIDTH_ENV = SCRIPT_DIR / "build" / "dmg-cluster-width.env"

WINDOW_TOP = 80
WINDOW_LEFT = 120
WINDOW_WIDTH = 1440
WINDOW_HEIGHT = 880
ICON_SIZE = 128
ICON_Y = 300
HIDDEN_ICON = (1200, 800)


def _feature_art_width() -> int:
    width = WINDOW_WIDTH * 40 // 100
    if CLUSTER_WIDTH_ENV.is_file():
        for line in CLUSTER_WIDTH_ENV.read_text(encoding="utf-8").splitlines():
            if line.startswith("DMG_LAYOUT_FEATURE_ART_WIDTH="):
                width = int(line.split("=", 1)[1].strip())
                break
    return width


def icon_positions() -> tuple[tuple[int, int], tuple[int, int]]:
    width = _feature_art_width()
    left = (WINDOW_WIDTH - width) // 2
    return (left, ICON_Y), (left + width - ICON_SIZE, ICON_Y)


def write_dsstore(output: Path, background_png: Path) -> None:
    from ds_store import DSStore
    import mac_alias

    bg = background_png.resolve()
    if not bg.is_file():
        raise FileNotFoundError(f"background not found: {bg}")

    top = WINDOW_TOP
    left = WINDOW_LEFT
    fwi0 = (
        struct.pack(">H", top)
        + struct.pack(">H", left)
        + struct.pack(">H", top + WINDOW_HEIGHT)
        + struct.pack(">H", left + WINDOW_WIDTH)
        + b"icnv"
        + bytes(4)
    )

    alias = mac_alias.Alias.for_file(str(bg))
    icvp = {
        "viewOptionsVersion": 1,
        "backgroundType": 2,
        "backgroundImageAlias": alias.to_bytes(),
        "gridOffsetX": 0.0,
        "gridOffsetY": 0.0,
        "gridSpacing": 100.0,
        "iconSize": float(ICON_SIZE),
        "textSize": 12.0,
        "showIconPreview": True,
        "showItemInfo": False,
        "labelOnBottom": True,
        "scrollPositionX": 0.0,
        "scrollPositionY": 0.0,
        "arrangeBy": "none",
        "backgroundColorRed": 1.0,
        "backgroundColorGreen": 1.0,
        "backgroundColorBlue": 1.0,
    }

    app_icon, apps_icon = icon_positions()
    if output.exists():
        output.unlink()
    with DSStore.open(str(output), "w+") as ds:
        ds["."]["icvp"] = icvp
        ds["."]["fwi0"] = ("blob", fwi0)
        ds["."]["fwsw"] = ("long", 0)
        ds["."]["fwvh"] = ("shor", WINDOW_HEIGHT)
        ds["."]["ICVO"] = ("bool", True)
        ds["."]["icvt"] = ("shor", 12)
        ds["Oasis.app"]["Iloc"] = app_icon
        ds[" "]["Iloc"] = apps_icon
        ds[".DS_Store"]["Iloc"] = HIDDEN_ICON
        ds[".background"]["Iloc"] = (HIDDEN_ICON[0] + 80, HIDDEN_ICON[1])
        ds[".VolumeIcon.icns"]["Iloc"] = (HIDDEN_ICON[0] + 160, HIDDEN_ICON[1])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=SCRIPT_DIR / "dsstore",
        help="Output dsstore path (default: browser/branding/custom/dsstore)",
    )
    parser.add_argument(
        "--background",
        type=Path,
        default=SCRIPT_DIR / "background.png",
        help="Repo background.png used to resolve the on-volume alias",
    )
    parser.add_argument(
        "--volume-background",
        type=Path,
        help="background.png on a mounted Oasis volume (default: /Volumes/Oasis/.background/background.png)",
    )
    args = parser.parse_args()

    vol_bg = args.volume_background
    if vol_bg is None:
        vol_bg = Path("/Volumes/Oasis/.background/background.png")
    if not vol_bg.is_file():
        print(
            f"error: mount Oasis and ensure {vol_bg} exists, or pass --volume-background",
            file=sys.stderr,
        )
        return 1

    try:
        write_dsstore(args.output, vol_bg)
    except ImportError as exc:
        print(
            "error: install ds-store and mac-alias (pip3 install ds-store mac-alias)",
            file=sys.stderr,
        )
        print(f"  ({exc})", file=sys.stderr)
        return 1

    data = args.output.read_bytes()
    if b".dmg" in data or b"private/var/folders" in data:
        print("error: dsstore still contains host .dmg or temp paths", file=sys.stderr)
        return 1
    if b"background.png" not in data or b"Oasis" not in data:
        print("error: dsstore missing expected background binding", file=sys.stderr)
        return 1
    if args.output.stat().st_size < 4096:
        print("error: dsstore too small", file=sys.stderr)
        return 1

    print(f"Wrote {args.output} ({args.output.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
