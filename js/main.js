var Buffer = require('Buffer');
const EventBus = new EventTarget();
// Emit (dispatch) a global event
function emitStateChange(newState){
  emitEvent("stateChange",{state:newState}) ;
}




function emitEvent(eventName, detail = {}) {
  const event = new CustomEvent(eventName, { detail }); // Pass data with the event
  EventBus.dispatchEvent(event);
}

// Listen for a global event
function listenToEvent(eventName, callback) {
  EventBus.addEventListener(eventName, (event) => {
      callback(event.detail); // Access the passed data
  });
}


  

function onStateChange(cb){
  listenToEvent("stateChange",({state})=>{
    
    cb(state) ;
  }) ;
}



const IMG_MANIPULATION_SELECT_PIXELS = 0
const IMG_MANIPULATION_ZOOM_MOVE = 1
const IMG_MANIPULATION_PIXELS_WEIGHT = 3

const ON_CANVAS_STRINGS = 0;
const ON_CANVAS_IMG = 1;
const ON_CANVAS_DISTANCE = 2;
const ON_CANVAS_STRING_COLOR = 3;
const ON_CANVAS_INSTRUCTION = 4;
const ON_CANVAS_PIXEL_WEIGHT = 5;
const STRINGS_STATE_VERSION = 3 ;
let lastStringColor = null
let lastDistance = null;


const States = {
  NS :'SIGN_IN',
  CP: 'CHOOSE_PROJECT',
  ES: 'EDDIT_SESSION',
  SC: 'SESSION_CREATED',
  PL:"ON_PLAY",
  ST:"ON_STOP",
  IN:"INSTRUCTIONS",
};

// Add enum for edit types at the top with other constants
const CustomPointEditTypes = {
  ADD: 'ADD',
  MOVE: 'MOVE',
  DELETE: 'DELETE',
  CLEAR: 'CLEAR'
};

let runTimeState = {};
function initRunTimeState(){    
  runTimeState = {
    state: States.NS ,
    debugMode: false,
    mouseDown: false,
    mouseButton: -1,
    mouseX: -1,
    mouseY: -1,
    mouseMoving: false,

    lastMouseX: -1,
    lastMouseY: -1,
    lastMouseR: -1,
    mouseOnCanvas: false,
    imgManipulationMode: IMG_MANIPULATION_ZOOM_MOVE,
    intervals: {
      intervalUpdateBackend: 0,
      intervalStreamPictures: 0,
      intervalInstruction: 0,
      timeoutNewServerImg: 0,
      timeoutNewThumbnails: 0,
      intervalSprints: 0,
      animationInterval: 0,
      mouseMoveInterval: 0,

    },
    linesArr: [],
    lines:0,
    pixelWeightSent: [],
    pixelWeightColor: 0x7f,
    previousSnapshot: "",
    rate: 1000,
    animationOn: false,
    updateCanvasRate: 50,
    maxSnapshots: 20,
    snapshots: [],
    zoomMove: [],
    
    onEditCustomPoints: false,
    customPointEditType: CustomPointEditTypes.ADD,  // Default to ADD mode
    cutomPointChosenIndex: -1,
  }
}
initRunTimeState();
let sessionState = {};
function InitState() {
  sessionState = {
    version : STRINGS_STATE_VERSION,
    lines:0,
    pointsW:86,
    pointsH: 106,
    pointsC: 256,
    sourceWidth: 128,
    sourceHeight: 128,
    radius: 64,
    pointsType: "R",
    brightness: 50,
    contrast: 50,
    normalize: 1.5,
    collision: 0,
    stringPixelRation: 32,
    lineThicknessMulltiply: 1,
    distanceViewFactor: 1,
    minLength: 1,  // Add minLength to session state
    sendRawSourceImg: "",
    pixelWeight: [],
    pointsArr: [],
    customPoints: [],
    snapshot: "",
    onCanvas: ON_CANVAS_STRINGS,
    stateId: "",
    bgColors: [0x7f, 0x7f, 0x7f, 0x7f],
    bgStrength: 0.5,
    onBGColor: 0,
    recOffX: 0,
    recOffY: 0,
    recWidth: 1,
    recHeight: 1,
    sessionFileName: "",
    serverAddr: `${window.location.protocol}//${window.location.hostname}`,
    customPointSpacingPercent: 1,
  }

  initRelevantPixels();
}
InitState();


let IMG_TO_CANVAS_SCLAE = 3;


function ApplyWeight() {
  SendRawWeight();
}

function OnPixelWeight() {
  runTimeState.imgManipulationMode = IMG_MANIPULATION_PIXELS_WEIGHT;
  GoToCanvas(ON_CANVAS_PIXEL_WEIGHT);
}

function OnZoomMove() {
  runTimeState.imgManipulationMode = IMG_MANIPULATION_ZOOM_MOVE;
}
function OnSelect() {
  runTimeState.imgManipulationMode = IMG_MANIPULATION_SELECT_PIXELS;
  GoToCanvas(ON_CANVAS_IMG);
}

function newSession() {
  InitState();
  LoadStateValuesToUI();
  let user  = runTimeState.user;
  initRunTimeState();
  runTimeState.user = user;
  emitStateChange(States.ES);
}



function fixDotIndex(index) {
  index = parseInt(index);
  index = index % sessionState.dots.length;
  if (index < 0) {
    index = sessionState.dots.length - index;
  }
  return index;
}
function getNeighborDot(dotIndex, distance) {
  if (distance == 0) {
    return [dotIndex];
  }

  return [fixDotIndex(dotIndex - distance), fixDotIndex(dotIndex + distance)];

}


function arrayBufferToBase64(buffer) {
  const uint8Array = new Uint8Array(buffer);
  const binaryString = uint8Array.reduce((str, byte) => str + String.fromCharCode(byte), "");
  return btoa(binaryString); // Convert binary string to base64
}


function saveSession() {


  let filename = getSessionOutFileName()
 
  saveState(); 
  saveText(JSON.stringify(sessionState), filename)
  //saveLinesImage(filename);
}
function getMainCanvas() {
  return document.getElementById("main-canvas")
}

function canvasPinchZoom(zoomMove1,zoomMove2){
  // Calculate distance between fingers in first touch position
  const d1 = Math.hypot(
    zoomMove1.f1.offsetX - zoomMove1.f2.offsetX,
    zoomMove1.f1.offsetY - zoomMove1.f2.offsetY
  );
  const d2 = Math.hypot(
    zoomMove2.f1.offsetX - zoomMove2.f2.offsetX,
    zoomMove2.f1.offsetY - zoomMove2.f2.offsetY
  );


  let growth =d1/d2;
  


  // Calculate the middle point between the two fingers
  const relativePosX = (zoomMove2.f1.relativePosX + zoomMove2.f2.relativePosX) / 2;
  const relativePosY = (zoomMove2.f1.relativePosY + zoomMove2.f2.relativePosY) / 2;

  handleGrow(growth,relativePosX,relativePosY) ;
  
}


function addZoomMove(finger1,finger2){

  const rect = mainCanvas.getBoundingClientRect();
  let toAdd = {f1:{
    offsetX: finger1.clientX - rect.left,
    offsetY: finger1.clientY - rect.top,
    relativePosX: (finger1.clientX - rect.left) / mainCanvas.width,
    relativePosY: (finger1.clientY - rect.top) / mainCanvas.height
  },f2:{
    offsetX: finger2.clientX - rect.left,
    offsetY: finger2.clientY - rect.top,
    relativePosX: (finger2.clientX - rect.left) / mainCanvas.width,
    relativePosY: (finger2.clientY - rect.top) / mainCanvas.height
  }};
  if(runTimeState.zoomMove.length<2){ 
    runTimeState.zoomMove.push(toAdd);
  }
  else{
    runTimeState.zoomMove[1] = toAdd;
  }
}

