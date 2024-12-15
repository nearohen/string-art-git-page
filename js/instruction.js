function InitInstructions() {

  sessionState.instructions = {
    currentInstruction: 0,
    instructionsArray: [],
    instructionDots: [],
    instructionFF: 100,
    instructionBatch: 8,

  };


}
function DeleteInstructions(sessionState) {
  sessionState.instructions = null;
  InitInstructions(sessionState);
}

function GetNextInstructionLine(linesIndexesArray, origin, prevPrevDot) {
  let numOfDots = sessionState.dots.length;


  linesIndexesArray.sort((a, b) => {
    let lineA = runTimeState.linesArr[a];
    let aTarget = lineA.dotA[2] == origin ? lineA.dotB[2] : lineA.dotA[2];

    let lineB = runTimeState.linesArr[b];
    let bTarget = lineB.dotA[2] == origin ? lineB.dotB[2] : lineB.dotA[2];


    aDistance = prevPrevDot > aTarget ? prevPrevDot - aTarget : aTarget - prevPrevDot;
    if (aDistance > numOfDots / 2) {
      aDistance = aDistance - numOfDots;
      aDistance = aDistance > 0 ? aDistance : -aDistance;

    }

    bDistance = prevPrevDot > bTarget ? prevPrevDot - bTarget : bTarget - prevPrevDot;
    if (bDistance > numOfDots / 2) {
      bDistance = bDistance - numOfDots;
      bDistance = bDistance > 0 ? bDistance : -bDistance;

    }

    return aDistance < bDistance ? -1 : 1;

  })





  /*
  linesIndexesArray.sort((a,b)=>{
    let lineA = runTimeState.linesArr[a] ;
    let aTarget = lineA.dotA[2]==origin ? lineA.dotB[2] : lineA.dotA[2] ;
 
    let lineB = runTimeState.linesArr[b] ;
    let bTarget = lineB.dotA[2]==origin ? lineB.dotB[2] : lineB.dotA[2] ;
    return aTarget<bTarget ? -1:1; 
    
})*/
  return linesIndexesArray[0];
}
function removeItemOnce(arr, value) {
  var index = arr.indexOf(value);
  if (index > -1) {
    arr.splice(index, 1);
  }
  return arr;
}

function goToInstruction() {

  let index = document.getElementById("goToInstruction").value;
  if (index != -1) {
    sessionState.instructions.currentInstruction = parseInt(index) + 3;
    refreshtoCurrentInstruction();
  }
  

}

function findInstruction() {

  document.getElementById("goToInstruction").value = "-1";
  let findA = document.getElementById("findPointA").value;
  let findB = document.getElementById("findPointB").value;



  for (let i = 0; i < sessionState.instructions.instructionsArray.length; i++) {
    let instruction = sessionState.instructions.instructionsArray[i];
    let a = instruction.dotAIndex;
    let b = instruction.dotBIndex;
    if ((a == findA && b == findB) || (a == findB && b == findA)) {
      document.getElementById("goToInstruction").value = i;
      break;
    }


  }

}

function refreshtoCurrentInstruction() {

  for (let i = 0; i < sessionState.instructions.instructionBatch; i++) {
    let element = "step" + i;
    document.getElementById(element).value = "";
  }
  clearMainCanvas();
  drawPoints();
  for (let i = 0; i < sessionState.instructions.currentInstruction; i++) {
    drawInstruction(mainCanvas, ctxMainCanvas, i);
  }
}
function initInstructions() {

  InitInstructions();
  emitStateChange(States.IN);
  sessionState.instructions.instructionBatch = 8;
  sessionState.onCanvas = ON_CANVAS_INSTRUCTION;
  document.getElementById("instructions").style.display = "block";

  if (sessionState.instructions.instructionsArray.length == 0) {

    for (let i = 0; i <= sessionState.instructions.instructionBatch; i++) {
      let element = "step" + i;
      document.getElementById(element).value = "";
    }


    let numOfDots = sessionState.dots.length;
    for (let i = 0; i < numOfDots; i++) {
      sessionState.instructions.instructionDots[i] = [];
    }

    if(document.getElementById('strings')){
      document.getElementById('strings').checked = true;
    }
    clearMainCanvas();
    drawPoints();
    sessionState.instructions.instructionsArray = [];
    sessionState.instructions.currentInstruction = 0;


    var decoded = Buffer.from(sessionState.snapshotBuffer, 'base64');
    let lineIndex = 0
    for (let i = 0; i < decoded.length; i++) {
      let byte = decoded.readInt8(i);
      for (let bit = 0; bit < 8; bit++) {
        if (byte & 1) {
          let aIndex = runTimeState.linesArr[lineIndex].dotA[2];
          let bIndex = runTimeState.linesArr[lineIndex].dotB[2];
          if (sessionState.instructions.instructionDots[aIndex] == undefined) {
            sessionState.instructions.instructionDots[aIndex] = [];
          }
          sessionState.instructions.instructionDots[aIndex].push(lineIndex);
          sessionState.instructions.instructionDots[aIndex].sort();

          if (sessionState.instructions.instructionDots[bIndex] == undefined) {
            sessionState.instructions.instructionDots[bIndex] = [];
          }

          sessionState.instructions.instructionDots[bIndex].push(lineIndex);
          sessionState.instructions.instructionDots[bIndex].sort();

        }

        byte = byte >> 1;
        lineIndex++;
      }
    }



    prevDot = 0;
    let pos = 0;
    while (pos != -1) {
      if (sessionState.instructions.instructionDots[pos].length == 0) {
        let instruction = {
          lineIndex: -1,
          dotAIndex: pos,
        };
        sessionState.instructions.instructionsArray.push(instruction);

        let found = false;
        let iter = 0;
        let startSearch = pos + 1;
        pos = -1;
        while (iter < numOfDots) {

          let nextPos = (startSearch + iter) % numOfDots;
          if (sessionState.instructions.instructionDots[nextPos].length > 0) {
            found = true;
            pos = nextPos;
            break;
          }
          iter++;

        }
      }
      if (pos != -1) {
        let linesFromDot = sessionState.instructions.instructionDots[pos];
        let lineIndex = GetNextInstructionLine(linesFromDot, pos, prevDot);
        let dotAIndex = runTimeState.linesArr[lineIndex].dotA[2];
        let dotBIndex = runTimeState.linesArr[lineIndex].dotB[2];
        let dotBArr = sessionState.instructions.instructionDots[dotBIndex];
        let dotAArr = sessionState.instructions.instructionDots[dotAIndex];

        removeItemOnce(dotBArr, lineIndex);
        removeItemOnce(dotAArr, lineIndex);
        let instruction = {
          lineIndex: lineIndex,
        };
        instruction.dotAIndex = pos;
        prevDot = pos;
        pos = pos == dotAIndex ? dotBIndex : dotAIndex;
        instruction.dotBIndex = pos;
        sessionState.instructions.instructionsArray.push(instruction);

      }




    }



  }
  document.getElementById('totalInstruction').value = sessionState.instructions.instructionsArray.length;
  clearMainCanvas();
  drawPoints();
  for (let i = 0; i < sessionState.instructions.currentInstruction; i++) {
    drawInstruction(mainCanvas, ctxMainCanvas, i);
  }




}
function playInstructions() {

  clearInterval(runTimeState.intervals.intervalInstruction);
  sessionState.instructions.instructionFF = sessionState.instructions.instructionFF / 2;
  runTimeState.intervals.intervalInstruction = setInterval(function () { nextInstruction(); }, sessionState.instructions.instructionFF);

}

