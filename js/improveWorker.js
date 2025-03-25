console.log("hello from worker");
importScripts('./stringArtWasm.js');

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
const BUFFER_POOL_SIZE = 2; // Can adjust size based on needs

var SAGetBuffer = Module.cwrap(
    "SA_GetBuffer",
    "number",
    ["i8*"]
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
}

function typedArrayToBuffer(array) {
    return array.buffer.slice(array.byteOffset, array.byteLength + array.byteOffset);
}

onmessage = function (msg){

    const {data : {cmd ,args}} = msg ;
    if(cmd === "stopImprove")
    {
        console.log("on cmd stopImprove");
        clearInterval(workerState.improveInterval) ;
        workerState.improveInterval = 0;
    }
    else if(cmd === "startImprove")
    {
        //console.log("on cmd startImprove");
        workerState.srcRawBuffer.set(args.thumbnailMainRaw); 
        workerState.improveInterval = setInterval(() => {
            console.log("on cmd startImprove interval");
            const okOrFail = SAImprove(1000, args.sessionKey);
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