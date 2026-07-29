import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

/**
 * Firebase configuration - same project as the web app.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyASmRKKGVmkcV91-EM2yvosFKq1C1kgX-w',
  authDomain: 'wanderlust-35cd9.firebaseapp.com',
  projectId: 'wanderlust-35cd9',
  storageBucket: 'wanderlust-35cd9.firebasestorage.app',
  messagingSenderId: '379966737355',
  appId: '1:379966737355:web:ac5ec8dbe0474db1a8c44e',
};

// Initialize Firebase (avoid re-initialization)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, googleProvider };
