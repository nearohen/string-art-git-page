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

const workerStae = {
    improveInterval : 0,
    snapshotBuffer: undefined,
    transalatebaleSnapshot: undefined,
    srcRawBuffer: undefined,
    srcFocusBuffer: undefined,
}
function initWorkerState() {
  workerStae.improveInterval = 0;
  workerStae.snapshotBuffer = undefined;
  workerStae.transalatebaleSnapshot = undefined;
  workerStae.srcRawBuffer = undefined;
  workerStae.srcFocusBuffer = undefined;
}

function typedArrayToBuffer(array) {
    return array.buffer.slice(array.byteOffset, array.byteLength + array.byteOffset);
}
onmessage = function (msg){

    const {data : {cmd ,args}} = msg ;
    if(cmd === "stopImprove")
    {
        clearInterval(workerStae.improveInterval) ;
        workerStae.improveInterval = 0;
    }
    else if(cmd === "startImprove")
    {
        workerStae.srcRawBuffer.set(args.thumbnailMainRaw); 
        workerStae.improveInterval = setInterval(()=>{
            const okOrFail = SAImprove(1000,args.sessionKey);
           // console.log("startImprove:"+okOrFail);
            if(workerStae.transalatebaleSnapshot && workerStae.snapshotBuffer)
            {
                const destinationInt8Array = new Int8Array(workerStae.transalatebaleSnapshot);
                destinationInt8Array.set(workerStae.snapshotBuffer);
    
                this.postMessage({type :"snapshotBuffer" , args :{buffer : workerStae.transalatebaleSnapshot}},[workerStae.transalatebaleSnapshot]);
                workerStae.transalatebaleSnapshot = undefined;
                
            }
        },0); 
    }
    else if(cmd === "updateThumbnailMainRaw")
    {
        if(workerStae.srcRawBuffer)
        {
            workerStae.srcRawBuffer.set(args.thumbnailMainRaw); 
        }
        
    }
    else if(cmd === "updateThumbnailFocusRaw")
    {
        if(workerStae.srcFocusBuffer)
        {
            workerStae.srcFocusBuffer.set(args.thumbnailFocusRaw); 
        }
    }
    else if(cmd === "snapshotBuffer") 
    {
        workerStae.transalatebaleSnapshot = args.buffer ;
    } 
    else if(cmd === "init")
    {

        const p = JSON.parse(args);
        //p.serverSnapshot = "";
        console.log("p:"+p);
        const sessionLock = SAInit(JSON.stringify(p));
        this.postMessage({type :"sessionLock" , args :{sessionLock : sessionLock}});
        const bufferPtr = SAGetBuffer(BUFF_SNAPSHOT);
        const bufferLength = SAGetBufferLength(BUFF_SNAPSHOT);
        workerStae.snapshotBuffer = new Int8Array(Module.HEAP8.buffer, bufferPtr,bufferLength);
        workerStae.transalatebaleSnapshot = typedArrayToBuffer(workerStae.snapshotBuffer);


        const SRbufferPtr = SAGetBuffer(BUFF_SRC_RAW);
        const SRbufferLength = SAGetBufferLength(BUFF_SRC_RAW);
        workerStae.srcRawBuffer = new Int8Array(Module.HEAP8.buffer, SRbufferPtr,SRbufferLength);

        const SFbufferPtr = SAGetBuffer(BUFF_SRC_FOCUS);
        const SFbufferLength = SAGetBufferLength(BUFF_SRC_FOCUS);
        workerStae.srcFocusBuffer = new Int8Array(Module.HEAP8.buffer, SFbufferPtr,SFbufferLength);


    }
    else if(cmd === "initWorkerState")
    {
        initWorkerState();
    }
    else if(cmd === "updateParam")
    {
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
    else {
        console.log("unknown:"+data);
    }

};