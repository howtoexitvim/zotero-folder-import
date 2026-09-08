/**
 * Zotero bootstrap entry points. Zotero looks these up by name on the plugin's
 * global scope, so they are published with Object.assign at the end.
 */
import { FolderImportController } from "./runtime/controller";

let controller: FolderImportController | undefined;

/** Waits for Zotero to finish loading, then registers the menu and chrome. */
async function startup({ id, rootURI }: { id: string; version: string; rootURI: string }): Promise<void> {
  await Zotero.initializationPromise;
  controller = new FolderImportController(id, rootURI);
  controller.register();
  Zotero.debug("[Folder Import] started");
}

/** Tears down everything startup registered, so the plugin unloads cleanly. */
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

