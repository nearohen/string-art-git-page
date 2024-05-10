import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth , GoogleAuthProvider ,signInWithPopup,createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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
  console.log("End")
  const provider = new GoogleAuthProvider();
  function signIn(cb) {
    console.log("signIn addScope");
    //provider.addScope('https://www.googleapis.com/auth/contacts.readonly');
    signInWithPopup(auth, provider)
    .then((result) => {
      // This gives you a Google Access Token. You can use it to access the Google API.
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential.accessToken;
      // The signed-in user info.
      const user = result.user;
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
