import { useEffect, useState } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';

export default function useAuth() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    signInAnonymously(auth).catch((e) => console.error(e));
    return onAuthStateChanged(auth, setUser);
  }, []);

  return user;
}
