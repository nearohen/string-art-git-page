
function abs(a) {
    return a < 0 ? -a : a;
  }
  
  function min(a, b) {
    return a < b ? a : b;
  }
  function sprintsToSnapshot(sprints, currentAnimateStep, animateLength) {
    let step = [];
    for (let i = 0; i < runTimeState.linesArr.length; i++) {
      step.push(0);
    }
    sprints.forEach(function (sprint) {

      let distance = max(getDotDistance(sprint.from.dotA,sprint.to.dotA),getDotDistance(sprint.from.dotB,sprint.to.dotB));
      let stepRatio = currentAnimateStep / animateLength;
      let steps = parseInt(distance*stepRatio) ;
      let newFromDotA = getCloserDotIndex(sprint.from.dotA,sprint.to.dotA,steps);
      let newFromDotB = getCloserDotIndex(sprint.from.dotB,sprint.to.dotB,steps);
      let lineIndex = getLineIndex(newFromDotA, newFromDotB) ;
      step[lineIndex] = 1;
      //sprint.from.dotA = newFromDotA ;
      //sprint.from.dotB = newFromDotB ;
      //sprint.from.index = lineIndex ;
    });
    return LinesToSnapshot(step);
  
  
  
  }

function sprintsToSnapshotFix(sprints, currentAnimateStep, animateLength) {
    let step = [];
    for (let i = 0; i < runTimeState.linesArr.length; i++) {
      step.push(0);
    }
    sprints.forEach(function (sprint) {
      let stepRatio = currentAnimateStep / animateLength;
      let dotAdis = abs(sprint.to.dotA - sprint.from.dotA);
      let toDotA = sprint.to.dotA;
      let fromDotA = sprint.from.dotA;
      if (dotAdis > sessionState.dots.length / 2) {
        dotAdis = sessionState.dots.length/2 ;
        if (sprint.to.dotA > sprint.from.dotA) {
          toDotA = sprint.to.dotA - sessionState.dots.length;
        }
        else {
          fromDotA = sprint.from.dotA - sessionState.dots.length;
        }
      }
      let stepDotA = parseInt(fromDotA + ((toDotA - fromDotA) * stepRatio));
      if (stepDotA < 0) {
        stepDotA = stepDotA + sessionState.dots.length;
      }
  
      let toDotB = sprint.to.dotB;
      let fromDotB = sprint.from.dotB;
  
      let dotBdis = abs(sprint.to.dotB - sprint.from.dotB);
      if (dotBdis > sessionState.dots.length / 2) {
        if (sprint.to.dotB > sprint.from.dotB) {
          toDotB = sprint.to.dotB - sessionState.dots.length;
        }
        else {
          fromDotB = sprint.from.dotB - sessionState.dots.length;
        }
      }
  
  
  
      
      let stepDotB = parseInt(fromDotB + ((toDotB - fromDotB) * stepRatio));
      if (stepDotB < 0) {
        stepDotB = stepDotB + sessionState.dots.length;
      }
  
      let toIndex = sprint.to.index;
      let fromIndex = sprint.from.index;
      if(currentAnimateStep == animateLength){
          if(toIndex != getLineIndex(stepDotA, stepDotB)){
              console.log("ad") ;
          }
      }
      linIndex = currentAnimateStep == animateLength ? toIndex : getLineIndex(stepDotA, stepDotB);
      step[linIndex] = 1;
    });
    return LinesToSnapshot(step);
  
  
  
  }

  function getDotDistance(indexA, indexB) {
    indexA = fixDotIndex(indexA) ;
    indexB = fixDotIndex(indexB);
    let diff = abs(indexA - indexB);
    if (diff > sessionState.dots.length / 2) {
      diff = sessionState.dots.length - diff;
    }
    return diff;
  }
  
  function getLinesDotsDistance(indexA, indexB) {
    let lineA = runTimeState.linesArr[indexA];
    let dotAA = lineA.dotA[2];
    let dotAB = lineA.dotB[2];
  
    let lineB = runTimeState.linesArr[indexB];
    let dotBA = lineB.dotA[2];
    let dotBB = lineB.dotB[2];
    return min(getDotDistance(dotAA, dotBA) + getDotDistance(dotAB, dotBB), getDotDistance(dotAA, dotBB) + getDotDistance(dotAB, dotAB));
  }
  function addSprint(sprints, fromIndex, toIndex) {
    sprints.snapshot[toIndex] = 1 ;
    let fromLine = runTimeState.linesArr[fromIndex];
    let toLine = runTimeState.linesArr[toIndex];
    let sprint = {
      from: {
        dotA: fromLine.dotA[2],
        dotB: fromLine.dotB[2],
        index: fromLine.index,
      },
      to: {
        dotA: toLine.dotA[2],
        dotB: toLine.dotB[2],
        index: toLine.index,
      },
    };
    sprints.push(sprint);
    return sprint;
  }
  function getSprints(fromSnapshot, toSnapshot) {
    let sprints = [];
    sprints.snapshot =  Buffer.alloc(runTimeState.linesArr.length); ;
    sprints.maxDistance = 0 ;
    let fromLines = snapshotToLines(fromSnapshot, runTimeState.linesArr.length);
    var toLines = snapshotToLinesIndexes(toSnapshot);
    toLines.forEach(function (toIndex) {
      addBestMatch(sprints, toIndex, fromLines,false,false);
    });
    let toLinesIndexes = snapshotToLines(toSnapshot, runTimeState.linesArr.length);
    for (let i =0;i<fromLines.length;i++){
  
      if(sprints.snapshot[i]==0 && fromLines[i]){
        addBestMatch(sprints, i, toLinesIndexes,true,true);
      }
  
    }
  
    return sprints;

}




