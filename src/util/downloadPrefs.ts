// Export download preferences. When "fixed folder" is ON and a folder is chosen,
// PDF/Excel exports write straight to that folder (no picker). When OFF, the
// export asks for a folder each time (the old behavior).

import AsyncStorage from "@react-native-async-storage/async-storage";

const ENABLED_KEY = "dlFolderEnabled";
const URI_KEY = "dlFolderUri";
const NAME_KEY = "dlFolderName";

export interface DownloadPrefs {
  enabled: boolean;
  folderUri: string | null;
  folderName: string | null;
}

export async function getDownloadPrefs(): Promise<DownloadPrefs> {
  try {
    const [e, u, n] = await Promise.all([
      AsyncStorage.getItem(ENABLED_KEY),
      AsyncStorage.getItem(URI_KEY),
      AsyncStorage.getItem(NAME_KEY),
    ]);
    return { enabled: e === "1", folderUri: u, folderName: n };
  } catch {
    return { enabled: false, folderUri: null, folderName: null };
  }
}

export async function setDownloadEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  console.log("[Download] fixed-folder enabled ->", on);
}

export async function setDownloadFolder(uri: string, name: string): Promise<void> {
  await AsyncStorage.multiSet([[URI_KEY, uri], [NAME_KEY, name]]);
  console.log("[Download] folder set ->", name);
}

export async function clearDownloadFolder(): Promise<void> {
  await AsyncStorage.multiRemove([URI_KEY, NAME_KEY]);
}

// Full readable path from a SAF tree URI, e.g.
//   …/tree/primary%3ADownload%2FExpense  ->  "Internal storage/Download/Expense"
//   …/tree/1AB2-3C4D%3AReports           ->  "SD card/Reports"
export function folderLabel(uri: string | null): string {
  if (!uri) return "No folder chosen";
  try {
    const decoded = decodeURIComponent(uri);
    const treeIdx = decoded.indexOf("/tree/");
    let part = treeIdx >= 0 ? decoded.slice(treeIdx + 6) : decoded;
    // Drop any "/document/..." suffix some pickers append.
    const docIdx = part.indexOf("/document/");
    if (docIdx >= 0) part = part.slice(0, docIdx);
    // part looks like "<volume>:<path>"
    const [volume, ...rest] = part.split(":");
    const path = rest.join(":");
    const vol =
      volume === "primary"
        ? "Internal storage"
        : volume === "home"
        ? "Documents"
        : `SD card (${volume})`;
    return path ? `${vol}/${path}` : vol;
  } catch {
    return uri;
  }
}
