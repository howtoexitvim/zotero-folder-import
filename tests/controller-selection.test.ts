import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("collection tree selection", () => {
  it("reads the selected row, not every row in the tree", async () => {
    const controller = await readFile(
      new URL("../src/runtime/controller.ts", import.meta.url),
      "utf8",
    );

    // getCollectionTreeRows() (plural) returns the whole tree, so
    // resolveDestination always saw more than one row and threw
    // "Select exactly one ..." on every invocation.
    expect(controller).toContain("getCollectionTreeRow()");
    expect(controller).not.toContain("getCollectionTreeRows()");
  });
});
