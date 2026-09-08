import { describe, expect, it } from "vitest";

import {
  allConflictsResolved,
  applyConflictChoice,
  makeUniqueName,
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
  it("applies a choice only to the selected conflict when apply-all is off", () => {
    const result = applyConflictChoice([conflict("a.pdf", true), conflict("b.pdf", true)], 0, "ignore", false);

    expect(result.map((file) => file.conflictAction)).toEqual(["ignore", "unresolved"]);
    expect(allConflictsResolved(result)).toBe(false);
  });

  it("applies a choice to remaining conflicts only for the current plan", () => {
    const original = [conflict("a.pdf", true), conflict("b.pdf", true)];
    const result = applyConflictChoice(original, 0, "keep-both", true);

    expect(result.map((file) => file.conflictAction)).toEqual(["keep-both", "keep-both"]);
    expect(original.map((file) => file.conflictAction)).toEqual(["unresolved", "unresolved"]);
  });

  it("does not apply replace to conflicts whose existing attachment has annotations", () => {
    const result = applyConflictChoice([conflict("a.pdf", true), conflict("b.pdf", false)], 0, "replace", true);

    expect(result.map((file) => file.conflictAction)).toEqual(["replace", "unresolved"]);
  });
});

describe("makeUniqueName", () => {
  it("uses the first available deterministic numeric suffix", () => {
    expect(makeUniqueName("paper.pdf", ["paper.pdf", "paper (2).pdf", "PAPER (3).PDF"]))
      .toBe("paper (4).pdf");
  });
});