function initMainCanvas() {

  width = sessionState.sourceWidth*IMG_TO_CANVAS_SCLAE
  height = sessionState.sourceHeight*IMG_TO_CANVAS_SCLAE 

  mainCanvas = getMainCanvas()
  mainCanvas.onmousemove = canvasMouseMove
  mainCanvas.onmouseenter = () => { runTimeState.mouseOnCanvas = true };
  mainCanvas.onmouseleave = () => { runTimeState.mouseOnCanvas = false };
  mainCanvas.onwheel = canvasMouseWheel;
  mainCanvas.onmousedown = canvasMousedown;
  mainCanvas.onmouseup = canvasMouseup;

  // Add touch event handlers
  mainCanvas.addEventListener('touchstart', function(event) {
    event.preventDefault();
    if(event.touches.length==1){
      runTimeState.onZoomDisableMove = false;
    }
     if (event.touches.length === 2) {
      // Two finger touch - prepare for pinch zoom
      runTimeState.zoomMove = [];
     
      let finger1 = event.touches[0];
      let finger2 = event.touches[1];
      addZoomMove(finger1,finger2);
    
    } else {
      // Single finger touch - handle as mouse event
      runTimeState.zoomMove = []; // Clear zoom points
      const touch = event.touches[0];
      const rect = mainCanvas.getBoundingClientRect();
      const touchEvent = {
        offsetX: touch.clientX - rect.left,
        offsetY: touch.clientY - rect.top
      };
      canvasMousedown(touchEvent);
    }
  }, { passive: false });

  mainCanvas.addEventListener('touchmove', function(event) {
    event.preventDefault();
    if (event.touches.length === 2) {
      // Update zoom points
      let finger1 = event.touches[0];
      let finger2 = event.touches[1];
      addZoomMove(finger1,finger2);
     
    } 
  }, { passive: false });

  mainCanvas.addEventListener('touchend', function(event) {
    event.preventDefault();
      
     
    if (runTimeState.zoomMove.length === 2) {

        canvasPinchZoom(runTimeState.zoomMove[0], runTimeState.zoomMove[1],);
        runTimeState.zoomMove = [];
        runTimeState.onZoomDisableMove = true;
      
    }
    else{
      runTimeState.zoomMove = []; // Clear zoom points
      // For touchend, use the last known touch position
      const touch = event.changedTouches[0];
      const rect = mainCanvas.getBoundingClientRect();
      const touchEvent = {
        offsetX: touch.clientX - rect.left,
        offsetY: touch.clientY - rect.top
      };
      if(!runTimeState.onZoomDisableMove){
        canvasMouseup(touchEvent);
      }
    }
  }, { passive: false });

  mainCanvas.height = height + 1;//plus 1 cus most right circle dot out of bounds
  mainCanvas.width = width + 1;
  ctxMainCanvas = mainCanvas.getContext('2d', { willReadFrequently: true });

}

function handleGrow(growth,relativePosX,relativePosY){

  if (growth < 1 || sessionState.recWidth * growth < can.original.canvas.width && sessionState.recHeight * growth < can.original.canvas.height) {//can grow
    let growX = sessionState.recWidth * growth - sessionState.recWidth;
    let growXLeft = relativePosX * growX;
    let growY = sessionState.recHeight * growth - sessionState.recHeight;
    let growYUp = relativePosY * growY;
    sessionState.recWidth += growX;
    sessionState.recHeight += growY;
    sessionState.recOffX -= growXLeft;
    sessionState.recOffY -= growYUp;
    fixRec();


  }
  UpdateNewServerImg();
}


function upDown(down){
  sessionState.recOffY += down ? 1 : -1;
  fixRec();
  UpdateNewServerImg();
}

function leftRight(left){
  sessionState.recOffX += left ? 1 : -1;
  fixRec();
  UpdateNewServerImg();
}


function Zoom(positive){
  let growth = 1.02;
  if(positive) {
    growth = 1.02;
  }
  else {
    growth = 0.98;
  }
  handleGrow(growth,0.5,0.5) ;

}
function canvasMouseWheel(event) {

  if (runTimeState.mouseOnCanvas) {
    event.preventDefault();
    if (runTimeState.imgManipulationMode == IMG_MANIPULATION_SELECT_PIXELS || runTimeState.imgManipulationMode == IMG_MANIPULATION_PIXELS_WEIGHT) {

      if (event.deltaY < 0) {


        sessionState.radius = sessionState.radius + 4;
        if (sessionState.radius > 100) {
          sessionState.radius = 100;
        }


        DrawMouse(true)
      }
      else if (event.deltaY > 0) {

        sessionState.radius = sessionState.radius - 4;
        if (sessionState.radius < 1) {
          sessionState.radius = 1;
        }

        DrawMouse(true)
      }

    }
    else if (runTimeState.imgManipulationMode == IMG_MANIPULATION_ZOOM_MOVE) {


      const scaled = getCanvasCoordinates(mainCanvas,event);
     



      let growth = 1.02;
      if (event.deltaY < 0) {
        growth = 0.98;
      }

      handleGrow(growth,scaled.x/mainCanvas.width,scaled.y/mainCanvas.height) ;
      

    }
  }

}

function UpdateNewServerImg() {

  if (runTimeState.intervals.timeoutNewServerImg != 0) {
    clearTimeout(runTimeState.intervals.timeoutNewServerImg);
    runTimeState.intervals.timeoutNewServerImg = 0;
  }
  runTimeState.intervals.timeoutNewServerImg = setTimeout(() => {
    handleNewServerImg();
    clearTimeout(runTimeState.intervals.timeoutNewServerImg);
    runTimeState.intervals.timeoutNewServerImg = 0;
  }, 100);
}

function updateNewThumbnails() {

  if (runTimeState.intervals.timeoutNewThumbnails != 0) {
    clearTimeout(runTimeState.intervals.timeoutNewThumbnails);
    runTimeState.intervals.timeoutNewThumbnails = 0;
  }
  runTimeState.intervals.timeoutNewThumbnails = setTimeout(() => {
    updateThumbnails();

  }, 100);
}



function editCustomPoints(){
  sessionState.dots = [];
  emitStateChange(States.ES);

  runTimeState.onEditCustomPoints = true;
  runTimeState.customPointEditType = CustomPointEditTypes.ADD;  // Set initial mode
  
  runTimeState.onEditCustomPointsFirstTime = sessionState.customPoints.length < 3;
  showEditPoints();
}
function onPointsCustom(){

    editCustomPoints();
  
}

function customPointsToDots(){

  
  if(sessionState.customPoints.length<2){
    if(sessionState.customPoints.length==0){
      sessionState.dots  = [] ;
    }
    return;
  }
  // Create a closed polygon by adding the first point at the end if needed
  const points = sessionState.customPoints;
  const closedPolygon = [...points];
  if (points.length > 0 && (points[0][0] !== points[points.length-1][0] || points[0][1] !== points[points.length-1][1])) {
    closedPolygon.push(points[0]);
  }

  // Calculate total polygon perimeter
  let totalLength = 0;
  for (let i = 0; i < closedPolygon.length - 1; i++) {
    const dx = closedPolygon[i+1][0] - closedPolygon[i][0];
    const dy = closedPolygon[i+1][1] - closedPolygon[i][1];
    totalLength += Math.sqrt(dx*dx + dy*dy);
  }

  // Calculate number of points based on spacing percentage
  const spacing = sessionState.customPointSpacingPercent / 100; // Convert from percentage to decimal
  const numPoints = Math.max(3, Math.floor(totalLength / spacing));
  
  // Create evenly spaced points
  const spacedPoints = [];
  let currentDist = 0;
  let currentSegment = 0;
  let segmentProgress = 0;
  
  for (let i = 0; i < numPoints; i++) {
    const targetDist = (i * totalLength) / numPoints;
    
    // Find the correct segment
    while (currentDist < targetDist && currentSegment < closedPolygon.length - 1) {
      const dx = closedPolygon[currentSegment+1][0] - closedPolygon[currentSegment][0];
      const dy = closedPolygon[currentSegment+1][1] - closedPolygon[currentSegment][1];
      const segmentLength = Math.sqrt(dx*dx + dy*dy);
      
      if (currentDist + segmentLength >= targetDist) {
        segmentProgress = (targetDist - currentDist) / segmentLength;
        break;
      }
      
      currentDist += segmentLength;
      currentSegment++;
    }
    
    // Interpolate point position
    const p1 = closedPolygon[currentSegment];
    const p2 = closedPolygon[currentSegment + 1];
    const x = p1[0] + (p2[0] - p1[0]) * segmentProgress;
    const y = p1[1] + (p2[1] - p1[1]) * segmentProgress;
    
    spacedPoints.push([x.toFixed(4), y.toFixed(4), i]);
  }

  // Update session state
  sessionState.dots = spacedPoints;
  ;

}


function applyCustomPoints() {

  customPointsToDots();
  runTimeState.onEditCustomPoints = false;
  handlePointsChange(false);
  
}



function handlePointsChange(initImgRec) {
  if(initImgRec){//on loading saved - this is called before image loaded dont 
    fixRec();
  }
  initDots();
  initLines();
  PostWorkerMessage({cmd : "initWorkerState" , args : {}});
  can.sourceStatus.canvas.width = sessionState.sourceWidth
  can.sourceStatus.canvas.height = sessionState.sourceHeight

  can.thumbnailMain.canvas.width = sessionState.sourceWidth;
  can.thumbnailMain.canvas.height = sessionState.sourceHeight;

  can.thumbnailWeight.canvas.width = sessionState.sourceWidth;
  can.thumbnailWeight.canvas.height = sessionState.sourceHeight;

  can.thumbnailFocus.canvas.width = sessionState.sourceWidth;
  can.thumbnailFocus.canvas.height = sessionState.sourceHeight;

  can.thumbnailStrings.canvas.width = sessionState.sourceWidth;
  can.thumbnailStrings.canvas.height = sessionState.sourceHeight;

  // Disable start session button if there are fewer than 4 dots
  const startSessionButton = document.getElementById('startSession');
  if (startSessionButton) {
    startSessionButton.disabled = sessionState.dots.length < 4;
    startSessionButton.title = sessionState.dots.length < 4 ? 'Need at least 4 dots to start' : '';
  }

  if (initImgRec) {
    initRec();
  }
  initMainCanvas();
  if(imageLoaded()){
    originalImg.src = sessionState.originalImgSrc;//to trigger onLoad
  }
  else{
    initOriginalSmall();
  }
  loadSavedToCanvas("weight", sessionState.weightImg);
  loadSavedToCanvas("focus", sessionState.focusImg);
}

