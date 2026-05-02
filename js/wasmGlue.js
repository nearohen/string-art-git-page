let improveWorker = new Worker("./js/improveWorker.js");

improveWorker.onmessage = function({data: {type, args}}) {
    if(type == "snapshotBuffer") {
        // Make copy of the data
        sessionState.snapshotBuffer = new Int8Array(args.buffer).slice();

        // Filter out short lines based on MinLength slider
        if (sessionState.snapshotBuffer ) {
            let lineIndex = 0;
            for (let i = 0; i < sessionState.snapshotBuffer.length; i++) {
                let byte = sessionState.snapshotBuffer[i];
                for (let bit = 0; bit < 8; bit++) {
                    if (byte & (1 << bit)) {
                        // Check if line exists and is shorter than MinLength
                        if (lineIndex < runTimeState.linesArr.length) {
                            const line = runTimeState.linesArr[lineIndex];
                            // Calculate index distance between dots, accounting for wrap-around
                            const dotAIndex = line.dotA[2];
                            const dotBIndex = line.dotB[2];
                            const numDots = sessionState.dots.length;
                            
                            // Get shortest distance considering wrap-around
                            const indexDist = Math.min(
                                Math.abs(dotBIndex - dotAIndex),
                                Math.abs(dotBIndex - dotAIndex + numDots),
                                Math.abs(dotBIndex - dotAIndex - numDots)
                            );

                            
                            // Turn off bit if line is too short
                            if (indexDist < sessionState.minLength) {
                                sessionState.snapshotBuffer[i] &= ~(1 << bit);
                            }
                        }
                    }
                    lineIndex++;
                }
            }
        }

        sessionState.newSnapshotBuffer = true ;



        // Return the buffer to the worker's pool
        improveWorker.postMessage({
            cmd: "returnBuffer",
            args: {
                buffer: args.buffer,
                bufferIndex: args.bufferIndex
            }
        });
    }
    else if(type=="sessionLock")
    {
        sessionState.sessionLock = args.sessionLock;
        sessionState.sessionKey = "";
        runTimeState.keyConfirmed = false;
        document.getElementById('lock').textContent = sessionState.sessionLock.length > 0 ? "locked" : "..." ;
        let ke = document.getElementById('key');
        if(ke) ke.textContent = "..." ;
        emitStateChange(runTimeState.state) ; // refresh button gate
        window.updateDB(runTimeState.user.uid,sessionState.sessionLock,(key) => {
            sessionState.sessionKey = key || "" ;
            runTimeState.keyConfirmed = !!(key && key.length > 0) ;
            if(ke) ke.textContent = runTimeState.keyConfirmed ? "got key" : "..." ;
            emitStateChange(States.SC) ;
        });

    }
    else if(type=="keyRejected")
    {
        console.warn("worker reports key rejected, re-authorizing");
        sessionState.sessionKey = "" ;
        runTimeState.keyConfirmed = false ;
        let ke = document.getElementById('key');
        if(ke) ke.textContent = "re-auth..." ;
        emitStateChange(States.ST) ;
        if(runTimeState.user && sessionState.sessionLock)
        {
            window.updateDB(runTimeState.user.uid,sessionState.sessionLock,(key) => {
                sessionState.sessionKey = key || "" ;
                runTimeState.keyConfirmed = !!(key && key.length > 0) ;
                if(ke) ke.textContent = runTimeState.keyConfirmed ? "got key" : "..." ;
                emitStateChange(runTimeState.state) ; // refresh button gate
            });
        }
    }
};

var SAImprove = Module.cwrap(
    "SA_Improve",
    "number",
    ["number","string"]
  ); 
  



function PostWorkerMessage(ob){
    improveWorker.postMessage(ob);
}

function UpdatThumbnailMainRaw(){
    PostWorkerMessage({cmd: "updateThumbnailMainRaw",args : { thumbnailMainRaw : sessionState.thumbnailMainRaw }},[sessionState.thumbnailMainRaw]);
}

function UpdatThumbnailFocusRaw(){
    PostWorkerMessage({cmd: "updateThumbnailFocusRaw",args : { thumbnailFocusRaw : sessionState.thumbnailFocusRaw }},[sessionState.thumbnailFocusRaw]);
}

function StartCapturing()
{
    // DIAG: log the call site so we can see if Firebase "Data changed" / re-auth /
    // some other path is calling StartCapturing while we're already in States.PL.
    // If so, that's the source of the leaked-interval bug in improveWorker.js.
    try {
        console.log("[DIAG] StartCapturing called",
            "currentState=", (typeof runTimeState !== 'undefined' ? runTimeState.state : '?'),
            "hasThumbnail=", !!sessionState.thumbnailMainRaw,
            "stack=", new Error().stack);
    } catch(e) { /* defensive: don't break play if logging fails */ }

    if(sessionState.thumbnailMainRaw){
        PostWorkerMessage({cmd: "startImprove",args :
        {
             thumbnailMainRaw : sessionState.thumbnailMainRaw,
             sessionKey : sessionState.sessionKey,
         }},[sessionState.thumbnailMainRaw]);

         emitStateChange(States.PL) ;

    }

}

