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

  it("registers the Fluent files so dialog labels are not blank", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../addon/manifest.json", import.meta.url), "utf8"),
    );

    expect(manifest.localization).toContain("locale/{locale}/folder-import.ftl");
  });

  it("points the dialog at the registered localization resource", async () => {
    const dialog = await readFile(
      new URL("../addon/content/dialog.xhtml", import.meta.url),
      "utf8",
    );

    // A bare "folder-import.ftl" href does not resolve to the registered
    // resource, leaving every data-l10n-id element blank.
    expect(dialog).toContain('href="locale/folder-import.ftl"');
  });

  it("keeps the built XPI filename in step with the manifest version", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../addon/manifest.json", import.meta.url), "utf8"),
    );
    const buildScript = await readFile(
      new URL("../scripts/build.mjs", import.meta.url),
      "utf8",
    );

    expect(buildScript).not.toContain(`folder-import-${manifest.version}.xpi"`);
    expect(buildScript).toContain("folder-import-${manifest.version}.xpi");
  });
});
