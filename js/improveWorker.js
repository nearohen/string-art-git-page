console.log("hello from worker");
importScripts('./stringArtWasm.js');

// Wait-for-wasm-runtime gate. Module.cwrap registers lazy wrappers
// synchronously, but actually CALLING them (like SAInit) requires the wasm
// runtime to be fully initialized. Chrome does that asynchronously, and
// without HTTP caching it takes long enough that the page's first "init"
// message can arrive before the runtime is ready — manifests as
// "_emscripten_stack_get_current is not a function". Queue any early
// messages and replay them once the runtime fires.
var _wasmReady = false;
var _pendingMsgs = [];
Module.onRuntimeInitialized = function() {
    console.log("[worker] wasm runtime initialized");
    _wasmReady = true;
    if (_pendingMsgs.length) {
        console.log("[worker] flushing", _pendingMsgs.length, "queued message(s)");
        const msgs = _pendingMsgs.splice(0);
        for (const m of msgs) {
            try { onmessage(m); } catch (e) { console.error("[worker] queued msg error", e); }
        }
    }
};

var SAImprove = Module.cwrap(
    "SA_Improve",
    "number",
    ["number","string"]
  ); 
  
var SAInit = Module.cwrap(
    'SA_Init',
    'string',
    ['string']
); 

const BUFF_SNAPSHOT = 1;
const BUFF_SRC_RAW = 2;
const BUFF_SRC_FOCUS = 3;
const BUFF_RELEVANT_MASK = 4;
const BUFFER_POOL_SIZE = 2; // Can adjust size based on needs

// SA_Improve return codes — keep in sync with stringArtWasm.cpp
const SESSION_OK            =  0;
const SESSION_FAILED        = -1;
const SESSION_KEY_REJECTED  = -2;

var SAGetBuffer = Module.cwrap(
    "SA_GetBuffer",
    "number",
    ["i8*"]
);

var SARebuildRelevantLines = Module.cwrap(
    "SA_RebuildRelevantLines",
    "number",
    []
);


var SAGetBufferLength = Module.cwrap(
    "SA_GetBufferLength",
    "number",
    ["number"]
);


var SASetDParam = Module.cwrap(
    "SA_SetDParam",
    "number",
    ["string","double"]
);


var SASetNParam = Module.cwrap(
    "SA_SetNParam",
    "number",
    ["string","number"]
);

var SASetSParam = Module.cwrap(
    "SA_SetDParam",
    "number",
    ["string","string"]
);

const workerState = {
    improveInterval: 0,
    snapshotBuffer: undefined,
    bufferPool: [], // Array to hold our pre-allocated buffers
    bufferStates: [], // Track if buffer is available
    currentBufferIndex: 0,
    srcRawBuffer: undefined,
    srcFocusBuffer: undefined,
    relevantMaskBuffer: undefined,
    // --- DIAG: research sporadic "endless loop" / leaked-interval bug ---
    diag: {
        startImproveCount: 0,   // how many times startImprove arrived
        stopImproveCount: 0,    // how many times stopImprove arrived
        intervalFireCount: 0,   // total times the setInterval callback fired
        lastFireTs: 0,          // ms timestamp of last fire (to detect tight-loop bursts)
        lastReportTs: 0,        // last time we printed a periodic diag
        leakedIntervalsSuspected: 0, // # of times we overwrote a non-zero improveInterval
    }
}

function initWorkerState() {
    console.log("initWorkerState");
    if(workerState.improveInterval)
    {
        clearInterval(workerState.improveInterval);
        workerState.improveInterval = 0;
    }
    workerState.snapshotBuffer = undefined;
    workerState.bufferPool = [];
    workerState.bufferStates = [];
    workerState.currentBufferIndex = 0;
    workerState.srcRawBuffer = undefined;
    workerState.srcFocusBuffer = undefined;
    workerState.relevantMaskBuffer = undefined;
}

function typedArrayToBuffer(array) {
    return array.buffer.slice(array.byteOffset, array.byteLength + array.byteOffset);
}

