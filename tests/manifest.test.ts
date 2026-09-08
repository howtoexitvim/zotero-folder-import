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

  it("references Fluent files by bare filename", async () => {
    const dialog = await readFile(
      new URL("../addon/content/dialog.xhtml", import.meta.url),
      "utf8",
    );

    // Zotero auto-registers locale/<locale>/*.ftl for every plugin and keys the
    // resource by bare filename (Zotero.Plugins registerLocales), so the href
    // must not carry a locale/ prefix and the manifest needs no localization
    // key of its own.
    expect(dialog).toContain('href="folder-import.ftl"');
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
