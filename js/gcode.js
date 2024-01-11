
function addToGCode(gcode, cmd, comment) {
    if (comment != undefined) {
        gcode.data.push(cmd + ";" + comment);
    } else {
        gcode.data.push(cmd);
    }

}
function butify(num){
    return parseFloat(num).toFixed(2);
}
function butifyE(num){
    return parseFloat(num).toFixed(4);
}
function gGoTo(gcode,dot, doExtrude) {
    let dotIndex = dot[2];
    if (gcode.dotsHeights[dotIndex]==undefined){
        gcode.dotsHeights[dotIndex]=0; 
    }
    let destX = butify(dot[0]*gcode.bed.width);
    let destY = butify(dot[1]*gcode.bed.height);
    if(doExtrude){
        let goExtrude = 0;
        let distance = 0;

        if(gcode.lastDot!=null){
            

            let currentPosX = butify(gcode.lastDot[0]*gcode.bed.width);
            let currentPosY = butify(gcode.lastDot[1]*gcode.bed.height);


            let dx = (currentPosX-destX);
            let dy = (currentPosY-destY);
            distance = Math.sqrt(dx*dx+dy*dy);
            goExtrude = butifyE(gcode.extrodeGo*distance);
            

            
            let destHeight = butify(gcode.maxHeight+10);
            addToGCode(gcode,`G1 X${currentPosX} Y${currentPosY} Z${destHeight} E${gcode.extrodeUp}`,"up");
            addToGCode(gcode,`G1 X${destX} Y${destY} E${ goExtrude}`, "go "+butify(distance));
            addToGCode(gcode,`G1 X${destX} Y${destY} Z${gcode.dotsHeights[dotIndex]} E${gcode.extrodeDown}`,"down");
            gcode.dotsHeights[dotIndex]+=gcode.extrodeDown;
            if(gcode.maxHeight <gcode.dotsHeights[dotIndex] )
                gcode.maxHeight = gcode.dotsHeights[dotIndex];


        }
        
      
    }
    else{
        addToGCode(gcode, `G1 X${destX} Y${destY} Z${gcode.dotsHeights[dotIndex]} E${0}`, "jump");
    }
    gcode.lastDot  = dot;
}

function GenerateGcode() {
    initInstructions();
    if (sessionState.instructions == undefined || sessionState.instructions.instructionsArray == undefined)
        return;
    
    let z = 0.01;
    let zInc = 0.01;
    const gcode = {};
    initGcode(gcode);
    const instructionsArray = sessionState.instructions.instructionsArray;
    let currentDotIndex = -1;
    for (index in instructionsArray) {
        const instruction = instructionsArray[index];
        let lineIndex = instruction["lineIndex"];

        if (lineIndex == -1) {
            currentDotIndex = -1;
            gcode.lastDot = null;
        }
        else {
            let dotAIndex = instruction["dotAIndex"];
            let dotBIndex = instruction["dotBIndex"];
            let line = runTimeState.linesArr[parseInt(lineIndex)];
            let dotA = line.dotA;
            let dotB = line.dotB;
            if (dotAIndex != line.dotA[2]) {
                dotB = line.dotA;
                dotA = line.dotB;
            }
            
            if (currentDotIndex != dotAIndex) {
                gGoTo(gcode,dotA , false);
            }

            gGoTo(gcode, dotB,true);
            currentDotIndex = dotBIndex;
            //z = z+ zInc;
        }

    }

    let filename = getSessionOutFileName()
    filename = filename + ".gcode";
    let out = "";
    for (index in gcode.data) {
        out = out + gcode.data[index] + "\r\n";

    }
    var a = document.createElement('a');
    a.setAttribute('href', 'data:text/plain;charset=utf-8,' + out);
    a.setAttribute('download', filename);
    a.click()




}


function initGcode(gcode) {
    gcode.data = [];

    gcode.bed = {
        width: 200,
        height: 200,
    }
    gcode.lastDot = null;
    gcode.extrodeUp = 0.1;
    gcode.extrodeDown = 0.1;
    gcode.extrodeGo = 0.001;


    gcode.dotsHeights = [] ;
    gcode.maxHeight = 0;
    addGcodeStart(gcode);
}
function addGcodeStart(gcode){
    addToGCode(gcode, "M201 X500 Y500 Z100 E5000 ; sets maximum accelerations, mm/sec^2");
    addToGCode(gcode, "M203 X500 Y500 Z10 E60 ; sets maximum feedrates, mm/sec");
    addToGCode(gcode, "M204 P500 R1000 T500 ; sets acceleration (P, T) and retract acceleration (R), mm/sec^2");
    addToGCode(gcode, "M205 X8.00 Y8.00 Z0.40 E5.00 ; sets the jerk limits, mm/sec");
    addToGCode(gcode, "M205 S0 T0 ; sets the minimum extruding and travel feed rate, mm/sec");
    addToGCode(gcode, "M107");
    addToGCode(gcode, ";TYPE:Custom");
    addToGCode(gcode, "G90 ; use absolute coordinates");
    addToGCode(gcode, "M83 ; extruder relative mode");
    addToGCode(gcode, "M140 S60 ; set final bed temp");
    addToGCode(gcode, "M104 S150 ; set temporary nozzle temp to prevent oozing during homing");
    addToGCode(gcode, "G4 S10 ; allow partial nozzle warmup");
    addToGCode(gcode, "G28 ; home all axis");
    addToGCode(gcode, "G29");
    addToGCode(gcode, "G1 Z50 F240");
    addToGCode(gcode, "G1 X2 Y10 F3000");
    addToGCode(gcode, "M104 S215 ; set final nozzle temp");
    addToGCode(gcode, "M190 S60 ; wait for bed temp to stabilize");
    addToGCode(gcode, "M109 S215 ; wait for nozzle temp to stabilize");
    addToGCode(gcode, "G1 Z0.28 F240");
    addToGCode(gcode, "G92 E0");
    addToGCode(gcode, "G1 Y140 E10 F1500 ; prime the nozzle");
    addToGCode(gcode, "G1 X2.3 F5000");
    addToGCode(gcode, "G92 E0");
    addToGCode(gcode, "G1 Y10 E10 F1200 ; prime the nozzle");
    addToGCode(gcode, "G92 E0");
    addToGCode(gcode, "G21 ; set units to millimeters");
    addToGCode(gcode, "G90 ; use absolute coordinates");
    addToGCode(gcode, "M83 ; use relative distances for extrusion");
    addToGCode(gcode, ";TYPE:External perimeter");

}