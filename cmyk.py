"""
cmyk.py — launch 4 string-art runs in parallel, one per CMYK channel.

Usage:
    python cmyk.py <basename> <seconds>

Expects 4 session JSON files alongside the basename:
    <basename>_C.json   <basename>_M.json   <basename>_Y.json   <basename>_K.json

Spawns 4 Chrome windows (one per channel), each running for <seconds>.
Each window auto-saves its DNA as <basename>_C.dna, <basename>_M.dna, etc.

This is a thin wrapper around string-art.py — all the real work happens there.
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
LAUNCHER = REPO_ROOT / "string-art.py"
CHANNELS = ("C", "M", "Y", "K")


def main() -> None:
    parser = argparse.ArgumentParser(description="CMYK 4-channel parallel launcher")
    parser.add_argument(
        "basename",
        help="basename for session files (expects <basename>_{C,M,Y,K}.json)",
    )
    parser.add_argument("seconds", type=int, help="seconds to run each channel")
    args = parser.parse_args()

    base = Path(args.basename)

    # Look for either <base>_<ch>.txt or <base>_<ch>.json (split-cmyk.py
    # preserves the extension of its input).
    def find_channel_file(ch):
        for ext in (".txt", ".json"):
            candidate = base.parent / f"{base.name}_{ch}{ext}"
            if candidate.exists():
                return candidate
        return None

    found = {ch: find_channel_file(ch) for ch in CHANNELS}
    missing = [ch for ch, p in found.items() if p is None]
    if missing:
        sys.exit(
            "ERROR: could not find channel files for: "
            + ", ".join(missing)
            + f"\n  (looked for {base}_{{C,M,Y,K}}.{{txt,json}})"
        )

    print(f"cmyk launcher: {len(CHANNELS)} channels x {args.seconds}s (serial)")
    # We run channels strictly sequentially. Each call to string-art.py
    # passes --wait so it BLOCKS until the channel's DNA file lands in
    # Downloads before returning. This avoids the "Chrome dedups parallel
    # --new-window calls into background tabs that get throttled / fail
    # Firebase auth" problem we hit with parallel launches.
    for i, ch in enumerate(CHANNELS):
        session = found[ch]
        output = f"{base.name}_{ch}.dna"
        print(f"\n=== channel {ch} ({i+1}/{len(CHANNELS)}) ===")
        subprocess.run(
            [sys.executable, str(LAUNCHER), str(session), str(args.seconds), output, "--wait"],
            check=True,
        )

    print("\nall 4 channels launched. Watch the Chrome windows; each will")
    print("trigger a download when its timer fires.")


if __name__ == "__main__":
    main()
