import { afterEach, describe, expect, it } from "vitest";

import { getExistingAttachments, ZoteroImportPort } from "../src/runtime/zotero-port";
import type { SourceFile } from "../src/core/scanner";

const savedGlobals = {
  Zotero: (globalThis as any).Zotero,
  IOUtils: (globalThis as any).IOUtils,
  PathUtils: (globalThis as any).PathUtils,
};

afterEach(() => {
  Object.assign(globalThis as any, savedGlobals);
});

function source(): SourceFile {
  return {
    absolutePath: "/source/paper.pdf",
    relativePath: "paper.pdf",
    name: "paper.pdf",
    extension: "pdf",
    size: 10,
    mtime: 100,
    md5: "source-hash",
  };
}

function attachment(id: number, path: string, size: number, hash: string | Error) {
  let childItemsLoaded = false;
  let collectionsLoaded = false;
  return {
    id,
    libraryID: 1,
    parentID: false,
    attachmentContentType: "application/pdf",
    attachmentSyncedHash: null,
    attachmentSyncedModificationTime: null,
    isStoredFileAttachment: () => true,
    getFilePathAsync: async () => path,
    get attachmentHash() {
      return hash instanceof Error ? Promise.reject(hash) : Promise.resolve(hash);
    },
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
    size,
  };
}

describe("getExistingAttachments", () => {
  it("loads required Zotero data and continues after one existing hash fails", async () => {
    const broken = attachment(1, "/storage/broken.pdf", 10, new Error("unreadable"));
    const unrelated = attachment(2, "/storage/other.pdf", 20, "unused");
    const items = [broken, unrelated];
    (globalThis as any).PathUtils = { filename: (path: string) => path.split("/").at(-1)! };
    (globalThis as any).IOUtils = {
      stat: async (path: string) => ({ size: path.includes("broken") ? 10 : 20, lastModified: 1 }),
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
    const errors: Array<{ path: string; message: string }> = [];

    const result = await getExistingAttachments(1, [source()], (error) => errors.push(error));

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 1, md5: "", collectionIDs: [7] });
    expect(result[1]).toMatchObject({ id: 2, name: "other.pdf" });
    expect(errors).toEqual([{
      path: "/storage/broken.pdf",
      message: "Unable to hash existing attachment: unreadable",
    }]);
  });
});

describe("ZoteroImportPort", () => {
  it("loads annotation data before runtime Replace safety checks", async () => {
    const item = attachment(3, "/storage/paper.pdf", 10, "hash");
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

describe("reuse never mutates existing library items", () => {
  it("adds the item to the collection without renaming it", async () => {
    const calls: string[] = [];
    const item = {
      id: 5,
      parentID: false,
      isStoredFileAttachment: () => true,
      getFilePathAsync: async () => "/storage/User Chosen Name.pdf",
      inCollection: () => false,
      addToCollection: (id: number) => calls.push(`addToCollection:${id}`),
      saveTx: async () => calls.push("saveTx"),
      renameAttachmentFile: async () => {
        calls.push("renameAttachmentFile");
        return true;
      },
      setField: () => calls.push("setField"),
    };
    (globalThis as any).PathUtils = { filename: (p: string) => p.split("/").at(-1)! };
    (globalThis as any).Zotero = {
      Items: { getAsync: async () => item, loadDataTypes: async () => {} },
    };

    const port = new ZoteroImportPort(1, [], []);
    await port.linkExisting(5, 7, "Folder Name.pdf");

    // An item already filed elsewhere keeps the name the user gave it.
    expect(calls).not.toContain("renameAttachmentFile");
    expect(calls).not.toContain("setField");
    expect(calls).toContain("addToCollection:7");
  });
});
