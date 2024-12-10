function arround(x, y) {
  ctxMainCanvas.fillStyle = "yellow"
  ctxMainCanvas.beginPath();
  ctxMainCanvas.moveTo(x, y);
  ctxMainCanvas.arc(x, y, sessionState.radius, 0, Math.PI * 2, false);
  ctxMainCanvas.fill();
}

function drawPoint(x, y) {
  x = mainCanvas.width * x
  y = mainCanvas.height * y
  ctxMainCanvas.fillStyle = "black"
  ctxMainCanvas.fillRect(x - 1, y - 1, 2, 2)

}

function drawPoints() {
  for ([x, y] of sessionState.dots)
    drawPoint(x, y)

}
function scaleToFit(img, canvas, ctxCanvas) {
  // get the scale
  var scale = Math.min(canvas.width / img.width, canvas.height / img.height);
  // get the top left position of the image
  var x = (canvas.width / 2) - (img.width / 2) * scale;
  var y = (canvas.height / 2) - (img.height / 2) * scale;
  ctxCanvas.drawImage(img, x, y, img.width * scale, img.height * scale);
}

function drawSrcImageOnCanvas(offX, offY, scale, img, canvas, ctxCanvas) {


  X = Math.floor(offX / IMG_TO_CANVAS_SCLAE);
  Y = Math.floor(offY / IMG_TO_CANVAS_SCLAE);

  ctxCanvas.drawImage(img, X, Y, img.width * scale, img.height * scale);
}


function DrawMouse(light) {
  light = true
  R = Math.floor(sessionState.radius);
  imgDataR = R + 1
  ctxMainCanvas.lineWidth = 1
  if (runTimeState.mouseOnCanvas) {
    x = runTimeState.mouseX
    y = runTimeState.mouseY
    if (runTimeState.lastMouseImage != null) {

      ctxMainCanvas.putImageData(runTimeState.lastMouseImage, runTimeState.lastMouseX - runTimeState.lastMouseR, runTimeState.lastMouseY - runTimeState.lastMouseR)

    }
    runTimeState.lastMouseImage = ctxMainCanvas.getImageData(x - imgDataR, y - imgDataR, 2 * imgDataR, 2 * imgDataR)
    ctxMainCanvas.strokeStyle = "#" + bgValToBaseColor(255) + bgValToBaseColor(128) + bgValToBaseColor(0);
    if (sessionState.imgManipulationMode == IMG_MANIPULATION_SELECT_PIXELS || sessionState.imgManipulationMode == IMG_MANIPULATION_PIXELS_WEIGHT) {
      ctxMainCanvas.beginPath();
      ctxMainCanvas.arc(x, y, R, 0, 2 * Math.PI);
      ctxMainCanvas.closePath();
      ctxMainCanvas.stroke();
    }
    else {
      ctxMainCanvas.beginPath();
      ctxMainCanvas.moveTo(x, y - 20);
      ctxMainCanvas.lineTo(x, y + 20);

      ctxMainCanvas.moveTo(x - 20, y);
      ctxMainCanvas.lineTo(x + 20, y);

      ctxMainCanvas.closePath();
      ctxMainCanvas.stroke();

    }



    runTimeState.lastMouseX = x
    runTimeState.lastMouseY = y
    runTimeState.lastMouseR = imgDataR


  }
}



let lineUsedSize = 0;
let lineUsed = null;
function initLineUsed(size) {
  ret = false;
  if (size > lineUsedSize) {
    lineUsed = Buffer.alloc(size);
    lineUsedSize = size;
    ret = true;
  }
  return ret;
}
function LogLine(index, on) {
  changed = false;
  if (lineUsedSize > index) {
    if (lineUsed[index] == 0 & on) {
      changed = true;
      lineUsed[index] = 1;
    }
    if (lineUsed[index] > 0 & !on) {
      changed = true;
      lineUsed[index] = 0;
    }

  }
  return changed;
}



