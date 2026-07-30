import assert from "node:assert/strict";
import test from "node:test";
import { countConsumerChapterCharacters } from "@0xnovelagent/shared/types/consumerWorkspace";
import { chapterDirectoryLabel } from "./chapterDirectoryLabel.ts";

test("chapter directory keeps the chapter number when an AI title replaces the placeholder", () => {
  assert.equal(
    chapterDirectoryLabel({ order: 2, title: "账房困局" }),
    "第 2 章 · 账房困局",
  );
});

test("chapter directory does not repeat an existing chapter prefix", () => {
  assert.equal(
    chapterDirectoryLabel({ order: 1, title: "第一章 烂账与破局" }),
    "第 1 章 · 烂账与破局",
  );
  assert.equal(
    chapterDirectoryLabel({ order: 3, title: "第 3 章" }),
    "第 3 章",
  );
});

test("chapter word count excludes layout whitespace", () => {
  assert.equal(
    countConsumerChapterCharacters("第一段。\n\n第二段。 "),
    8,
  );
});