function loadSavedToCanvas(canvasName, data) {
  if (data != undefined) {
    var tmp = new Image;
    tmp.onload = function () {
      can[canvasName].ctx.drawImage(tmp, 0, 0); // Or at whatever offset you like 
      updateThumbnails();
    };
    tmp.src = data;
  }

}

function RestartState() {
  sessionState.stateId = "";
  LoadStateValuesToUI()
  handlePointsChange(false);


}
function handleNewState(params) {
  sessionState = params
  RestartState();
  sessionState.snapshotBuffer =  base64ToArrayBuffer(sessionState.snapshotB64)  ;
  GoToCanvas(ON_CANVAS_STRINGS);
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64); // Decode base64
  const len = binaryString.length;
  const uint8Array = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
      uint8Array[i] = binaryString.charCodeAt(i);
  }
  return uint8Array.buffer; // Convert back to ArrayBuffer
}

function LoadSession(evt) {

  const fileList = this.files;
  var file = this.files[0];//e.originalEvent.srcElement.files[i];

  var reader = new FileReader();


  reader.onloadend = function () {

    params = JSON.parse(reader.result);

 
    if (params != null) {

      handleNewState(params);
      startSession();
    }
  }
  reader.readAsText(file)


}
function bgValToBaseColor(val) {

  num = parseInt(val).toString(16).padStart(2, 0);

  return num
}
function bgValToColor(val) {

  num = parseInt(val).toString(16).padStart(2, 0);
  num = "#" + num + num + num
  return num
}
function updateOptionalValue(name,value){
  if(document.getElementById(name)){
    document.getElementById(name).value = value
  }
  

}
function setSessionFileName(){
  document.getElementById("sessionFileName").textContent = sessionState.sessionFileName
  adjustSessionFileNameWidth(); ;
}
function LoadStateValuesToUI() {

  document.getElementById("stringPixelRatio").value = sessionState.stringPixelRation;
  document.getElementById("stringPixelRatioText").value = sessionState.stringPixelRation;

  document.getElementById("lineThicknessMulltiply").value = sessionState.lineThicknessMulltiply;
  document.getElementById("lineThicknessMulltiplyText").value = sessionState.lineThicknessMulltiply;


  document.getElementById("normalizeRange").value = sessionState.normalize;
  document.getElementById("normalizeRangeText").value = sessionState.normalize;
  document.getElementById("collisionRange").value = sessionState.collision;
  document.getElementById("collisionRangeText").value = sessionState.collision;


  document.getElementById("pointsW").value = sessionState.pointsW;
  document.getElementById("pointsH").value = sessionState.pointsH;
  document.getElementById("pointsC").value = sessionState.pointsC;

  setSessionFileName() ;
  if(!sessionState.sessionFileName){
    document.getElementById("triggerFileInput").textContent = "Upload Image" ;
  }

  

  
  updateOptionalValue("contrastRangeText",sessionState.contrast);
  updateOptionalValue("contrastRange",sessionState.contrast);

  updateOptionalValue("brightnessRangeText",sessionState.brightness);
  updateOptionalValue("brightnessRange",sessionState.brightness);
  updateOptionalValue("bgStrength",sessionState.bgStrength);
  

  
    // Update the toggle view icon to match the current state
    const button = document.querySelector('#toggleControls .icon-button');
    if (button) {
      const icon = button.querySelector('.material-icons');
      icon.textContent = sessionState.onCanvas === ON_CANVAS_IMG ? 'timeline' : 'image';
    }
  

}

const port = 8005

linesSempling = 1000;
let mainCanvas;
let ctxMainCanvas

let can = {};
const originalImg = document.createElement("img");
async function AnimateGifLoad() {
  //animatedGidData.superGif = new SuperGif({ gif: document.getElementById('animatedGif') });
  //animatedGidData.superGif.load();
 // animatedGidData.superGif.pause();

}

addCanvasElement("sourceStatus", true);

function SendRawWeight() {
  var imgPixels = can.thumbnailWeight.ctx.getImageData(0, 0, can.thumbnailWeight.canvas.width, can.thumbnailWeight.canvas.height);
  let w = sessionState.sourceWidth;
  let h = sessionState.sourceHeight;
  let buf = Buffer.alloc(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let pos = x * h + y;
      let pixel = imgPixels.data[pos * 4] + imgPixels.data[pos * 4 + 1] + imgPixels.data[pos * 4 + 2];;
      pixel = pixel / 3;
      if (pixel < 0) {
        pixel = 0;
      }
      if (pixel > 255) {
        pixel = 255;
      }
      buf.writeUInt8(pixel, pos);
    }
  }
  sessionState.sendWeightImg = buf.toString('base64');
  if (serverConnected()) {
    updateSessionParams();
  }
}

function updateRaw(name, binary) {

  var imgPixels = can[name].ctx.getImageData(0, 0, can[name].canvas.width, can[name].canvas.height);
  let w = sessionState.sourceWidth;
  let h = sessionState.sourceHeight;
  buf = Buffer.alloc(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let pos = x * h + y;
      let pixel = imgPixels.data[pos * 4] + imgPixels.data[pos * 4 + 1] + imgPixels.data[pos * 4 + 2];;
      pixel = pixel / 3;
      if (pixel < 0) {
        pixel = 0;
      }
      if (pixel > 255) {
        pixel = 255;
      }
      if (binary) {
        pixel = pixel > 0x7f ? 255 : 0;
      }

      buf.writeUInt8(pixel, pos);

    }

  }
  runTimeState[name + "Buf"] = buf;
  sessionState[name + "Raw"] = buf ;


}




function startSession() {

  
  if(runTimeState.onEditCustomPoints){
    applyCustomPoints();
  }
   // Hide all inputs first
   document.querySelectorAll('.shape-input').forEach(input => {
    input.classList.remove('visible');
  });
  if(sessionState.dots.length<4){
    return;
  }
  sessionState.normalize = document.getElementById("normalizeRangeText").value;
  sessionState.stringPixelRation = document.getElementById("stringPixelRatioText").value



 

  const params = {
    stringPixelRatio: parseInt(sessionState.stringPixelRation),
    normalize: parseFloat(sessionState.normalize),
    collision: parseFloat(sessionState.collision),
    width: sessionState.sourceWidth,
    height: sessionState.sourceHeight,
    serverSnapshot: sessionState.snapshotB64,
    bgColors: JSON.stringify(sessionState.bgColors),
    dots:[],
    brightness: parseFloat(sessionState.brightness),
    contrast: parseFloat(sessionState.contrast),
    bgStrength: parseFloat (sessionState.bgStrength),
    distanceViewFactor: parseFloat(sessionState.distanceViewFactor),
  };



  const dots = sessionState.dots ;
  console.log(`saParams:dots${dots.length} `) ;
  for (pointIndex in dots)
  {
      let dot = {
          x:params.width*dots[pointIndex][0],
          y:params.height*dots[pointIndex][1],
          
      }
      //console.log(` dot:${JSON.stringify(dot)} `) ;
      params.dots.push(dot)
  }
  const initJson = JSON.stringify(params) ;
  PostWorkerMessage( {cmd: "init",args : initJson});

  
  
}



