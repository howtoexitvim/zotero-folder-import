import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Zotero install manifest", () => {
  it("declares the update URL required by Zotero 10's add-on installer", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../addon/manifest.json", import.meta.url), "utf8"),
    );

    expect(manifest.applications.zotero.update_url).toBe(
      "https://folder-import.shuqi.invalid/updates.json",
    );
  });
});
