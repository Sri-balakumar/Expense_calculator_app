// Auth helpers — port of the PWA's js/auth.js to the modular Firebase SDK.

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updatePassword,
  EmailAuthProvider,
  User,
} from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "./config";

export async function signUp(email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signIn(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function updateUserProfile(
  uid: string,
  updates: Record<string, any>
): Promise<void> {
  await updateDoc(doc(db, "users", uid), updates);
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("Not signed in.");
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

// Resolve once with the current user (or null) — mirror of waitForAuth().
export function waitForAuth(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

export function onAuth(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

// Friendly error messages for common Firebase auth errors (port of friendlyAuthError).
export function friendlyAuthError(err: any): string {
  const code = (err && err.code) || "";
  switch (code) {
    case "auth/invalid-email":
      return "That doesn't look like a valid email.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try logging in.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 6 characters.";
    case "auth/user-not-found":
      return "No account with this email. Try signing up.";
    case "auth/wrong-password":
      return "Wrong password. Try again.";
    case "auth/invalid-credential":
      return "Wrong email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a minute and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your internet connection.";
    default:
      return (err && err.message) || "Something went wrong. Try again.";
  }
}
