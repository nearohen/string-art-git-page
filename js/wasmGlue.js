let improveWorker = new Worker("./js/improveWorker.js");

improveWorker.onmessage = function ({data :{type,args}}){
    if(type=="snapshotBuffer")
    {
        sessionState.snapshotBuffer  = args.buffer.slice();
        improveWorker.postMessage({cmd : "snapshotBuffer",args },[args.buffer]);
    }
    else if(type=="sessionLock")
    {
        sessionState.sessionLock  = args.sessionLock;
        document.getElementById('lock').textContent = sessionState.sessionLock.length > 0 ? "locked" : "..." ;
        window.updateDB(runTimeState.user.uid,sessionState.sessionLock,(key) => {
            sessionState.sessionKey = key ;
            let ke = document.getElementById('key');
            ke.textContent = sessionState.sessionKey.length > 0 ? "got key" : "..." ;;
            emitStateChange(States.SC) ;
            
            
        });

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
    if(sessionState.thumbnailMainRaw){
        PostWorkerMessage({cmd: "startImprove",args : 
        {
             thumbnailMainRaw : sessionState.thumbnailMainRaw,
             sessionKey : sessionState.sessionKey,
         }},[sessionState.thumbnailMainRaw]);

         emitStateChange(States.PL) ;

    }

}

