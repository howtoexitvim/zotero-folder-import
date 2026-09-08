import { describe, expect, it } from "vitest";

import { buildImportPlan, normalizeName } from "../src/core/planner";
import type { SourceFile } from "../src/core/scanner";

function source(relativePath: string, md5: string, size = 10): SourceFile {
  const name = relativePath.split("/").at(-1)!;
  return {
    absolutePath: `/source/${relativePath}`,
    relativePath,
    name,
    extension: name.toLowerCase().endsWith(".epub") ? "epub" : "pdf",
    size,
    mtime: 100,
    md5,
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

  it("classifies same content as reuse before considering a same-name conflict", () => {
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
          size: 10,
          md5: "same",
          collectionIDs: [10],
          hasAnnotations: false,
        },
      ],
    });

    expect(plan.files[0].classification).toBe("reused");
    expect(plan.files[0].existingAttachmentIDs).toEqual([90]);
    expect(plan.summary).toMatchObject({ new: 0, reused: 1, conflict: 0 });
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
          size: 10,
          md5: "old",
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
          size: 10,
          md5: "old",
          collectionIDs: [10],
          hasAnnotations: false,
        },
      ],
    });

    expect(plan.files[0].classification).toBe("new");
  });

  it("plans repeated source content as one new file followed by a source reuse", () => {
    const plan = buildImportPlan({
      rootName: "Root",
      files: [source("a.pdf", "same"), source("sub/b.pdf", "same")],
      collections: [],
      attachments: [],
    });

    expect(plan.files.map((file) => file.classification)).toEqual(["new", "reused"]);
    expect(plan.files[1].sourceDuplicateOf).toBe("a.pdf");
    expect(plan.summary).toMatchObject({ new: 1, reused: 1 });
  });
});

describe("normalizeName", () => {
  it("matches collection and file names case-insensitively after NFC normalization", () => {
    expect(normalizeName("CAFÉ")).toBe(normalizeName("cafe\u0301"));
  });
});
