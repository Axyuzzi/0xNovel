interface ChapterDirectoryScrollStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const memoryPositions = new Map<string, number>();
const STORAGE_PREFIX = "consumer-chapter-directory-scroll";

function storageKey(novelId: string): string {
  return `${STORAGE_PREFIX}:${novelId}`;
}

function normalizePosition(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function readChapterDirectoryScrollPosition(
  novelId: string,
  storage?: ChapterDirectoryScrollStorage,
): number {
  const key = storageKey(novelId);
  const memoryPosition = memoryPositions.get(key);
  if (memoryPosition !== undefined) {
    return memoryPosition;
  }

  if (!storage) {
    return 0;
  }

  try {
    const storedPosition = Number(storage.getItem(key));
    const position = normalizePosition(storedPosition);
    memoryPositions.set(key, position);
    return position;
  } catch {
    return 0;
  }
}

export function writeChapterDirectoryScrollPosition(
  novelId: string,
  position: number,
  storage?: ChapterDirectoryScrollStorage,
): void {
  const key = storageKey(novelId);
  const normalizedPosition = normalizePosition(position);
  memoryPositions.set(key, normalizedPosition);

  try {
    storage?.setItem(key, String(normalizedPosition));
  } catch {
    // The in-memory value still preserves the position for this app session.
  }
}
