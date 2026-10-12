#!/usr/bin/env python3
"""Show the beta number in Sparkle's update prompt before signing the feed."""

import re
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: label-macos-appcast.py FEED VERSION")
    path = Path(sys.argv[1])
    version = sys.argv[2].removeprefix("v")
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-beta\.\d+)?", version):
        raise SystemExit(f"unsupported release version: {version}")
    content = path.read_text(encoding="utf-8")
    replacements = (
        (r"(<item>\s*<title>)[^<]+(</title>)", 1),
        (r"(<sparkle:shortVersionString>)[^<]+(</sparkle:shortVersionString>)", 1),
    )
    for pattern, expected in replacements:
        content, count = re.subn(pattern, lambda match: f"{match[1]}{version}{match[2]}", content, count=1)
        if count != expected:
            raise SystemExit(f"missing appcast field: {pattern}")
    path.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    main()
