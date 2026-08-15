import {
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { staffIdToEmail } from '../utils/staffIdentity';

export async function signInStaff(
  authInstance,
  staffId,
  password,
  authApi = { setPersistence, signInWithEmailAndPassword },
) {
  await authApi.setPersistence(authInstance, browserSessionPersistence);
  return authApi.signInWithEmailAndPassword(
    authInstance,
    staffIdToEmail(staffId),
    password,
  );
}