onmessage = function (msg){

    // If the runtime isn't ready yet, queue any wasm-touching command
    // until onRuntimeInitialized fires. We don't gate stopImprove or
    // initWorkerState because they're cheap pure-JS bookkeeping.
    const cmd0 = msg && msg.data && msg.data.cmd;
    const needsWasm = cmd0 === 'init' || cmd0 === 'startImprove' ||
                      cmd0 === 'updateThumbnailMainRaw' ||
                      cmd0 === 'updateThumbnailFocusRaw' ||
                      cmd0 === 'setRelevantMask' ||
                      cmd0 === 'updateParam';
    if (needsWasm && !_wasmReady) {
        console.log("[worker] queueing", cmd0, "until wasm ready");
        _pendingMsgs.push(msg);
        return;
    }

    const {data : {cmd ,args}} = msg ;
    if(cmd === "stopImprove")
    {
        workerState.diag.stopImproveCount++;
        // DIAG: log existing interval id so we can see if a leaked one is still running.
        // If user reports "I pressed stop but strings keep forming", expect prevId !== 0
        // here AND another interval still firing in the logs after this line.
        const prevId = workerState.improveInterval;
        console.log("on cmd stopImprove",
            "prevIntervalId=", prevId,
            "stopCount=", workerState.diag.stopImproveCount,
            "totalFires=", workerState.diag.intervalFireCount,
            "leaksSuspected=", workerState.diag.leakedIntervalsSuspected);
        clearInterval(workerState.improveInterval) ;
        workerState.improveInterval = 0;
    }
    else if(cmd === "startImprove")
    {
        workerState.diag.startImproveCount++;
        // DIAG: BUG SUSPECT — if improveInterval is already non-zero, the previous
        // interval id is about to be overwritten and LEAKED (cannot be cleared later).
        // Two intervals will run concurrently => double the fire rate, "endless loop"
        // appearance, and stop button only kills the newest one.
        // Hypothesis: Firebase "Data changed" handler retriggers StartCapturing()
        // while one is already running.
        if(workerState.improveInterval)
        {
            workerState.diag.leakedIntervalsSuspected++;
            console.warn("[DIAG] startImprove received while interval already running!",
                "existingIntervalId=", workerState.improveInterval,
                "startCount=", workerState.diag.startImproveCount,
                "leaksSuspected=", workerState.diag.leakedIntervalsSuspected,
                "-- previous interval will be LEAKED");
        }
        console.log("on cmd startImprove",
            "startCount=", workerState.diag.startImproveCount,
            "stopCount=", workerState.diag.stopImproveCount);
        workerState.srcRawBuffer.set(args.thumbnailMainRaw);
        workerState.improveInterval = setInterval(() => {
            // DIAG: throttle the per-fire log so a runaway loop doesn't spam,
            // but still surface burst rate. Print every 100 fires + dt since last batch.
            workerState.diag.intervalFireCount++;
            const now = Date.now();
            const dtSinceLastFire = workerState.diag.lastFireTs ? (now - workerState.diag.lastFireTs) : 0;
            workerState.diag.lastFireTs = now;
            if(workerState.diag.intervalFireCount % 100 === 0)
            {
                const dtBatch = workerState.diag.lastReportTs ? (now - workerState.diag.lastReportTs) : 0;
                workerState.diag.lastReportTs = now;
                console.log("[DIAG] interval fire #", workerState.diag.intervalFireCount,
                    "dt-last-fire(ms)=", dtSinceLastFire,
                    "ms-per-100-fires=", dtBatch,
                    "leaksSuspected=", workerState.diag.leakedIntervalsSuspected);
            }
            //console.log("on cmd startImprove interval");
            const okOrFail = SAImprove(1000, args.sessionKey);
            if(okOrFail === SESSION_KEY_REJECTED)
            {
                console.warn("SA_Improve key rejected, stopping interval");
                clearInterval(workerState.improveInterval);
                workerState.improveInterval = 0;
                this.postMessage({type: "keyRejected", args: {sessionKey: args.sessionKey}});
                return;
            }
           // console.log("on cmd startImprove interval okOrFail", okOrFail);
            // Find available buffer
            let availableBufferIndex = -1;
            for(let i = 0; i < BUFFER_POOL_SIZE; i++) {
                if(workerState.bufferStates[i]) {
                    availableBufferIndex = i;
                    break;
                }
            }
           //// console.log("on cmd startImprove interval availableBufferIndex", availableBufferIndex);
            if(workerState.snapshotBuffer && availableBufferIndex !== -1) {
              // console.log("on cmd startImprove interval workerState.snapshotBuffer", workerState.snapshotBuffer ? "true" : "false");
                const currentBuffer = workerState.bufferPool[availableBufferIndex];
                workerState.bufferStates[availableBufferIndex] = false; // Mark as in-use
                
                const destinationInt8Array = new Int8Array(currentBuffer);
                destinationInt8Array.set(workerState.snapshotBuffer);

                this.postMessage({
                    type: "snapshotBuffer", 
                    args: {
                        buffer: currentBuffer,
                        bufferIndex: availableBufferIndex
                    }
                });
            }
        }, 0);
    }
    else if(cmd === "updateThumbnailMainRaw")
    {
        if(workerState.srcRawBuffer)
        {
            console.log("on cmd updateThumbnailMainRaw");
            workerState.srcRawBuffer.set(args.thumbnailMainRaw); 
        }
        
    }
    else if(cmd === "updateThumbnailFocusRaw")
    {
        if(workerState.srcFocusBuffer)
        {
            console.log("on cmd updateThumbnailFocusRaw");
            workerState.srcFocusBuffer.set(args.thumbnailFocusRaw); 
        }
    }
    else if(cmd === "snapshotBuffer") 
    {
        console.log("on cmd snapshotBuffer");
        workerState.transalatebaleSnapshot = args.buffer ;
    } 
    else if(cmd === "init")
    {
        console.log("on cmd init");
        const p = JSON.parse(args);
        const sessionLock = SAInit(JSON.stringify(p));
        this.postMessage({type: "sessionLock", args: {sessionLock}});

        // Get the buffer size we need
        const bufferPtr = SAGetBuffer(BUFF_SNAPSHOT);
        const bufferLength = SAGetBufferLength(BUFF_SNAPSHOT);
        
        // Create our snapshot buffer
        workerState.snapshotBuffer = new Int8Array(Module.HEAP8.buffer, bufferPtr, bufferLength);
        
        // Initialize buffer pool and states
        for (let i = 0; i < BUFFER_POOL_SIZE; i++) {
            workerState.bufferPool.push(new ArrayBuffer(bufferLength));
            workerState.bufferStates.push(true); // true means available
        }

        const SRbufferPtr = SAGetBuffer(BUFF_SRC_RAW);
        const SRbufferLength = SAGetBufferLength(BUFF_SRC_RAW);
        workerState.srcRawBuffer = new Int8Array(Module.HEAP8.buffer, SRbufferPtr,SRbufferLength);

        const SFbufferPtr = SAGetBuffer(BUFF_SRC_FOCUS);
        const SFbufferLength = SAGetBufferLength(BUFF_SRC_FOCUS);
        workerState.srcFocusBuffer = new Int8Array(Module.HEAP8.buffer, SFbufferPtr,SFbufferLength);

        const RMbufferPtr = SAGetBuffer(BUFF_RELEVANT_MASK);
        const RMbufferLength = SAGetBufferLength(BUFF_RELEVANT_MASK);
        workerState.relevantMaskBuffer = new Int8Array(Module.HEAP8.buffer, RMbufferPtr,RMbufferLength);
    }
    else if(cmd === "setRelevantMask")
    {
        if(workerState.relevantMaskBuffer)
        {
            console.log("on cmd setRelevantMask");
            workerState.relevantMaskBuffer.set(args.mask);
            SARebuildRelevantLines();
        }
    }
    else if(cmd === "rebuildRelevantLines")
    {
        console.log("on cmd rebuildRelevantLines");
        SARebuildRelevantLines();
    }
    else if(cmd === "initWorkerState")
    {
        console.log("on cmd initWorkerState");
        initWorkerState();
    }
    else if(cmd === "updateParam")
    {   
        console.log("on cmd updateParam");
        const name = args.name ;
        const val = args.val ;
        const type = args.type ;
        let ret = -1;
        if(type === "d" || type === "double")
        {
            ret = SASetDParam(name,val) ;
        } 
        else if(type === "s" || type === "string")
        {
            ret = SASetSParam(name,val) ;
        } 
        else if(type === "n" || type === "number")
        {
            ret = SASetNParam(name,parseInt(val)) ;
        }
        console.log(`name ${name} val ${val} type ${type} ret ${ret}`);
    }
    else if(cmd === "returnBuffer") {
        const {buffer, bufferIndex} = args;
        workerState.bufferPool[bufferIndex] = buffer;
        workerState.bufferStates[bufferIndex] = true; // Mark as available
    }
    else {
        console.log("unknown:"+data);
    }

};