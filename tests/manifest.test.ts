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

  it("uses a XUL window root, as every Zotero dialog does", async () => {
    const dialog = await readFile(
      new URL("../addon/content/dialog.xhtml", import.meta.url),
      "utf8",
    );

    // All 26 dialogs shipped in Zotero 10 use a XUL <window> root. An HTML
    // root opened via openDialog() in a chrome context renders an empty
    // window and never runs the page script.
    expect(dialog).toContain(
      'xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"',
    );
    expect(dialog).toMatch(/<window[\s>]/);
    expect(dialog).not.toMatch(/<html xmlns="http:\/\/www\.w3\.org\/1999\/xhtml">/);
  });

  it("bootstraps from the window's onload handler", async () => {
    const dialog = await readFile(
      new URL("../addon/content/dialog.xhtml", import.meta.url),
      "utf8",
    );
    const script = await readFile(
      new URL("../src/dialog.ts", import.meta.url),
      "utf8",
    );

    expect(dialog).toContain('onload="FolderImportDialog.init()"');
    expect(script).toContain("FolderImportDialog");
  });

  it("only uses HTML tags the XUL parser actually builds", async () => {
    const dialog = await readFile(
      new URL("../addon/content/dialog.xhtml", import.meta.url),
      "utf8",
    );

    // Mixing HTML into the XUL window body made the parser drop the whole
    // subtree (documentElement reported children=0 with readyState=complete).
    // The working reference plugin's dialog is pure XUL apart from the
    // localization <link>, so keep html: usage down to that plus <progress>,
    // which has no XUL equivalent.
    const allowed = new Set(["link", "progress"]);
    const used = [...dialog.matchAll(/<html:([a-z0-9]+)/g)].map((m) => m[1]);

    expect([...new Set(used)].filter((tag) => !allowed.has(tag))).toEqual([]);
  });

  it("creates runtime elements in the HTML namespace", async () => {
    const script = await readFile(
      new URL("../src/dialog.ts", import.meta.url),
      "utf8",
    );

    // The plain createElement() in a XUL document builds XUL elements, which
    // would render nothing for <li>/<select>/<option>. Strip comments first so
    // prose mentioning the API does not trip the assertion.
    const code = script.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

    expect(code).not.toMatch(/document\.createElement(?!NS)/);
    expect(code).toContain("createElementNS(HTML_NS");
  });

  it("labels the checkbox from script, not data-l10n-id", async () => {
    const dialog = await readFile(
      new URL("../addon/content/dialog.xhtml", import.meta.url),
      "utf8",
    );
    const script = await readFile(
      new URL("../src/dialog.ts", import.meta.url),
      "utf8",
    );

    // DOM localization clears a XUL checkbox's built-in label before the
    // plugin bundle resolves, so the box rendered with no text at all.
    const checkbox = dialog.match(/<checkbox[^>]*>/)?.[0] ?? "";
    expect(checkbox).not.toContain("data-l10n-id");
    expect(checkbox).toContain("label=");
    expect(script).toContain('byId("apply-all").setAttribute("label"');
  });

  it("keeps long paths from widening the window", async () => {
    const dialog = await readFile(
      new URL("../addon/content/dialog.xhtml", import.meta.url),
      "utf8",
    );
    const script = await readFile(
      new URL("../src/dialog.ts", import.meta.url),
      "utf8",
    );

    // Each path is its own flexible row that crops in the middle, with the
    // full value kept on the tooltip.
    expect(dialog).toMatch(/id="source-path"[^>]*crop="center"/);
    expect(dialog).toMatch(/id="destination-path"[^>]*crop="center"/);
    expect(script).toContain('setAttribute("tooltiptext", text)');
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
