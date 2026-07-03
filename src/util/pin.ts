// App-lock PIN storage backed by expo-secure-store (encrypted Keychain/Keystore).
// Works in Expo Go. The 4-digit PIN is kept in secure storage, not AsyncStorage.

import * as SecureStore from "expo-secure-store";

const PIN_KEY = "app_lock_pin";

export const PIN_LENGTH = 4;

export async function hasPin(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(PIN_KEY)) != null;
  } catch {
    return false;
  }
}

export async function savePin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(PIN_KEY, pin);
}

export async function verifyPin(pin: string): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync(PIN_KEY);
    return stored != null && stored === pin;
  } catch {
    return false;
  }
}

export async function clearPin(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PIN_KEY);
  } catch {}
}
