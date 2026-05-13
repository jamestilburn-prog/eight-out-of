import { initializeApp } from "firebase/app";
import { 
  getAuth, 
    createUserWithEmailAndPassword,
      signInWithEmailAndPassword,
      sendPasswordResetEmail,
      signOut,
      onAuthStateChanged 
          } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
const firebaseConfig = {
  apiKey: "AIzaSyDfYCfIbItVFYtpPrmWBb5JrBpJSSCB2DY",
    authDomain: "eight-out-of.firebaseapp.com",
      projectId: "eight-out-of",
        storageBucket: "eight-out-of.firebasestorage.app",
          messagingSenderId: "418453508686",
            appId: "1:418453508686:web:447bb21ba1df373039691f"
            };

            // Initialize Firebase
            const app = initializeApp(firebaseConfig);

            // Initialize Services
            export const auth = getAuth(app);
            export const db = getFirestore(app);

            // Helper functions for Email/Password
            export const registerUser = (email, password) => createUserWithEmailAndPassword(auth, email, password);
            export const loginUser = (email, password) => signInWithEmailAndPassword(auth, email, password);
            export const logout = () => signOut(auth);
            export const resetPassword = (email) => sendPasswordResetEmail(auth, email);