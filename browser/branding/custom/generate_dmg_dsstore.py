#!/usr/bin/env python3
"""Fallback dsstore generator when Finder capture is unavailable.

Prefer capture_dmg_dsstore.sh, which binds the background alias correctly.
"""

import struct
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT = SCRIPT_DIR / "dsstore"

WINDOW_TOP = 80
WINDOW_LEFT = 120
WINDOW_WIDTH = 1440
WINDOW_HEIGHT = 880
ICON_SIZE = 128
ICON_Y = 300
WINDOW_CANVAS_WIDTH = 1440
CLUSTER_WIDTH_ENV = SCRIPT_DIR / "build" / "dmg-cluster-width.env"
HIDDEN_ICON = (1200, 800)


def icon_positions() -> tuple[tuple[int, int], tuple[int, int]]:
    """Match dmg_layout_common.sh; prefer build/dmg-cluster-width.env from build_branding_icons.sh."""
    width = WINDOW_CANVAS_WIDTH * 40 // 100
    if CLUSTER_WIDTH_ENV.is_file():
        for line in CLUSTER_WIDTH_ENV.read_text(encoding="utf-8").splitlines():
            if line.startswith("DMG_LAYOUT_FEATURE_ART_WIDTH="):
                width = int(line.split("=", 1)[1].strip())
                break
    left = (WINDOW_CANVAS_WIDTH - width) // 2
    return (left, ICON_Y), (left + width - ICON_SIZE, ICON_Y)

STALE_MARKERS = (
    b"Nightly",
    b"firefox-installer",
    b"oasis-dmg-install",
    b"private/var/folders",
)


def validate_dsstore(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 4096:
        return False
    data = path.read_bytes()
    if any(marker in data for marker in STALE_MARKERS):
        return False
    if b"background.png" not in data:
        return False
    return True


def write_dsstore() -> None:
    from ds_store import DSStore

    top = WINDOW_TOP
    left = WINDOW_LEFT
    bottom = WINDOW_TOP + WINDOW_HEIGHT
    right = WINDOW_LEFT + WINDOW_WIDTH
    fwi0 = (
        struct.pack(">H", top)
        + struct.pack(">H", left)
        + struct.pack(">H", bottom)
        + struct.pack(">H", right)
        + b"icnv"
        + bytes(4)
    )

    icvp = {
        "viewOptionsVersion": 1,
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
        "backgroundType": 1,
    }

    with DSStore.open(str(OUTPUT), "w+") as ds:
        ds["."]["icvp"] = icvp
        ds["."]["fwi0"] = ("blob", fwi0)
        ds["."]["fwsw"] = ("long", 0)
        ds["."]["fwvh"] = ("shor", WINDOW_HEIGHT)
        ds["."]["ICVO"] = ("bool", True)
        ds["."]["icvt"] = ("shor", 12)
        app_icon, apps_icon = icon_positions()
        ds["Oasis.app"]["Iloc"] = app_icon
        ds[" "]["Iloc"] = apps_icon
        ds[".DS_Store"]["Iloc"] = HIDDEN_ICON
        ds[".background"]["Iloc"] = (HIDDEN_ICON[0] + 80, HIDDEN_ICON[1])
        ds[".VolumeIcon.icns"]["Iloc"] = (HIDDEN_ICON[0] + 160, HIDDEN_ICON[1])


def main() -> int:
    try:
        write_dsstore()
    except ImportError as exc:
        print(
            "error: install ds-store (pip3 install ds-store mac-alias)",
            file=sys.stderr,
        )
        print(f"  ({exc})", file=sys.stderr)
        return 1

    if not validate_dsstore(OUTPUT):
        print(
            "error: fallback dsstore is missing a valid background binding; "
            "run capture_dmg_dsstore.sh on macOS",
            file=sys.stderr,
        )
        return 1

    print(f"Wrote fallback {OUTPUT} (solid background; run capture for image background)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
