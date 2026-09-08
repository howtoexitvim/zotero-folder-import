import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { getExistingAttachments, ZoteroImportPort } from "../src/runtime/zotero-port";

const savedGlobals = {
  Zotero: (globalThis as any).Zotero,
  IOUtils: (globalThis as any).IOUtils,
  PathUtils: (globalThis as any).PathUtils,
};

afterEach(() => {
  Object.assign(globalThis as any, savedGlobals);
});

function attachment(id: number, path: string) {
  let childItemsLoaded = false;
  let collectionsLoaded = false;
  return {
    id,
    libraryID: 1,
    parentID: false,
    attachmentContentType: "application/pdf",
    isStoredFileAttachment: () => true,
    getFilePathAsync: async () => path,
    getAnnotations() {
      if (!childItemsLoaded) throw new Error("childItems not loaded");
      return [];
    },
    getCollections() {
      if (!collectionsLoaded) throw new Error("collections not loaded");
      return [7];
    },
    markLoaded(types: string[]) {
      childItemsLoaded ||= types.includes("childItems");
      collectionsLoaded ||= types.includes("collections");
    },
  };
}

describe("getExistingAttachments", () => {
  it("loads names and collections without reading any file content", async () => {
    const first = attachment(1, "/storage/paper.pdf");
    const second = attachment(2, "/storage/other.pdf");
    const items = [first, second];
    let statCalls = 0;
    (globalThis as any).PathUtils = { filename: (path: string) => path.split("/").at(-1)! };
    (globalThis as any).IOUtils = {
      stat: async () => { statCalls += 1; return { size: 10, lastModified: 1 }; },
    };
    (globalThis as any).Zotero = {
      File: { getExtension: () => "pdf" },
      Items: {
        getAll: async () => items,
        loadDataTypes: async (loadedItems: typeof items, types: string[]) => {
          loadedItems.forEach((item) => item.markLoaded(types));
        },
      },
    };

    const result = await getExistingAttachments(1);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 1, name: "paper.pdf", collectionIDs: [7] });
    expect(result[1]).toMatchObject({ id: 2, name: "other.pdf" });
    // Classification is by filename within the destination collection, so
    // nothing needs to be hashed or even stat'ed.
    expect(statCalls).toBe(0);
  });
});

describe("ZoteroImportPort", () => {
  it("loads annotation data before runtime Replace safety checks", async () => {
    const item = attachment(3, "/storage/paper.pdf");
    (globalThis as any).Zotero = {
      Items: {
        getAsync: async () => item,
        loadDataTypes: async (loadedItems: [typeof item], types: string[]) => {
          loadedItems.forEach((loaded) => loaded.markLoaded(types));
        },
      },
    };
    const port = new ZoteroImportPort(1, [], []);

    await expect(port.getAttachmentContext(3)).resolves.toEqual({
      id: 3,
      parentID: false,
      hasAnnotations: false,
    });
  });
});

describe("existing library items are never mutated", () => {
  it("has no code path that renames or re-titles an existing attachment", async () => {
    const port = await readFile(
      new URL("../src/runtime/zotero-port.ts", import.meta.url),
      "utf8",
    );

    // Imports create their own attachment, so nothing in the library is ever
    // renamed. renameAttachmentFile appears only in importStored, where it
    // restores the source filename on a file this run just created.
    const renames = port.match(/renameAttachmentFile/g) ?? [];
    expect(renames).toHaveLength(1);
    expect(port).not.toContain("linkExisting");
  });
});
