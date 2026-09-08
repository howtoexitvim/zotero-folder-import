import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const controllerSource = readFile(
  new URL("../src/runtime/controller.ts", import.meta.url),
  "utf8",
);

describe("ZoteroPane API usage", () => {
  it("uses the plural collection tree accessor", async () => {
    const controller = await controllerSource;

    // Zotero 10 removed the singular ZoteroPane.getCollectionTreeRow(); it now
    // throws "was removed -- use ZoteroPane.getCollectionTreeRows()". The
    // plural form returns only the selected rows, which is what we want.
    expect(controller).toContain("getCollectionTreeRows()");
    expect(controller).not.toMatch(/getCollectionTreeRow(?!s)/);
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
