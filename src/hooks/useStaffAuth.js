import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../services/firebase';

export const isPasswordUser = (user) => (
  user?.providerData?.some((provider) => provider.providerId === 'password') === true
);

export default function useStaffAuth() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, async (nextUser) => {
    if (nextUser && !isPasswordUser(nextUser)) {
      // The customer routes use anonymous auth on the same Firebase project.
      // Never let that persisted customer session open the staff application.
      setUser(null);
      try {
        await signOut(auth);
      } catch (error) {
        console.error('Unable to clear non-staff Firebase session', error);
      } finally {
        setIsAuthLoading(false);
      }
      return;
    }

    setUser(nextUser);
    setIsAuthLoading(false);
  }), []);

  return { user, isAuthLoading };
}
