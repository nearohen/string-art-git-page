let improveWorker = new Worker("./js/improveWorker.js");

improveWorker.onmessage = function ({data :{type,args}}){
    if(type=="snapshotBuffer")
    {
        sessionState.serverSnapshot  = args.buffer.slice();
        improveWorker.postMessage({cmd : "snapshotBuffer",args },[args.buffer]);
    }
    else if(type=="sessionLock")
    {
        sessionState.sessionLock  = args.sessionLock;
        document.getElementById('lock').value = sessionState.sessionLock ;
        window.updateDB(sessionState.userId,sessionState.sessionLock,(key) => {
            sessionState.sessionKey = key ;
            
            document.getElementById('key').value = sessionState.sessionKey;
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

function StartCapturing()
{
    setTimeout(()=>{

        PostWorkerMessage({cmd: "startImprove",args : 
        {
             thumbnailMainRaw : sessionState.thumbnailMainRaw,
             sessionKey : sessionState.sessionKey,
         }},[sessionState.thumbnailMainRaw]);
        // Display the buffer contents
    
    },1000);
}

