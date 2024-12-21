import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth ,signOut ,getRedirectResult, GoogleAuthProvider ,signInWithPopup,onAuthStateChanged,signInWithRedirect,createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, update,onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";





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
    document.getElementById("displayName").textContent = userE.displayName ; 
    document.getElementById("signOut").style.display = "block";
    document.getElementById("signInButton").style.display = "none";
    document.getElementById("advanced").style.display = "none";
    // User is signed in, see docs for a list of available properties
    // https://firebase.google.com/docs/reference/js/auth.user
    sessionState.userId = userE.uid ;
    user = userE  ;
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




function updateDB(userId,sessionLock,cb) {
   
    const newData = {
      assemblyLock: sessionLock,
      // Add your data here
    };
    const db = getDatabase(app);
    // Reference to the database
    const dbRef = ref(db, `users/${userId}`);

    const onKey = ref(db, `users/${userId}/assemblyKey`);
    onValue(onKey, (snapshot) => {
      const updatedData = snapshot.val();
      cb(updatedData); 
      console.log("Data changed:", updatedData);
      // Call your callback function here passing updatedData
  });

    // Update the database
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
