import assert from "node:assert/strict";
import test from "node:test";
import {
  readChapterDirectoryScrollPosition,
  writeChapterDirectoryScrollPosition,
} from "./chapterDirectoryScroll.ts";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("chapter directory keeps an independent scroll position for each novel", () => {
  const storage = createStorage();

  writeChapterDirectoryScrollPosition("novel-scroll-a", 486, storage);
  writeChapterDirectoryScrollPosition("novel-scroll-b", 129, storage);

  assert.equal(
    readChapterDirectoryScrollPosition("novel-scroll-a", storage),
    486,
  );
  assert.equal(
    readChapterDirectoryScrollPosition("novel-scroll-b", storage),
    129,
  );
});

test("chapter directory normalizes invalid scroll positions", () => {
  const storage = createStorage();

  writeChapterDirectoryScrollPosition("novel-scroll-invalid", Number.NaN, storage);
  writeChapterDirectoryScrollPosition("novel-scroll-negative", -20, storage);

  assert.equal(
    readChapterDirectoryScrollPosition("novel-scroll-invalid", storage),
    0,
  );
  assert.equal(
    readChapterDirectoryScrollPosition("novel-scroll-negative", storage),
    0,
  );
});
