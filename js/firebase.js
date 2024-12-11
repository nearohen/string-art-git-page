import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth ,getRedirectResult, GoogleAuthProvider ,signInWithPopup,onAuthStateChanged,signInWithRedirect,createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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

  getRedirectResult(auth)
  .then((result) => {
    if (result) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential.accessToken;
      const user = result.user;

      console.log("Redirect sign-in successful:", user);
      // Perform post-sign-in actions here
    }
  })
  .catch((error) => {
    console.error("Error handling redirect result:", error);
  });

  console.log("End")
  const provider = new GoogleAuthProvider();
  onAuthStateChanged(auth, (userE) => {
    if (userE) {
      // User is signed in, see docs for a list of available properties
      // https://firebase.google.com/docs/reference/js/auth.user
      user = userE  ;
      if(getUserCB){
        getUserCB(userE); 
      }
    } else {
      // User is signed out
      // ...
    }
  });


  async function signIn(cb) {
    console.log("signIn addScope");
     // Check if a user is already signed in
    const user = auth.currentUser;
    if (user) {
      console.log("User already signed in:", user);

      // Trigger the callback with the user ID
      const userId = user.uid;
      if (cb) {
        cb(userId);
      }

      // Call additional logic for a signed-in user if needed
      if (getUserCB) {
        getUserCB(user);
      }
      return; // Exit since the user is already signed in
    }
    //provider.addScope('https://www.googleapis.com/auth/contacts.readonly');

    console.log("No user signed in, proceeding with sign-in...");
    // If no user is signed in, proceed with redirect sign-in
    try {
      await signInWithRedirect(auth, provider);
      // Handle successful redirect in a separate callback or listener
    } catch (error) {
      console.error("Error during sign-in:", error);
      // Optional: Handle specific error scenarios
    }


    await signInWithRedirect(auth, provider)
    .then((result) => {
      // This gives you a Google Access Token. You can use it to access the Google API.
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential.accessToken;
      // The signed-in user info.
      if(getUserCB){
        getUserCB(user); 
      }
      const userId = user.uid;
      // IdP data available using getAdditionalUserInfo(result)
      cb(userId)

      
      
      // ...
    }).catch((error) => {
      // Handle Errors here.
      const errorCode = error.code;
      const errorMessage = error.message;
      // The email of the user's account used.
      //const email = error.customData.email;
      // The AuthCredential type that was used.
      const credential = GoogleAuthProvider.credentialFromError(error);
      // ...
    });
}

window.signIn = signIn;
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
