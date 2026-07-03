// Auth state + user profile, shared app-wide. Subscribes to onAuthStateChanged
// (persisted via AsyncStorage) and loads the user's Firestore profile.

import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "firebase/auth";
import { onAuth } from "../firebase/auth";
import { getUser } from "../firebase/firestore";
import { isAdmin as checkAdmin } from "../constants/admin";
import { UserDoc } from "../types";

interface AuthContextValue {
  user: User | null;
  profile: UserDoc | null;
  isAdmin: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (u: User | null) => {
    if (!u) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await getUser(u.uid));
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    const unsub = onAuth((u) => {
      setUser(u);
      // Unblock the splash immediately once auth state is known — don't wait on
      // the Firestore profile fetch. Screens read `profile` reactively and update
      // as soon as it arrives, so the app opens fast instead of hanging on a
      // network round-trip.
      setLoading(false);
      loadProfile(u);
    });
    return unsub;
  }, []);

  const refreshProfile = async () => loadProfile(user);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin: checkAdmin(user),
        loading,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
