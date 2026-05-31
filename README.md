# string-art-git-page

The string-art **optimizer / generator** frontend. You load an image, the
WebAssembly solver computes a nail-to-nail line sequence, you preview it
(including CMYK multi-channel mode), and you save the result as a project that
the playback PWA can build from. Static site, hosted via git.

Part of the String Art platform:

| Repo | Role |
|------|------|
| `stringartwasm` | C++ → WebAssembly solver (private) |
| **`string-art-git-page`** | **Optimizer / generator frontend (this repo)** |
| `string-art-instructions` | Instruction playback PWA |
| `string-art-functions` | Firebase Cloud Functions (backend) |

## Stack

- Vanilla JS + HTML + CSS, no build step
- WebAssembly solver produced by the private `stringartwasm` repo
- Firebase JS SDK (Auth + Realtime Database), project **`stringart-18a36`**
- Python helper scripts for offline experiments: `cmyk.py`, `split-cmyk.py`,
  `string-art.py`

## Run locally

It's a static site — serve the folder over HTTP:

```bash
python -m http.server 8081
# open http://localhost:8081/
```

Sign in with Google to load/save projects against your own
`users/{uid}/...` data.

## How data flows

- After optimizing, the app writes the project to
  `users/{uid}/instructions/{projectId}` (see `js/firebase.js`,
  `addInstructionsObToDB`).
- A Cloud Function (`string-art-functions`) reacts to that write and creates
  `users/{uid}/projectsMeta/{projectId}`.
- The playback PWA (`string-art-instructions`) then reads those to display and
  play the build steps.

## CMYK preview

Color projects are split into K/Y/M/C channels (`split-cmyk.py` /
`cmyk.py` for the offline pipeline). The in-app preview composites the channels
with `multiply` blending and supports **preview-only** controls:

- per-channel show/hide toggles
- a string-thickness slider (0.5×–2×)

These affect only the preview — they do **not** change the computed line
sequence. CMYK work lives on the `cymk-split` branch.

## Deploy

No CI pipeline. Hosting is served from git. Merge the working branch
(`cymk-split`) into the deploy branch and push.

## Key files

- `index.html` — main optimizer UI
- `js/main.js` — optimizer logic, preview rendering, CMYK compositing
- `js/firebase.js` — auth + writes projects to the Realtime Database
- `css/styles.css` — styles
- `*.py` — offline image/CMYK experiments (not used by the web app at runtime)
