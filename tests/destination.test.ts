import { describe, expect, it } from "vitest";

import { resolveDestination } from "../src/core/destination";

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

  it("routes a special My Library view to the library root", () => {
    expect(resolveDestination([{ type: "duplicates", libraryID: 1 }], 1).baseCollectionID)
      .toBeUndefined();
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