function snapshotToLines(snapshot, size) {
    let ret = Buffer.alloc(size);
    var buff = Buffer.from(snapshot, 'base64');
    let lineIndex = 0;
    for (let i = 0; i < buff.length; i++) {
      let byte = buff.readInt8(i);
      for (let bit = 0; bit < 8; bit++) {
        if(lineIndex>=size){
          break ;
        }
        ret[lineIndex] = byte & 1 ? 1 : 0;
        byte = byte >> 1;
        lineIndex++;
        
      }
    }
    return ret;
  }
  function snapshotToLinesIndexes(snapshot) {
    let ret = [];
    var buff = Buffer.from(snapshot, 'base64');
    let lineIndex = 0;
    for (let i = 0; i < buff.length; i++) {
      let byte = buff.readInt8(i);
      for (let bit = 0; bit < 8; bit++) {
        if (byte & 1) {
          ret.push(lineIndex);
        }
        byte = byte >> 1;
        lineIndex++;
        if(lineIndex>=runTimeState.linesArr.length){
          return ret ;
        }
      }
    }
    return ret;
  }
  
  function LinesToSnapshot(lines) {
    let ret = Buffer.alloc(lines.length / 8 + (lines.length % 8 ? 1 : 0));
    let lineIndex = 0;
    for (let i = 0; i < ret.length; i++) {
      let currentByte = 0;
      let bit = 1;
      for (let j = 0; j < 8; j++) {
        if (lineIndex < lines.length && lines[lineIndex]) {
          currentByte = currentByte | bit;
        }
        lineIndex++;
        bit = bit * 2;
      }
      ret[i] = currentByte;
  
    }
    return ret.toString('base64');;
  }

  
  function max(a,b){
    return a >b ?a:b;
  }
  

function getCloserDotIndex(indexFrom,indexTo,steps){
  indexTo = fixDotIndex(indexTo); 
  let closer = indexFrom ;
  for(let i =0;i<steps;i++){
    closer = fixDotIndex(closer); 
    if(closer==indexTo){
      return closer ;
    }

    if(abs(indexTo-indexFrom)>sessionState.dots.length/2){
      if(indexFrom>indexTo){
        closer =  fixDotIndex(closer+1) ;
      }
      else {
        closer =  fixDotIndex(closer-1) ;
      }
    }
    else{
      if(indexFrom>indexTo){
        closer =  fixDotIndex(closer-1) ;
      }
      else {
        closer =  fixDotIndex(closer+1) ;
      }
    }

  }
  return closer ;


}