function getRndColor() {
  var r = 255 * Math.random() | 0,
    g = 255 * Math.random() | 0,
    b = 255 * Math.random() | 0;
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function xToOriginal(x) {

  const ret = sessionState.recOffX + x * pixelWidthToOriginal();
  return ret;
}

function yToOriginal(y) {
  const ret = sessionState.recOffY + y * pixelWidthToOriginal();
  return ret;
}
function pixelWidthToOriginal() {
  const ret = sessionState.recWidth / sessionState.sourceWidth;
  return ret;
}

function getCanvasCoordinates(canvas, event) {
  // Get the canvas's bounding rectangle on the page
  const rect = canvas.getBoundingClientRect();
  
  // Get the scaling factors
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  
  // Calculate the real canvas coordinates
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  
  return { x, y };
}


function canvasMouseMove(event) {
  // Set mouse moving state
  runTimeState.mouseMoving = true;
 
  // Clear existing timer if any
  if (runTimeState.intervals.mouseMoveInterval) {
    clearTimeout(runTimeState.intervals.mouseMoveInterval);
  }

  // Set new timer to mark mouse as stopped after 100ms of no movement
  runTimeState.intervals.mouseMoveInterval = setTimeout(() => {
    runTimeState.mouseMoving = false;
    runTimeState.intervals.mouseMoveInterval = 0;
  }, 100);

  // Existing mouse move code
  const scaled = getCanvasCoordinates(mainCanvas,event);
  runTimeState.mouseX = scaled.x
  runTimeState.mouseY = scaled.y
  let X = Math.floor(scaled.x / IMG_TO_CANVAS_SCLAE);
  let Y = Math.floor(scaled.y / IMG_TO_CANVAS_SCLAE);

  processFocus(event,"move");  
  if(runTimeState.onEditCustomPoints && runTimeState.cutomPointChosenIndex!=-1 && runTimeState.mouseDown) {
    let {x, y} = getCanvasCoordinates(mainCanvas, event);
    x = x / mainCanvas.width;
    y = y / mainCanvas.height;
    sessionState.customPoints[runTimeState.cutomPointChosenIndex][0] = x;
    sessionState.customPoints[runTimeState.cutomPointChosenIndex][1] = y;
  }
  DrawMouse(true)
}

function imgManipulationMode(type) {
  runTimeState.imgManipulationMode = type;
}

///////////////////////////////////////////////////////////////////////////////////////////////

function startMainCanvas() {
  setTimeout(() => {
    DrawCanvas();
    startMainCanvas();
  }, runTimeState.updateCanvasRate);

}








////////////////////////////////////////////////////////////////////////

function initRelevantPixels() {

  sessionState.focus = getEmptyPixelBuff(1);
  sessionState.pixelWeight = getEmptyPixelBuff(0x7f);
}





function UpdateStatus() {

  let params = GetStateIdParam();
  params.params.width = sessionState.sourceWidth;
  params.params.height = sessionState.sourceHeight;

  if (sessionState.onCanvas == ON_CANVAS_DISTANCE) {
    axios.get(`${sessionState.serverAddr}:${port}/distance`, params)
      .then(({ data }) => {
        var totalDistance = data["totalDistance"]
        document.getElementById("totalDistance").value = totalDistance;
        if (data["res"] == "ok") {
          var b64 = data["distance"];
          var decoded = atob(b64);
          lastDistance = decoded;
          let len = decoded.length;
          for (var i = 0; i < sessionState.sourceWidth; i++) {
            for (var j = 0; j < sessionState.sourceHeight; j++) {
              pos = sessionState.sourceHeight * i + j
              a = decoded.charCodeAt(pos);
              colorStr = 'rgb(' + a + ', ' + a + ', ' + a + ')';
              can.sourceStatus.ctx.fillStyle = colorStr
              can.sourceStatus.ctx.fillRect(i, j, 1, 1)
            }
          }

        }


      });
  }
  if (sessionState.onCanvas == ON_CANVAS_STRING_COLOR) {
    axios.get(`${sessionState.serverAddr}:${port}/stringcolor`, params)
      .then(({ data }) => {
        var b64 = data["stringColor"];
        var decoded = atob(b64);
        lastStringColor = decoded
        let len = decoded.length;
        for (var i = 0; i < sessionState.sourceWidth; i++) {
          for (var j = 0; j < sessionState.sourceHeight; j++) {
            pos = sessionState.sourceHeight * i + j
            a = decoded.charCodeAt(pos);
            colorStr = 'rgb(' + a + ', ' + a + ', ' + a + ')';
            can.sourceStatus.ctx.fillStyle = colorStr
            can.sourceStatus.ctx.fillRect(i, j, 1, 1)
          }
        }

      });
  }


}




function GoToCanvas(type) {
  sessionState.onCanvas = type;
  const button = document.querySelector('#toggleControls .icon-button');
  const icon = button.querySelector('.material-icons');
  if(type==ON_CANVAS_IMG){
      icon.textContent = 'timeline';
  }
  if(type==ON_CANVAS_STRINGS){
    icon.textContent = 'image';
  }
}

function updateThumbnail(name, defaultColor, source, scale, binray) {

  let fullName = "thumbnail" + name;
  fillCanvas(fullName, defaultColor);
  can[fullName].ctx.drawImage(source, sessionState.recOffX * scale, sessionState.recOffY * scale,
    sessionState.recWidth * scale, sessionState.recHeight * scale, 0, 0, can[fullName].canvas.width, can[fullName].canvas.height);
  updateRaw(fullName, binray);

}
function updateThumbnailSource(){
  fillCanvas("thumbnailSource", "#FFFFFF");
  can.thumbnailSource.canvas.width = sessionState.sourceWidth;
  can.thumbnailSource.canvas.height = sessionState.sourceHeight;
  for (var i = 0; i < sessionState.sourceWidth; i++) {
    for (var j = 0; j < sessionState.sourceHeight; j++) {
      let {color,bgColor} = GetCalculatedColor(i,j);
      can.thumbnailSource.ctx.fillStyle = 'rgb(' + bgColor + ',' + bgColor + ',' + bgColor + ')';
      can.thumbnailSource.ctx.fillRect(i, j, 1, 1)
    }
  }
}

function updateThumbnails() {
  updateThumbnail("Main", "#FFFFFF", originalImg, IMG_TO_CANVAS_SCLAE, false);
  updateThumbnail("Weight", "#7F7F7F", can.weight.canvas, 1, false);
  updateThumbnail("Focus", "#FFFFFF", can.focus.canvas, 1, true);
  UpdatThumbnailMainRaw();
  UpdatThumbnailFocusRaw();
  updateThumbnailSource();
  if (serverConnected()) {
    updateSessionParams();
  }
  sessionState.weightImg = can.weight.canvas.toDataURL();
  sessionState.focusImg = can.focus.canvas.toDataURL();
  saveState();
}

function handleNewServerImg() {

  drawSrcImageOnCanvas(0, 0, 1 / IMG_TO_CANVAS_SCLAE, originalImg, can.original.canvas, can.original.ctx)
  updateThumbnails();
  saveState();


  can.original.ctx.save();
  can.original.ctx.strokeStyle = "red";
  can.original.ctx.beginPath();
  can.original.ctx.rect(sessionState.recOffX, sessionState.recOffY, sessionState.recWidth, sessionState.recHeight);
  can.original.ctx.stroke();
  can.original.ctx.restore();
  initOriginalSmall();
  if(runTimeState.state==States.ES && imageLoaded()){
    document.getElementById('startSession').style.display = '';
    document.getElementById('shapeControls').style.display = '';
  }
}

function fillCanvas(name, color) {
  can[name].ctx.fillStyle = color;
  can[name].ctx.fillRect(0, 0, can[name].canvas.width, can[name].canvas.height);
}
function initRec() {
  sessionState.recOffX = 0;
  sessionState.recOffY = 0;
  if (sessionState.sourceWidth / can.original.canvas.width > sessionState.sourceHeight / can.original.canvas.height) {
    sessionState.recWidth = can.original.canvas.width;
    sessionState.recHeight = sessionState.recWidth * sessionState.sourceHeight / sessionState.sourceWidth
  }
  else {
    sessionState.recHeight = can.original.canvas.height;
    sessionState.recWidth = sessionState.recHeight * sessionState.sourceWidth / sessionState.sourceHeight
  }
}





// Separate arrays for handling different behaviors
const divsToHide = ["signIn", "chooseProject", "createSession","container","editSession", 
  "original","controls","lockNkey","loadImgDiv","advanced","playStop","animation",
  "improvementsInfo","toggleControls","editPointsDiv","thumbnails"] ;

const divsToInvisible = [ "sessionCreated","stop"];
const divsToDisable = [ "signOut","home"];

const divsToHideDebug = [ 
  "original","lockNkey","advanced","animation",
  "improvementsInfo","editPointsDiv"] ;

const divsToInvisibleDebug = [ ];
const divsToDisableDebug = [ "signOut","home"];



let allowedDivs = {
  [States.NS] : ["signIn","animation","container"],
  [States.CP] : ["chooseProject","signOut"],
  [States.ES] : ["editSession","signOut","original","home","loadImgDiv","container","editPointsDiv"],
  [States.SC] : ["sessionCreated","signOut","container","improvementsInfo","original","playStop","controls","stop","home","toggleControls","thumbnails"],
  [States.PL] : ["sessionCreated","playStop","container","improvementsInfo","original","controls","toggleControls","thumbnails"],
  [States.ST] : ["sessionCreated","playStop","stop","signOut","container","improvementsInfo","original","controls","home","toggleControls","thumbnails"],
  [States.IN] : ["signOut","container","home","toggleControls"]
}


function hideDivsForState(currentState) {
  const allowed = allowedDivs[currentState] || [];

  // Utility function to process a list of divs
  function processDivs(divList, action) {
    divList.forEach(divId => {
      const div = document.getElementById(divId);
      if (div) {
        if (!allowed.includes(divId)) {
          action(div); // Apply the action if the div is not in allowed
        } else {
          resetDiv(div); // Reset the div if it is allowed
        }
      }
    });
  }

  // Actions for hide, invisible, and disable
  const hideAction = div => div.style.display = "none";
  const invisibleAction = div => div.style.visibility = "hidden";
  const disableAction = div => {
    div.style.pointerEvents = "none";
    div.style.opacity = "0.5";
    div.querySelectorAll("button, input, select, textarea").forEach(element => {
      element.disabled = true;
    });
  };

  // Reset function to revert properties
  function resetDiv(div) {
    div.style.display = "";
    div.style.visibility = "visible";
    div.style.pointerEvents = "auto";
    div.style.opacity = "1";
    div.querySelectorAll("button, input, select, textarea").forEach(element => {
      element.disabled = false;
    });
  }

  // Process each group of divs
  runTimeState.debugMode ? processDivs(divsToHideDebug, hideAction) : processDivs(divsToHide, hideAction);
  runTimeState.debugMode ? processDivs(divsToInvisibleDebug, invisibleAction) : processDivs(divsToInvisible, invisibleAction);
  runTimeState.debugMode ? processDivs(divsToDisableDebug, disableAction) : processDivs(divsToDisable, disableAction);
}

function noLines(){
  return !runTimeState.lines || runTimeState.lines == 0;
}

onStateChange((newState)=>{



  let stateChanged = runTimeState.state!=newState ;
  runTimeState.state = newState ;
  hideDivsForState(newState);

  // Hide Make It button if no lines are set
  const makeItButton = document.getElementById('makeIt');
  if (makeItButton) {
    if (noLines()) {
      makeItButton.style.display = 'none';
    } else {
      makeItButton.style.display = '';
    }
  } 

  if( runTimeState.state!=States.NS){
    if(noLines() && sessionState.pointsType!="P"){

        GoToCanvas(ON_CANVAS_IMG);
    
    }
    else{
      GoToCanvas(ON_CANVAS_STRINGS);
    }
  }
  
  if( runTimeState.state==States.ES && sessionState.pointsType=="P"){
    showEditPoints(); 
  } else{
    hideEditPoints();
  }


  if(stateChanged && newState==States.PL){
    document.getElementById('instructionAppLink').style.display = 'none';
    document.getElementById('instructionAppLink').innerHTML = '';
    document.getElementById('makeItButton').style.display = 'block';
    GoToCanvas(ON_CANVAS_STRINGS);
  }
  // Disable Continue button if no saved session exists or no image was loaded
  const continueButton = document.getElementById('continue');
  let lss = isLocalStorageStateValid();
  if(!lss ||!lss.originalImgSrc|| !lss.originalImgSrc.length){
    continueButton.disabled = true;
    continueButton.title = 'No temporary session available' ;
  }
  else{
    continueButton.disabled = false;
    continueButton.title = '' ;
  }


  if(stateChanged && newState==States.ES){
    OnZoomMove();
    GoToCanvas(ON_CANVAS_IMG);
    if(sessionState.pointsType=="C"){
      selectShape("circle");
    }
    else if(sessionState.pointsType=="R"){
      selectShape("rectangle");
    }
    else if(sessionState.pointsType=="P"){
      selectShape("polygon");
    }

    if(!imageLoaded()){
      document.getElementById('startSession').style.display = 'none';
      document.getElementById('shapeControls').style.display = 'none';
    }


  }
})

function main() {

  //  IMG_TO_CANVAS_SCLAE

  const fileInput = document.getElementById("loadImgFile");
  fileInput.addEventListener('input', handleImageFileSelect, false);
  const button = document.getElementById("triggerFileInput");
  button.addEventListener("click", () => {
    fileInput.click(); // Trigg
  });

  document.getElementById('loadSessionFile').addEventListener('input', LoadSession, false);
  document.getElementById("signOut").style.display = "none";
  document.getElementById('sessionFileName').addEventListener('input', adjustSessionFileNameWidth);
  updateOptionalValue("ip",sessionState.serverAddr);

  // Get device pixel ratio for proper canvas rendering
  const devicePixelRatio = window.devicePixelRatio || 1;
 




  RestartState();
  GoToCanvas(ON_CANVAS_STRINGS);
  startMainCanvas();

  window.getUser((user)=>{
    sessionState.user = user ;
    runTimeState.user = user ;
    if(user){
      clearTimeout(runTimeState.intervals.animationInterval) ;
      emitStateChange(States.CP) ;
    }
    else{
      emitStateChange(States.NS) ;
      runTimeState.intervals.animationInterval = setTimeout(Animate,100);
    }
  })
  emitStateChange(States.NS);
  runTimeState.intervals.animationInterval = setTimeout(Animate,1000);
}


function handleGifFileSelect(evt) {

  const fileList = this.files;
  var file = this.files[0];//e.originalEvent.srcElement.files[i];

  var reader = new FileReader();
  reader.onloadend = function () {
    document.getElementById("animatedGif").onload = function () {
      AnimateGifLoad();
    }
    document.getElementById("animatedGif").src = reader.result;
  }
  reader.readAsDataURL(file);

}

function handleImageFileSelect(evt) {
  const fileList = this.files;
  var file = this.files[0];

  // Update button text to show filename
  const button = document.getElementById("triggerFileInput");
  button.textContent = file.name;

  var reader = new FileReader();
  reader.onloadend = function () {
    originalImg.src = reader.result;
    sessionState.sessionFileName = getImageFileName();
    setSessionFileName();
      
    GoToCanvas(ON_CANVAS_STRINGS);
    
    // Clear the file input value so the same file can be selected again
    document.getElementById("loadImgFile").value = '';
  }
  reader.readAsDataURL(file);

  return true;
}

function SetAddr(add) {
  if (add === undefined) {
    sessionState.serverAddr = document.getElementById("ip").value;

  }
  else {
    document.getElementById("ip").value = add;
    sessionState.serverAddr

  }

  localStorage.serverAddr = sessionState.serverAddr;
}

function destroySession() {
  if (document.getElementById('stateId').value.length > 0) {
    axios.post(`${sessionState.serverAddr}:${port}/deInit`, {
      stateId: document.getElementById('stateId').value,
    }).then(function () {
      sessionState.stateID = "";
      document.getElementById('stateId').value = "";

    })
  }
}
function updateSessionParams(cb) {
  saveState();
  sessionState.thumbnailMainRaw = "";
  sessionState.thumbnailWeightRaw = "";
  sessionState.thumbnailFocusRaw = "";
  if (cb != undefined) {
    cb();
  }
}



function saveState() {
  //localStorage.clear();
  if(runTimeState.state!=States.NS){
    let tmp = arrayBufferToBase64(sessionState.snapshotBuffer) ; ;
    sessionState.snapshotB64 = tmp ;
    localStorage.sessionState = JSON.stringify(sessionState);
  }
}
function isLocalStorageStateValid() {
  let params = localStorage.sessionState != undefined ? JSON.parse(localStorage.sessionState) : undefined;
  if(params && params.pointsH != undefined && params.version == STRINGS_STATE_VERSION ){
    return params;
  }
  return false;
}
function LoadStateFromLocalStorage() {

  if (localStorage.sessionState != undefined) {
    let params = isLocalStorageStateValid();
    if (params) {
      handleNewState(params)
    }
  }


}
function initDots() {

  sessionState.pointsW = document.getElementById("pointsW").value;
  sessionState.pointsH = document.getElementById("pointsH").value;
  sessionState.pointsC = document.getElementById("pointsC").value;

  if (sessionState.pointsType=="C") {
    cx = 1 / 2
    cy = 1 / 2
    r = cy
    let pointsAr = []
    let move = Math.PI / sessionState.pointsC;
    for (i = 0; i < sessionState.pointsC; i++) {
      let deg = move * i * 2
      let x = cx + r * Math.cos(deg)
      let y = cy + r * Math.sin(deg)
      pointsAr[i] = [x.toFixed(4), y.toFixed(4), i]
    }
    sessionState.dots = pointsAr

    sessionState.sourceWidth = 128
    sessionState.sourceHeight = 128

  }
  else  if (sessionState.pointsType=="R")  {
    let pointsAr = []
    moveX = 1 / sessionState.pointsW
    moveY = 1 / sessionState.pointsH
    for (i = 0; i <= sessionState.pointsW; i++) {
      let x = i * moveX
      pointsAr.push([x.toFixed(4), 0, pointsAr.length])

    }

    for (i = 1; i < sessionState.pointsH; i++) {
      let y = i * moveY
      pointsAr.push([1, y.toFixed(4), pointsAr.length])

    }
    for (i = sessionState.pointsW; i >= 0; i--) {
      let x = i * moveX
      pointsAr.push([x.toFixed(4), 1, pointsAr.length])

    }
    for (i = sessionState.pointsH - 1; i >= 1; i--) {
      let y = i * moveY
      pointsAr.push([0, y.toFixed(4), pointsAr.length])

    }
    sessionState.dots = pointsAr
    height = Math.ceil(sessionState.pointsH * sessionState.sourceWidth / sessionState.pointsW)
    sessionState.sourceHeight = height

  }
  else if (sessionState.pointsType=="P" && runTimeState.onEditCustomPoints) {
    sessionState.sourceWidth = 128
    sessionState.sourceHeight = 128
    if (can.original && can.original.canvas) {
      let ratio = can.original.canvas.height / can.original.canvas.width;
      sessionState.sourceHeight = Math.ceil(sessionState.sourceWidth * ratio);
    }

    sessionState.dots = sessionState.customPoints ;
  }
  if (true) {
    initRelevantPixels()
  }

}
function getLineIndex(aI, bI) {
  let ret = aI < bI ? runTimeState.dotsToLine[aI + "_" + bI] : runTimeState.dotsToLine[bI + "_" + aI];
  return ret;
}

let rotate = 0
function initLines() {
  sessionState.serverSnapshot = "";
  sessionState.snapshotBuffer = undefined;
  let linesArr = []
  let dotsToLine = [];
  let dotsLineIndexes = [];
  for (var i = 0; i < sessionState.dots.length; i++) {
    for (var j = i + 1; j < sessionState.dots.length; j++) {
      X = (i + rotate) % sessionState.dots.length
      Y = (j + rotate) % sessionState.dots.length;
      dotsToLine[i + "_" + j] = (linesArr.length);
      let index = linesArr.length;
      if (dotsLineIndexes[i] == undefined) {
        dotsLineIndexes[i] = [];
      }
      if (dotsLineIndexes[j] == undefined) {
        dotsLineIndexes[j] = [];
      }
      dotsLineIndexes[i].push(index);
      dotsLineIndexes[j].push(j);

      let iD = i < sessionState.dots.length ? i : sessionState.dots.length - i;
      let jD = j < sessionState.dots.length ? j : sessionState.dots.length - j;
      if (iD > jD) {
        let tmp = jD;
        jD = iD;
        iD = tmp;
      }

      let distanceFromExis = iD + jD / 1000;
      linesArr.push({ dotA: sessionState.dots[X], dotB: sessionState.dots[Y], index: index, distanceFromExis: distanceFromExis });

    }
  }
  runTimeState.linesArr = linesArr;
  runTimeState.dotsToLine = dotsToLine;
  runTimeState.dotsLineIndexes = dotsLineIndexes;
}




function serverConnected() {
  return runTimeState.intervals.intervalUpdateBackend != 0;
}


function pauseSender() {
  if (runTimeState.intervals.intervalUpdateBackend != 0) {
    clearInterval(runTimeState.intervals.intervalUpdateBackend)
    runTimeState.intervals.intervalUpdateBackend = 0
  }

}



function getXY(e) {
  var mouseX, mouseY;

  if (e.offsetX) {
    mouseX = e.offsetX;
    mouseY = e.offsetY;
  }
  else if (e.layerX) {
    mouseX = e.layerX;
    mouseY = e.layerY;
  }
  return [mouseX, mouseY]
  /* do something with mouseX/mouseY */
}

function addCustomPoint(offsetX,offsetY){

  let x = offsetX / mainCanvas.width;
   let y = offsetY / mainCanvas.height;

  let bestIndex = sessionState.customPoints.length; // Default to appending
    let minDistance = Infinity;
    
    // Only check between points if we have at least 2 points

    if(runTimeState.onEditCustomPointsFirstTime){
      sessionState.customPoints.push([x,y,sessionState.customPoints.length]);
      handlePointsChange(false);
      return;
    }
    if (sessionState.customPoints.length >= 2) {
      for (let i = 0; i < sessionState.customPoints.length; i++) {
        // Get prev and next points (wrapping around for closed polygon)
        const prev = sessionState.customPoints[i];
        const next = sessionState.customPoints[(i + 1) % sessionState.customPoints.length];
        
        // Calculate distance if we insert between these points
        const d1 = Math.hypot(x - prev[0], y - prev[1]); // Distance to prev
        const d2 = Math.hypot(next[0] - x, next[1] - y); // Distance to next
        const totalDist = d1 + d2;
        
        if (totalDist < minDistance) {
          minDistance = totalDist;
          bestIndex = i + 1;
        }
      }
    }
    
    // Insert the new point at the optimal position
    sessionState.customPoints.splice(bestIndex, 0, [x, y, sessionState.customPoints.length]);

}



function processFocus(event,type){
  if(!runTimeState.mouseDown){
    return;
  }
  let mb = runTimeState.mouseButton;
  if(mb==-1){
    mb = event.button;
  }
  const scaled = getCanvasCoordinates(mainCanvas,event);
  let X = Math.floor(scaled.x / IMG_TO_CANVAS_SCLAE);
  let Y = Math.floor(scaled.y / IMG_TO_CANVAS_SCLAE);
  let R = Math.floor(sessionState.radius / IMG_TO_CANVAS_SCLAE);
  if (sessionState.onCanvas == ON_CANVAS_IMG || sessionState.onCanvas == ON_CANVAS_STRINGS || sessionState.onCanvas == ON_CANVAS_PIXEL_WEIGHT) {

    if (runTimeState.mouseDown) {
      //mouse is down
    
      if(runTimeState.imgManipulationMode == IMG_MANIPULATION_SELECT_PIXELS &&  mb!=-1)  {
        for (x = X - R; x < X + R; x++) {
          for (y = Y - R; y < Y + R; y++) {
            xD = (x - X) ** 2;
            yD = (y - Y) ** 2;
            if (xD + yD < R * R) {
              if (runTimeState.imgManipulationMode == IMG_MANIPULATION_SELECT_PIXELS) {
                can.focus.ctx.fillStyle = mb == 2 ? 'rgb(255,255,255)' : 'rgb(0,0,0)';
                can.focus.ctx.fillRect(xToOriginal(x), yToOriginal(y), pixelWidthToOriginal(), pixelWidthToOriginal())
              }
             
  
            }
  
          }
  
        }

      }


      let onCustomMove =  (runTimeState.onEditCustomPoints && runTimeState.customPointEditType === CustomPointEditTypes.MOVE) ;
    
      if(!onCustomMove && runTimeState.imgManipulationMode == IMG_MANIPULATION_ZOOM_MOVE && type=="move"){
        MoveSource(event.offsetX,event.offsetY);
      }

      updateNewThumbnails();
    }

  }



}

function getNearestCustomPoint(x, y) {   
  x = x / mainCanvas.width;
  y = y / mainCanvas.height;
  let minDistance = Infinity; 
  let minIndex = -1;
  for(let i = 0; i < sessionState.customPoints.length; i++) {
    const distance = Math.hypot(sessionState.customPoints[i][0] - x, sessionState.customPoints[i][1] - y);
    if(distance < minDistance) {
      minDistance = distance;
      minIndex = i;
    }
  }
  return minIndex;
}

function canvasMousedown(event) {

  runTimeState.mouseDown = true
  if(event.offsetX && event.offsetY){
    runTimeState.mouseDownX = event.offsetX
    runTimeState.mouseDownY = event.offsetY
    sessionState.recDownOffX = sessionState.recOffX;
    sessionState.recDownOffY = sessionState.recOffY;
  }
  if(runTimeState.onEditCustomPoints) {
    const {x, y} = getCanvasCoordinates(mainCanvas, event);
    
    switch(runTimeState.customPointEditType) {
      case CustomPointEditTypes.ADD:
        addCustomPoint(x, y);
        handlePointsChange(false);
        break;
      case CustomPointEditTypes.MOVE:
        runTimeState.cutomPointChosenIndex = getNearestCustomPoint(x, y);
        break;
      case CustomPointEditTypes.DELETE:
        runTimeState.cutomPointChosenIndex = getNearestCustomPoint(x, y);
        sessionState.customPoints.splice(runTimeState.cutomPointChosenIndex, 1);
        break;
    }
    
    
  } else {
    processFocus(event,"down");
  }
  
}

function fixRec() {
    // Check if any of the rec variables are NaN
    if (isNaN(sessionState.recOffX) || 
        isNaN(sessionState.recOffY) || 
        isNaN(sessionState.recWidth) || 
        isNaN(sessionState.recHeight)) {
        initRec();
        return;
    }

    if (sessionState.recOffX < 0) {
        sessionState.recOffX = 0;
    }
    if (sessionState.recOffX + sessionState.recWidth > can.original.canvas.width) {
        sessionState.recOffX = can.original.canvas.width - sessionState.recWidth;
    }

    if (sessionState.recOffY < 0) {
        sessionState.recOffY = 0;
    }
    if (sessionState.recOffY + sessionState.recHeight > can.original.canvas.height) {
        sessionState.recOffY = can.original.canvas.height - sessionState.recHeight;
    }
}

function MoveSource(offsetX,offsetY){
     const diffX = offsetX - runTimeState.mouseDownX;
      const diffY = offsetY - runTimeState.mouseDownY;
      let relativeMoveX = diffX / mainCanvas.width;
      let relativeMoveY = diffY / mainCanvas.height;
      let realDiffx = sessionState.recWidth * relativeMoveX;
      let realDiffy = sessionState.recHeight * relativeMoveY;
  
      sessionState.recOffX =sessionState.recDownOffX - realDiffx;
      sessionState.recOffY =sessionState.recDownOffY - realDiffy;
      fixRec();

      UpdateNewServerImg();

}


function canvasMouseup(event) {

  runTimeState.mouseDown = false;
  runTimeState.mouseButton = event.button;
  runTimeState.cutomPointChosenIndex = -1;
  if(event.offsetX && event.offsetY){
    runTimeState.mouseUpX = event.offsetX
    runTimeState.mouseUpY = event.offsetY


    let onCustomMove =  (runTimeState.onEditCustomPoints && runTimeState.customPointEditType === CustomPointEditTypes.MOVE) ;
    
    if (runTimeState.imgManipulationMode == IMG_MANIPULATION_PIXELS_WEIGHT) {
      UpdateNewServerImg();
    }
    else if (!onCustomMove && runTimeState.imgManipulationMode == IMG_MANIPULATION_ZOOM_MOVE) {
    
      MoveSource(runTimeState.mouseUpX,runTimeState.mouseUpY);
  
    }



  }
 




}
window.onmousedown = (event) => {

  runTimeState.mouseDown = true
  runTimeState.mouseButton = event.button
}

window.onmouseup = (event) => {
  event.preventDefault();
  runTimeState.mouseDown = false
  runTimeState.mouseButton = -1




}



function addCanvasElement(name, create) {

  let cElement = {};
  cElement.canvas = create ? document.createElement('canvas') : document.getElementById(name);
  cElement.ctx = cElement.canvas.getContext('2d');
  cElement.ctx.fillStyle = "#ffffffFF";
  can[name] = cElement;
}



function loader() {
  addCanvasElement("animation", true);
  addCanvasElement("thumbnailMain", false);
  addCanvasElement("thumbnailStrings", false);
  addCanvasElement("thumbnailWeight", false);
  addCanvasElement("thumbnailFocus", false);
  addCanvasElement("thumbnailSource", false);
  // Check if we're on localhost and show secret controls if we are
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const secretControls = document.getElementById('secretControls');
    if (secretControls) {
      secretControls.style.display = 'block';
    }
  }

  addCanvasElement("original", true);
  addCanvasElement("focus", false);
  addCanvasElement("weight", false);

  initRelevantPixels();
  initUploadButton();  // Initialize upload button text

  originalImg.onload = function () {
    if (!allowedDivs[States.ES].includes("editSession")) {
      allowedDivs[States.ES].push("editSession");
    }
    if(runTimeState.state==States.ES){
      emitStateChange(States.ES);
    }
    // Check if image size needs to be compressed
    const MAX_WIDTH = 1200;  // Maximum width for compressed image
    const MAX_FILE_SIZE = 500 * 1024; // 500KB max file size
    
    // Get file size from base64 string
    const base64Size = originalImg.src.length * 3/4; // Approximate size in bytes
    
    if (originalImg.width > MAX_WIDTH || base64Size > MAX_FILE_SIZE) {
      // Create temporary canvas for compression
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      
      // Calculate new dimensions maintaining aspect ratio
      let newWidth = originalImg.width;
      let newHeight = originalImg.height;
      
      if (originalImg.width > MAX_WIDTH) {
        newWidth = MAX_WIDTH;
        newHeight = (originalImg.height * MAX_WIDTH) / originalImg.width;
      }
      
      // Set canvas size and draw scaled image
      tempCanvas.width = newWidth;
      tempCanvas.height = newHeight;
      tempCtx.drawImage(originalImg, 0, 0, newWidth, newHeight);
      
      // Convert to compressed base64
      const quality = 0.7; // Adjust quality (0 to 1)
      originalImg.src = tempCanvas.toDataURL('image/jpeg', quality);
      
      // Clean up
      tempCanvas.remove();
      return; // Will trigger onload again with compressed image
    }

    

    let changed = sessionState.originalImgSrc != originalImg.src;
    sessionState.originalImgSrc = originalImg.src;
    
    can.weight.canvas.width = originalImg.width / IMG_TO_CANVAS_SCLAE;
    can.weight.canvas.height = originalImg.height / IMG_TO_CANVAS_SCLAE;
    fillCanvas("weight", "#7F7F7F");

    can.focus.canvas.width = originalImg.width / IMG_TO_CANVAS_SCLAE;
    can.focus.canvas.height = originalImg.height / IMG_TO_CANVAS_SCLAE;
    fillCanvas("focus", "#FFFFFF");
    let oldW = can.original.canvas.width;
    let oldH = can.original.canvas.height;
    
    can.original.canvas.width = originalImg.width / IMG_TO_CANVAS_SCLAE;
    can.original.canvas.height = originalImg.height / IMG_TO_CANVAS_SCLAE;
    if(changed && (can.original.canvas.width!=oldW || can.original.canvas.height!=oldH)){
      initRec();
    }
    else if (sessionState.recWidth == 1 || sessionState.recWidth == -1) {
      initRec();
    }
    fixRec();
    handleNewServerImg();
    if(runTimeState.state==States.SI){
      emitStateChange(States.ES);
    }
  }
  main()
}

