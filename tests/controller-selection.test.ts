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
