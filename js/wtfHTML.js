function saveText(text, filename){
    var a = document.createElement('a');
    a.setAttribute('href', 'data:text/plain;charset=utf-8,'+encodeURIComponent(text));
    a.setAttribute('download', filename);
    a.click()
  }


  //saveText("asdasda","sdfsdf.txt")

  
 
  document.getElementById('loadSessionFile').addEventListener('input', handleSessionFileSelect, false);

  function handleSessionFileSelect(evt){

    const fileList = this.files;
    var file = this.files[0] ;//e.originalEvent.srcElement.files[i];
    
    var reader = new FileReader();
  
  
    reader.onloadend = function() {
         params  = JSON.parse(reader.result);
         if(params!=null){
            img = document.getElementById("imgid") ;
            img.onload = () => { 
             
            };
  
         }
    }
    reader.readAsText(file)
    
  
  }
 