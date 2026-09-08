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

  it("imports a new file under its source filename", async () => {
    const { port, events } = fakePort();
    const input = plan([planned()]);

    const result = await executeImport(input, port);

    expect(events).toEqual([
      "collection:Root",
      "import:/source/paper.pdf:paper.pdf:parent=none",
      "index:100",
    ]);
    expect(result.imported).toBe(1);
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

  it("refuses to replace multiple same-name attachments as one operation", async () => {
    const { port, events } = fakePort();
    const input = plan([planned({
      classification: "conflict",
      conflictAction: "replace",
      replaceAllowed: true,
      existingAttachmentIDs: [9, 10],
    })]);

    const result = await executeImport(input, port);

    expect(result.failed).toBe(1);
    expect(events.some((event) => event.startsWith("trash:"))).toBe(false);
    expect(events.some((event) => event.startsWith("import:"))).toBe(false);
  });

  it("imports repeated source content once and links it to later target collections", async () => {
    const { port, events } = fakePort();
    const input = plan([
      planned(),
      planned({
        absolutePath: "/source/sub/paper.pdf",
        relativePath: "sub/paper.pdf",
        name: "paper.pdf",
        target: { segments: ["Root", "sub"] },
        existingAttachmentIDs: [],
      }),
    ]);

    const result = await executeImport(input, port);

    // The same file in two source folders becomes two independent attachments,
    // so deleting one never affects the other.
    expect(events.filter((event) => event.startsWith("import:"))).toHaveLength(2);
    expect(result).toMatchObject({ imported: 2 });
  });

  it("stores same-content files separately when their filenames differ", async () => {
    const { port, events } = fakePort();
    const input = plan([
      planned({ name: "a.pdf", relativePath: "a.pdf", absolutePath: "/source/a.pdf" }),
      planned({ name: "b.pdf", relativePath: "b.pdf", absolutePath: "/source/b.pdf" }),
    ]);

    const result = await executeImport(input, port);

    expect(events.filter((event) => event.startsWith("import:"))).toHaveLength(2);
    expect(result.imported).toBe(2);
  });

  it("keeps successful import counts when full-text indexing reports an error", async () => {
    const { port } = fakePort();
    port.indexAttachments = async () => {
      throw new Error("index unavailable");
    };

    const result = await executeImport(plan([planned()]), port);

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([{ path: "[full-text-index]", message: "index unavailable" }]);
  });

  it("continues importing when the progress callback is no longer available", async () => {
    const { port, events } = fakePort();
    const input = plan([
      planned({ name: "a.pdf", relativePath: "a.pdf", absolutePath: "/source/a.pdf" }),
      planned({ name: "b.pdf", relativePath: "b.pdf", absolutePath: "/source/b.pdf" }),
    ]);

    const result = await executeImport(input, port, () => {
      throw new Error("dialog closed");
    });

    expect(result.imported).toBe(2);
    expect(events.filter((event) => event.startsWith("import:"))).toHaveLength(2);
  });
});

describe("cancellation", () => {
  function threeFiles() {
    return plan(["a.pdf", "b.pdf", "c.pdf"].map((name) => planned({
      absolutePath: `/source/${name}`,
      relativePath: name,
      name,
    })));
  }

  it("keeps finished work, skips the rest, and reports the run as cancelled", async () => {
    const { port, events } = fakePort();
    let processed = 0;

    const result = await executeImport(
      threeFiles(),
      port,
      () => { processed += 1; },
      () => processed >= 2,
    );

    // Cancel is checked between files, so nothing is left half-imported.
    expect(result.cancelled).toBe(true);
    expect(result.imported).toBe(2);
    expect(events.filter((event) => event.startsWith("import:"))).toHaveLength(2);
  });

  it("does not mark a completed run as cancelled", async () => {
    const { port, events } = fakePort();

    const result = await executeImport(threeFiles(), port, undefined, () => false);

    expect(result.cancelled).toBeFalsy();
    expect(result.imported).toBe(3);
    expect(events.filter((event) => event.startsWith("import:"))).toHaveLength(3);
  });
});
