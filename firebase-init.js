import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDz4xuYzXgURfQ7SWG0Qiir1k2V-EDh9-E',
  authDomain: 'eatlog-086.firebaseapp.com',
  projectId: 'eatlog-086',
  storageBucket: 'eatlog-086.firebasestorage.app',
  messagingSenderId: '491855762407',
  appId: '1:491855762407:web:66d44e5898d3a3fddce342',
  measurementId: 'G-9WFX2Z5CBS'
};

const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
