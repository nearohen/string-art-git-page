"""
split-cmyk.py — split a saved string-art session into 4 channel sessions.

Usage:
    python split-cmyk.py <session.txt> [--gcr 0.20]

Reads the session JSON, decodes its embedded color image (originalImgSrc),
applies the same crop & resize the HTML did, then produces 4 new sessions
identical to the input except that thumbnailMainRaw is replaced with the
per-channel grayscale "ink density" map for C, M, Y, and K.

Output filenames:
    <session>_C.<ext>
    <session>_M.<ext>
    <session>_Y.<ext>
    <session>_K.<ext>

GCR (Gray Component Replacement) controls how much of the neutral component
moves into the K layer:
    K_density   = gcr * (255 - max(R,G,B))
    C_target    = clamp(R + K_density)        (srcBuff convention: 0=ink, 255=blank)
    M_target    = clamp(G + K_density)
    Y_target    = clamp(B + K_density)
    K_target    = 255 - K_density

A bright pixel becomes 255 in every channel (no ink needed).
A pure-red pixel becomes 0 in M and Y (full ink), 255 in C and K (no ink).
A pure-black pixel splits according to gcr — at gcr=0.20, K gets 20% of the
darkness and the remaining 80% is shared by C, M, Y.

Requires Pillow:
    pip install Pillow
"""

import argparse
import base64
import copy
import json
import sys
from io import BytesIO
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("ERROR: Pillow not installed. Run:  pip install Pillow")


CHANNELS = ("C", "M", "Y", "K")


def decode_original(data_url: str) -> Image.Image:
    """Decode a 'data:image/...;base64,xxx' URL to a PIL RGB image."""
    if "," not in data_url:
        sys.exit("ERROR: originalImgSrc is not a data: URL")
    _, b64 = data_url.split(",", 1)
    raw = base64.b64decode(b64)
    return Image.open(BytesIO(raw)).convert("RGB")


# The HTML displays the original image inside a canvas that is
# original.width / IMG_TO_CANVAS_SCLAE wide. The rec* fields the user drags
# are in CANVAS coordinates, so to map back to the original image we
# multiply by this scale.
IMG_TO_CANVAS_SCALE = 3   # matches js/main.js:158 (sic: typo'd as SCLAE there)


def cropped_thumbnail(img: Image.Image, session: dict) -> Image.Image:
    """Apply the same crop the HTML did, then resize to (sourceWidth, sourceHeight).

    The HTML draws via:
        ctx.drawImage(src, recOffX*scale, recOffY*scale,
                           recWidth*scale, recHeight*scale,
                           0, 0, canvas.w, canvas.h)
    so rec* in the saved JSON are in CANVAS coords (original / scale).
    Multiply by scale to get original-image pixel coordinates.
    """
    s = IMG_TO_CANVAS_SCALE
    left   = session["recOffX"]    * s
    top    = session["recOffY"]    * s
    right  = left + session["recWidth"]  * s
    bottom = top  + session["recHeight"] * s

    # PIL accepts non-integer floats and floors internally, but be explicit.
    crop_box = (
        max(0, left),
        max(0, top),
        min(img.width,  right),
        min(img.height, bottom),
    )
    cropped = img.crop(crop_box)

    sw = int(session["sourceWidth"])
    sh = int(session["sourceHeight"])
    return cropped.resize((sw, sh), Image.LANCZOS)


def channel_grayscale_image(rgb_img: Image.Image, channel: str, gcr: float) -> Image.Image:
    """Return a grayscale PIL Image (mode 'L') the same size as `rgb_img`,
    where pixel value = the srcBuff-convention "ink target" for `channel`
    (0 = full ink, 255 = blank).

    We render at the ORIGINAL image dimensions so that the HTML's load-flow
    (which redraws from originalImgSrc and re-derives thumbnailMainRaw on
    every session start) produces our channel data, not the RGB average."""
    w, h = rgb_img.size
    src = rgb_img.load()
    out = Image.new("L", (w, h))
    out_pix = out.load()

    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            mxv = max(r, g, b)
            k_dens = gcr * (255 - mxv)
            if channel == "C":
                v = r + k_dens
            elif channel == "M":
                v = g + k_dens
            elif channel == "Y":
                v = b + k_dens
            else:  # K
                v = 255 - k_dens
            out_pix[x, y] = max(0, min(255, int(round(v))))

    return out


