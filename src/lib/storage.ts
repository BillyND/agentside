// chrome.storage.local wrappers that never throw (storage may be unavailable).
export async function getLocal<T>(key: string): Promise<T | undefined> {
  try {
    return (await chrome.storage.local.get(key))[key] as T | undefined;
  } catch {
    return undefined;
  }
}

export function setLocal(key: string, value: unknown) {
  try {
    chrome.storage.local.set({ [key]: value });
  } catch {}
}
