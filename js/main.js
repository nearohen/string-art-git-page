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
    keyConfirmed: false,
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
    vivid: 0,
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
    // ─── CMYK manual-mode state (additive, no effect when cmykMode=false) ───
    // cmykMode:        true → project is a 4-channel CMYK piece
    // activeChannel:   'K' | 'Y' | 'M' | 'C' | null — which one is loaded now
    // cmykChannels:    per-channel { src: <data-url>, dna: <b64> }
    // originalImgSrc is NOT touched — keeps the full color image.
    cmykMode: false,
    activeChannel: null,
    cmykChannels: {},
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

  // CMYK multi-slot: capture EVERY slot's live DNA (not just the active
  // one — all 4 channels can have been running independently). saveState()
  // also does this, but call it here too so the file we write uses
  // up-to-the-moment DNAs.
  captureLiveCmykDnasToSessionState();

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
    // CMYK mode: load the active channel's grayscale instead of the full
    // color image. originalImgSrc still holds the color version so we can
    // re-split if needed. Existing single-channel projects (cmykMode=false)
    // hit the original branch unchanged.
    let imgSrcForLoad = sessionState.originalImgSrc;
    if (sessionState.cmykMode && sessionState.activeChannel &&
        sessionState.cmykChannels &&
        sessionState.cmykChannels[sessionState.activeChannel] &&
        sessionState.cmykChannels[sessionState.activeChannel].src) {
      imgSrcForLoad = sessionState.cmykChannels[sessionState.activeChannel].src;
    }
    originalImg.src = imgSrcForLoad;//to trigger onLoad
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
  // Mirror any saved CMYK state into the UI: show the channel panel,
  // tick the checkbox, highlight active channel, enable preview button.
  // Without this, Continue() and LoadSession() both leave the CMYK UI
  // hidden even when the saved session has cmykMode=true.
  if (typeof syncCMYKUIFromState === 'function') {
    try { syncCMYKUIFromState(); }
    catch (e) { console.error('syncCMYKUIFromState in handleNewState failed:', e); }
  }
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
      // Tear down any slots left from a previous session — Load is a
      // hard reset. Then route to CMYK or single-channel init.
      if (typeof tearDownAllSlots === 'function') tearDownAllSlots();
      if (sessionState.cmykMode) {
        // initCMYKProject lazy-spawns the channel slots via setActiveChannel.
        initCMYKProject();
      } else {
        if (typeof recreateMainSlot === 'function') recreateMainSlot();
        startSession();
      }
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
  updateOptionalValue("vividRangeText",sessionState.vivid);
  updateOptionalValue("vividRange",sessionState.vivid);
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
  // Push m_srcBuff bytes to wasm. In single-channel mode UpdatThumbnailMainRaw
  // posts to the active 'main' slot with the bytes extracted from the
  // displayed canvas (which is the user's color image).
  // In CMYK mode each slot needs its OWN channel's bytes (extracted from
  // cmykChannels[ch].src with the shared crop applied) — we cannot reuse
  // thumbnailMainRaw because that was extracted from whatever originalImg
  // currently shows (= the active channel's grayscale only).
  if (sessionState.cmykMode) {
    pushSrcToAllCmykSlots();
  } else {
    UpdatThumbnailMainRaw();
  }
  UpdatThumbnailFocusRaw();
  updateThumbnailSource();
  if (serverConnected()) {
    updateSessionParams();
  }
  sessionState.weightImg = can.weight.canvas.toDataURL();
  sessionState.focusImg = can.focus.canvas.toDataURL();
  saveState();
}

