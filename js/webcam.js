function InitWebcam(){
    cam.canvasElement =  document.createElement('canvas');//document.getElementById("webcamCanvas")  ;//
    cam.webcamElement = document.getElementById('webcam');
    cam.snapSoundElement = null ;//document.getElementById('snapSound');
    cam.webcam = new Webcam(cam.webcamElement, 'user',cam.canvasElement,cam.snapSoundElement);
    document.getElementById("webcamDiv").style.display = "none"  ;
    webcam.stream =false ;
    cam.webcam.info().then((res)=>{
      console.log(res) ;
    })
  }
  
function StreamPictures()
{
  if(runTimeState.intervals.intervalStreamPictures==0){
    runTimeState.intervals.intervalStreamPictures = setInterval(() => {
      originalImg.src  = cam.webcam.snap(); 
     }, 200)
  }
}

cam  = {

  on :false ,
  webcam : null ,
  
}




function StopStreamPictures(){
    if(runTimeState.intervalStreamPictures!=0){
      clearInterval(runTimeState.intervals.intervalStreamPictures)
      runTimeState.intervals.intervalStreamPictures = 0 
    }
  }
  function StartWebcam(){
  
    if(cam.on){
  
      return  ;
    
  
    }
    else
    {
  
      cam.webcam.start()
      .then(result =>{
        cam.on = true ;
        document.getElementById("webcamDiv").style.display = "block"  ;
        ;
       
        console.log("webcam started");
      })
      .catch(err => {
        console.log(err);
    });
    }
  
  
  }
  
  
  function StopWebcam(){  
    
    StopStreamPictures(); 
    cam.webcam.stop() ;
    cam.on = false ;
    document.getElementById("webcamDiv").style.display = "none"  ;
  }
  
  