function initUploadButton() {
  const button = document.getElementById("triggerFileInput");
  if (!sessionState.originalImgSrc) {
    button.textContent = "Upload Image";
  }
}

function Continue(){
  LoadStateFromLocalStorage()
  startSession();
}
function inputControler(name, unit, callback) {
  let input = document.getElementById(name + "-in")
  let label = document.getElementById(name + "-span")
  input.value = state[name]
  input.onmousemove = () => {
    old = sessionState[name]
    sessionState[name] = input.value
    label.innerHTML = `${input.value} ${unit}`
    if (old != sessionState[name] && callback)
      callback()
  }
}


function PlayStop(){
  const button = document.getElementById("playStop");
  const icon = button.querySelector('.material-icons');

  if(runTimeState.state==States.PL){
      Stop();
      icon.textContent = 'play_arrow';
      saveState();
  } else {
      Play();
      icon.textContent = 'stop';
  }
}

function Play() {
  updateThumbnails();
  GoToCanvas(ON_CANVAS_STRINGS);
  StartCapturing();
  const icon = document.getElementById("playStop").querySelector('.material-icons');
  icon.textContent = 'stop';
}

function Stop(cb) {
  pauseSender();
  PostWorkerMessage({cmd : "stopImprove" ,args : { }});
  emitStateChange(States.ST) ;  
}





