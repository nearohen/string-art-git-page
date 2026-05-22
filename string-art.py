"""
string-art.py — CLI launcher for the string-art auto-mode.

Usage:
    python string-art.py <session.json> <time-seconds> <output.dna>

Behavior:
    1. Reads STRINGART_SALT from the PC environment.
    2. Writes js/runtime-config.js (gitignored) holding window.__SALT__.
    3. Stages the session JSON under js/sessions/<unique>.json so each
       parallel run has its own URL.
    4. Ensures the local server (js/simpleServer.py) is running on :8000.
    5. Opens a new Chrome window pointing at index.html with auto-mode
       URL params: ?session=...&autoStart=1&time=N&autoSave=name.dna&testMode=1

The HTML auto-mode (in main.js) does the rest: fetch session, restore state,
bypass Firebase using window.__SALT__, click play, stop after N seconds,
trigger a download with the given filename.
"""

import argparse
import json
import os
import socket
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
JS_DIR = REPO_ROOT / "js"
SESSIONS_DIR = JS_DIR / "sessions"
SERVER_HOST = "localhost"
SERVER_PORT = 8000
SERVER_URL = f"http://{SERVER_HOST}:{SERVER_PORT}"
INDEX_PATH = "/index.html"


def write_runtime_config(salt: str) -> None:
    """Write js/runtime-config.js with the salt for the page to read."""
    target = JS_DIR / "runtime-config.js"
    # json.dumps gives us proper JS string escaping (quotes, backslashes, etc.)
    target.write_text(
        f"window.__SALT__ = {json.dumps(salt)};\n",
        encoding="utf-8",
    )
    print(f"  wrote {target.relative_to(REPO_ROOT)}")


def stage_session(session_path: str) -> str:
    """Copy the session JSON into js/sessions/ with a unique name and return
    the URL-relative path the page should fetch."""
    src = Path(session_path).resolve()
    if not src.exists():
        sys.exit(f"ERROR: session file not found: {src}")

    SESSIONS_DIR.mkdir(exist_ok=True)
    # Validate JSON before staging so the page doesn't fail mysteriously.
    raw = src.read_text(encoding="utf-8")
    try:
        json.loads(raw)
    except json.JSONDecodeError as e:
        sys.exit(f"ERROR: invalid JSON in {src}: {e}")

    run_id = f"run_{int(time.time() * 1000)}_{src.stem}"
    target = SESSIONS_DIR / f"{run_id}.json"
    target.write_text(raw, encoding="utf-8")
    rel = f"js/sessions/{run_id}.json"
    print(f"  staged session at {rel}")
    return rel


def is_port_open(host: str, port: int, timeout: float = 0.3) -> bool:
    """Return True if a TCP listener is already accepting on (host, port)."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def ensure_server_running() -> None:
    """If simpleServer.py isn't already on :8000, spawn it in the background."""
    if is_port_open(SERVER_HOST, SERVER_PORT):
        print(f"  server already running at {SERVER_URL}")
        return

    print(f"  starting simpleServer.py on {SERVER_URL}...")
    server_script = JS_DIR / "simpleServer.py"
    if not server_script.exists():
        sys.exit(f"ERROR: {server_script} not found")

    # Run from REPO_ROOT so SimpleHTTPRequestHandler serves the repo, not /js.
    # DETACHED_PROCESS keeps the server alive after this script exits (Windows).
    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_CONSOLE

    subprocess.Popen(
        [sys.executable, str(server_script)],
        cwd=str(REPO_ROOT),
        creationflags=creationflags,
    )

    # Wait briefly for the server to come up.
    for _ in range(40):
        if is_port_open(SERVER_HOST, SERVER_PORT):
            print(f"  server is up at {SERVER_URL}")
            return
        time.sleep(0.25)
    sys.exit("ERROR: server failed to start within 10 seconds")


def find_chrome() -> str:
    """Find the Chrome executable. Falls back to letting the OS resolve 'chrome'."""
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    # Last resort — let PATH resolve it.
    return "chrome"


