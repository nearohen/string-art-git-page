# CLAUDE.md — string-art-git-page

Working notes for Nir + Claude. (General overview is in `README.md`.)

## What this is

The optimizer / generator frontend. Loads an image, runs the WASM solver,
previews the result (incl. CMYK), and **writes the project to Firebase** so the
playback PWA can read it.

## ⚠️ Notes

- **This app DOES write to Firebase** — unlike `string-art-instructions`. It
  writes `users/{uid}/instructions/{projectId}` via `js/firebase.js`
  (`addInstructionsObToDB`). A Cloud Function then creates `projectsMeta`.
- **No CI pipeline.** Static site served from git; deploy by merging to the
  deploy branch and pushing. Pushing a feature branch does not deploy.
- Active work is on the **`cymk-split`** branch (CMYK multi-channel).
- The WASM module comes from the private `stringartwasm` repo
  (`stringArtWasm.js` + `.wasm`).

## CMYK preview

- Channels split K/Y/M/C, composited with `multiply` blending.
- The per-channel show/hide toggles and the thickness slider (0.5×–2×) are
  **preview-only** — they must **never** change the computed line sequence.
- Relevant code in `js/main.js`: `renderCMYKPreview`, `renderCMYKComposite`,
  `wireCmykToggles`, `cmykShowPreview`.

## Run locally

```bash
python -m http.server 8081   # open http://localhost:8081/
```

## Housekeeping

- There's a junk file literally named `et --hard <hash>` from a mistyped git
  command — safe to delete.
- Other untracked files (`bobFace.png`, `temp.jpg`, `legacy.html`,
  `manifest.json`, `sw.js`) are scratch, not part of the app.

## Sibling repos

`stringartwasm` (private solver) · `string-art-instructions` (playback PWA,
read-only) · `string-art-functions` (Cloud Functions backend).
