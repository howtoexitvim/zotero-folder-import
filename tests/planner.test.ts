import { describe, expect, it } from "vitest";

import { buildImportPlan, normalizeName } from "../src/core/planner";
import type { SourceFile } from "../src/core/scanner";

function source(relativePath: string, _md5 = "", size = 10): SourceFile {
  const name = relativePath.split("/").at(-1)!;
  return {
    absolutePath: `/source/${relativePath}`,
    relativePath,
    name,
    extension: name.toLowerCase().endsWith(".epub") ? "epub" : "pdf",
    size,
    mtime: 100,
  };
}

describe("buildImportPlan", () => {
  it("maps the source root below the selected collection and reuses matching collection names", () => {
    const plan = buildImportPlan({
      rootName: "Award_Papers",
      baseCollectionID: 5,
      files: [source("Best/Sub/Paper.pdf", "aaa")],
      collections: [
        { id: 10, libraryID: 1, parentID: 5, name: "award_papers" },
        { id: 11, libraryID: 1, parentID: 10, name: "Best" },
      ],
      attachments: [],
    });

    expect(plan.files[0].target).toEqual({
      segments: ["Award_Papers", "Best", "Sub"],
      existingCollectionID: undefined,
    });
    expect(plan.collectionsToCreate).toEqual([
      ["Award_Papers", "Best", "Sub"],
    ]);
  });

  it("treats a same-name file in the destination as a conflict, whatever its content", () => {
    const plan = buildImportPlan({
      rootName: "Award_Papers",
      baseCollectionID: 5,
      files: [source("Paper.pdf", "same")],
      collections: [{ id: 10, libraryID: 1, parentID: 5, name: "Award_Papers" }],
      attachments: [
        {
          id: 90,
          parentID: 80,
          name: "Paper.pdf",
          collectionIDs: [10],
          hasAnnotations: false,
        },
      ],
    });

    // Identical content elsewhere in the library is irrelevant: only the
    // destination collection is consulted, and only by filename.
    expect(plan.files[0].classification).toBe("conflict");
    expect(plan.files[0].existingAttachmentIDs).toEqual([90]);
    expect(plan.summary).toMatchObject({ new: 0, conflict: 1 });
  });

  it("marks a different-content same-name attachment as an unresolved conflict", () => {
    const plan = buildImportPlan({
      rootName: "Award_Papers",
      baseCollectionID: 5,
      files: [source("Paper.pdf", "new")],
      collections: [{ id: 10, libraryID: 1, parentID: 5, name: "Award_Papers" }],
      attachments: [
        {
          id: 90,
          name: "paper.PDF",
          collectionIDs: [10],
          hasAnnotations: true,
        },
      ],
    });

    expect(plan.files[0]).toMatchObject({
      classification: "conflict",
      conflictAction: "unresolved",
      existingAttachmentIDs: [90],
      replaceAllowed: false,
    });
  });

  it("disables bulk replacement when multiple existing attachments share the name", () => {
    const plan = buildImportPlan({
      rootName: "Root",
      files: [source("Paper.pdf", "new")],
      collections: [{ id: 10, libraryID: 1, name: "Root" }],
      attachments: [
        { id: 1, name: "paper.pdf", collectionIDs: [10], hasAnnotations: false },
        { id: 2, name: "PAPER.PDF", collectionIDs: [10], hasAnnotations: false },
      ],
    });

    expect(plan.files[0]).toMatchObject({ classification: "conflict", replaceAllowed: false });
  });

  it("treats a changed name and changed content as a new file", () => {
    const plan = buildImportPlan({
      rootName: "Award_Papers",
      baseCollectionID: 5,
      files: [source("Renamed.pdf", "new")],
      collections: [{ id: 10, libraryID: 1, parentID: 5, name: "Award_Papers" }],
      attachments: [
        {
          id: 90,
          name: "Old.pdf",
          collectionIDs: [10],
          hasAnnotations: false,
        },
      ],
    });

    expect(plan.files[0].classification).toBe("new");
  });

  it("imports the same file into two source folders as two independent copies", () => {
    const plan = buildImportPlan({
      rootName: "Root",
      files: [source("a/paper.pdf", "same"), source("b/paper.pdf", "same")],
      collections: [],
      attachments: [],
    });

    // Two folders means two destination collections, so each gets its own
    // attachment -- deleting one never affects the other.
    expect(plan.files.map((file) => file.classification)).toEqual(["new", "new"]);
    expect(plan.summary).toMatchObject({ new: 2, conflict: 0 });
  });

  it("keeps same-content files separate when their source filenames differ", () => {
    const plan = buildImportPlan({
      rootName: "Root",
      files: [source("a.pdf", "same"), source("b.pdf", "same")],
      collections: [],
      attachments: [],
    });

    expect(plan.files.map((file) => file.classification)).toEqual(["new", "new"]);
  });
});

describe("normalizeName", () => {
  it("matches collection and file names case-insensitively after NFC normalization", () => {
    expect(normalizeName("CAFÉ")).toBe(normalizeName("cafe\u0301"));
  });
});