// For each live CMYK slot, re-extract its channel grayscale bytes with the
// CURRENT crop (recOff/recWidth/recHeight) and push to that slot's wasm.
// Called from updateThumbnails() so any code path that re-derives thumbnails
// (zoom, pan, B/C tweak, etc.) automatically updates every channel.
// Independent of play state — shared-mem write hits m_srcBuff which the
// optimizer reads on every iteration regardless.
async function pushSrcToAllCmykSlots() {
  if (!sessionState.cmykMode || !sessionState.cmykChannels) return;
  if (typeof getSlotIds !== 'function') return;
  const ids = getSlotIds();
  for (const ch of ids) {
    if (!['K','Y','M','C'].includes(ch)) continue;
    const chData = sessionState.cmykChannels[ch];
    if (!chData || !chData.src) continue;
    try {
      const bytes = await extractThumbnailBytesForChannelSrc(chData.src);
      postToSlot(ch, { cmd: 'updateThumbnailMainRaw', args: { thumbnailMainRaw: bytes } });
    } catch (e) {
      console.error(`[CMYK-mode] pushSrcToAllCmykSlots: slot ${ch} failed`, e);
    }
  }
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

  // Keep play/stop icon in sync with the ACTIVE SLOT's play state — so
  // switching channels in CMYK mode immediately shows the right icon
  // for the channel you switched to, even if other channels are still
  // running in the background.
  const playStopBtn = document.getElementById("playStop");
  if(playStopBtn){
    const slot = (typeof getActiveSlot === 'function') ? getActiveSlot() : null;
    const slotId = slot ? slot.id : '(none)';
    const isPlaying = slot ? slot.playing : (newState == States.PL);
    const keyConfirmed = slot ? slot.keyConfirmed : runTimeState.keyConfirmed;
    const icon = playStopBtn.querySelector('.material-icons');
    if(icon){
      icon.textContent = isPlaying ? 'stop' : 'play_arrow' ;
    }
    const wasDisabled = playStopBtn.disabled;
    const nowDisabled = !keyConfirmed;
    playStopBtn.disabled = nowDisabled;
    playStopBtn.title = keyConfirmed ? '' : 'authorizing...' ;
    if (wasDisabled !== nowDisabled) {
      console.log(`[PlayBtn] disabled=${nowDisabled} (slot=${slotId}, slotKeyConfirmed=${slot ? slot.keyConfirmed : '?'}, runTimeState.keyConfirmed=${runTimeState.keyConfirmed})`);
    }
  }

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
  console.log('[UPLOAD] handleImageFileSelect — file=', file && file.name,
              'size=', file && file.size,
              'cmykMode=', sessionState.cmykMode,
              'activeChannel=', sessionState.activeChannel);

  // Update button text to show filename
  const button = document.getElementById("triggerFileInput");
  button.textContent = file.name;

  var reader = new FileReader();
  reader.onloadend = function () {
    console.log('[UPLOAD] FileReader done — data URL len=', reader.result.length,
                'prevOriginalImgSrc len=', (sessionState.originalImgSrc || '').length);
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



// Capture each CMYK slot's live snapshotBuffer into cmykChannels[ch].dna so
// the saved JSON has the actual current DNAs (not the stale ones from when
// the channel was last switched away from). Single-channel mode is a no-op.
function captureLiveCmykDnasToSessionState() {
  if (!sessionState.cmykMode || !sessionState.cmykChannels) return;
  if (typeof getSlot !== 'function') return;
  for (const ch of ['K','Y','M','C']) {
    const slot = getSlot(ch);
    if (!slot || !slot.snapshotBuffer) continue;
    if (!sessionState.cmykChannels[ch]) continue;
    try {
      sessionState.cmykChannels[ch].dna = arrayBufferToBase64(slot.snapshotBuffer);
    } catch (e) {
      console.warn(`[saveState] failed to capture live DNA for ${ch}:`, e);
    }
  }
}

function saveState() {
  //localStorage.clear();
  if(runTimeState.state!=States.NS){
    captureLiveCmykDnasToSessionState();
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

    // EARLY channel-switch detection — we need this BEFORE the size-
    // compression block below. If originalImg.src is one of our cached
    // CMYK channel grayscales (i.e. setActiveChannel just swapped the
    // display image), DO NOT auto-compress: re-encoding the grayscale
    // as JPEG (a) destroys per-channel fidelity and (b) the compressed
    // result wouldn't match any cmykChannels[ch].src, so the next
    // onload re-fires would mistake it for a new user upload, update
    // originalImgSrc with the compressed grayscale, and resplitCMYK
    // would derive 4 channels from a grayscale-treated-as-color source
    // (collapsing C=M=Y identical, breaking the whole CMYK pipeline).
    let _onloadIsChannelSwitch = false;
    if (sessionState.cmykMode && sessionState.cmykChannels) {
      for (const ch of ['K','Y','M','C']) {
        const cs = sessionState.cmykChannels[ch] && sessionState.cmykChannels[ch].src;
        if (cs && cs === originalImg.src) { _onloadIsChannelSwitch = true; break; }
      }
    }

    // Check if image size needs to be compressed
    const MAX_WIDTH = 1200;  // Maximum width for compressed image
    const MAX_FILE_SIZE = 500 * 1024; // 500KB max file size

    // Get file size from base64 string
    const base64Size = originalImg.src.length * 3/4; // Approximate size in bytes

    if (!_onloadIsChannelSwitch && (originalImg.width > MAX_WIDTH || base64Size > MAX_FILE_SIZE)) {
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

    

    // In CMYK mode, the `originalImg.src` we just loaded is one of two
    // kinds of thing:
    //   (a) a channel grayscale data URL we cached in cmykChannels[ch].src
    //       — this happens on channel-switch and on Load. Must NOT replace
    //       sessionState.originalImgSrc (which holds the color original)
    //       and must NOT trigger the "new image" code paths (crop reset,
    //       re-split).
    //   (b) anything else — a brand-new upload the user picked. MUST
    //       replace originalImgSrc AND trigger a re-split so the channels
    //       re-derive from the new color image.
    // Non-CMYK mode has no channel-grayscale concept, so it always treats
    // a different src as a new image.
    let isCmykChannelSwitch = false;
    let matchedChannel = null;
    if (sessionState.cmykMode && sessionState.cmykChannels) {
      for (const ch of ['K','Y','M','C']) {
        const cs = sessionState.cmykChannels[ch] && sessionState.cmykChannels[ch].src;
        if (cs && cs === originalImg.src) {
          isCmykChannelSwitch = true;
          matchedChannel = ch;
          break;
        }
      }
    }
    let changed = !isCmykChannelSwitch &&
                  sessionState.originalImgSrc != originalImg.src;
    console.log('[ONLOAD] cmykMode=', sessionState.cmykMode,
                'srcLen=', (originalImg.src || '').length,
                'originalImgSrcLen=', (sessionState.originalImgSrc || '').length,
                'isCmykChannelSwitch=', isCmykChannelSwitch,
                'matchedChannel=', matchedChannel,
                'changed=', changed);
    if (sessionState.cmykMode && sessionState.cmykChannels) {
      // Brief fingerprint of channel srcs so we can see when match logic gets confused
      const fp = ch => {
        const s = sessionState.cmykChannels[ch] && sessionState.cmykChannels[ch].src;
        return s ? (s.length + ':' + s.substring(s.length - 12)) : '(none)';
      };
      console.log('[ONLOAD] cached channel srcs len:tail —',
                  'K=', fp('K'), 'Y=', fp('Y'), 'M=', fp('M'), 'C=', fp('C'),
                  '| originalImg.src tail=', originalImg.src.substring(originalImg.src.length - 12));
    }
    if (!isCmykChannelSwitch) {
      sessionState.originalImgSrc = originalImg.src;
      console.log('[ONLOAD] updated sessionState.originalImgSrc → new len=', sessionState.originalImgSrc.length);
    } else {
      console.log('[ONLOAD] preserved sessionState.originalImgSrc (channel switch)');
    }
    // CMYK-mode new-image upload: cached channel grayscales are now stale.
    // Fire resplitCMYK() asynchronously so the onload chain can finish
    // its synchronous work first; resplitCMYK will reload the active
    // channel via setActiveChannel and trigger onload again — which will
    // then take the "channel switch" branch above and not loop.
    if (sessionState.cmykMode && !isCmykChannelSwitch) {
      console.log('[ONLOAD→CMYK] new image detected — calling resplitCMYK()');
      try {
        const p = resplitCMYK();
        if (p && typeof p.then === 'function') {
          p.then(()  => console.log('[ONLOAD→CMYK] resplitCMYK() resolved'))
           .catch(e => console.error('[ONLOAD→CMYK] resplitCMYK() rejected:', e));
        }
      }
      catch (e) { console.error('[ONLOAD→CMYK] resplitCMYK threw sync:', e); }
    }

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
  LoadStateFromLocalStorage();
  // Same teardown logic as LoadSession — Continue is a fresh start.
  if (typeof tearDownAllSlots === 'function') tearDownAllSlots();
  if (sessionState.cmykMode) {
    initCMYKProject();
  } else {
    if (typeof recreateMainSlot === 'function') recreateMainSlot();
    startSession();
  }
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
  // Per-slot play state: the button toggles the ACTIVE slot's play/stop.
  // In CMYK mode the inactive slots keep doing whatever they were doing.
  const slot = (typeof getActiveSlot === 'function') ? getActiveSlot() : null;
  const isPlaying = slot ? slot.playing : (runTimeState.state == States.PL);
  if (isPlaying) {
      Stop();
      saveState();
  } else {
      Play();
  }
}

function Play() {
  const slot = (typeof getActiveSlot === 'function') ? getActiveSlot() : null;
  if (!slot || !slot.keyConfirmed) {
    console.warn(`[Play] blocked — slot=${slot ? slot.id : '?'} keyConfirmed=${slot ? slot.keyConfirmed : '?'}`);
    return;
  }
  updateThumbnails();
  GoToCanvas(ON_CANVAS_STRINGS);
  StartCapturing();
}

function Stop(cb) {
  pauseSender();
  // Target the active slot only — other slots keep their own play state.
  if (typeof StopCapturing === 'function') {
    StopCapturing();
  } else {
    // Fallback for ordering edge cases at page load
    PostWorkerMessage({cmd : "stopImprove" ,args : { }});
  }
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
  // CMYK mode: each channel has its own contrast. Persist into the active
  // channel slot too, so saveSession() captures it and setActiveChannel()
  // restores it on switch.
  if (sessionState.cmykMode && sessionState.activeChannel &&
      sessionState.cmykChannels[sessionState.activeChannel]) {
    sessionState.cmykChannels[sessionState.activeChannel].contrast = val;
  }
  PostWorkerMessage({cmd : "updateParam" ,args : {type: "double",name : "contrast", val : sessionState.contrast }});
  updateThumbnailSource();

}

function updateBrightness(val, bDone) {

  document.getElementById("brightnessRangeText").value = val;
  sessionState.brightness = val;
  if (sessionState.cmykMode && sessionState.activeChannel &&
      sessionState.cmykChannels[sessionState.activeChannel]) {
    sessionState.cmykChannels[sessionState.activeChannel].brightness = val;
  }
  PostWorkerMessage({cmd : "updateParam" ,args : {type: "double",name : "brightness", val : sessionState.brightness }});
  updateThumbnailSource();

}

// Vivid is a saturation boost applied to the COLOR original BEFORE the
// CMYK split. Pushing the input image away from luma makes each channel
// more separated, so the per-channel string art looks punchier.
// In non-CMYK mode there's no color image to saturate — slider no-ops
// for now (single-channel tone-curve would be a separate feature).
function updateVivid(val, bDone) {

  document.getElementById("vividRangeText").value = val;
  sessionState.vivid = val;
  if (sessionState.cmykMode) {
    // Debounce re-split via the existing K-curve scheduler — same 250ms
    // window keeps drag-interactions smooth without re-splitting 60x/sec.
    scheduleCMYKResplit();
  }

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
    // CMYK projects fan out into 4 per-channel instruction records.
    if (sessionState.cmykMode) {
        return makeItCMYK();
    }
    // Single-channel path — existing behavior, unchanged.
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


// =============================================================================
// CMYK "Make it REAL" — 4 instruction records, one per channel, in winding
// order (K first because it's the opaque baseline, then Y, M, C translucent
// on top). Each record has its own DNA from cmykChannels[ch].dna and a title
// suffixed with the channel letter so the user can keep track.
// =============================================================================
async function makeItCMYK() {
    // 1) Capture the in-flight active channel's snapshot into cmykChannels
    //    so we don't push stale DNA. Same pattern saveSession() uses.
    if (sessionState.activeChannel &&
        sessionState.cmykChannels[sessionState.activeChannel] &&
        sessionState.snapshotBuffer && sessionState.snapshotBuffer.length > 0) {
        try {
            sessionState.cmykChannels[sessionState.activeChannel].dna =
                arrayBufferToBase64(sessionState.snapshotBuffer);
        } catch (e) {
            console.warn('[makeItCMYK] capture failed:', e);
        }
    }

    // 2) Warn-and-block if any channel has no DNA yet. Without this the
    //    user might think they got a complete CMYK set but missed a layer.
    const channelOrder = ['K', 'Y', 'M', 'C'];
    const empty = channelOrder.filter(ch => {
        const c = sessionState.cmykChannels[ch];
        return !c || !c.dna || c.dna.length === 0;
    });
    if (empty.length > 0) {
        const proceed = confirm(
            `These channels have no DNA yet:\n  ${empty.join(', ')}\n\n` +
            `Generate instructions only for the channels that ARE optimized? ` +
            `(Cancel to go back and optimize the missing ones first.)`
        );
        if (!proceed) return;
    }

    // 3) Render a stacked panel of placeholder rows, fill in URLs as each
    //    Firebase upload completes.
    const linkContainer = document.getElementById('instructionAppLink');
    linkContainer.style.display = 'block';
    document.getElementById('makeItButton').style.display = 'none';
    linkContainer.innerHTML = `
        <p style="margin: 4px 0; font-weight: bold;">CMYK instructions (wind in this order):</p>
        <div id="cmykInstructionRows"></div>
    `;
    const rowsDiv = document.getElementById('cmykInstructionRows');

    // 4) For each channel that DOES have DNA, push to Firebase via a
    //    sessionState shim so the existing addInstructionsObToDB code path
    //    is reused unchanged. Sequential so the UI fills predictably.
    const baseName = (sessionState.sessionFileName || 'project').replace(/\.[^.]+$/, '');
    const chColorBg = { K: '#000', Y: '#dc0', M: '#c0c', C: '#0cc' };
    const chColorFg = { K: '#fff', Y: '#000', M: '#fff', C: '#000' };

    for (const ch of channelOrder) {
        const c = sessionState.cmykChannels[ch];
        if (!c || !c.dna) continue;   // skip empty ones (already warned)

        const row = document.createElement('div');
        row.id = `cmykRow_${ch}`;
        row.style.cssText = 'display: flex; align-items: center; gap: 8px; margin: 4px 0; padding: 6px; background: #f2f2f2; border-radius: 4px;';
        row.innerHTML = `
            <div style="width:24px;height:24px;border-radius:50%;background:${chColorBg[ch]};color:${chColorFg[ch]};display:flex;align-items:center;justify-content:center;font-weight:bold;flex:0 0 auto;">${ch}</div>
            <div style="flex:1; font-size: 13px; color: #333;">${baseName}_${ch} — preparing…</div>
        `;
        rowsDiv.appendChild(row);

        // Shim a sessionState with this channel's DNA + a suffixed title.
        const stateForCh = Object.assign({}, sessionState, {
            snapshotB64: c.dna,
            sessionFileName: `${baseName}_${ch}.png`,
        });

        // Wrap callback-style addInstructionsObToDB into a Promise.
        await new Promise((resolve) => {
            addInstructionsObToDB(stateForCh, (result) => {
                if (result && result.error) {
                    row.querySelector('div:last-child').innerHTML =
                        `<span style="color:red;">${baseName}_${ch} — ${result.message || 'error'}</span>`;
                } else if (result && result.url) {
                    row.querySelector('div:last-child').innerHTML =
                        `<div style="font-weight:bold;">${baseName}_${ch}</div>
                         <a href="${result.url}" target="_blank" style="font-size:12px;color:#06c;word-break:break-all;">${result.text || 'Step by Step Instructions'}</a>`;
                }
                resolve();
            });
        });
    }
}
window.makeItCMYK = makeItCMYK;

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


// =============================================================================
// IN-PAGE CMYK SPLITTER + SEQUENTIAL RUNNER
// -----------------------------------------------------------------------------
// The user loads a color image normally, sets up dots / brightness / contrast,
// then clicks "Split & Run CMYK". This:
//   1. Decomposes the loaded color image into 4 channel grayscales (C/M/Y/K)
//      using the GCR slider.
//   2. For each channel in order K → Y → M → C:
//        a. Swaps in the channel grayscale as the source image
//        b. Restarts the wasm session with a clean DNA
//        c. Calls Play()
//        d. Waits for the plateau (improvements < 10 for 5 s straight)
//        e. Stops, saves the DNA as <basename>_<ch>.dna
//   3. Reports completion in the status line under the button.
//
// Order is K first because K is the most "shape-like" channel — easiest to
// eyeball-verify the pipeline is right before the colored layers run.
// =============================================================================

// Industry-style GCR curve, ported from CNCBrush PaletteManager.
// Slider semantics:
//   s = 0   → never use K (pure CMY)
//   s = 0.5 → industry medium GCR — K only in shadow/dark-neutral regions,
//             ramps in gradually, never fully replaces C/M/Y
//   s = 1   → aggressive K — replaces neutral as fast as possible
// This is dramatically better than the naive linear `K = gcr * neutral`
// because it preserves saturation in midtones (yellow petals stay yellow
// instead of getting K-muddied).
function _gcrParamsForSlider(s) {
  s = Math.max(0, Math.min(1, s));
  if (s <= 0.5) {
    const t = s / 0.5;
    return { blackStart: 1.0 - 0.75 * t, gcrAmount: 0.5 * t,         blackLimit: 0.95 * t };
  }
  const t = (s - 0.5) / 0.5;
  return { blackStart: 0.25 * (1 - t),   gcrAmount: 0.5 + 0.5 * t,   blackLimit: 0.95 + 0.05 * t };
}

// Per-pixel K blend factor: what FRACTION of the neutral component should
// move to K. Returns 0..1. Same math as CNCBrush's computeLocalKBlend.
function _localKBlend(s, destR, destG, destB) {
  const p = _gcrParamsForSlider(s);
  if (p.gcrAmount <= 0) return 0;
  const grayNorm = Math.min(255 - destR, 255 - destG, 255 - destB) / 255;
  if (grayNorm <= p.blackStart) return 0;
  const t = (grayNorm - p.blackStart) / (1 - p.blackStart);
  return Math.min(p.blackLimit, t * p.gcrAmount);
}

// Channel split using the industry GCR curve.
//   neutralAmount = 255 - max(R,G,B)           // common dark component
//   kBlend        = _localKBlend(s, R,G,B)     // per-pixel 0..1 (curve)
//   kDens         = kBlend * neutralAmount     // actual K ink density
//   srcBuff_K = 255 - kDens
//   srcBuff_C = R + kDens
//   srcBuff_M = G + kDens
//   srcBuff_Y = B + kDens
// srcBuff convention: 0 = full ink, 255 = blank.
function computeChannelDataUrl(colorImg, channel, gcr, vivid) {
  const w = colorImg.width;
  const h = colorImg.height;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  cx.drawImage(colorImg, 0, 0);
  const imgData = cx.getImageData(0, 0, w, h);
  const d = imgData.data;
  // Vivid 0..100 → luma-preserving saturation multiplier 1..3.
  // 0 = pass-through (neutral). Bigger pushes each pixel further from
  // its own luma; gray pixels stay gray; saturated colors get more
  // saturated → CMY channels separate more after the split below.
  const v01 = (parseFloat(vivid) || 0) / 100;
  const satFactor = 1 + 2 * v01;
  const doSat = satFactor !== 1;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i+1], b = d[i+2];
    if (doSat) {
      const lum = 0.299*r + 0.587*g + 0.114*b;
      r = Math.max(0, Math.min(255, lum + (r - lum) * satFactor));
      g = Math.max(0, Math.min(255, lum + (g - lum) * satFactor));
      b = Math.max(0, Math.min(255, lum + (b - lum) * satFactor));
    }
    const neutralAmount = 255 - Math.max(r, g, b);
    const kBlend = _localKBlend(gcr, r, g, b);
    const kDens = kBlend * neutralAmount;
    let v;
    if (channel === 'C')      v = r + kDens;
    else if (channel === 'M') v = g + kDens;
    else if (channel === 'Y') v = b + kDens;
    else                       v = 255 - kDens;   // K
    v = Math.max(0, Math.min(255, Math.round(v)));
    d[i] = v; d[i+1] = v; d[i+2] = v;
    // alpha (d[i+3]) untouched
  }
  cx.putImageData(imgData, 0, 0);
  return cv.toDataURL('image/png');
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('failed to load image from data URL'));
    img.src = dataUrl;
  });
}

