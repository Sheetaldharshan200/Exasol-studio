// localStorage that never throws (private windows, storage turned off):
// remembered layouts and lists are conveniences, so a failure just forgets.

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* not remembered */
    }
  },
};
