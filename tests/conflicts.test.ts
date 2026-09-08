import { describe, expect, it } from "vitest";

import {
  allConflictsResolved,
  applyConflictChoice,
  makeUniqueName,
  setAllConflicts,
} from "../src/core/conflicts";
import type { PlannedFile } from "../src/core/planner";

function conflict(path: string, replaceAllowed: boolean): PlannedFile {
  const name = path.split("/").at(-1)!;
  return {
    absolutePath: `/source/${path}`,
    relativePath: path,
    name,
    extension: "pdf",
    size: 10,
    mtime: 100,
    target: { segments: ["Root"] },
    classification: "conflict",
    existingAttachmentIDs: [1],
    conflictAction: "unresolved",
    replaceAllowed,
  };
}

describe("applyConflictChoice", () => {
  it("applies a choice only to the selected conflict", () => {
    const result = applyConflictChoice([conflict("a.pdf", true), conflict("b.pdf", true)], 0, "ignore");

    expect(result.map((file) => file.conflictAction)).toEqual(["ignore", "unresolved"]);
    expect(allConflictsResolved(result)).toBe(false);
  });

  it("refuses replace on a conflict whose existing attachment has annotations", () => {
    const result = applyConflictChoice([conflict("a.pdf", false)], 0, "replace");

    expect(result[0].conflictAction).toBe("unresolved");
  });
});

describe("setAllConflicts", () => {
  it("applies to every conflict, not only the undecided ones", () => {
    const original = [conflict("a.pdf", true), conflict("b.pdf", true)];
    const once = setAllConflicts(original, "ignore");

    // The old apply-to-remaining checkbox only touched unresolved rows, so a
    // second use silently did nothing and changing your mind was impossible.
    const twice = setAllConflicts(once, "keep-both");

    expect(twice.map((file) => file.conflictAction)).toEqual(["keep-both", "keep-both"]);
    expect(original.map((file) => file.conflictAction)).toEqual(["unresolved", "unresolved"]);
  });

  it("leaves annotation-protected conflicts untouched when setting replace", () => {
    const result = setAllConflicts([conflict("a.pdf", true), conflict("b.pdf", false)], "replace");

    expect(result.map((file) => file.conflictAction)).toEqual(["replace", "unresolved"]);
  });
});

describe("makeUniqueName", () => {
  it("uses the first available deterministic numeric suffix", () => {
    expect(makeUniqueName("paper.pdf", ["paper.pdf", "paper (2).pdf", "PAPER (3).PDF"]))
      .toBe("paper (4).pdf");
  });
});