function DrawLine(lineIndex, ctxCanvas, canvas) {

  ctxCanvas.lineWidth = 0.5;
  ctxCanvas.beginPath();
  line = runTimeState.linesArr[parseInt(lineIndex)]
  let x1 = (line.dotA[0] + OffX(line.dotA[0])) * canvas.width;
  let y1 = (line.dotA[1] + OffY(line.dotA[1])) * canvas.height;
  let x2 = (line.dotB[0] + OffX(line.dotB[0])) * canvas.width;
  let y2 = (line.dotB[1] + OffY(line.dotB[1])) * canvas.height;

  ctxCanvas.moveTo(x1 + OffX(line.dotA[0]), y1 + OffY(line.dotA[1]));
  ctxCanvas.lineTo(x2 + OffX(line.dotB[0]), y2 + OffY(line.dotB[1]));
  ctxCanvas.stroke();
}

function DrawLines(canvas, ctxCanvas, updateImprovements, snapshot) {
  let firstTime = initLineUsed(runTimeState.linesArr.length);
  let changes = 0;
  let count = 0;
  canvasPixelScale = canvas.width / sessionState.sourceWidth;
  ctxCanvas.beginPath();
  let stringPixelRation = sessionState.stringPixelRation;
  ctxCanvas.lineWidth = sessionState.lineThicknessMulltiply * canvasPixelScale / stringPixelRation
  lastColor = 0
  ctxCanvas.strokeStyle = toStrokeStyle(lastColor)
  var decoded = new Uint8Array(snapshot);
  let lineIndex = 0
  for (let i = 0; i < decoded.byteLength; i++) {
    let byte = decoded[i];
    for (let bit = 0; bit < 8; bit++) {
      if (byte & 1) {
        if (LogLine(lineIndex, true) && !firstTime) {
          changes++;
        }
        if (lineIndex < runTimeState.linesArr.length) {
          line = runTimeState.linesArr[parseInt(lineIndex)]
          let x1 = (line.dotA[0]) * canvas.width;
          let y1 = (line.dotA[1]) * canvas.height;
          let x2 = (line.dotB[0]) * canvas.width;
          let y2 = (line.dotB[1]) * canvas.height;

          ctxCanvas.moveTo(x1, y1);
          ctxCanvas.lineTo(x2, y2);
          count++;
        }
      }
      else {
        if (LogLine(lineIndex, false) && !firstTime) {
          changes++;
        }
      }
      byte = byte >> 1;
      lineIndex++;
    }
  }
  ctxCanvas.stroke();
  if (updateImprovements) {
    document.getElementById('improvements').value = changes;
  }

  return {count,changes} ;
}

function DrawLinesThumbnailCanvas() {

  fillCanvas("thumbnailStrings", "#FFFFFF");
  let {count,changes} = DrawLines(can.thumbnailStrings.canvas, can.thumbnailStrings.ctx, true, sessionState.serverSnapshot) ;
 
  return count;

}

async function ss1() {
  let diff = 1;
  while (runTimeState.animationOn) {

    let lines = Buffer.alloc(runTimeState.linesArr.length);
    for (let i = 0; i < sessionState.dots.length; i++) {
      let from = i;
      let to = fixDotIndex(i * diff);
      lines[getLineIndex(from, to)] = 1;
    }
    await addToSnapshots(LinesToSnapshot(lines));
    diff += 0.1;


  }
}

