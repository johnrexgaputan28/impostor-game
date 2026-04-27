import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  get,
  push,
  remove,
  onValue,
  serverTimestamp,
  onDisconnect,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  createUserWithEmailAndPassword,
  FacebookAuthProvider,
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyABLDkXYTJZ2JXElgsUbqd59EjR-2qAZz8",
  authDomain: "impostor-game-9b619.firebaseapp.com",
  databaseURL: "https://impostor-game-9b619-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "impostor-game-9b619",
  storageBucket: "impostor-game-9b619.firebasestorage.app",
  messagingSenderId: "815150546031",
  appId: "1:815150546031:web:07cbc31567ea5b24f0219a"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();
facebookProvider.addScope("email");

const roomRef = (roomCode) => ref(db, `rooms/${roomCode}`);
const playersRef = (roomCode) => ref(db, `rooms/${roomCode}/players`);
const playerRef = (roomCode, playerId) => ref(db, `rooms/${roomCode}/players/${playerId}`);
const chatRef = (roomCode) => ref(db, `rooms/${roomCode}/chat`);
const gameRef = (roomCode) => ref(db, `rooms/${roomCode}/game`);
const votesRef = (roomCode) => ref(db, `rooms/${roomCode}/game/votes`);

function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

function signInWithFacebook() {
  return signInWithPopup(auth, facebookProvider);
}

function registerWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export {
  auth,
  chatRef,
  db,
  facebookProvider,
  gameRef,
  get,
  googleProvider,
  onAuthStateChanged,
  onDisconnect,
  onValue,
  playerRef,
  playersRef,
  push,
  ref,
  registerWithEmail,
  remove,
  roomRef,
  runTransaction,
  serverTimestamp,
  set,
  loginWithEmail,
  signInWithFacebook,
  signInWithGoogle,
  signOut,
  update,
  updateProfile,
  votesRef
};
