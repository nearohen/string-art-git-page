function getEmptyPixelBuff(val = 0) {

  var focus = []
  for (var i = 0; i < sessionState.sourceWidth; i++) {
    line = []
    for (var j = 0; j < sessionState.sourceHeight; j++) {
      line.push(val)
    }
    focus.push(line)
  }
  return focus;
}

function Trancuate(color) {
  if (color < 0) {
    return 0;
  }
  if (color > 255) {
    return 255;
  }
  return color;
}

function GetColor(color) {
  brightness = sessionState.brightness - 50;
  brightness = brightness * 255 / 50;
  color = color + brightness

  contrast = sessionState.contrast - 50;
  contrast = contrast * 255 / 50
  f = 259 * (255 + contrast) / (255 * (259 - contrast))

  return Trancuate(f * (color - 128) + 128);
}


function isFocusEdge(i, j) {

  val = runTimeState.thumbnailFocusBuf[thPos(i, j)]
  if (val == 0) {
    return false;
  }

  if (i < (sessionState.sourceWidth - 1)) {
    let nVal = runTimeState.thumbnailFocusBuf[thPos(i + 1, j)];
    if (nVal - val > 0x20 || val - nVal > 0x20) {
      return true;
    }
  }
  if (i > 0) {
    let nVal = runTimeState.thumbnailFocusBuf[thPos(i - 1, j)];
    if (nVal - val > 0x20 || val - nVal > 0x20) {
      return true;
    }
  }
  if (j > 0) {
    let nVal = runTimeState.thumbnailFocusBuf[thPos(i, j - 1)]
    if (nVal - val > 0x20 || val - nVal > 0x20) {
      return true;
    }
  }
  if (j < sessionState.sourceHeight - 1) {
    let nVal = runTimeState.thumbnailFocusBuf[thPos(i, j + 1)]
    if (nVal - val > 0x20 || val - nVal > 0x20) {
      return true;
    }
  }

  return false;

}

function GetStateIdParam() {
  return { params: { stateId: document.getElementById('stateId').value } }

}

function toStrokeStyle(num) {
  num >>>= 0;
  var b = num & 0xFF,
    g = (num & 0xFF00) >>> 8,
    r = (num & 0xFF0000) >>> 16,
    a = ((num & 0xFF000000) >>> 24) / 255;

  return "rgba(" + [r, g, b, 255].join(",") + ")";
}


function OffY(y) {
  return 0;
  let gap = 0.1;
  gap = gap;
  if (y == 0) {
    return gap;
  }
  else if (y == 1) {
    return -gap;
  }
  else {
    return 0;
  }
}
function OffX(x) {
  return 0;
  let gap = 0.1;
  gap = gap;
  if (x == 0) {
    return gap;
  }
  else if (x == 1) {
    return -gap;
  }
  else {
    return 0;
  }
  //return 7*(-0.5+Math.random())  ;
}
function saveLinesImage(name) {

  var canvas = document.createElement('canvas');
  canvas.id = "CursorLayer";
  canvas.width = mainCanvas.width;
  canvas.height = mainCanvas.height;
  var ctx = canvas.getContext("2d");
  DrawLines(canvas, ctx, false, sessionState.serverSnapshot);

  var a = document.createElement('a');
  var dataUrl = canvas.toDataURL("image/png");
  a.setAttribute('href', dataUrl);
  a.setAttribute('download', name);
  a.click()

}
function saveText(text, filename) {

  var a = document.createElement('a');
  a.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  a.setAttribute('download', filename);
  a.click()
}


function getSessionOutFileName() {

  let name = getImageFileName()
  var f = name.substr(0, name.lastIndexOf('.'));
  if (f.length > 0) {
    name = f;
  }
  let filename = `${name}_thick_${sessionState.stringPixelRation}_br_${sessionState.brightness}_con_${sessionState.contrast}_lins_${Object.keys(lineUsed).length}`;
  return filename;
}

function SaveImage() {

  saveLinesImage(getSessionOutFileName())
  //var d=mainCanvas.toDataURL("image/png");
  // var w=window.open('about:blank','image from canvas');
  // w.document.write("<img src='"+d+"' alt='from canvas'/>");
}



function getImageFileName() {
  let imgName = document.getElementById('loadImgFile').value
  imgName = imgName.substring(imgName.lastIndexOf("\\") + 1);
  if (imgName.length == 0) {
    imgName = sessionState.sessionFileName
  }
  return imgName;
}

function distance(a, b) {
  return Math.sqrt(a * a + b * b)
}