function restartSession() {
  if (sessionState.stateId.length > 0) {
    Stop(() => {
      document.getElementById("playPauseToggleCheckBox").checked = false;
      RestartState();
      startSession();

    });
  }


}


function playPauseToggle(cb) {
  sessionState.stateId
  if (cb.checked) {
    if (sessionState.stateId.length == 0) {
      startSession();
      Play();
    }
    else {
      Play();
    }


  }
  else {
    Stop()
  }

}


function canvasToggle(img) {
  sessionState.onCanvas = img
  if (img == ON_CANVAS_IMG) {
    runTimeState.imgManipulationMode = IMG_MANIPULATION_SELECT_PIXELS
  }
  if (img == ON_CANVAS_PIXEL_WEIGHT) {
    runTimeState.imgManipulationMode = IMG_MANIPULATION_PIXELS_WEIGHT;
  }

}

function statusType(type) {
  sessionState.statusType = type
}




function updateBGStength(val) {

  sessionState.bgStrength = parseFloat(val)
  updateSessionParams();
}
function updatePixelWeight(val, bDone) {

  runTimeState.pixelWeightColor = parseInt(val);;
  s = runTimeState.pixelWeightColor.toString(16);
  str = "#" + s + s + s
  document.getElementById("pixelWeightColor").style.backgroundColor = str

  updateSessionParams()
  

}
function updateContrast(val, bDone) {

  document.getElementById("contrastRangeText").value = val;
  sessionState.contrast = val;
  PostWorkerMessage({cmd : "updateParam" ,args : {type: "double",name : "contrast", val : sessionState.contrast }});
  updateThumbnailSource();

}