function DrawLinesMainCanvas() {
  drawPoints();
  if (sessionState.serverSnapshot) {
    let {count,changes} = DrawLines(mainCanvas, ctxMainCanvas, false, sessionState.serverSnapshot) ;
    document.getElementById("lines").value = count ; 
    if(changes)
      document.getElementById("improvements").value = changes-1 ; 
    runTimeState.previousSnapshot = sessionState.serverSnapshot;
    return count;
  }
}
function updateServerSnapshot(snapshot) {
  if (snapshot != undefined) {
    sessionState.serverSnapshot = snapshot;
    document.getElementById('lines').value = DrawLinesThumbnailCanvas()
  }
}
function DrawCanvas() {
  ///rotate = rotate+1
  // initLines()

  ;
  if (sessionState.onCanvas == ON_CANVAS_IMG) {
    clearMainCanvas();
    DrawImg();
    runTimeState.lastMouseImage = null
    DrawMouse(false)
  }
  else if (sessionState.onCanvas == ON_CANVAS_STRING_COLOR || sessionState.onCanvas == ON_CANVAS_DISTANCE) {
    clearMainCanvas();
    DrawStatus();
    runTimeState.lastMouseImage = null
    DrawMouse(false)
  }
  else if (sessionState.onCanvas == ON_CANVAS_STRINGS) {
    if (sessionState.onCanvas == ON_CANVAS_STRINGS) {
      clearMainCanvas();
      DrawLinesMainCanvas();
      runTimeState.lastMouseImage = null
      DrawMouse(false)
    }
  }
  else if (sessionState.onCanvas == ON_CANVAS_PIXEL_WEIGHT) {
    clearMainCanvas();
    DrawImg();
    runTimeState.lastMouseImage = null
    DrawMouse(false)
  }


}


function thPos(x, y) {
  let pos = y * sessionState.sourceWidth + x;
  return pos;
}
function DrawImg() {

  if (runTimeState.thumbnailMainBuf == undefined) {
    return;
  }

  largestDistance = distance(sessionState.sourceWidth, sessionState.sourceHeight)

  for (var i = 0; i < sessionState.sourceWidth; i++) {
    for (var j = 0; j < sessionState.sourceHeight; j++) {
      a = runTimeState.thumbnailMainBuf[thPos(i, j)];
      let color = GetColor(a)
      let bgColor = color;
      alpha = 1;

      if (runTimeState.thumbnailFocusBuf[thPos(i, j)] < 0x7f) {

        dTL = largestDistance - distance(i, j)
        dTR = largestDistance - distance(sessionState.sourceWidth - i, j)
        dBL = largestDistance - distance(i, sessionState.sourceHeight - j)
        dBR = largestDistance - distance(sessionState.sourceWidth - i, sessionState.sourceHeight - j)
        bgColor = dTL * sessionState.bgColors[0] + dTR * sessionState.bgColors[1] + dBL * sessionState.bgColors[2] + dBR * sessionState.bgColors[3]
        bgColor = bgColor / (dTL + dTR + dBL + dBR)
      }


      if (sessionState.imgManipulationMode == IMG_MANIPULATION_ZOOM_MOVE) {
        if (isFocusEdge(i, j)) {
          alpha = 0.5 + Math.random() / 2;
        }
      }
      if (sessionState.imgManipulationMode == IMG_MANIPULATION_SELECT_PIXELS) {
        if (runTimeState.mouseOnCanvas) {

          if (isFocusEdge(i, j)) {
            alpha = 0.5 + Math.random() / 2;
          }

        }
        else {
          color = bgColor;
        }

      }

      else if (sessionState.imgManipulationMode == IMG_MANIPULATION_PIXELS_WEIGHT) {
        a = runTimeState.thumbnailWeightBuf[thPos(i, j)];
        if (runTimeState.mouseOnCanvas) {
          color = bgColor;
          let pixelWeight = a;
          alpha = pixelWeight / 256;
        }
        else {
          alpha = 1;
          color = 255 - a;

        }
      }

      colorStr = 'rgba(' + color + ', ' + color + ', ' + color + ', ' + alpha + ')';
      ctxMainCanvas.fillStyle = colorStr
      ctxMainCanvas.fillRect(i * IMG_TO_CANVAS_SCLAE, j * IMG_TO_CANVAS_SCLAE, IMG_TO_CANVAS_SCLAE, IMG_TO_CANVAS_SCLAE)
    }
  }

}


function DrawStatus() {
  ctxMainCanvas.drawImage(can.sourceStatus.canvas, 0, 0, mainCanvas.width, mainCanvas.height);
}


function clearMainCanvas() {
  ctxMainCanvas.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
  ctxMainCanvas.fillStyle = "white"
  ctxMainCanvas.strokeStyle = "black"
}

