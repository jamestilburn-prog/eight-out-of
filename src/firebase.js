import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged
} from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
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
export const registerUser = async (email, password, username) => {
  // 1. Create the authentication account
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // 2. Create a document in the 'users' collection using the user's unique UID
  await setDoc(doc(db, 'users', user.uid), {
    username: username.trim(),
    createdAt: new Date()
  });

  return user;
};


export const loginUser = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);