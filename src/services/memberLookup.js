import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { auth, functions } from './firebase';

// Callables don't wait for the anonymous sign-in the way Firestore reads do — a lookup
// fired before useAuth finishes goes out without a token and the backend says
// "sign-in-required". Wait for auth first (and sign in if nobody is).
export async function ensureSignedIn(authInstance = auth, signIn = signInAnonymously) {
  if (typeof authInstance.authStateReady === 'function') await authInstance.authStateReady();
  if (!authInstance.currentUser) await signIn(authInstance);
  return authInstance.currentUser;
}

export async function lookupMemberByPhone(phone, { authInstance = auth, callableFactory = httpsCallable, signIn = signInAnonymously } = {}) {
  await ensureSignedIn(authInstance, signIn);
  const result = await callableFactory(functions, 'lookupMember')({ phone });
  return result.data || { exists: false };
}
