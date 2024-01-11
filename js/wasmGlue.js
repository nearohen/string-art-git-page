let improveWorker = new Worker("/src/js/improveWorker.js");

improveWorker.onmessage = function ({data :{type,args}}){
    if(type=="snapshotBuffer")
    {
        sessionState.serverSnapshot  = args.buffer.slice();
        improveWorker.postMessage({cmd : "snapshotBuffer",args },[args.buffer]);
    }

};

var SAImprove = Module.cwrap(
    "SA_Improve",
    "number",
    ["number"]
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

        PostWorkerMessage({cmd: "startImprove",args : { thumbnailMainRaw : sessionState.thumbnailMainRaw }},[sessionState.thumbnailMainRaw]);
        // Display the buffer contents
    
    },1000);
}