def img_to_data_url(img: Image.Image) -> str:
    """PNG-encode a PIL image and return a 'data:image/png;base64,...' URL,
    matching the format the HTML stores in originalImgSrc."""
    buf = BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def make_channel_session(base_session: dict, ch: str,
                         channel_data_url: str) -> dict:
    """Return a deep-copied session with originalImgSrc swapped for the
    channel-grayscale PNG, and any saved DNA cleared so each channel starts
    fresh.

    Note: we do NOT touch thumbnailMainRaw. main.js's updateThumbnails()
    re-derives it from originalImg on every session start, so anything we
    put there would be overwritten anyway. Replacing only originalImgSrc
    is the minimal correct change."""
    s = copy.deepcopy(base_session)
    s["originalImgSrc"] = channel_data_url

    # Clear any baked-in DNA — old snapshot is from the original source,
    # not this channel. Each channel starts from zero lines.
    s["snapshotB64"]    = ""
    s["snapshotBuffer"] = {}
    s["serverSnapshot"] = ""
    s["lines"]          = 0

    # Tag the filename so the HTML's UI shows which channel this is.
    orig_name = s.get("sessionFileName", "")
    if orig_name:
        stem, _, ext = orig_name.rpartition(".")
        if stem:
            s["sessionFileName"] = f"{stem}_{ch}.{ext}"
        else:
            s["sessionFileName"] = f"{orig_name}_{ch}"

    return s


def main() -> None:
    p = argparse.ArgumentParser(description="Split a session JSON into 4 CMYK sessions")
    p.add_argument("session", help="path to source session JSON/TXT")
    p.add_argument(
        "--gcr",
        type=float,
        default=0.20,
        help="GCR fraction (0..1) — how much neutral density moves to K. Default 0.20.",
    )
    p.add_argument(
        "--out-dir",
        default=None,
        help="output directory (default: same as input)",
    )
    args = p.parse_args()

    if not (0.0 <= args.gcr <= 1.0):
        sys.exit("ERROR: --gcr must be between 0.0 and 1.0")

    src = Path(args.session).resolve()
    if not src.exists():
        sys.exit(f"ERROR: file not found: {src}")

    with open(src, encoding="utf-8") as f:
        session = json.load(f)

    print(f"input: {src.name}")
    print(f"  thumbnail: {session['sourceWidth']} x {session['sourceHeight']}")
    print(f"  crop:      ({session['recOffX']:.1f}, {session['recOffY']:.1f}) "
          f"size ({session['recWidth']:.1f}, {session['recHeight']:.1f})")
    print(f"  GCR:       {args.gcr:.2f}  ({int(args.gcr * 100)}% K)")

    img = decode_original(session["originalImgSrc"])
    print(f"  original:  {img.width} x {img.height} (decoded from originalImgSrc)")

    out_dir = Path(args.out_dir).resolve() if args.out_dir else src.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"\nwriting:")
    for ch in CHANNELS:
        # Channel grayscale at ORIGINAL image dims — this becomes the new
        # originalImgSrc; the HTML's load flow re-derives thumbnailMainRaw
        # from it automatically.
        ch_img_full = channel_grayscale_image(img, ch, args.gcr)
        ch_data_url = img_to_data_url(ch_img_full)

        new_session = make_channel_session(session, ch, ch_data_url)
        out_path = out_dir / f"{src.stem}_{ch}{src.suffix}"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(new_session, f)

        # Eyeball preview — what the wasm will see after the HTML's
        # crop + resize at thumbnail dims.
        preview = cropped_thumbnail(ch_img_full, session)
        preview_path = out_dir / f"{src.stem}_{ch}.preview.png"
        preview.save(preview_path)
        print(f"  {out_path.name}   (+ {preview_path.name})")

    print("\ndone. Next:")
    print(f"  python cmyk.py \"{out_dir / src.stem}\" 600")
    print("(assumes your STRINGART_SALT env var is set)")


if __name__ == "__main__":
    main()