function addBestMatch(sprints, toIndex, indexes,reverse) {

   
    if (indexes[toIndex]) {
      return addSprint(sprints, toIndex, toIndex);
    }
    let toLine = runTimeState.linesArr[toIndex];
    let dotA = toLine.dotA[2];
    let dotB = toLine.dotB[2];
    for (let distanceFromLine = 1; distanceFromLine < sessionState.dots.length; distanceFromLine++) {
      if(distanceFromLine>sprints.maxDistance){
        sprints.maxDistance = distanceFromLine ;
      }
       let distanceFromDotA = 0; 
        let nDotsA = getNeighborDot(dotA, distanceFromDotA);
        let nDotsB = getNeighborDot(dotB, distanceFromLine - distanceFromDotA);
        for (let a = 0; a < nDotsA.length; a++) {
          for (let b = 0; b < nDotsB.length; b++) {
            let lineIndex = getLineIndex(nDotsA[a], nDotsB[b]);
            if (indexes[lineIndex]) {
              if(reverse){
                return addSprint(sprints, toIndex,lineIndex);
              }else{
                return addSprint(sprints, lineIndex, toIndex);
              }
              
            }

          }

        }
        distanceFromDotA = distanceFromLine; 
        nDotsA = getNeighborDot(dotA, distanceFromDotA);
        nDotsB = getNeighborDot(dotB, distanceFromLine - distanceFromDotA);
        for (let a = 0; a < nDotsA.length; a++) {
          for (let b = 0; b < nDotsB.length; b++) {
            let lineIndex = getLineIndex(nDotsA[a], nDotsB[b]);
            if (indexes[lineIndex]) {
              if(reverse){
                return addSprint(sprints, toIndex,lineIndex);
              }else{
                return addSprint(sprints, lineIndex, toIndex);
              }
              
            }

          }

        }
      



      /*
       for (let distanceFromDotA = 0; distanceFromDotA <= distanceFromLine; distanceFromDotA++) {
        let nDotsA = getNeighborDot(dotA, distanceFromDotA);
        let nDotsB = getNeighborDot(dotB, distanceFromLine - distanceFromDotA);
        for (let a = 0; a < nDotsA.length; a++) {
          for (let b = 0; b < nDotsB.length; b++) {
            let lineIndex = getLineIndex(nDotsA[a], nDotsB[b]);
            if (indexes[lineIndex]) {
              if(reverse){
                return addSprint(sprints, toIndex,lineIndex);
              }else{
                return addSprint(sprints, lineIndex, toIndex);
              }
              
            }
  
          }
  
        }
  
      }
      
      */
     



  
    }
  }
  
  
let animatedGidData = {
  superGif:null,
  length:0,
  currentFrame:0,
  currentPlaybackFrame:0,
  playbackInterval : 0 ,
  interval:0,
  previousSnapshot:null,
  frames:[],
}

function AnimateGifSave(){
  let imgName = document.getElementById('loadImgFile').value;
  saveText(JSON.stringify(animatedGidData), imgName+".frames") ;
  
}


function LoadAnimationFile(evt){
  const fileList = this.files;
  var file = this.files[0];//e.originalEvent.srcElement.files[i];

  var reader = new FileReader();
  reader.onloadend = function () {
    params = JSON.parse(reader.result);
    if (params != null) {
      animatedGidData = params  ;
    }
  }
  reader.readAsText(file)

}