// Set originalImg.src and resolve when the image AND main.js's existing onload
// chain (handleNewServerImg → updateThumbnails → worker thumbnail update) has
// had time to settle. We use addEventListener so we don't clobber the
// existing .onload assignment in loader().
function setOriginalImgAndWait(dataUrl, settleMs) {
  if (settleMs == null) settleMs = 600;
  return new Promise((resolve) => {
    const handler = () => {
      originalImg.removeEventListener('load', handler);
      setTimeout(resolve, settleMs);
    };
    originalImg.addEventListener('load', handler);
    originalImg.src = dataUrl;
  });
}

// Poll the #improvements input. Resolves when the value stays below
// `rateThreshold` for `windowMs` consecutive milliseconds, OR when `maxMs`
// elapses overall (whichever first). The first `graceMs` is ignored so we
// don't false-trigger before the worker has produced any snapshots.
// Module-level flag that the manual Skip button toggles. waitForPlateau
// resolves immediately when it sees this true, then runCMYK clears it
// before the next channel starts. Lets the user say "I'm satisfied with
// this channel, move on" without having to wait for natural plateau.
var _cmykSkipRequested = false;
function cmykSkipCurrent() {
  console.log('[CMYK] skip requested by user');
  _cmykSkipRequested = true;
}

// Cache of the last run's per-channel DNAs so the user can re-render the
// preview manually after the run ends, or after tweaking line thickness.
var _cmykLastDnaMap = null;
function cmykShowPreview() {
  // Two sources for DNAs, in priority order:
  //   1. _cmykLastDnaMap — set by the old "Split & Run CMYK" auto path.
  //   2. sessionState.cmykChannels[ch].dna — built up by manual-mode work.
  //      For manual mode we ALSO need to capture the currently-running
  //      channel's snapshotBuffer (it hasn't been persisted yet).
  let dnaMap = _cmykLastDnaMap;
  let source = 'auto-run cache';

  if (!dnaMap && sessionState.cmykMode && sessionState.cmykChannels) {
    dnaMap = {};
    // For each channel, prefer the LIVE per-slot snapshotBuffer (each
    // CMYK channel runs its own wasm session in its own worker, so we
    // have a live snapshot for every channel that's been activated at
    // least once). Fall back to the saved base64 .dna for channels
    // whose slot hasn't been spawned yet.
    for (const ch of ['K', 'Y', 'M', 'C']) {
      const slot = (typeof getSlot === 'function') ? getSlot(ch) : null;
      const live = slot && slot.snapshotBuffer;
      if (live && live.length > 0) {
        dnaMap[ch] = live.buffer && live.byteLength
          ? live.buffer.slice(live.byteOffset, live.byteOffset + live.byteLength)
          : new Uint8Array(live).slice().buffer;
        continue;
      }
      const saved = sessionState.cmykChannels[ch] && sessionState.cmykChannels[ch].dna;
      if (saved && saved.length > 0) {
        dnaMap[ch] = base64ToArrayBuffer(saved);
      }
    }
    source = 'CMYK-mode channels (per-slot live + saved fallback)';
  }

  if (!dnaMap || Object.keys(dnaMap).length === 0) {
    console.warn('[CMYK] no DNAs available to preview yet');
    const status = document.getElementById('cmykStatus');
    if (status) status.textContent =
      'No CMYK data yet — run Split & Run CMYK or use CMYK manual mode first.';
    return;
  }

  const chs = Object.keys(dnaMap);
  console.log(`[CMYK] preview from ${source} (${chs.length} channels: ${chs.join(',')})`);
  try {
    renderCMYKPreview(dnaMap);
    const status = document.getElementById('cmykStatus');
    if (status) status.textContent =
      `Preview rendered from ${chs.length} channel(s) [${chs.join(',')}].`;
  } catch (e) {
    console.error('[CMYK] preview failed:', e);
  }
}