def open_chrome(url: str) -> None:
    """Open the URL in a new Chrome window.

    A nudge to make Chrome treat this as a SEPARATE window rather than
    folding it into an existing tab: include --window-position so the new
    window has a distinct x,y. The position cycles through screen quadrants
    based on a counter file so 4-up CMYK runs visibly tile.
    """
    chrome = find_chrome()

    # Cycle through 4 quadrants. This is best-effort — the count file lives
    # under js/ and resets when the launcher is restarted from scratch.
    pos_file = JS_DIR / ".chrome_pos_counter"
    try:
        n = int(pos_file.read_text().strip()) if pos_file.exists() else 0
    except Exception:
        n = 0
    pos_file.write_text(str((n + 1) % 4))
    quadrants = [(0, 0), (700, 0), (0, 500), (700, 500)]
    px, py = quadrants[n % 4]

    args = [
        chrome,
        "--new-window",
        f"--window-position={px},{py}",
        "--window-size=680,640",
        url,
    ]
    print(f"  opening Chrome at ({px},{py}) -> {url}")
    subprocess.Popen(args)


def wait_for_download(filename: str, timeout_sec: int) -> bool:
    """Poll the user's Downloads folder for `filename` to appear.

    Returns True when the file is seen and stable (size hasn't changed for a
    second). Returns False if the timeout elapses without the file appearing.

    This lets the CLI run channels strictly sequentially: each invocation
    blocks until the page finishes saving its DNA, then returns so the next
    channel can launch into a clean Chrome state.
    """
    downloads = Path(os.path.expanduser("~")) / "Downloads"
    target = downloads / filename

    deadline = time.time() + timeout_sec
    last_size = -1
    stable_since = None

    while time.time() < deadline:
        if target.exists():
            sz = target.stat().st_size
            if sz == last_size and last_size > 0:
                if stable_since is None:
                    stable_since = time.time()
                elif time.time() - stable_since > 1.0:
                    print(f"  output file ready: {target} ({sz} bytes)")
                    return True
            else:
                last_size = sz
                stable_since = None
        time.sleep(0.5)

    print(f"  WARNING: timed out waiting for {target}")
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description="string-art CLI launcher")
    parser.add_argument("session", help="path to session JSON file")
    parser.add_argument("seconds", type=int, help="seconds to run before stopping (max cap)")
    parser.add_argument("output", help="output DNA filename (e.g. result.dna)")
    parser.add_argument(
        "--wait",
        action="store_true",
        help="block until the output DNA appears in ~/Downloads (used by cmyk.py for serial runs)",
    )
    args = parser.parse_args()

    salt = os.environ.get("STRINGART_SALT", "")
    if not salt:
        # We don't hard-fail because a user may genuinely want to test without
        # bypass (and rely on the normal Firebase flow). But we do warn loudly.
        print("WARNING: STRINGART_SALT is empty. Auto-mode bypass will be skipped.")
        print("         Set STRINGART_SALT in your env to enable testMode.")

    print("string-art launcher:")
    write_runtime_config(salt)
    session_url_path = stage_session(args.session)
    ensure_server_running()

    # testMode is always 1 — the bypass JS itself decides whether to act
    # (it no-ops with a warning when window.__SALT__ is empty, which lets
    # the normal Firebase sign-in flow proceed unchanged).
    qs = urllib.parse.urlencode({
        "session": session_url_path,
        "autoStart": "1",
        "time": args.seconds,
        "autoSave": args.output,
        "testMode": "1",
    })
    url = f"{SERVER_URL}{INDEX_PATH}?{qs}"
    open_chrome(url)

    if args.wait:
        # Block until the page saves its DNA. Add a generous buffer over the
        # hard time cap to account for Firebase auth, image decode, page
        # load, and the worker's flush-on-stop.
        timeout = args.seconds + 60
        print(f"  waiting up to {timeout}s for {args.output} to appear...")
        ok = wait_for_download(args.output, timeout)
        if not ok:
            print("  did not see expected output — moving on anyway")
        else:
            print("  channel finished.")
    else:
        print("done — Chrome will close-or-stay-open per its own behavior;")
        print("the page auto-saves the DNA when the timer fires.")


if __name__ == "__main__":
    main()