function animateSaveFrame(snapshot,duration){
  animatedGidData.frames.push({
    snapshot:snapshot,
    stringPixelRation:sessionState.stringPixelRation,
    duration:duration,
  });


}
async function AnimateSnapshotToSnapshot(fromSnapshot,toSnapshot){

  let sprints = getSprints(fromSnapshot,toSnapshot) ;
  let sprintsSize = 20 ;
  for(let i = 0;i<sprintsSize;i++){
    animateSaveFrame(sprintsToSnapshot(sprints, i, sprintsSize),100)
  }
  animateSaveFrame(sprintsToSnapshot(sprints, sprintsSize, sprintsSize),1000)


}


function Animate(){

  fetch('./js/output.json') // Adjust the path to your file
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json(); // For JSON files, use .json(); for text, use .text()
  })
  .then(data => {

    sessionState.pointsH = data.sessions[0].pointsH ;
    sessionState.pointsV = data.sessions[0].pointsV ;
    sessionState.pointsType = data.sessions[0].pointsType ;
    RestartState();

    for(let i = 0;i<data.sessions.length;i++){
      AnimateSnapshotToSnapshot(data.sessions[i].snapshotB64,data.sessions[(i+1)%data.sessions.length].snapshotB64) ;
    }
    

    let nextFrameDuration = 100 ;
    let showNextFrame = (frame) => {
     
      let snapshotBuffer =  base64ToArrayBuffer(frame.snapshot)  ;
      sessionState.snapshotBuffer = snapshotBuffer ;
      animatedGidData.currentFrame = (animatedGidData.currentFrame+1)%animatedGidData.frames.length ;
      if(animatedGidData.currentFrame>=animatedGidData.frames.length){
        animatedGidData.currentFrame = 0 ;
      }
    }

    let timeOutFrame = () => {
      let frame = animatedGidData.frames[animatedGidData.currentFrame] ;
      nextFrameDuration = frame.duration ;
      showNextFrame(frame) ;
      runTimeState.intervals.animationInterval = setTimeout(timeOutFrame,nextFrameDuration) ;
    }
    timeOutFrame();
   

    console.log('File content:', data);
  })
  .catch(error => {
    console.error('Error loading the file:', error);
  });

 
}


