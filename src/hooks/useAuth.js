import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config';

/**
 * Tracks Firebase auth state reactively.
 *
 * Returns:
 *  - user:  the current Firebase user (or null when signed out)
 *  - isAuthenticated: convenience boolean
 *  - isAuthReady: false until Firebase has restored persisted state at least
 *    once, so screens can avoid flashing the "sign in" gate before we know.
 */
export default function useAuth() {
  const [user, setUser] = useState(() => auth.currentUser);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthReady(true);
    });
    return unsubscribe;
  }, []);

  return {
    user,
    isAuthenticated: !!user,
    isAuthReady,
  };
}
