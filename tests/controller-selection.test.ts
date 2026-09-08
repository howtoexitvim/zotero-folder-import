import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const controllerSource = readFile(
  new URL("../src/runtime/controller.ts", import.meta.url),
  "utf8",
);

describe("ZoteroPane API usage", () => {
  it("uses the plural collection tree accessor", async () => {
    const controller = await controllerSource;

    // Zotero 10 removed the singular accessor; it now throws unconditionally.
    // The plural form returns only the selected rows, which is what we want.
    // Strip comments so prose naming the API does not trip the assertion.
    const code = controller.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

    expect(code).toContain("getCollectionTreeRows()");
    expect(code).not.toMatch(/getCollectionTreeRow(?!s)/);
  });
});

describe("chrome registration", () => {
  it("opens the dialog from a chrome:// URL, not the raw rootURI", async () => {
    const controller = await controllerSource;

    // An installed XPI's rootURI is a jar: URL. A dialog opened from one
    // renders as an empty window because its script and stylesheet never
    // load. Working Zotero plugins register a chrome package at startup
    // (aomStartup.registerChrome) and open dialogs through chrome://.
    expect(controller).toContain("registerChrome");
    expect(controller).toContain("chrome://${CHROME_PACKAGE}/content/dialog.xhtml");
    expect(controller).not.toContain("${this.rootURI}content/dialog.xhtml");
  });

  it("releases the chrome handle on shutdown", async () => {
    const controller = await controllerSource;

    expect(controller).toContain("chromeHandle?.destruct()");
  });
});

describe("menu localization", () => {
  it("sets the menu label directly instead of relying on l10nID", async () => {
    const controller = await controllerSource;

    // Zotero never loads a plugin's own Fluent files for menus: the code that
    // would do it is commented out in menuManager.js. An l10nID therefore has
    // no bundle and the item renders as a blank but selectable row, so the
    // label has to be set in onShowing.
    const code = controller.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

    expect(code).toContain("onShowing");
    expect(code).toContain('setAttribute("label", menuLabel())');
    expect(code).not.toContain("l10nID");
  });
});

describe("import progress", () => {
  it("opens the dialog non-modally", async () => {
    const controller = await controllerSource;

    // A modal dialog spins a nested event loop that blocks the opener, where
    // the import actually runs -- so the progress bar froze and work only
    // resumed when the window was closed.
    expect(controller).not.toMatch(/"chrome[^"]*\bmodal\b/);
  });

  it("yields to the event loop between files", async () => {
    const importer = await readFile(
      new URL("../src/core/importer.ts", import.meta.url),
      "utf8",
    );

    // The loop only awaits file I/O, which never lets the dialog repaint, so
    // the progress bar sat frozen until the entire import finished.
    expect(importer).toContain("setTimeout(resolve, 0)");
  });
});

describe("dialog argument passing", () => {
  it("self-references wrappedJSObject the way Zotero's own dialogs do", async () => {
    const controller = await controllerSource;

    // Zotero's dialogs (see fileInterface.js) build the argument object and
    // then set `args.wrappedJSObject = args`, so the dialog can read the data
    // through either handle. Passing `{ wrappedJSObject: data }` instead hands
    // the dialog a wrapper whose own fields are undefined, which left the
    // preview window blank.
    expect(controller).toContain("dialogData.wrappedJSObject = dialogData");
    expect(controller).not.toContain("{ wrappedJSObject: dialogData }");
  });
});
