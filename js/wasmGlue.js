// ──────────────────────────────────────────────────────────────────────────
// Slot abstraction
//   A Slot = one Worker (one wasm session) + its auth/snapshot state.
//   Single-channel mode: 1 slot named 'main'.
//   CMYK mode (Phase 2): 4 slots — 'K','Y','M','C' — running in parallel.
//
//   Slot state lives in module-local `_slots` map (NOT runTimeState, which
//   gets reset by initRunTimeState() in main.js after wasmGlue.js loads).
//   The active slot's auth/snapshot fields are mirrored into the existing
//   sessionState.snapshotBuffer / sessionKey / sessionLock and
//   runTimeState.keyConfirmed so the rest of the app keeps working
//   unmodified during the refactor.
// ──────────────────────────────────────────────────────────────────────────

const SAImprove = Module.cwrap("SA_Improve", "number", ["number","string"]);

const _slots = {};               // slotId → Slot
let   _activeSlotId = 'main';

function createSlot(slotId) {
    console.log(`[slot ${slotId}] creating worker`);
    const slot = {
        id: slotId,
        worker: new Worker("./js/improveWorker.js"),
        sessionLock: "",
        sessionKey: "",
        keyConfirmed: false,
        snapshotBuffer: null,
        keyRejectedCount: 0,
        playing: false,            // is this slot's improve interval running?
        onKeyConfirmed: null,      // optional one-shot callback fired when keyConfirmed flips true (used for "wait for slot ready")
    };

    slot.worker.onmessage = function({data: {type, args}}) {
        if (type === "snapshotBuffer") {
            // Drop snapshots arriving from an old wasm session during an
            // in-place switch (legacy single-slot path — irrelevant in
            // the full multi-slot world but keep for now).
            if (typeof runTimeState !== 'undefined' && runTimeState.ignoreSnapshotsDuringSwitch &&
                slot.id === _activeSlotId) {
                console.log(`[slot ${slot.id}] dropping snapshot during switch`);
                slot.worker.postMessage({
                    cmd: "returnBuffer",
                    args: { buffer: args.buffer, bufferIndex: args.bufferIndex }
                });
                return;
            }

            const incoming = new Int8Array(args.buffer).slice();
            slot.snapshotBuffer = incoming;

            // Mirror to global sessionState for the ACTIVE slot only —
            // the rest of the app (drawing code, save flow) reads from
            // sessionState.snapshotBuffer.
            if (slot.id === _activeSlotId) {
                sessionState.snapshotBuffer = incoming;
                applyMinLengthFilter(sessionState.snapshotBuffer);
                sessionState.newSnapshotBuffer = true;
            }

            slot.worker.postMessage({
                cmd: "returnBuffer",
                args: { buffer: args.buffer, bufferIndex: args.bufferIndex }
            });
        }
        else if (type === "sessionLock") {
            console.log(`[slot ${slot.id}] sessionLock received: ${args.sessionLock}`);
            slot.sessionLock = args.sessionLock;
            slot.sessionKey  = "";
            slot.keyConfirmed = false;

            if (slot.id === _activeSlotId) {
                sessionState.sessionLock = slot.sessionLock;
                sessionState.sessionKey  = "";
                runTimeState.keyConfirmed = false;
                const lockEl = document.getElementById('lock');
                if (lockEl) lockEl.textContent = slot.sessionLock.length > 0 ? "locked" : "...";
                const ke = document.getElementById('key');
                if (ke) ke.textContent = "...";
                emitStateChange(runTimeState.state); // refresh button gate
            }

            if (!runTimeState.user) {
                console.warn(`[slot ${slot.id}] no user yet, skipping updateDB`);
                return;
            }
            window.updateDB(runTimeState.user.uid, slot.sessionLock, (key) => {
                console.log(`[slot ${slot.id}] assemblyKey delivered: ${key}`);
                slot.sessionKey = key || "";
                slot.keyConfirmed = !!(key && key.length > 0);
                if (slot.id === _activeSlotId) {
                    sessionState.sessionKey = slot.sessionKey;
                    runTimeState.keyConfirmed = slot.keyConfirmed;
                    const ke = document.getElementById('key');
                    if (ke) ke.textContent = slot.keyConfirmed ? "got key" : "...";
                    emitStateChange(States.SC);
                }
                // Fire one-shot ready callback (for spawnChannelSlot's promise)
                if (slot.keyConfirmed && slot.onKeyConfirmed) {
                    const cb = slot.onKeyConfirmed;
                    slot.onKeyConfirmed = null;
                    try { cb(slot); } catch(e) { console.error(`[slot ${slot.id}] onKeyConfirmed threw:`, e); }
                }
            }, slot.id /* per-slot unsubscribe id */);
        }
        else if (type === "keyRejected") {
            slot.keyRejectedCount++;
            console.warn(`[slot ${slot.id}] key rejected (count=${slot.keyRejectedCount}), re-authorizing — keyConfirmed FALSE`);
            slot.sessionKey = "";
            slot.keyConfirmed = false;

            if (slot.id === _activeSlotId) {
                sessionState.sessionKey = "";
                runTimeState.keyConfirmed = false;
                runTimeState.keyRejectedCount = (runTimeState.keyRejectedCount || 0) + 1;
                const ke = document.getElementById('key');
                if (ke) ke.textContent = "re-auth...";
                emitStateChange(States.ST);
            }

            if (runTimeState.user && slot.sessionLock) {
                window.updateDB(runTimeState.user.uid, slot.sessionLock, (key) => {
                    console.log(`[slot ${slot.id}] re-auth key: ${key}`);
                    slot.sessionKey = key || "";
                    slot.keyConfirmed = !!(key && key.length > 0);
                    if (slot.id === _activeSlotId) {
                        sessionState.sessionKey = slot.sessionKey;
                        runTimeState.keyConfirmed = slot.keyConfirmed;
                        const ke = document.getElementById('key');
                        if (ke) ke.textContent = slot.keyConfirmed ? "got key" : "...";
                        emitStateChange(runTimeState.state);
                    }
                }, slot.id);
            }
        }
        else {
            console.log(`[slot ${slot.id}] unhandled msg type=${type}`);
        }
    };

    return slot;
}

