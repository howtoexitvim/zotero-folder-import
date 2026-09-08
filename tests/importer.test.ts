import { describe, expect, it } from "vitest";

import { executeImport, type ImportPort } from "../src/core/importer";
import type { ImportPlan, PlannedFile } from "../src/core/planner";

function planned(overrides: Partial<PlannedFile> = {}): PlannedFile {
  return {
    absolutePath: "/source/paper.pdf",
    relativePath: "paper.pdf",
    name: "paper.pdf",
    extension: "pdf",
    size: 10,
    mtime: 100,
    md5: "hash",
    target: { segments: ["Root"], existingCollectionID: 7 },
    classification: "new",
    existingAttachmentIDs: [],
    ...overrides,
  };
}

function plan(files: PlannedFile[]): ImportPlan {
  return {
    rootName: "Root",
    files,
    collectionsToCreate: [],
    summary: {
      total: files.length,
      bytes: files.reduce((sum, file) => sum + file.size, 0),
      new: files.filter((file) => file.classification === "new").length,
      reused: files.filter((file) => file.classification === "reused").length,
      conflict: files.filter((file) => file.classification === "conflict").length,
    },
  };
}

function fakePort(options: { failImportPath?: string } = {}) {
  const events: string[] = [];
  let nextID = 100;
  const port: ImportPort = {
    async stat() {
      return { size: 10, mtime: 100 };
    },
    async ensureCollection(_base, segments) {
      events.push(`collection:${segments.join("/")}`);
      return 7;
    },
    async getAttachmentContext(id) {
      return { id, parentID: 50, hasAnnotations: false };
    },
    async importStored(request) {
      events.push(`import:${request.path}:${request.name}:parent=${request.parentItemID ?? "none"}`);
      if (request.path === options.failImportPath) throw new Error("copy failed");
      return nextID++;
    },
    async linkExisting(id, collectionID, name, renameToSource = true) {
      events.push(`link:${id}:${collectionID}:${name}:rename=${renameToSource}`);
    },
    async trashAttachments(ids) {
      events.push(`trash:${ids.join(",")}`);
    },
    async occupiedNames() {
      return ["paper.pdf", "paper (2).pdf"];
    },
    async indexAttachments(ids) {
      events.push(`index:${ids.join(",")}`);
    },
  };
  return { port, events };
}

describe("executeImport", () => {
  it("refuses an unresolved conflict before performing any write", async () => {
    const { port, events } = fakePort();
    const input = plan([planned({ classification: "conflict", conflictAction: "unresolved" })]);

    await expect(executeImport(input, port)).rejects.toThrow("unresolved conflict");
    expect(events).toEqual([]);
  });

  it("reuses one matching attachment and preserves the source filename", async () => {
    const { port, events } = fakePort();
    const input = plan([planned({ classification: "reused", existingAttachmentIDs: [22, 11] })]);

    const result = await executeImport(input, port);

    expect(events).toEqual(["collection:Root", "link:11:7:paper.pdf:rename=true"]);
    expect(result.reused).toBe(1);
  });

  it("imports a replacement successfully before trashing the old attachment", async () => {
    const { port, events } = fakePort();
    const input = plan([planned({
      classification: "conflict",
      conflictAction: "replace",
      replaceAllowed: true,
      existingAttachmentIDs: [9],
    })]);

    const result = await executeImport(input, port);

    expect(events).toEqual([
      "collection:Root",
      "import:/source/paper.pdf:paper.pdf:parent=50",
      "link:100:7:paper.pdf:rename=true",
      "trash:9",
      "index:100",
    ]);
    expect(result.replaced).toBe(1);
  });

  it("keeps both by selecting the first available numeric suffix", async () => {
    const { port, events } = fakePort();
    const input = plan([planned({
      classification: "conflict",
      conflictAction: "keep-both",
      replaceAllowed: false,
      existingAttachmentIDs: [9],
    })]);

    const result = await executeImport(input, port);

    expect(events).toContain("import:/source/paper.pdf:paper (3).pdf:parent=none");
    expect(result.keptBoth).toBe(1);
  });

  it("skips a file changed since preview and continues with later files", async () => {
    const { port, events } = fakePort();
    port.stat = async (path) => path.includes("changed")
      ? { size: 11, mtime: 101 }
      : { size: 10, mtime: 100 };
    const input = plan([
      planned({ absolutePath: "/source/changed.pdf", relativePath: "changed.pdf", name: "changed.pdf" }),
      planned({ absolutePath: "/source/good.pdf", relativePath: "good.pdf", name: "good.pdf" }),
    ]);

    const result = await executeImport(input, port);

    expect(result.failed).toBe(1);
    expect(result.imported).toBe(1);
    expect(events.some((event) => event.includes("changed.pdf"))).toBe(false);
    expect(events.some((event) => event.includes("good.pdf"))).toBe(true);
  });

  it("does not trash an old attachment when replacement import fails", async () => {
    const { port, events } = fakePort({ failImportPath: "/source/paper.pdf" });
    const input = plan([planned({
      classification: "conflict",
      conflictAction: "replace",
      replaceAllowed: true,
      existingAttachmentIDs: [9],
    })]);

    const result = await executeImport(input, port);

    expect(result.failed).toBe(1);
    expect(events).not.toContain("trash:9");
  });

  it("imports repeated source content once and links it to later target collections", async () => {
    const { port, events } = fakePort();
    const input = plan([
      planned({ md5: "same" }),
      planned({
        absolutePath: "/source/sub/alias.pdf",
        relativePath: "sub/alias.pdf",
        name: "alias.pdf",
        md5: "same",
        target: { segments: ["Root", "sub"] },
        classification: "reused",
        existingAttachmentIDs: [],
        sourceDuplicateOf: "paper.pdf",
      }),
    ]);

    const result = await executeImport(input, port);

    expect(events.filter((event) => event.startsWith("import:"))).toHaveLength(1);
    expect(events).toContain("link:100:7:alias.pdf:rename=false");
    expect(result).toMatchObject({ imported: 1, reused: 1 });
  });
});
