import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore/lite';

// Firebase web config is public by design; access is enforced by Firestore Security Rules.
// Analytics is intentionally not initialised (minimal personal data).
const firebaseConfig = {
  apiKey: 'AIzaSyBa81BpAtQ7OENnREyikzSm9DoP6m71FXI',
  authDomain: 'curio-ebc43.firebaseapp.com',
  projectId: 'curio-ebc43',
  storageBucket: 'curio-ebc43.firebasestorage.app',
  messagingSenderId: '785377596791',
  appId: '1:785377596791:web:92ba6b9a7ef1c23b873d72',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