// Apply MinLength filter in-place on a snapshot buffer view.
function applyMinLengthFilter(buf) {
    if (!buf) return;
    let lineIndex = 0;
    for (let i = 0; i < buf.length; i++) {
        let byte = buf[i];
        for (let bit = 0; bit < 8; bit++) {
            if (byte & (1 << bit)) {
                if (lineIndex < runTimeState.linesArr.length) {
                    const line = runTimeState.linesArr[lineIndex];
                    const dotAIndex = line.dotA[2];
                    const dotBIndex = line.dotB[2];
                    const numDots = sessionState.dots.length;
                    const indexDist = Math.min(
                        Math.abs(dotBIndex - dotAIndex),
                        Math.abs(dotBIndex - dotAIndex + numDots),
                        Math.abs(dotBIndex - dotAIndex - numDots)
                    );
                    if (indexDist < sessionState.minLength) {
                        buf[i] &= ~(1 << bit);
                    }
                }
            }
            lineIndex++;
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Slot helpers
// ──────────────────────────────────────────────────────────────────────────

function getActiveSlot()  { return _slots[_activeSlotId]; }
function getActiveWorker(){ const s = getActiveSlot(); return s ? s.worker : null; }
function getSlot(id)      { return _slots[id]; }
function getSlotIds()     { return Object.keys(_slots); }
function forEachSlot(fn)  { for (const id of Object.keys(_slots)) fn(_slots[id], id); }
function setActiveSlotId(id) {
    if (!_slots[id]) { console.warn(`setActiveSlotId: unknown slot ${id}`); return; }
    console.log(`[slot] active slot changed: ${_activeSlotId} → ${id} (playing=${_slots[id].playing}, keyConfirmed=${_slots[id].keyConfirmed})`);
    _activeSlotId = id;
    improveWorker = _slots[id].worker;   // keep legacy alias in sync
    // Re-mirror the new active slot's state into the global session fields
    // so anything reading sessionState.sessionKey etc. sees the right values.
    const s = _slots[id];
    sessionState.sessionLock  = s.sessionLock;
    sessionState.sessionKey   = s.sessionKey;
    runTimeState.keyConfirmed = s.keyConfirmed;
    // ALWAYS set, even if slot.snapshotBuffer is null — otherwise the
    // canvas keeps showing the previous channel's strings on the new
    // channel's image (visually jarring "stopping between switches").
    sessionState.snapshotBuffer = s.snapshotBuffer || null;
    sessionState.newSnapshotBuffer = true;
    console.log(`[slot ${id}] mirrored snapshotBuffer to sessionState (${s.snapshotBuffer ? s.snapshotBuffer.length+'B' : 'null'})`);
    // Refresh the lock/key DOM text for the new active slot.
    const lockEl = document.getElementById('lock');
    if (lockEl) lockEl.textContent = s.sessionLock && s.sessionLock.length > 0 ? "locked" : "...";
    const ke = document.getElementById('key');
    if (ke) ke.textContent = s.keyConfirmed ? "got key" : "...";
    // Update runTimeState.state to match new slot's play state, AND emit
    // a stateChange so the icon syncer + visibility rules refresh for the
    // new slot. We pick PL vs ST based on slot.playing; the rest of the
    // state-machine semantics (SC, ES, etc.) don't apply per-slot.
    if (typeof emitStateChange === 'function' && typeof States !== 'undefined') {
        emitStateChange(s.playing ? States.PL : States.ST);
    }
}
function getActiveSlotId(){ return _activeSlotId; }

// No transfer list — see comment on PostWorkerMessage.
function postToSlot(id, ob) {
    const s = _slots[id];
    if (!s) { console.warn(`[slot ${id}] postToSlot but slot doesn't exist`); return; }
    s.worker.postMessage(ob);
}
function postToAllSlots(ob) {
    forEachSlot((s, id) => { s.worker.postMessage(ob); });
}

// Per-slot play/stop. Sets slot.playing + posts the cmd to that slot only.
// Used by main.js Play/Stop (which target the active slot) and by future
// fan-out logic (e.g. "play all CMYK channels at once").
function slotPlay(slotId, startImproveArgs) {
    const s = _slots[slotId];
    if (!s) { console.warn(`[slot ${slotId}] slotPlay: slot missing`); return false; }
    if (!s.keyConfirmed) {
        console.warn(`[slot ${slotId}] slotPlay BLOCKED: key not confirmed yet`);
        return false;
    }
    s.playing = true;
    console.log(`[slot ${slotId}] slotPlay → posting startImprove`);
    s.worker.postMessage({cmd: "startImprove", args: startImproveArgs});
    return true;
}
function slotStop(slotId) {
    const s = _slots[slotId];
    if (!s) { console.warn(`[slot ${slotId}] slotStop: slot missing`); return; }
    s.playing = false;
    console.log(`[slot ${slotId}] slotStop → posting stopImprove`);
    s.worker.postMessage({cmd: "stopImprove", args: {}});
}

// Create a new slot, post its init JSON to its worker, and return a
// promise that resolves once the slot's keyConfirmed flips true
// (== ready to be Play()ed). Each slot does its own SA_Init + Firebase
// auth round-trip — they happen in parallel since each lives in its
// own Worker.
function spawnChannelSlot(slotId, initJson, options) {
    if (_slots[slotId]) {
        console.warn(`[slot ${slotId}] spawn but slot already exists — destroying old first`);
        destroyChannelSlot(slotId);
    }
    const opts = options || {};
    const timeoutMs = opts.timeoutMs || 30000;
    const slot = createSlot(slotId);
    _slots[slotId] = slot;
    // If we have no active slot at all (e.g. the default 'main' was torn
    // down before any channel slot was spawned), promote this one to
    // active so its onmessage mirror-to-sessionState code path fires
    // during init. setActiveChannel will re-run setActiveSlotId later
    // for the eventual UI swap which is harmless.
    if (!_activeSlotId) {
        _activeSlotId = slotId;
        improveWorker = slot.worker;
        console.log(`[slot ${slotId}] auto-promoted to active (no other active slot)`);
    }
    console.log(`[slot ${slotId}] spawned, posting init`);
    slot.worker.postMessage({cmd: "init", args: initJson});

    return new Promise((resolve, reject) => {
        const deadline = setTimeout(() => {
            if (slot.onKeyConfirmed === handler) {
                slot.onKeyConfirmed = null;
                reject(new Error(`[slot ${slotId}] spawn timed out after ${timeoutMs}ms (keyConfirmed never flipped)`));
            }
        }, timeoutMs);
        const handler = (s) => {
            clearTimeout(deadline);
            console.log(`[slot ${slotId}] ready (keyConfirmed)`);
            resolve(s);
        };
        slot.onKeyConfirmed = handler;
    });
}

function destroyChannelSlot(slotId) {
    const s = _slots[slotId];
    if (!s) return;
    console.log(`[slot ${slotId}] destroyChannelSlot`);
    try { s.worker.postMessage({cmd: "stopImprove", args: {}}); } catch(e) {}
    try { s.worker.terminate(); } catch(e) { console.warn(`[slot ${slotId}] terminate threw:`, e); }
    delete _slots[slotId];
    if (_activeSlotId === slotId) {
        const fallback = Object.keys(_slots)[0];
        if (fallback) {
            console.log(`[slot ${slotId}] was active, falling back to ${fallback}`);
            setActiveSlotId(fallback);
        } else {
            console.warn(`[slot ${slotId}] was active and no other slots remain`);
            _activeSlotId = null;
        }
    }
}

// Destroy every slot. Called when starting a new project so stale slots
// from a previous project (CMYK channels, the original main) don't keep
// running.
function tearDownAllSlots() {
    const ids = Object.keys(_slots);
    console.log(`[slot] tearDownAllSlots: destroying ${ids.length} slot(s) [${ids.join(',')}]`);
    for (const id of ids) {
        try { destroyChannelSlot(id); } catch(e) { console.warn(`destroy ${id} threw:`, e); }
    }
}

// (Re)create the default single-channel 'main' slot and make it active.
// Used by code paths that start a non-CMYK session — they call
// tearDownAllSlots() first, then this.
function recreateMainSlot() {
    if (_slots.main) {
        destroyChannelSlot('main');
    }
    _slots.main = createSlot('main');
    improveWorker = _slots.main.worker;
    _activeSlotId = 'main';
    console.log(`[slot main] recreateMainSlot done`);
}

// ──────────────────────────────────────────────────────────────────────────
// Spawn the default 'main' slot at module load.
// `improveWorker` stays as a backcompat alias to the main slot's worker
// (it gets reassigned by setActiveSlotId if/when we go multi-slot).
// ──────────────────────────────────────────────────────────────────────────
_slots.main = createSlot('main');
let improveWorker = _slots.main.worker;

// The old PostWorkerMessage took one argument and silently ignored any
// second-arg "transfer list" that callers (UpdatThumbnailMainRaw,
// StartCapturing, etc.) passed. Those transfer lists contained
// sessionState.thumbnailMainRaw which is a VIEW into wasm heap, NOT a
// transferable ArrayBuffer — actually trying to transfer it throws
// DataCloneError. Keep the one-arg signature for behavior parity.
function PostWorkerMessage(ob) {
    const w = getActiveWorker();
    if (!w) { console.warn("PostWorkerMessage but no active worker"); return; }
    w.postMessage(ob);
}

function UpdatThumbnailMainRaw(){
    PostWorkerMessage({cmd: "updateThumbnailMainRaw",args : { thumbnailMainRaw : sessionState.thumbnailMainRaw }},[sessionState.thumbnailMainRaw]);
}

function UpdatThumbnailFocusRaw(){
    PostWorkerMessage({cmd: "updateThumbnailFocusRaw",args : { thumbnailFocusRaw : sessionState.thumbnailFocusRaw }},[sessionState.thumbnailFocusRaw]);
}

// Targets the ACTIVE slot. Per-slot play state lives on slot.playing —
// channel switch then preserves "K was playing, Y was paused" naturally.
function StartCapturing()
{
    const slot = getActiveSlot();
    try {
        console.log("[DIAG] StartCapturing called",
            "activeSlot=", _activeSlotId,
            "slotKeyConfirmed=", slot && slot.keyConfirmed,
            "currentState=", (typeof runTimeState !== 'undefined' ? runTimeState.state : '?'),
            "hasThumbnail=", !!sessionState.thumbnailMainRaw);
    } catch(e) { /* defensive */ }

    if (!sessionState.thumbnailMainRaw) return;
    if (!slot) { console.warn("StartCapturing: no active slot"); return; }
    if (!slot.keyConfirmed) {
        console.warn(`[slot ${_activeSlotId}] StartCapturing blocked — key not confirmed yet`);
        return;
    }
    const ok = slotPlay(_activeSlotId, {
        thumbnailMainRaw: sessionState.thumbnailMainRaw,
        sessionKey: slot.sessionKey,
    });
    if (ok) emitStateChange(States.PL);
}

// Targets the ACTIVE slot — used by Stop() in main.js so single-channel
// keeps its current behavior. In CMYK mode this stops only the
// currently-visible channel; the others keep doing whatever they were doing.
function StopCapturing() {
    if (!_activeSlotId) return;
    slotStop(_activeSlotId);
}