async function AnimateGif(){
  

  if (sessionState.stateId.length == 0) {
    Init()
  }
  else {
    Play()
  }
  let framesFromGif = 35 ;
  let gifStringPixelRation = 15;
  let logoStrinPixelration = 9 ;
  let sprintSize = 20 ;
  //log contrast
  const logoSrc = sessionState.originalImgSrc ;
  const waitForStringSmall = 15000 ;
  const waitForStringsBig = 25000 ;
  updateStringPixelRatio(logoStrinPixelration,true);
  updateContrast(41,true)
  updateBrightness(50,true); 
  sessionState.recWidth = 201.326
  sessionState.recHeight  = 358.61;
  sessionState.recOffX = 3.698
  sessionState.recOffY =  14.138;;
  UpdateNewServerImg(); 
  await new Promise((res) => setTimeout(res,waitForStringsBig));
  animatedGidData.frames = []; 
  animatedGidData.length = animatedGidData.superGif.get_length();
  animatedGidData.currentFrame = 0 ;
  
  const logoSnapshot = runTimeState.previousSnapshot ;
  for(let logoTime = 0;logoTime<10;logoTime++){
    animateSaveFrame(logoSnapshot); 
  }
  


  for(let gifFrameindex = 0;gifFrameindex<framesFromGif+1;gifFrameindex++){
    //loading waiting 5 sec
   
    document.getElementById("aGifProgress").value = ""+gifFrameindex +"/"+(animatedGidData.length);

    if(gifFrameindex==0){


      updateStringPixelRatio(gifStringPixelRation,true);
      updateContrast(50,true)
      sessionState.recHeight = 65.28837694554774
      sessionState.recOffX = 47.74115209095105
      sessionState.recOffY = 37.4469931331426
      sessionState.recWidth = 36.653123899254936
      animatedGidData.superGif.move_to(gifFrameindex) ;
      let c =  animatedGidData.superGif.get_canvas() ;
      originalImg.src = c.toDataURL();
      UpdateNewServerImg(); 
      await new Promise((res) => setTimeout(res,waitForStringSmall));
      let sprints = getSprints(logoSnapshot,runTimeState.previousSnapshot) ;
      for(let logoSprint = 0;logoSprint<=sprintSize;logoSprint++){
        let spr = gifStringPixelRation+(logoStrinPixelration-gifStringPixelRation)*(logoSprint/sprintSize);
     
        sessionState.stringPixelRation = parseInt(spr);
        animateSaveFrame(sprintsToSnapshot(sprints, logoSprint, sprintSize))
      }
    }
    else if(false && (gifFrameindex==framesFromGif/2 || gifFrameindex==(framesFromGif+1)/2))
    {
      const firstPosSnapshot = runTimeState.previousSnapshot ;
      updateBrightness(34,true);
      updateStringPixelRatio(gifStringPixelRation,true);
      updateContrast(32,true)

      sessionState.recHeight = 56.00229510248718;
      sessionState.recOffX = 21.648158597893172;
      sessionState.recOffY = 27.975508049190736;
      sessionState.recWidth = 31.43988496981741;

     
      animatedGidData.superGif.move_to(gifFrameindex) ;
      let c =  animatedGidData.superGif.get_canvas() ;
      originalImg.src = c.toDataURL();
      UpdateNewServerImg(); 
      await new Promise((res) => setTimeout(res,waitForStringSmall));
      let sprints = getSprints(firstPosSnapshot,runTimeState.previousSnapshot) ;
      for(let logoSprint = 0;logoSprint<=sprintSize;logoSprint++){
        animateSaveFrame(sprintsToSnapshot(sprints, logoSprint, sprintSize))
      }
    }
    else if(gifFrameindex==framesFromGif){
      const secondPosSnapshot = runTimeState.previousSnapshot ;
      
      let sprints = getSprints(secondPosSnapshot,logoSnapshot) ;
      sprintSize = sprintSize ;
      for(let logoSprint = 0;logoSprint<=sprintSize;logoSprint++){
        let spr = gifStringPixelRation+(logoStrinPixelration-gifStringPixelRation)*(logoSprint/sprintSize);
        
        sessionState.stringPixelRation = parseInt(spr) ;
        animateSaveFrame(sprintsToSnapshot(sprints, logoSprint, sprintSize))
      }
    }
    else{
      if(gifFrameindex==1){
        updateStringPixelRatio(gifStringPixelRation,true);
      }
      animatedGidData.superGif.move_to(gifFrameindex) ;
      let c =  animatedGidData.superGif.get_canvas() ;
      originalImg.src = c.toDataURL();
      await new Promise((res) => setTimeout(res,waitForStringSmall));
      animateSaveFrame(runTimeState.previousSnapshot);
    }
  

  }
  Stop(); 
  moveTo++ ;
}

function DrawLinesAnimationCanvasCanvas(sapshot,width,height,index) {


  let tocut = 2 ;
  can.animation.canvas.width = width+tocut
  can.animation.canvas.height = height
  fillCanvas("animation","#FFFFFF");
  let {count,changes} = DrawLines(can.animation.canvas, can.animation.ctx,true,sapshot);
  let left = can.animation.ctx.getImageData(0, 0, (width/2), height);
  let right = can.animation.ctx.getImageData((width/2)+tocut, 0,(width/2), height);
  can.animation.canvas.width = width
  can.animation.canvas.height = height
  can.animation.ctx.putImageData(left,0,0);
  can.animation.ctx.putImageData(right,width/2,0);
  saveAnimationImage(can.animation.canvas,"frame."+width+"_"+height+"_"+index+".jpg")
  return count;

}

function saveAnimationImage(canvas ,name ){
  
  

  var a = document.createElement('a');
  
  var dataUrl = canvas.toDataURL("image/jpeg") ;
  a.setAttribute('href',dataUrl );
  a.setAttribute('download',name);
  a.click()
  
}