function updateBrightness(val, bDone) {

  document.getElementById("brightnessRangeText").value = val;
  sessionState.brightness = val;
  PostWorkerMessage({cmd : "updateParam" ,args : {type: "double",name : "brightness", val : sessionState.brightness }});
  updateThumbnailSource();

}

function updateNormalize(val, bDone) {

  document.getElementById("normalizeRangeText").value = val;
  
  sessionState.normalize = val;
  PostWorkerMessage({cmd : "updateParam" ,args : {type: "double",name : "collision", val : sessionState.collision }});
  

}


function updateCollision(val, bDone) {

  document.getElementById("collisionRangeText").value = val;
  
  sessionState.collision = val;
  PostWorkerMessage({cmd : "updateParam" ,args : {type: "double",name : "collision", val : sessionState.collision }});
  

}
function updateDistanceViewFactor(val, bDone) {
  document.getElementById("distanceViewFactorText").value = val;
  
  sessionState.distanceViewFactor = val;
  PostWorkerMessage({cmd : "updateParam" ,args : {type: "double",name : "distanceViewFactor", val : sessionState.distanceViewFactor }});
  
}

function updateLineThickness(val, bDone) {

  document.getElementById("lineThicknessMulltiplyText").value = val;
  
  sessionState.lineThicknessMulltiply = val;
  PostWorkerMessage({cmd : "updateParam" ,args : {type: "double",name : "lineThicknessMulltiply", val : sessionState.lineThicknessMulltiply }});
  

}
function updateStringPixelRatio(val, bDone) {

  document.getElementById("stringPixelRatioText").value = val;
  
  sessionState.stringPixelRation = val;
  PostWorkerMessage({cmd : "updateParam" ,args : {type: "number",name : "stringPixelRatio", val : sessionState.stringPixelRation }});
  

}



