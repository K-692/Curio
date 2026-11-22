import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  reauthenticateWithPopup,
  deleteUser,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore/lite';
import { auth, db } from './firebase';
import { clearAllHistory } from './history';
import { deleteFeedState } from './feed';
import { deleteTopicStats } from './stats';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export { onAuthStateChanged, type User };

export async function signInWithGoogle(): Promise<void> {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

export const completeRedirect = () => getRedirectResult(auth).catch((e) => { throw e; });

export const signOut = () => fbSignOut(auth);

/** Creates the minimal profile doc on first sign-in. Returns whether the user is an admin. */
export async function ensureProfile(user: User): Promise<{ isAdmin: boolean }> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: (user.displayName ?? '').slice(0, 100),
      photoURL: (user.photoURL ?? '').slice(0, 500),
      createdAt: serverTimestamp(),
    });
  }
  let isAdmin = false;
  try {
    isAdmin = (await getDoc(doc(db, 'admins', user.uid))).exists();
  } catch {
    isAdmin = false;
  }
  return { isAdmin };
}

/** Deletes all of the user's data, then the auth account itself. */
export async function deleteAccount(user: User): Promise<void> {
  await clearAllHistory(user.uid);
  await deleteFeedState(user.uid);
  await deleteTopicStats(user.uid);
  await deleteDoc(doc(db, 'users', user.uid));
  try {
    await deleteUser(user);
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/requires-recent-login') {
      await reauthenticateWithPopup(user, provider);
      await deleteUser(user);
    } else throw e;
  }
}
