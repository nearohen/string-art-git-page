import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth ,signOut ,getRedirectResult, GoogleAuthProvider ,signInWithPopup,onAuthStateChanged,signInWithRedirect,createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, update,onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";





const firebaseConfig = {
    apiKey: "AIzaSyBR5Vm7ESjz0Fv2rqI55dbXDU5Ei65_SN8",
    authDomain: "stringart-18a36.firebaseapp.com",
    projectId: "stringart-18a36",
    storageBucket: "stringart-18a36.appspot.com",
    messagingSenderId: "1027935072494",
    appId: "1:1027935072494:web:c3413a3e140363f85e83ff",
    measurementId: "G-8938S8PCLR",
    databaseURL: "https://stringart-18a36-default-rtdb.firebaseio.com"
  };

  // Initialize Firebase
  console.log("app") ;
  const app = initializeApp(firebaseConfig);
  console.log("auth")
  const auth = getAuth(app) ;
  let user = undefined ;
  let getUserCB = undefined ;
  window.getUser = (cb)=>{
    getUserCB = cb ;
    if(user){
      getUserCB(user) ;
    }
  }

function handleUser(userE){
  if (userE) {
    document.getElementById("displayName").textContent = userE.displayName;
    document.getElementById("userEmail").textContent = userE.email;
    document.getElementById("signOut").style.display = "block";
    document.getElementById("signInButton").style.display = "none";
    document.getElementById("advanced").style.display = "none";
    // User is signed in, see docs for a list of available properties
    // https://firebase.google.com/docs/reference/js/auth.user
    sessionState.userId = userE.uid;
    user = userE;
    if(getUserCB){
      getUserCB(userE); 
    }
  } else {
    // User is signed out
    // ...
  }
}

  console.log("End")
  const provider = new GoogleAuthProvider();
  onAuthStateChanged(auth, (userE) => {
    handleUser(userE) ;
    
  });






  async function signOutUser() {
    try {
      await signOut(auth);
      document.getElementById("signOut").style.display = "none";
      document.getElementById("signInButton").style.display = "block";
      console.log("User signed out successfully");
      emitStateChange(States.NS) ;
      runTimeState.intervals.animationInterval = setTimeout(Animate,100);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }

  
  document.getElementById('signOutButton').addEventListener('click', async () => {
    try {
      signOutUser();
    } catch (error) {
      console.error("Sign-out failed:", error);
    }
  });


  document.getElementById('signInButton').addEventListener('click', async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      handleUser(result.user);
      console.log("User signed in successfully:", user);
    } catch (error) {
      console.error("Sign-in failed:", error);
    }
  });




function updateDB(userId, sessionLock, cb) {
    const user = auth.currentUser;
    if (!user) {
        console.error("No user logged in");
        return;
    }
   
    const newData = {
        assemblyLock: sessionLock,
        userEmail: user.email,  // Add user's email
        lastUpdated: Date.now() // Optional: add timestamp
    };

    const db = getDatabase(app);
    const dbRef = ref(db, `users/${userId}`);

    const onKey = ref(db, `users/${userId}/assemblyKey`);
    onValue(onKey, (snapshot) => {
        const updatedData = snapshot.val();
        cb(updatedData); 
        console.log("Data changed:", updatedData);
    });

    update(dbRef, newData)
        .then(() => {
            console.log("Data updated successfully");
        })
        .catch((error) => {
            console.error("Error updating data:", error);
        });
}
window.updateDB = updateDB ;

  /*
    createUserWithEmailAndPassword(auth, "nir.hen@gmail.com", password)
  .then((userCredential) => {
    // Signed up 
    const user = userCredential.user;
    // ...
  })
  .catch((error) => {
    const errorCode = error.code;
    const errorMessage = error.message;
    // ..
  });
  */

function addInstructionsObToDB(sessionState, callback) {
    // Get current user
    const projectId = crypto.randomUUID();
    const user = auth.currentUser;
    if (!user) {
        console.error("No user logged in");
        return;
    }

    const instructionData = {
        dots: sessionState.dots,
        snapshotB64: sessionState.snapshotB64,
        width: sessionState.sourceWidth,
        height: sessionState.sourceHeight,  
        thickness: sessionState.stringPixelRation,
        projectId: projectId,
        createdAt: Date.now(),
        userId: user.uid,
        userEmail: user.email,
        title: sessionState.sessionFileName,
    };

    const db = getDatabase(app);
    // Reference to the instructions in RTDB under the user's path
    const dbRef = ref(db, `users/${user.uid}/instructions/${projectId}`);

    // Update the database
    update(dbRef, instructionData)
        .then(() => {
            console.log("Instructions added successfully for project:", projectId);
            // Get PWA link from our function, adding email as parameter
            const encodedEmail = encodeURIComponent(user.email);
            const url = `https://us-central1-stringart-18a36.cloudfunctions.net/getPWALink?id=${projectId}&userId=${user.uid}&email=${encodedEmail}`;
            console.log("Generated URL:", url); // Debug log
            return fetch(url);
        })
        .then(response => response.json())
        .then(data => {
            // Make sure the email parameter is in the final URL
            const finalUrl = new URL(data.url);
            finalUrl.searchParams.set('email', user.email);
            
            // Create and return link object
            callback({
                url: finalUrl.toString(),
                text: 'Step by Step Instructions',
                tip: 'Tip: After opening, click the install button in your browser to add this app to your device!'
            });
        })
        .catch((error) => {
            console.error("Error in instruction process:", error);
            callback({
                error: true,
                message: 'Error generating instructions link. Please try again.'
            });
        });
}
window.addInstructionsObToDB = addInstructionsObToDB;