import { describe, expect, it } from "vitest";

import { scanFolder, type FileSystemPort } from "../src/core/scanner";

const entries: Record<string, Awaited<ReturnType<FileSystemPort["list"]>>> = {
  "/papers": [
    { name: ".hidden.pdf", path: "/papers/.hidden.pdf", kind: "file" },
    { name: "notes.md", path: "/papers/notes.md", kind: "file" },
    { name: "paper.PDF", path: "/papers/paper.PDF", kind: "file" },
    { name: "shortcut.lnk", path: "/papers/shortcut.lnk", kind: "file" },
    { name: "sub", path: "/papers/sub", kind: "directory" },
    { name: "linked", path: "/papers/linked", kind: "directory", symlink: true },
  ],
  "/papers/sub": [
    { name: "book.epub", path: "/papers/sub/book.epub", kind: "file" },
  ],
};

const fs: FileSystemPort = {
  async list(path) {
    return entries[path] ?? [];
  },
  async stat(path) {
    if (path.endsWith("paper.PDF")) return { size: 10, mtime: 100 };
    if (path.endsWith("book.epub")) return { size: 20, mtime: 200 };
    return { size: 1, mtime: 1 };
  },
};

describe("scanFolder", () => {
  it("recursively includes PDF and EPUB while skipping hidden entries and links", async () => {
    const result = await scanFolder("/papers", fs);

    expect(result.files).toEqual([
      {
        absolutePath: "/papers/paper.PDF",
        relativePath: "paper.PDF",
        name: "paper.PDF",
        extension: "pdf",
        size: 10,
        mtime: 100,
      },
      {
        absolutePath: "/papers/sub/book.epub",
        relativePath: "sub/book.epub",
        name: "book.epub",
        extension: "epub",
        size: 20,
        mtime: 200,
      },
    ]);
    expect(result.unsupportedCount).toBe(2);
    expect(result.errors).toEqual([]);
  });
});
