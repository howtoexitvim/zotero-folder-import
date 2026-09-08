import { describe, expect, it } from "vitest";

import { canImportInto, resolveDestination } from "../src/core/destination";

describe("resolveDestination", () => {
  it("uses My Library as a root destination", () => {
    expect(resolveDestination([{ type: "library", libraryID: 1 }], 1)).toEqual({
      libraryID: 1,
      baseCollectionID: undefined,
      baseLabel: "My Library",
    });
  });

  it("uses a selected collection as the parent destination", () => {
    expect(resolveDestination([{
      type: "collection",
      libraryID: 1,
      collectionID: 20,
      collectionPath: "Publishing / CoRL_Conf",
    }], 1)).toEqual({
      libraryID: 1,
      baseCollectionID: 20,
      baseLabel: "My Library / Publishing / CoRL_Conf",
    });
  });

  it("rejects special views that cannot receive files", () => {
    // My Publications, Duplicate Items, Unfiled Items, Trash and friends are
    // views over existing items; importing into them used to fall back to the
    // library root, which silently filed things somewhere the user never chose.
    for (const type of ["publications", "duplicates", "unfiled", "trash", "search", "retracted", "recentlyRead", "feed"]) {
      expect(() => resolveDestination([{ type, libraryID: 1 }], 1))
        .toThrow("Select My Library or a collection");
    }
  });

  it("rejects multiple selections and non-user libraries", () => {
    expect(() => resolveDestination([], 1)).toThrow("Select exactly one");
    expect(() => resolveDestination([
      { type: "library", libraryID: 1 },
      { type: "collection", libraryID: 1, collectionID: 2 },
    ], 1)).toThrow("Select exactly one");
    expect(() => resolveDestination([{ type: "library", libraryID: 5 }], 1))
      .toThrow("My Library only");
  });
});

describe("canImportInto", () => {
  it("accepts My Library and collections only", () => {
    expect(canImportInto({ type: "library", libraryID: 1 }, 1)).toBe(true);
    expect(canImportInto({ type: "collection", libraryID: 1, collectionID: 2 }, 1)).toBe(true);

    for (const type of ["publications", "duplicates", "unfiled", "trash", "search", "feed", "group"]) {
      expect(canImportInto({ type, libraryID: 1 }, 1)).toBe(false);
    }
    expect(canImportInto({ type: "library", libraryID: 9 }, 1)).toBe(false);
    expect(canImportInto(undefined, 1)).toBe(false);
  });
});