function onBGColor(index) {
  sessionState.onBGColor = index
  document.getElementById("bgColorRange").value = sessionState.bgColors[index]
}

function updateBGColor(val) {

  s = parseInt(val).toString(16);
  str = "#" + s + s + s
  sessionState.bgColors[sessionState.onBGColor] = parseInt(val);
  document.getElementById("bgColor" + sessionState.onBGColor).style.backgroundColor = str
  updateSessionParams();

}

window.onload = loader;


function imageLoaded(){
  return sessionState.originalImgSrc != null && sessionState.originalImgSrc.length > 0;
}
//inputs 

function initOriginalSmall() {
  const originalTinyCanvas = document.getElementById("originalTiny");

  if (!imageLoaded()) {
   
    originalTinyCanvas.style.display = 'none';
  } else {
    // Hide the default icon and show the canvas
    originalTinyCanvas.style.display = 'inline';
    
    // Regular thumbnail logic for when image is loaded
    const originalSmallCanvas = document.getElementById("originalSmall");
  
    if (originalSmallCanvas && can.original.canvas) {
      const MAX_WIDTH = 200;
      const aspectRatio = can.original.canvas.height / can.original.canvas.width;
      const width = Math.min(MAX_WIDTH, can.original.canvas.width);
      const height = width * aspectRatio;
  
      originalSmallCanvas.width = width;
      originalSmallCanvas.height = height;
      const ctx = originalSmallCanvas.getContext("2d");
      ctx.drawImage(can.original.canvas, 0, 0, can.original.canvas.width, can.original.canvas.height, 0, 0, width, height);
    }
  
    if (originalTinyCanvas && can.original.canvas) {
      const TINY_HEIGHT = 150;
      const aspectRatio = can.original.canvas.width / can.original.canvas.height;
      const width = Math.round(TINY_HEIGHT * aspectRatio);
      
      originalTinyCanvas.width = width;
      originalTinyCanvas.height = TINY_HEIGHT;
      const ctx = originalTinyCanvas.getContext("2d");
      ctx.drawImage(can.original.canvas, 0, 0, can.original.canvas.width, can.original.canvas.height, 0, 0, width, TINY_HEIGHT);
    }
  }
}

function adjustSessionFileNameWidth() {
    const input = document.getElementById('sessionFileName');
    if (input) {
        // Create a temporary span to measure text width
        const tmp = document.createElement('span');
        tmp.style.visibility = 'hidden';
        tmp.style.position = 'absolute';
        tmp.style.whiteSpace = 'pre';
        tmp.style.font = window.getComputedStyle(input).font;
        tmp.textContent = input.value;
        document.body.appendChild(tmp);
        
        // Set input width to match text (plus some padding)
        const width = tmp.getBoundingClientRect().width;
        input.style.width = (width + 20) + 'px';
        
        document.body.removeChild(tmp);
    }
}

// Add event listener to adjust width when text changes

function updateCustomPointSpacing(value) {
  const spacing = parseFloat(value);
  if (!isNaN(spacing) && spacing >= 0.5 && spacing <= 3) {
    sessionState.customPointSpacingPercent = spacing; // Convert to percentage
    // Update both range and text inputs
    document.getElementById('polygonSpacing').value = spacing;
    document.getElementById('polygonSpacingText').value = spacing;
    
  }
}

function showEditPoints() {
  runTimeState.onEditCustomPoints = true;
    document.getElementById('editPointsDiv').style.display = 'block';
    document.getElementById('toggleControls').style.display = 'none';
}

function hideEditPoints() {
  runTimeState.onEditCustomPoints = false;
    document.getElementById('editPointsDiv').style.display = 'none';
    document.getElementById('toggleControls').style.display = 'block';
}

function toggleView() {
    const button = document.querySelector('#toggleControls .icon-button');
    const icon = button.querySelector('.material-icons');
    if (icon.textContent === 'image') {
        icon.textContent = 'timeline';
        GoToCanvas(ON_CANVAS_IMG);
        
    } else {
        icon.textContent = 'image';
        GoToCanvas(ON_CANVAS_STRINGS);
    }
}

function selectShape(shape) {
  // Remove selected class from all buttons
  document.querySelectorAll('.shape-button').forEach(btn => {
    btn.classList.remove('selected');
  });
  
  // Hide all shape inputs first
  document.querySelectorAll('.shape-input').forEach(input => {
    input.classList.remove('visible');
    if (input.classList.contains('polygon-input')) {
      input.style.display = 'none';
    }
  });
  
  // Add selected class to clicked button
  document.getElementById(shape + 'Button').classList.add('selected');
  
  // Show relevant inputs for the selected shape
  document.querySelectorAll('.' + shape + '-input').forEach(input => {
    input.classList.add('visible');
    if (input.classList.contains('polygon-input')) {
      input.style.display = 'flex';
    }
  });
  
  // Show/hide edit points div based on shape selection
  if (shape === 'polygon') {
    showEditPoints();
  } else {
    hideEditPoints();
  }
  
  // Update the shape type
  if (shape === 'circle') {
    if(runTimeState.onEditCustomPoints){
      applyCustomPoints();
    }
    sessionState.pointsType = "C";
  } else if (shape === 'rectangle') {
    if(runTimeState.onEditCustomPoints){
      applyCustomPoints();
    }
    sessionState.pointsType = "R";
  } else if (shape === 'polygon') {
    sessionState.pointsType = "P";
    onPointsCustom();
  }
  
  handlePointsChange(true);
}



function makeIt() {
    // Add the instructions to the database with a callback
    addInstructionsObToDB(sessionState, (result) => {
        const linkContainer = document.getElementById('instructionAppLink');
        linkContainer.style.display = 'block';
        document.getElementById('makeItButton').style.display = 'none';
        
        if (result.error) {
            linkContainer.innerHTML = `<p style="color: red;">${result.message}</p>`;
            return;
        }

        // Create and display the PWA link
        const link = document.createElement('a');
        link.href = result.url;
        link.target = '_blank';
        link.textContent = result.text;
        link.style.display = 'block';
        link.style.marginTop = '10px';
        link.style.color = '#ffffff';
        link.style.backgroundColor = '#ff0000';
        link.style.padding = '12px 20px';
        link.style.borderRadius = '5px';
        link.style.textDecoration = 'none';
        link.style.textAlign = 'center';
        link.style.fontWeight = 'bold';
        link.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        
        // Add installation instructions
        const instructions = document.createElement('p');
        instructions.style.marginTop = '10px';
        instructions.style.fontSize = '14px';
        instructions.style.color = '#666';
        instructions.innerHTML = result.tip;
        
        // Add URL display
        const urlDisplay = document.createElement('div');
        urlDisplay.style.marginTop = '5px';
        urlDisplay.style.fontSize = '12px';
        urlDisplay.style.color = '#666';
        urlDisplay.style.wordBreak = 'break-all';
        urlDisplay.textContent = link.href;
        
        linkContainer.innerHTML = '';
        linkContainer.appendChild(link);
        linkContainer.appendChild(instructions);
        linkContainer.appendChild(urlDisplay);
    });
}
window.makeIt = makeIt;

// Update UI functions to handle edit type selection
function setCustomPointEditType(type) {
    if (Object.values(CustomPointEditTypes).includes(type)) {
        runTimeState.customPointEditType = type;
        
        // Get the container and all edit buttons
        const container = document.querySelector('.edit-points-controls');
        const editButtons = document.querySelectorAll('.edit-point-mode');
        
        // Update UI to show active mode
        editButtons.forEach(btn => {
            // Skip the CLEAR button
            if (btn.getAttribute('data-mode') !== 'CLEAR') {
                btn.classList.remove('active');
                if (btn.getAttribute('data-mode') === type) {
                    btn.classList.add('active');
                }
            }
        });

        // Add has-active class to container when a mode is selected
        container.classList.add('has-active');
    }
}

// Placeholder functions for new edit types
function moveCustomPoint(x, y) {
  // TODO: Implement point moving logic
  console.log("moveCustomPoint", x, y);
}

function deleteCustomPoint(x, y) {
  // TODO: Implement point deletion logic 
  console.log("deleteCustomPoint", x, y);
}
function clearCustomPoints(){
  sessionState.customPoints = [];
  handlePointsChange(true);

}

function updateMinLength(val, bDone) {
  document.getElementById("minLengthText").value = val;
  sessionState.minLength = parseInt(val);
}