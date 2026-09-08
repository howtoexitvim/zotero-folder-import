import { FolderImportController } from "./runtime/controller";

let controller: FolderImportController | undefined;

async function startup({ id, rootURI }: { id: string; version: string; rootURI: string }): Promise<void> {
  await Zotero.initializationPromise;
  controller = new FolderImportController(id, rootURI);
  controller.register();
  Zotero.debug("[Folder Import] started");
}

function shutdown(): void {
  controller?.unregister();
  controller = undefined;
  Zotero.debug("[Folder Import] stopped");
}

function install(): void {
  Zotero.debug("[Folder Import] installed");
}

function uninstall(): void {
  Zotero.debug("[Folder Import] uninstalled");
}

Object.assign(globalThis, { startup, shutdown, install, uninstall });