function stopInstructions() {

  clearInterval(runTimeState.intervals.intervalInstruction);
  runTimeState.intervals.intervalInstruction = 0;
  sessionState.instructions.instructionFF = 100;


}
function prevInstruction() {
  if (sessionState.instructions.currentInstruction > 0) {
    sessionState.instructions.currentInstruction--;

    refreshtoCurrentInstruction();


  }
}
function nextInstruction() {

  if (sessionState.instructions.currentInstruction < sessionState.instructions.instructionsArray.length) {
    drawInstruction(mainCanvas, ctxMainCanvas, sessionState.instructions.currentInstruction);
    sessionState.instructions.currentInstruction++;
  }
  else {


    stopInstructions();
  }

}
function nextInstructionBatch() {

  for (let batch = 0; batch < sessionState.instructions.instructionBatch; batch++) {
    nextInstruction();
  }
}
let prev = "";

function drawInstruction(canvas, ctxCanvas, instructionIndex) {

  let lineIndex = sessionState.instructions.instructionsArray[instructionIndex]["lineIndex"];
  lineIndex = parseInt(lineIndex);

  for (let i = 0; i < sessionState.instructions.instructionBatch; i++) {
    let element = "step" + i;
    let nextElement = "step" + (i + 1);
    if (document.getElementById(element).value.length > 0 && document.getElementById(nextElement).value.length > 0) {
      if (document.getElementById(element).value.substring(0, 1) == document.getElementById(nextElement).value.substring(0, 1)) {
        console.log("afafaf");
      }
    }

    document.getElementById(element).value = document.getElementById(nextElement).value;
  }



  drawInstructionAtElement(canvas, ctxCanvas, instructionIndex, "step" + sessionState.instructions.instructionBatch);


}
function DotIndexToLRTBIndex(index) {
  if (sessionState.circle) {
    return "" + index;
  }

  const width = parseInt(sessionState.pointsW);
  const height = parseInt(sessionState.pointsH);

  if (index < width) {//top
    return "T." + index; //0->79
  }
  else if (index < width + height) {//width...width+height-1
    return "R." + (index - width); //0->105
  }
  else if (index < width + height + width) {//.width+height ...width+height+width-1
    return "B." + (index - width - height);//0->79
  }
  else {//width+height+width ... width+height+width+height-1
    return "L." + (index - width - height - width);//0->105
  }
  alert("WTF");

}
function drawInstructionAtElement(canvas, ctxCanvas, instructionIndex, stepElement) {
  if (instructionIndex < sessionState.instructions.instructionsArray.length) {
    ctxCanvas.beginPath();
    ctxCanvas.lineWidth = sessionState.lineThicknessMulltiply * canvasPixelScale / sessionState.stringPixelRation
    let lineIndex = sessionState.instructions.instructionsArray[instructionIndex]["lineIndex"];

    let dotAIndex = sessionState.instructions.instructionsArray[instructionIndex]["dotAIndex"];
    if (lineIndex != -1) {

      document.getElementById('instruction').value = instructionIndex;
      const friendlyName = DotIndexToLRTBIndex(dotAIndex);
      document.getElementById(stepElement).value = friendlyName;
      ctxCanvas.strokeStyle = toStrokeStyle(lastColor)
      line = runTimeState.linesArr[parseInt(lineIndex)]
      ctxCanvas.moveTo(line.dotA[0] * canvas.width, line.dotA[1] * canvas.height);
      ctxCanvas.lineTo(line.dotB[0] * canvas.width, line.dotB[1] * canvas.height);
      ctxCanvas.stroke();
    }
    else {
      document.getElementById(stepElement).value = DotIndexToLRTBIndex(dotAIndex) + " *"

    }



  }

}