function waitForPlateau(opts) {
  const rateThreshold = opts.rateThreshold || 10;
  const windowMs      = opts.windowMs      || 5000;
  const graceMs       = opts.graceMs       || 3000;
  const maxMs         = opts.maxMs         || 600000;
  const statusEl      = opts.statusEl      || null;

  return new Promise((resolve) => {
    const startedAt = Date.now();
    let lowSince = 0;
    const id = setInterval(() => {
      // Manual skip overrides everything else.
      if (_cmykSkipRequested) {
        clearInterval(id);
        resolve({ reason: 'user-skipped', elapsed: Date.now() - startedAt });
        return;
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed > maxMs) {
        clearInterval(id);
        resolve({ reason: 'max-cap', elapsed });
        return;
      }
      if (elapsed < graceMs) return;

      const el = document.getElementById('improvements');
      const imp = el ? parseInt(el.value || '0', 10) : 0;

      if (imp < rateThreshold) {
        if (lowSince === 0) lowSince = Date.now();
        const lowFor = Date.now() - lowSince;
        if (statusEl) {
          statusEl.textContent =
            `running... imp=${imp}, low ${(lowFor/1000).toFixed(1)}s/${(windowMs/1000)}s (Skip to advance)`;
        }
        if (lowFor >= windowMs) {
          clearInterval(id);
          resolve({ reason: 'plateau', elapsed });
        }
      } else {
        lowSince = 0;
        if (statusEl) statusEl.textContent = `running... imp=${imp} (Skip to advance)`;
      }
    }, 200);
  });
}

