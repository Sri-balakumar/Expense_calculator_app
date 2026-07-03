// Firebase initialization for React Native.
// Reuses the SAME Firebase project as the web PWA (expense-app-280ee) so all
// existing accounts and Firestore data work unchanged.

import { initializeApp, getApps, getApp } from "firebase/app";
// getReactNativePersistence is provided by the firebase/auth "react-native"
// export condition (Metro resolves it at runtime). The default TS types don't
// always surface it, so we import it loosely.
import {
  initializeAuth,
  getAuth,
  type Auth,
  // @ts-ignore - present in the react-native build of firebase/auth
  getReactNativePersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyApu04Oa4r1kdgJSyy8nvrCVEqH-GVBdc8",
  authDomain: "expense-app-280ee.firebaseapp.com",
  projectId: "expense-app-280ee",
  storageBucket: "expense-app-280ee.firebasestorage.app",
  messagingSenderId: "265762763918",
  appId: "1:265762763918:web:eb917b17450c164978c5df",
  measurementId: "G-3GYSV0VG7D",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// initializeAuth (not getAuth) with AsyncStorage persistence — without this the
// user is signed out on every cold start. Guard against double-init on fast
// refresh by falling back to getAuth.
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

export const db = getFirestore(app);
export { auth };
export default app;
