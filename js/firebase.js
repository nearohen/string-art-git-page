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




// SERIALIZED auth requests.
//
// All slots share ONE Firebase path:
//   users/{uid}/assemblyLock  ← we write here
//   users/{uid}/assemblyKey   ← cloud function writes here, all subscribers listen
//
// If two slots auth in parallel:
//   A writes lockA → fn hashes → writes hashA
//   B writes lockB → fn hashes → writes hashB
//   Both A's and B's listeners fire with hashB → A gets B's key → wrong!
//
// Fix: chain auths on a global promise queue. Each updateDB call waits for
// the previous one to fully complete (key delivered → cb fired → listener
// unsubscribed) before writing its own lock. One slot's auth round-trip is
// done before the next starts.
//
// Listener is one-shot: subscribe → wait for the correct fire → cb → unsub
// → resolve the queue. This is acceptable because re-auth (e.g. on
// SESSION_KEY_REJECTED) is handled by wasmGlue.keyRejected which calls
// updateDB again — a brand new queued auth.

let _authQueue = Promise.resolve();

function updateDB(userId, sessionLock, cb, slotId) {
    const slotKey = slotId || 'main';
    const queuedAt = Date.now();

    _authQueue = _authQueue.then(() => new Promise((resolve) => {
        const startedAt = Date.now();
        console.log(`[slot ${slotKey}] auth queue: starting (waited ${startedAt - queuedAt}ms)`);

        const user = auth.currentUser;
        if (!user) {
            console.error(`[slot ${slotKey}] No user logged in — aborting auth`);
            resolve();
            return;
        }

        const newData = {
            assemblyLock: sessionLock,
            userEmail: user.email,
            lastUpdated: Date.now()
        };
        const db = getDatabase(app);
        const dbRef = ref(db, `users/${userId}`);

        // The flow:
        //
        // 1. Subscribe — the FIRST onValue fire is the current assemblyKey
        //    BEFORE our write. Capture as initialValue, don't accept yet.
        // 2. Write our lock. Cloud function (`onSignIn` in functions/index.ts)
        //    is `onValueWritten` so it fires on every write — it hashes
        //    our lock and writes the result to assemblyKey.
        // 3. If our lock hashes to a DIFFERENT value than initialValue,
        //    Firebase fires a CHANGE event on the listener → use that.
        // 4. If our lock hashes to the SAME value as initialValue, Firebase
        //    does NOT fire a change event (same-value write). After a short
        //    timeout we conclude this case happened and use initialValue.
        // 5. Hard timeout at 8s in case the cloud function is down.

        let initialFired = false;
        let initialValue = null;
        let resolved     = false;
        let unsub        = null;

        const finish = (value, reason) => {
            if (resolved) return;
            resolved = true;
            if (typeof unsub === 'function') {
                try { unsub(); } catch(e) {}
            }
            console.log(`[slot ${slotKey}] auth done in ${Date.now() - startedAt}ms (${reason}) → key=${value}`);
            try { cb(value); } catch(e) { console.error(`[slot ${slotKey}] cb threw:`, e); }
            resolve();
        };

        const onKey = ref(db, `users/${userId}/assemblyKey`);
        unsub = onValue(onKey, (snapshot) => {
            if (resolved) return;
            const v = snapshot.val();
            if (!initialFired) {
                initialFired = true;
                initialValue = v;
                console.log(`[slot ${slotKey}] initial value captured: ${v}`);
                return;
            }
            console.log(`[slot ${slotKey}] change event: ${v}`);
            finish(v, "change event");
        });

        update(dbRef, newData)
            .then(() => console.log(`[slot ${slotKey}] lock write OK`))
            .catch((error) => {
                console.error(`[slot ${slotKey}] lock write ERROR:`, error);
                finish(null, "write error");
            });

        // No-change timeout: lock probably hashed to the same value as
        // initialValue, so no change event will ever fire. Accept initial.
        // 1500ms is enough for the cloud function round-trip in normal
        // conditions (write→trigger→hash→write) — observed ~300-700ms.
        const noChangeTimer = setTimeout(() => {
            if (resolved) return;
            if (initialFired) {
                finish(initialValue, "no-change timeout (lock matches existing)");
            }
        }, 1500);

        // Hard timeout — give up entirely so the auth queue isn't wedged.
        const hardTimer = setTimeout(() => {
            if (resolved) return;
            console.warn(`[slot ${slotKey}] auth HARD TIMEOUT 8s`);
            finish(null, "hard timeout");
        }, 8000);
    }));
    return _authQueue;
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