function saveBinaryDna(filename) {
  const buf = sessionState && sessionState.snapshotBuffer;
  if (!buf || buf.length === 0) {
    console.warn('[CMYK] no snapshotBuffer to save for', filename);
    return false;
  }
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Render one DNA's lines on an existing context with a given stroke style.
// Mirrors draw.js's DrawLines but is parameterized on color and alpha so we
// can layer 4 channels with multiply blending.
function drawDnaWithColor(ctx, canvas, snapshotBuffer, strokeStyle, lineWidth) {
  if (!snapshotBuffer || !runTimeState || !runTimeState.linesArr) return 0;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  const decoded = new Uint8Array(snapshotBuffer);
  let lineIndex = 0;
  let count = 0;
  for (let i = 0; i < decoded.byteLength; i++) {
    let byte = decoded[i];
    for (let bit = 0; bit < 8; bit++) {
      if (byte & 1) {
        if (lineIndex < runTimeState.linesArr.length) {
          const line = runTimeState.linesArr[lineIndex];
          const x1 = line.dotA[0] * canvas.width;
          const y1 = line.dotA[1] * canvas.height;
          const x2 = line.dotB[0] * canvas.width;
          const y2 = line.dotB[1] * canvas.height;
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          count++;
        }
      }
      byte = byte >> 1;
      lineIndex++;
    }
  }
  ctx.stroke();
  return count;
}

// Render 5 previews:
//   - thumbK / thumbY / thumbM / thumbC: one canvas per channel, each drawn
//     in that channel's dye TRANSMISSION color on white. No blending — these
//     are "what does just this layer look like alone" views.
//   - thumbMix: all 4 layered with canvas 'multiply' blend = correct
//     subtractive composite (yellow × magenta = red, etc).
//
// Line width uses the SAME formula as draw.js's DrawLines:
//     lineWidth = lineThicknessMulltiply * canvasPixelScale / stringPixelRatio
// where canvasPixelScale = canvas.width / sourceWidth. We render at high
// internal resolution so the resulting sub-source-pixel widths become
// visible in actual pixels (CSS scales the canvas down to fit the panel).
//
// dnaMap: { K: ArrayBuffer, Y, M, C }
function renderCMYKPreview(dnaMap) {
  const block = document.getElementById('cmykPreviewBlock');
  if (!block) return;

  // Render at NATIVE source dimensions — same as the existing
  // thumbnailMain / thumbnailStrings / originalSmall canvases. CSS scales
  // the small canvas UP to display size, which the browser does smoothly.
  // Earlier I rendered at 24× source then CSS-downsampled by ~15× — that
  // downsampling is what produced the grainy/moiré look.
  const sw = sessionState.sourceWidth;
  const sh = sessionState.sourceHeight;
  const renderW = sw;
  const renderH = sh;

  // Same line-width formula draw.js uses, with canvasPixelScale = 1
  // (canvas dim equals source dim). Sub-pixel widths are fine — browser
  // anti-aliases each line, and over many overlapping strings the
  // accumulated darkness produces the right tone density just like the
  // existing thumbnail does.
  const stringPxRatio = parseInt(sessionState.stringPixelRation, 10) || 32;
  const lineThickMult = parseFloat(sessionState.lineThicknessMulltiply) || 1;
  const stringPx = lineThickMult / stringPxRatio;

  console.log('[CMYK preview] stringPx=', stringPx.toFixed(3),
              ' canvas=', renderW, 'x', renderH,
              ' lineThickMult=', lineThickMult,
              ' stringPxRatio=', stringPxRatio);

  // Each dye's TRANSMISSION color (what light gets through), drawn on a
  // white paper background. These are the colors used for both the
  // single-channel thumbs and the multiply composite.
  const channelColors = {
    K: 'rgba(0,   0,   0,   1)',
    Y: 'rgba(255, 255, 0,   1)',
    M: 'rgba(255, 0,   255, 1)',
    C: 'rgba(0,   255, 255, 1)',
  };

  // The `willReadFrequently: true` context option flips the canvas to a
  // SOFTWARE-rendered backend (instead of GPU). Despite its read-data-y
  // name, the side effect is that blend modes (especially 'multiply') and
  // sub-pixel anti-aliasing render deterministically and crisply rather
  // than producing the grainy/mottled GPU output. The main canvas already
  // uses this — see main.js:353. We use it on every preview canvas too.
  const CTX_OPTS = { willReadFrequently: true };

  // -- Per-channel single-color previews ------------------------------------
  for (const ch of ['K', 'Y', 'M', 'C']) {
    const canvas = document.getElementById('thumb' + ch);
    if (!canvas) continue;
    canvas.width  = renderW;
    canvas.height = renderH;
    canvas.style.height = 'auto';
    const ctx = canvas.getContext('2d', CTX_OPTS);

    // White paper.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, renderW, renderH);

    const dna = dnaMap[ch];
    if (dna) {
      ctx.lineCap = 'butt';
      ctx.imageSmoothingEnabled = false;
      drawDnaWithColor(ctx, canvas, dna, channelColors[ch], stringPx);
    }
  }

  // -- Composite via multiply blend ----------------------------------------
  // Important: don't re-rasterize the lines into the mix canvas. When two
  // channels' anti-aliased lines land on slightly different sub-pixel
  // positions, multiplying those AA edges directly produces noise/speckle
  // in the composite. Instead, multiply the four ALREADY-DRAWN per-channel
  // canvases via drawImage — each one is clean by itself, and drawImage
  // with multiply blend gives a deterministic per-pixel result.
  const mix = document.getElementById('thumbMix');
  if (mix) {
    mix.width  = renderW;
    mix.height = renderH;
    mix.style.height = 'auto';
    const ctx = mix.getContext('2d', CTX_OPTS);

    // White paper.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, renderW, renderH);

    // Multiply each finished channel canvas onto the white. Same math as
    // re-rasterizing but operates on solid pixel values, not on per-line
    // AA gradients — no edge speckle.
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = false;
    for (const ch of ['K', 'Y', 'M', 'C']) {
      const chCanvas = document.getElementById('thumb' + ch);
      if (chCanvas && dnaMap[ch]) {
        ctx.drawImage(chCanvas, 0, 0);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  block.style.display = 'block';
}

// Entry point — wired to the "Split & Run CMYK" button in index.html.
async function runCMYK() {
  const status = document.getElementById('cmykStatus');
  const btn = document.getElementById('cmykRunBtn');
  if (!status || !btn) return;

  if (!sessionState.originalImgSrc || sessionState.originalImgSrc.length < 16) {
    status.textContent = 'Load an image first.';
    return;
  }

  // KEEP acceptFirstFire=true for sequential CMYK. Two reasons:
  //   1. Wasm RNG sometimes repeats the lock across consecutive sessions.
  //      In that case the cloud function has nothing to recompute, the
  //      listener only fires ONCE with the (still-valid) cached key, and
  //      skip-stale would discard it → infinite wait.
  //   2. For the "different lock" case the first fire is stale, but Play()
  //      will be rejected → wasmGlue.keyRejected runs → updateDB called
  //      again → by then the cloud function has caught up and the next
  //      first-fire is the right value. So we lose ONE rejection round
  //      vs. skip-stale, but never get permanently stuck.
  window.__AUTO_MODE_ACCEPT_FIRST_FIRE__ = true;
  console.log('[CMYK] enabling first-fire-accept (handles RNG-repeat lock)');

  // Capture the COLOR original BEFORE we start swapping in channel grayscales.
  // (sessionState.originalImgSrc gets overwritten on every originalImg.onload.)
  const colorDataUrl = sessionState.originalImgSrc;

  const gcr = (parseInt(document.getElementById('cmykGCR').value, 10) || 0) / 100;
  let baseName = (sessionState.sessionFileName || 'session').replace(/\.[^.]+$/, '');

  btn.disabled = true;
  // Enable the manual skip button while a run is in progress.
  const skipBtn = document.getElementById('cmykSkipBtn');
  if (skipBtn) skipBtn.disabled = false;
  status.textContent = 'Decoding color image...';

  let colorImg;
  try {
    colorImg = await loadImageFromDataUrl(colorDataUrl);
  } catch (e) {
    status.textContent = 'Failed to decode source image.';
    btn.disabled = false;
    return;
  }

  console.log(`[CMYK] starting — base="${baseName}", gcr=${gcr.toFixed(2)}, ` +
              `original=${colorImg.width}x${colorImg.height}`);

  // Hide any previous preview while we run.
  const previewBlock = document.getElementById('cmykPreviewBlock');
  if (previewBlock) previewBlock.style.display = 'none';

  const channels = ['K', 'Y', 'M', 'C'];
  const dnaMap = {};   // capture each channel's final DNA for the composite preview

  try {
    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      // Reset the per-channel skip flag — clicking Skip during channel N
      // shouldn't auto-skip channel N+1.
      _cmykSkipRequested = false;
      status.textContent = `[${i+1}/${channels.length}] ${ch}: preparing...`;
      console.log(`[CMYK] === channel ${ch} (${i+1}/${channels.length}) ===`);

      // Make sure any in-flight session is stopped before swapping image.
      try { Stop(); } catch(e) {}
      await _sleep(300);

      const channelUrl = computeChannelDataUrl(colorImg, ch, gcr, sessionState.vivid);

      status.textContent = `[${i+1}/${channels.length}] ${ch}: loading channel image...`;
      await setOriginalImgAndWait(channelUrl);

      // Fresh wasm session: new srcBuff (the channel grayscale we just loaded
      // via originalImg.onload → updateThumbnails) AND a clean DNA.
      // CRITICAL: clear snapshotB64 so startSession doesn't pass the previous
      // channel's solved DNA to wasm as serverSnapshot. Without this, e.g.
      // M starts warm-loaded with Y's strings and spends most of its run
      // budget undoing them — saw a 170s "Y" run that was really fighting K's
      // pre-seeded lines.
      sessionState.snapshotB64 = '';
      sessionState.snapshotBuffer = null;
      runTimeState.keyConfirmed = false;   // force a re-handshake
      try { startSession(); } catch(e) { console.error(e); }
      await _sleep(700);

      // Wait for the cloud function to compute and push back the key
      // matching THIS session's lock. Firebase's first-fire might be a
      // stale key from a previous session; we wait long enough that the
      // wasm-rejection → re-auth → new-key cycle can complete.
      status.textContent = `[${i+1}/${channels.length}] ${ch}: waiting for key...`;
      const keyDeadline = Date.now() + 90000;   // 90s
      let lastReport = 0;
      while (!runTimeState.keyConfirmed && Date.now() < keyDeadline) {
        await _sleep(300);
        const elapsed = Date.now() - keyDeadline + 90000;
        if (elapsed - lastReport > 5000) {
          lastReport = elapsed;
          status.textContent = `[${i+1}/${channels.length}] ${ch}: waiting for key (${(elapsed/1000).toFixed(0)}s)...`;
        }
      }
      if (!runTimeState.keyConfirmed) {
        console.error('[CMYK] key never confirmed for channel', ch, '— skipping');
        status.textContent = `[${i+1}/${channels.length}] ${ch}: AUTH TIMEOUT — skipping`;
        continue;
      }

      status.textContent = `[${i+1}/${channels.length}] ${ch}: starting...`;
      // Pre-Play snapshot reference so we can detect "worker is silent".
      let snapBefore = sessionState.snapshotBuffer;
      try { Play(); } catch(e) { console.error('[CMYK] Play() threw:', e); }

      // Robust retry: don't trust any counter — just observe whether the
      // worker is actually producing snapshots. If snapshotBuffer didn't
      // change after a few seconds, Play() didn't take effect (key was
      // stale or worker was stopped). Wait for keyConfirmed and re-Play.
      for (let retryN = 0; retryN < 6; retryN++) {
        await _sleep(2500);
        // Has snapshotBuffer been updated by the worker since Play?
        const moving = sessionState.snapshotBuffer &&
                       sessionState.snapshotBuffer !== snapBefore;
        if (moving) {
          // Worker is producing snapshots — Play is genuinely running.
          if (retryN > 0) {
            console.log(`[CMYK] ${ch}: Play() took effect on retry ${retryN}`);
          }
          break;
        }
        // Worker silent. Wait briefly for keyConfirmed in case re-auth is
        // still in flight, then call Play() again.
        console.warn(`[CMYK] ${ch}: worker silent — re-Play attempt ${retryN+1}`);
        status.textContent = `[${i+1}/${channels.length}] ${ch}: retry ${retryN+1}...`;
        const wDeadline = Date.now() + 15000;
        while (!runTimeState.keyConfirmed && Date.now() < wDeadline) {
          await _sleep(300);
        }
        if (!runTimeState.keyConfirmed) {
          console.error(`[CMYK] ${ch}: keyConfirmed never came back`);
          continue;     // try once more — maybe firebase is just slow
        }
        snapBefore = sessionState.snapshotBuffer;
        try { Play(); } catch(e) { console.error('[CMYK] retry Play() threw:', e); }
      }

      const result = await waitForPlateau({
        rateThreshold: 20,        // debug-fast: <20 improvements/snapshot is "done"
        windowMs: 3000,           // sustained 3 s
        graceMs: 3000,
        maxMs: 600000,
        statusEl: status,
      });

      try { Stop(); } catch(e) {}
      await _sleep(900);   // let final snapshot flow back

      // Capture this channel's final DNA before the next iteration overwrites
      // sessionState.snapshotBuffer. .slice() on an Int8Array makes a copy.
      const buf = sessionState.snapshotBuffer;
      if (buf && buf.length > 0) {
        dnaMap[ch] = (buf.buffer && buf.byteLength)
          ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
          : new Uint8Array(buf).slice().buffer;
        // Quick sanity check — count set bits so we can spot empty/partial
        // captures from the console.
        const arr = new Uint8Array(dnaMap[ch]);
        let bits = 0;
        for (let b = 0; b < arr.length; b++) {
          let v = arr[b];
          while (v) { bits += v & 1; v >>= 1; }
        }
        console.log(`[CMYK] ${ch}: captured DNA, ${bits} lines on (${arr.length} bytes)`);
        if (bits < 50) {
          console.warn(`[CMYK] ${ch}: only ${bits} lines! channel probably did not run — ` +
                       `check for "key rejected" or "re-auth timed out" above`);
        }
      } else {
        console.error(`[CMYK] ${ch}: NO snapshot at all — channel did not run`);
      }

      const fname = `${baseName}_${ch}.dna`;
      const saved = saveBinaryDna(fname);
      console.log(`[CMYK] channel ${ch} done (${result.reason}, ${(result.elapsed/1000).toFixed(1)}s) — ` +
                  (saved ? `saved ${fname}` : 'NO DNA TO SAVE'));
      status.textContent = `[${i+1}/${channels.length}] ${ch}: ${result.reason}, saved ${fname}`;
      await _sleep(700);   // give browser time to actually trigger download
    }

    // Cache the DNAs so the manual "Show CMYK Preview" button can re-render
    // them later (after tweaking thickness, fixing a render bug, etc.) even
    // though the run is over.
    _cmykLastDnaMap = dnaMap;
    const previewBtn = document.getElementById('cmykPreviewBtn');
    if (previewBtn) previewBtn.disabled = false;

    status.textContent = '✓ All 4 channels saved. Rendering preview...';
    console.log('[CMYK] all channels done — rendering composite preview.');
    try {
      renderCMYKPreview(dnaMap);
      status.textContent = '✓ All 4 channels saved. Composite preview below.';
    } catch (e) {
      console.error('[CMYK] preview render failed:', e);
      status.textContent = '✓ Channels saved. Auto-preview failed — click "Show CMYK Preview" to retry. (' + e.message + ')';
    }
  } catch (err) {
    console.error('[CMYK] fatal:', err);
    status.textContent = 'Error: ' + err.message;
  } finally {
    btn.disabled = false;
    if (skipBtn) skipBtn.disabled = true;
    _cmykSkipRequested = false;
  }
}

// =============================================================================
// CMYK MANUAL-MODE PROJECT FLOW
// -----------------------------------------------------------------------------
// User flow (no auto-download, no scripts, just buttons):
//   1. Upload a color image, set crop / brightness / contrast normally.
//   2. Tick the "CMYK mode" checkbox.
//      → On tick, originalImg gets split into 4 channel grayscales (using
//        the GCR slider), stored in sessionState.cmykChannels.
//      → activeChannel becomes 'K', the K grayscale is swapped into
//        originalImg, and the page's normal updateThumbnails() chain
//        re-derives thumbnailMainRaw from the K grayscale.
//   3. Click any of the K/Y/M/C buttons to switch the active channel.
//      → Current snapshotB64 is captured into the previous channel's dna.
//      → The new channel's src is loaded into originalImg.
//      → snapshotB64 is restored from the new channel's saved dna.
//      → startSession() reinits wasm with the new srcBuff and DNA.
//   4. Click Play / Stop / Save normally — the existing buttons all
//      operate on whatever is currently active.
//   5. Save persists everything via JSON.stringify(sessionState). Load
//      restores via the existing handleNewState path. Round-trips clean.
// =============================================================================

// Click handler for the "Create Project" button. Inspects the CMYK
// checkbox in the Select Shape panel:
//   - unticked → existing single-channel behavior: call startSession()
//   - ticked   → initCMYKProject() which splits + activates K, which
//                internally calls startSession() with the K source loaded
function createProject() {
  const cb = document.getElementById('cmykModeToggle');
  if (cb && cb.checked) {
    console.log('[Create Project] CMYK ticked → initCMYKProject()');
    initCMYKProject();
  } else {
    // Existing single-channel path. Tear down any leftover slots from a
    // previous CMYK session and create a fresh 'main' slot for this one.
    sessionState.cmykMode = false;
    if (typeof tearDownAllSlots === 'function') tearDownAllSlots();
    if (typeof recreateMainSlot === 'function') recreateMainSlot();
    startSession();
  }
}

// Called from createProject() whenever the user clicks "Create Project"
// with the CMYK checkbox ticked. Splits the loaded color image into 4
// channel grayscales and loads K. If the project already has channels
// (loaded from a saved session), just reveals the channel-switcher UI
// without re-splitting (so per-channel DNAs survive).
async function initCMYKProject() {
  const channelPanel = document.getElementById('cmykChannelPanel');
  const labelDiv     = document.getElementById('cmykActiveChannelLabel');

  // Need a loaded color source.
  if (!sessionState.originalImgSrc || sessionState.originalImgSrc.length < 16) {
    alert('Load a color image before creating a CMYK project.');
    return false;
  }

  sessionState.cmykMode = true;
  if (channelPanel) channelPanel.style.display = 'block';
  // Enable the manual preview button so the user can render any time.
  const previewBtn = document.getElementById('cmykPreviewBtn');
  if (previewBtn) previewBtn.disabled = false;

  // Tear down the default single-channel 'main' slot. CMYK mode spawns
  // up to 4 dedicated channel slots lazily — main is dead weight here.
  if (typeof getSlot === 'function' && getSlot('main')) {
    console.log('[CMYK-mode] entering CMYK — destroying default main slot');
    try { destroyChannelSlot('main'); } catch(e) { console.warn('destroy main threw:', e); }
  }

  // Only split if we don't already have channels (e.g. loading saved
  // session). Preserves per-channel DNAs across reloads.
  const haveChannels = sessionState.cmykChannels &&
                       sessionState.cmykChannels.K &&
                       sessionState.cmykChannels.K.src;
  if (!haveChannels) {
    if (labelDiv) labelDiv.textContent = 'Splitting color image into channels…';
    const colorImg = await loadImageFromDataUrl(sessionState.originalImgSrc);
    const gcr = (parseInt(document.getElementById('cmykGCR').value, 10) || 0) / 100;
    // Snapshot the user's current brightness/contrast — each channel starts
    // from this baseline and can be tuned independently later.
    const seedB = parseFloat(sessionState.brightness) || 50;
    const seedC = parseFloat(sessionState.contrast)   || 50;
    sessionState.cmykChannels = {};
    for (const ch of ['K', 'Y', 'M', 'C']) {
      sessionState.cmykChannels[ch] = {
        src:        computeChannelDataUrl(colorImg, ch, gcr, sessionState.vivid),
        dna:        '',
        brightness: seedB,
        contrast:   seedC,
      };
    }
    console.log(`[CMYK-mode] split done — gcr=${gcr.toFixed(2)}, ` +
                `image=${colorImg.width}x${colorImg.height}, b/c seed=${seedB}/${seedC}`);
  } else {
    console.log('[CMYK-mode] channels already present, reusing');
  }

  // Default to K. setActiveChannel handles loading the src + restarting.
  await setActiveChannel(sessionState.activeChannel || 'K');
  return true;
}

// Debounced re-split trigger from the K-curve slider's oninput. Without
// debouncing, dragging the slider would fire dozens of splits per second
// (each split decodes the image, walks every pixel × 4 channels, encodes
// 4 PNGs — heavy). 250 ms of slider idle is the trigger.
var _cmykResplitTimer = null;
function scheduleCMYKResplit() {
  if (!sessionState.cmykMode) return;   // no-op when CMYK isn't active
  if (_cmykResplitTimer) clearTimeout(_cmykResplitTimer);
  _cmykResplitTimer = setTimeout(() => {
    _cmykResplitTimer = null;
    try { resplitCMYK(); }
    catch (e) { console.error('[CMYK-mode] debounced re-split failed:', e); }
  }, 250);
}

// Re-split the original color image into 4 channel grayscales using the
// CURRENT K-curve slider value. Per-channel DNAs are preserved — only the
// `src` (grayscale image) per channel changes. The active channel is
// reloaded so the user sees the new K-curve effect immediately.
//
// Use case: user tweaks the K curve slider after splitting; previously
// they had to disable + re-enable CMYK mode (which wiped DNAs). Now they
// click "Re-split" and keep their work.
async function resplitCMYK() {
  console.log('[RESPLIT] enter resplitCMYK',
              'cmykMode=', sessionState.cmykMode,
              'originalImgSrc len=', (sessionState.originalImgSrc || '').length,
              'activeChannel=', sessionState.activeChannel);
  if (!sessionState.cmykMode) {
    console.warn('[RESPLIT] bail: cmykMode is off');
    return;
  }
  if (!sessionState.originalImgSrc || sessionState.originalImgSrc.length < 16) {
    console.warn('[RESPLIT] bail: no original color image to re-split');
    return;
  }
  const labelDiv = document.getElementById('cmykActiveChannelLabel');
  if (labelDiv) labelDiv.textContent = 'Re-splitting…';

  console.log('[RESPLIT] loading colorImg from originalImgSrc...');
  const colorImg = await loadImageFromDataUrl(sessionState.originalImgSrc);
  console.log('[RESPLIT] colorImg loaded', colorImg.width, 'x', colorImg.height);
  const gcr = (parseInt(document.getElementById('cmykGCR').value, 10) || 0) / 100;
  for (const ch of ['K', 'Y', 'M', 'C']) {
    if (!sessionState.cmykChannels[ch]) {
      sessionState.cmykChannels[ch] = { src: '', dna: '' };
    }
    const oldLen = (sessionState.cmykChannels[ch].src || '').length;
    // Only the grayscale changes — preserve any saved dna.
    sessionState.cmykChannels[ch].src = computeChannelDataUrl(colorImg, ch, gcr, sessionState.vivid);
    console.log(`[RESPLIT]   channel ${ch}: src len ${oldLen} → ${sessionState.cmykChannels[ch].src.length}`);
  }
  console.log(`[RESPLIT] all 4 channels rebuilt at gcr=${gcr.toFixed(2)}, vivid=${sessionState.vivid}`);

  // Push the new grayscale bytes into each EXISTING channel slot's
  // m_srcBuff via updateThumbnailMainRaw. The wasm session itself is
  // preserved (no re-init), so DNA + auth all carry over. Each slot's
  // next SA_Improve iteration uses the new target image automatically.
  for (const ch of ['K','Y','M','C']) {
    if (typeof getSlot === 'function' && getSlot(ch)) {
      try {
        const bytes = await extractThumbnailBytesForChannelSrc(sessionState.cmykChannels[ch].src);
        postToSlot(ch, { cmd: 'updateThumbnailMainRaw', args: { thumbnailMainRaw: bytes } });
        console.log(`[RESPLIT] pushed new src bytes to slot ${ch}`);
      } catch (e) {
        console.error(`[RESPLIT] failed to push bytes to slot ${ch}:`, e);
      }
    }
  }

  // Show the active channel's new grayscale on the display canvas.
  const targetCh = sessionState.activeChannel || 'K';
  await setActiveChannel(targetCh);
  console.log('[RESPLIT] done');
}

// Switch which channel is currently being optimized. Saves the running
// snapshot to the previous channel, swaps the source image, restores the
// new channel's DNA, and restarts the wasm session so it picks up both.
// ──────────────────────────────────────────────────────────────────────────
// CMYK multi-slot helpers (Phase 2)
// ──────────────────────────────────────────────────────────────────────────

// Render a channel's grayscale data URL into a hidden canvas with the same
// crop/scale the page applies for display, then read the bytes into an
// Int8Array (one byte per pixel — channels are already grayscale so R=G=B).
// This is what each slot's wasm `m_srcBuff` gets initialized from.
async function extractThumbnailBytesForChannelSrc(channelSrc) {
  const img = await loadImageFromDataUrl(channelSrc);
  const sourceW = sessionState.sourceWidth;
  const sourceH = sessionState.sourceHeight;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = sourceW;
  tempCanvas.height = sourceH;
  const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
  const s = IMG_TO_CANVAS_SCLAE;
  // Match the crop rect: img(rec*s, ...) drawn to sourceW×sourceH.
  ctx.drawImage(img,
    sessionState.recOffX  * s, sessionState.recOffY  * s,
    sessionState.recWidth * s, sessionState.recHeight * s,
    0, 0, sourceW, sourceH);
  const imgData = ctx.getImageData(0, 0, sourceW, sourceH);
  const bytes = new Int8Array(sourceW * sourceH);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = imgData.data[i * 4]; // R; G/B are identical for grayscale
  }
  return bytes;
}

// Build the init JSON for a specific CMYK channel — mirrors startSession()'s
// params shape, but uses per-channel B/C + DNA from cmykChannels[ch].
function buildInitJsonForChannel(ch) {
  const chData = sessionState.cmykChannels[ch] || {};
  const params = {
    stringPixelRatio: parseInt(sessionState.stringPixelRation),
    normalize: parseFloat(sessionState.normalize),
    collision: parseFloat(sessionState.collision),
    width: sessionState.sourceWidth,
    height: sessionState.sourceHeight,
    serverSnapshot: chData.dna || '',
    bgColors: JSON.stringify(sessionState.bgColors),
    dots: [],
    brightness: parseFloat(chData.brightness !== undefined ? chData.brightness : sessionState.brightness),
    contrast:   parseFloat(chData.contrast   !== undefined ? chData.contrast   : sessionState.contrast),
    bgStrength: parseFloat(sessionState.bgStrength),
    distanceViewFactor: parseFloat(sessionState.distanceViewFactor),
  };
  const dots = sessionState.dots || [];
  for (let i = 0; i < dots.length; i++) {
    const d = dots[i];
    params.dots.push({ x: params.width * d[0], y: params.height * d[1] });
  }
  return JSON.stringify(params);
}

// If a slot for this channel doesn't exist yet, spawn it (which posts init
// → triggers Firebase auth → resolves when keyConfirmed). Then push the
// channel's thumbnail bytes. Subsequent calls are no-ops because the slot
// is already live.
async function ensureSlotExists(ch) {
  if (typeof getSlot !== 'function') {
    console.warn('[CMYK-mode] ensureSlotExists called but wasmGlue not loaded');
    return null;
  }
  const existing = getSlot(ch);
  if (existing) {
    console.log(`[CMYK-mode] slot ${ch} already exists`);
    return existing;
  }
  console.log(`[CMYK-mode] spawning slot ${ch}`);
  const initJson = buildInitJsonForChannel(ch);
  const slot = await spawnChannelSlot(ch, initJson);
  // Push the channel's thumbnail bytes so its wasm m_srcBuff has the
  // target image to optimize toward.
  const bytes = await extractThumbnailBytesForChannelSrc(sessionState.cmykChannels[ch].src);
  postToSlot(ch, { cmd: 'updateThumbnailMainRaw', args: { thumbnailMainRaw: bytes } });

  // Pre-populate the slot's snapshotBuffer from the saved DNA (if any).
  // Without this, switching to a freshly-spawned channel shows nothing
  // because the worker only sends snapshots during improve — until Play
  // is pressed, there's nothing to draw from. Pre-populating means the
  // canvas shows whatever the saved state was the moment the channel
  // is selected, even before Play.
  const savedDna = sessionState.cmykChannels[ch] && sessionState.cmykChannels[ch].dna;
  if (savedDna && savedDna.length > 0) {
    try {
      slot.snapshotBuffer = new Int8Array(base64ToArrayBuffer(savedDna));
      console.log(`[CMYK-mode] pre-populated slot ${ch}.snapshotBuffer from saved DNA (${slot.snapshotBuffer.length} bytes)`);
    } catch (e) {
      console.warn(`[CMYK-mode] failed to pre-populate ${ch} snapshotBuffer:`, e);
    }
  }

  console.log(`[CMYK-mode] slot ${ch} fully initialized (init + thumbnail)`);
  return slot;
}

// Replaces the old in-place-swap-on-the-single-slot setActiveChannel.
// Now: ensure the target channel has its own wasm slot (lazy-spawn on
// first switch), then it's pure UI — point active slot at it, swap the
// displayed image, sync sliders, update button. The previously-active
// slot keeps running (or paused) independently.
async function setActiveChannel(ch) {
  if (!sessionState.cmykMode) {
    console.warn('[CMYK-mode] setActiveChannel called but cmykMode is off');
    return;
  }
  if (!sessionState.cmykChannels[ch]) {
    console.warn('[CMYK-mode] channel', ch, 'not in cmykChannels — split first?');
    return;
  }

  console.log(`[CMYK-mode] setActiveChannel → ${ch} (was ${sessionState.activeChannel})`);

  // 1) Persist the OUTGOING channel's slider values back into its slot's
  //    cmykChannels entry. (DNA is owned by the slot's wasm — JS only sees
  //    snapshots; nothing to save here per-switch.)
  const old = sessionState.activeChannel;
  if (old && old !== ch && sessionState.cmykChannels[old]) {
    sessionState.cmykChannels[old].brightness = sessionState.brightness;
    sessionState.cmykChannels[old].contrast   = sessionState.contrast;
  }

  // 2) Ensure the target channel has a live wasm slot. First switch to a
  //    channel spawns its worker + does the Firebase auth round-trip.
  //    Subsequent switches are instant (slot already exists).
  const cmykPanel = document.getElementById('cmykActiveChannelLabel');
  if (cmykPanel) cmykPanel.textContent = `Loading ${ch}…`;
  try {
    await ensureSlotExists(ch);
  } catch (e) {
    console.error(`[CMYK-mode] ensureSlotExists(${ch}) failed:`, e);
    if (cmykPanel) cmykPanel.textContent = `Error loading ${ch}`;
    return;
  }
  if (cmykPanel) cmykPanel.textContent = `Active: ${ch}`;

  // 3) Update activeChannel + active slot. setActiveSlotId mirrors the
  //    new slot's auth/snapshot state into sessionState and emits a
  //    stateChange so the Play button icon refreshes for this slot.
  sessionState.activeChannel = ch;
  setActiveSlotId(ch);

  // 4) Sync UI sliders to this channel's B/C.
  const chData = sessionState.cmykChannels[ch];
  if (chData.brightness !== undefined) {
    sessionState.brightness = chData.brightness;
    const br  = document.getElementById('brightnessRange');
    const brT = document.getElementById('brightnessRangeText');
    if (br)  br.value  = sessionState.brightness;
    if (brT) brT.value = sessionState.brightness;
  }
  if (chData.contrast !== undefined) {
    sessionState.contrast = chData.contrast;
    const co  = document.getElementById('contrastRange');
    const coT = document.getElementById('contrastRangeText');
    if (co)  co.value  = sessionState.contrast;
    if (coT) coT.value = sessionState.contrast;
  }

  // 5) Highlight the active channel button.
  document.querySelectorAll('#cmykChannelToggles button').forEach(b => {
    if (b.dataset.ch === ch) {
      b.style.boxShadow = '0 0 0 3px gold inset';
    } else {
      b.style.boxShadow = '';
    }
  });

  // 6) Swap displayed image to the channel's grayscale (display only —
  //    each slot's wasm already has its own srcBuff so we don't need
  //    to push thumbnail bytes via the worker on every switch).
  originalImg.src = chData.src;

  // 7) Auto-refresh CMYK preview if it's open.
  const previewBlock = document.getElementById('cmykPreviewBlock');
  if (previewBlock && previewBlock.style.display !== 'none') {
    console.log('[CMYK-mode] preview is open — auto-refreshing for new active channel');
    try { cmykShowPreview(); }
    catch (e) { console.error('[CMYK-mode] cmykShowPreview auto-refresh failed:', e); }
  }
}

// On page load, if a saved session is restored that already has cmykMode
// on, mirror it into the UI: tick the checkbox in Select Shape, reveal
// the channel-switcher panel, highlight the active channel.
function syncCMYKUIFromState() {
  const cb           = document.getElementById('cmykModeToggle');
  const channelPanel = document.getElementById('cmykChannelPanel');
  const labelDiv     = document.getElementById('cmykActiveChannelLabel');
  const previewBtn   = document.getElementById('cmykPreviewBtn');
  const resplitBtn   = document.getElementById('cmykResplitBtn');

  if (cb) cb.checked = !!sessionState.cmykMode;
  if (channelPanel) channelPanel.style.display = sessionState.cmykMode ? 'block' : 'none';
  if (resplitBtn)   resplitBtn.style.display   = sessionState.cmykMode ? 'block' : 'none';
  if (sessionState.cmykMode && previewBtn) previewBtn.disabled = false;

  if (sessionState.cmykMode && sessionState.activeChannel) {
    document.querySelectorAll('#cmykChannelToggles button').forEach(b => {
      b.style.boxShadow = (b.dataset.ch === sessionState.activeChannel)
        ? '0 0 0 3px gold inset' : '';
    });
    if (labelDiv) labelDiv.textContent = `Active: ${sessionState.activeChannel}`;
  } else if (labelDiv) {
    labelDiv.textContent = '';
  }
}
window.addEventListener('load', () => setTimeout(syncCMYKUIFromState, 200));

// =============================================================================
// CLI AUTO-MODE
// -----------------------------------------------------------------------------
// Activated by URL params written by string-art.py. None of these affect the
// public deployed site (params absent => block is a no-op).
//
// Params:
//   ?session=path/to/foo.json   -> fetch and restore via handleNewState
//   ?autoStart=1                -> click play once auth is confirmed
//   ?time=N                     -> stop & save after N seconds
//   ?autoSave=name.dna          -> filename for the snapshot download
//   ?testMode=1                 -> bypass Firebase by computing key locally
//                                  using window.__SALT__ (set by launcher).
// =============================================================================
(function autoModeInit() {
  const params = new URLSearchParams(location.search);
  const sessionUrl  = params.get('session');
  const autoStart   = params.get('autoStart') === '1';
  const testMode    = params.get('testMode')  === '1';
  const timeSec     = parseInt(params.get('time') || '0', 10) || 0;
  const autoSaveName = params.get('autoSave') || '';

  // Fast-exit when not in auto-mode (i.e. a normal user visit).
  if (!sessionUrl && !autoStart && !testMode && !timeSec) return;
  console.log('[auto-mode] params:', { sessionUrl, autoStart, testMode, timeSec, autoSaveName });

  // -- Synchronous patches done IMMEDIATELY (before wasm/firebase init) -------
  // These have to happen before any other script runs sessionLock handling,
  // otherwise wasmGlue.js trips on `runTimeState.user.uid` (user not set yet)
  // and the original Firebase updateDB sets up a listener that pushes back
  // STALE DNA from a previous run (we saw a phantom serverSnapshot).
  if (testMode) {
    // 0) Tell firebase.js to accept the first-fire assemblyKey value.
    //    Without this, Firebase's "skipping stale" logic discards the
    //    very value we need (the wasm RNG repeats so the stored key IS valid).
    window.__AUTO_MODE_ACCEPT_FIRST_FIRE__ = true;

    // 1) Pin runTimeState.user via a property descriptor that ignores
     //    null/undefined assignments. Without this, firebase.js's auth
     //    callback (which fires with user=null before sign-in completes)
     //    overwrites our stub, and wasmGlue.js then trips on `user.uid`.
    if (typeof runTimeState !== 'undefined') {
      let _stubUser = { uid: 'auto-mode-user' };
      try {
        Object.defineProperty(runTimeState, 'user', {
          get: () => _stubUser,
          set: (v) => { if (v && v.uid) _stubUser = v; /* drop null/undefined */ },
          configurable: true,
          enumerable: true,
        });
        console.log('[auto-mode] runTimeState.user pinned (null-set ignored)');
      } catch(e) {
        // Fallback for environments where defineProperty fails (very old).
        runTimeState.user = _stubUser;
        console.warn('[auto-mode] defineProperty failed, using direct assignment:', e);
      }
    }

    // 2) If we have a salt, intercept updateDB to compute the key locally.
    //    If we don't, leave Firebase alone — the user is presumably signed
    //    in and the cloud function will compute the right key via the
    //    server-side salt. (Path B: bypass-the-bypass.)
    if (window.__SALT__) {
      window.updateDB = function(uid, sessionLock, cb) {
        const data = new TextEncoder().encode(window.__SALT__ + sessionLock);
        crypto.subtle.digest('SHA-256', data).then(hash => {
          const hex = Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0')).join('');
          console.log('[auto-mode] updateDB local key:', hex.substring(0, 16) + '...');
          cb(hex);
        });
      };
      console.log('[auto-mode] Firebase updateDB intercepted with local SHA-256');
    } else {
      console.log('[auto-mode] No __SALT__ set — letting Firebase auth flow run normally');
    }

    // 3) Clear any cached sessionState from a prior run so it can't leak
    //    color-image bytes into the new channel session via originalImg.
    try { localStorage.removeItem('sessionState'); } catch(e) {}
  }

  // -- Helpers -----------------------------------------------------------------
  function saveBinaryFile(bytes, filename) {
    // bytes is an Int8Array. Wrap as a Blob so the browser treats it as binary
    // (not text) and the download is byte-exact.
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function computeKeyLocally(salt, lock) {
    // Mirrors the C++ side: SHA-256 of (salt + lock) as lowercase hex.
    const data = new TextEncoder().encode(salt + lock);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function whenReady(cb) {
    // CRITICAL: must wait for window.onload, not DOMContentLoaded.
    // window.onload triggers loader() which registers originalImg.onload.
    // If we run before that, our `originalImg.src = ...` finishes decoding
    // but no handler fires, so the canvases never get redrawn from the new
    // image. Result: page keeps showing whatever was drawn last by some
    // other path (the color image), with no way to fix it.
    if (document.readyState === 'complete') {
      // window.onload already fired — loader() should already have run.
      setTimeout(cb, 200);
    } else {
      window.addEventListener('load', () => setTimeout(cb, 200));
    }
  }

  // -- testMode bypass: poll for sessionLock, inject locally-computed key ------
  function startBypassWatcher() {
    if (!testMode) return;
    const salt = window.__SALT__ || '';
    if (!salt) {
      console.warn('[auto-mode] testMode=1 but window.__SALT__ is empty — bypass disabled');
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(async () => {
      try {
        // 30s safety timeout — give up if no lock arrives (probably wasm not initialized).
        if (Date.now() - startedAt > 30000) {
          console.error('[auto-mode] bypass timed out waiting for sessionLock');
          clearInterval(id);
          return;
        }
        const lock = sessionState && sessionState.sessionLock;
        if (lock && lock.length > 0 && !runTimeState.keyConfirmed) {
          const key = await computeKeyLocally(salt, lock);
          sessionState.sessionKey = key;
          runTimeState.keyConfirmed = true;
          console.log('[auto-mode] sessionKey injected via local SHA-256 (Firebase bypassed)');
          const ke = document.getElementById('key');
          if (ke) ke.textContent = 'auto';
          // Refresh whatever button gating depends on this flag.
          if (typeof emitStateChange === 'function' && typeof runTimeState !== 'undefined') {
            emitStateChange(runTimeState.state);
          }
          clearInterval(id);
        }
      } catch (err) {
        console.error('[auto-mode] bypass error:', err);
      }
    }, 200);
  }

  // -- Load a session JSON from a URL (replaces FileReader / file input) ------
  async function loadSessionFromUrl(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error('[auto-mode] fetch failed:', url, resp.status);
        return false;
      }
      const json = await resp.json();
      if (!json) {
        console.error('[auto-mode] session JSON parsed to null');
        return false;
      }
      // Mirrors LoadSession() at the top of this file.
      handleNewState(json);
      startSession();
      console.log('[auto-mode] session loaded from', url);
      return true;
    } catch (err) {
      console.error('[auto-mode] load error:', err);
      return false;
    }
  }

  // -- Auto-start: wait for keyConfirmed + dots ready, then Play() ------------
  function autoClickPlay() {
    const startedAt = Date.now();
    const PLAY_WAIT_MS = 300000;   // 5 min — Firebase auth can be very slow on
                                   // freshly-spawned Chrome windows; we'd
                                   // rather wait than fail and have the user
                                   // chase a phantom timeout.
    let lastReport = 0;
    const id = setInterval(() => {
      const dotsReady = sessionState && sessionState.dots && sessionState.dots.length >= 4;
      const elapsed = Date.now() - startedAt;
      // Periodic progress log so it's not silent for 2 min when stuck.
      if (elapsed - lastReport > 5000) {
        lastReport = elapsed;
        console.log('[auto-mode] waiting for Play... keyConfirmed=', runTimeState.keyConfirmed,
                    'dotsReady=', dotsReady, 'elapsed=', (elapsed/1000).toFixed(1)+'s');
      }
      if (runTimeState.keyConfirmed && dotsReady) {
        clearInterval(id);
        console.log('[auto-mode] starting Play()');
        try {
          Play();
          // Start the run timer AFTER Play actually fires, so the budget
          // counts improvement time, not Firebase/image-load wait time.
          if (timeSec > 0) scheduleStopAndSave();
        } catch (err) { console.error('[auto-mode] Play() threw:', err); }
      } else if (elapsed > PLAY_WAIT_MS) {
        clearInterval(id);
        console.error('[auto-mode] Play timed out: keyConfirmed=',
                      runTimeState.keyConfirmed, 'dotsReady=', dotsReady);
      }
    }, 200);
  }

  // -- Rate-based stop with time as safety cap --------------------------------
  // We watch the `improvements` counter (lines flipped between consecutive
  // snapshots) and stop when it drops below RATE_THRESHOLD for RATE_WINDOW_MS
  // straight. That's the optimizer's natural plateau signal — stops "when
  // it's done getting better", regardless of how long that takes.
  // The `time` arg is kept as a hard upper bound so runs never exceed it.
  function scheduleStopAndSave() {
    if (timeSec <= 0) return;

    const RATE_THRESHOLD = 10;       // single-digit = "barely improving"
    const RATE_WINDOW_MS = 5000;     // 5 s of consecutive low
    const GRACE_MS       = 3000;     // skip first 3 s after Play (warm-up)
    const MAX_MS         = timeSec * 1000;

    const startedAt = Date.now();
    let lowSince = 0;                // ms timestamp when low streak began (0 = not low)

    const stopAndSave = (reason) => {
      console.log('[auto-mode] stopping — reason:', reason);
      try { Stop(); }
      catch (err) { console.warn('[auto-mode] Stop() threw:', err); }

      // Brief delay so the worker can flush its final snapshot back to main.
      setTimeout(() => {
        if (!autoSaveName) return;
        const buf = sessionState && sessionState.snapshotBuffer;
        if (buf && buf.length > 0) {
          saveBinaryFile(buf, autoSaveName);
          console.log('[auto-mode] saved DNA ->', autoSaveName, '(' + buf.length + ' bytes)');
        } else {
          console.warn('[auto-mode] no snapshotBuffer to save');
        }
      }, 800);
    };

    const monId = setInterval(() => {
      const elapsed = Date.now() - startedAt;

      // 1) Hard time cap — safety net so we never run forever.
      if (elapsed > MAX_MS) {
        clearInterval(monId);
        stopAndSave('hard time cap (' + (MAX_MS/1000) + 's)');
        return;
      }

      // 2) Skip rate check during warm-up — improvements is meaningless until
      //    a couple of snapshots have flowed back.
      if (elapsed < GRACE_MS) return;

      const el = document.getElementById('improvements');
      const imp = el ? parseInt(el.value || '0', 10) : 0;

      if (imp < RATE_THRESHOLD) {
        if (lowSince === 0) lowSince = Date.now();
        const lowFor = Date.now() - lowSince;
        if (lowFor >= RATE_WINDOW_MS) {
          clearInterval(monId);
          stopAndSave('improvements < ' + RATE_THRESHOLD +
                      ' for ' + (lowFor/1000).toFixed(1) + 's');
        }
      } else {
        if (lowSince !== 0) {
          // Optional: comment back in for verbose progress.
          // console.log('[auto-mode] rate recovered (', imp, ') — resetting low timer');
        }
        lowSince = 0;
      }
    }, 200);
  }

  // -- Wire up -----------------------------------------------------------------
  whenReady(async () => {
    startBypassWatcher();          // starts polling for sessionLock
    if (sessionUrl) {
      const ok = await loadSessionFromUrl(sessionUrl);
      if (!ok) return;             // fetch/parse failed; abort the rest
    }
    if (autoStart) autoClickPlay();
    // Note: scheduleStopAndSave is now called from inside autoClickPlay AFTER
    // Play() actually fires, so the time budget counts real improvement time
    // rather than being eaten by Firebase auth + image-load latency.
  });
})();