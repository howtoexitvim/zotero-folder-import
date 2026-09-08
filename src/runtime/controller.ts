import { canImportInto, resolveDestination, type SelectedRow } from "../core/destination";
import { executeImport, type ImportProgress } from "../core/importer";
import { buildImportPlan, type ConflictAction, type ImportPlan } from "../core/planner";
import { scanFolder } from "../core/scanner";
import {
  getExistingAttachments,
  getLibraryCollections,
  hashSourceFiles,
  ZoteroFileSystemPort,
  ZoteroImportPort,
} from "./zotero-port";

/**
 * Wires the plugin into Zotero: the File menu entry, the chrome package the
 * dialog is served from, and the scan -> preview -> import sequence.
 */

/** Conflict resolutions chosen in the preview dialog, keyed by relative path. */
interface DialogActions {
  [relativePath: string]: ConflictAction;
}

/** Builds "Parent / Child" for a collection, walking up to the library root. */
function collectionPath(collection: any): string {
  const parts: string[] = [];
  let current = collection;
  while (current) {
    parts.unshift(current.name);
    current = current.parentID ? Zotero.Collections.get(current.parentID) : null;
  }
  return parts.join(" / ");
}

function selectedRows(window: any): SelectedRow[] {
  // Zotero 10 removed the singular accessor (it now throws). The plural form
  // returns only the selected rows (collectionsView.selection.selected), which
  // is already what we want. Multi-select means it can hold more than one.
  return window.ZoteroPane.getCollectionTreeRows().map((row: any) => ({
    type: row.type,
    libraryID: row.ref?.libraryID,
    collectionID: row.isCollection?.() ? row.ref.id : undefined,
    collectionPath: row.isCollection?.() ? collectionPath(row.ref) : undefined,
  }));
}

/** Trailing folder name of a path, used as the top collection to create. */
function rootName(path: string): string {
  return PathUtils.filename(path.replace(/[\\/]+$/, ""));
}

/** Applies the dialog's conflict choices onto the plan before importing. */
function resolvedPlan(plan: ImportPlan, actions: DialogActions): ImportPlan {
  return {
    ...plan,
    files: plan.files.map((file) => file.classification === "conflict"
      ? { ...file, conflictAction: actions[file.relativePath] ?? "unresolved" }
      : file),
  };
}

/** Chrome package name registered at startup; dialogs load through it. */
const CHROME_PACKAGE = "folder-import";

/**
 * Zotero never loads a plugin's own Fluent files for menus -- the code that
 * would do it is commented out in menuManager.js -- so an l10nID resolves to
 * nothing and renders a blank row. Labels are set directly instead.
 */
function menuLabel(): string {
  const locale = String(Zotero.locale ?? "en-US").toLowerCase();
  return locale.startsWith("zh") ? "导入文件夹…" : "Import Folder…";
}

export class FolderImportController {
  private registeredMenuID?: string;
  private chromeHandle?: { destruct(): void };

  constructor(
    private readonly pluginID: string,
    private readonly rootURI: string,
  ) {}

  /**
   * An installed XPI's rootURI is a jar: URL, and a dialog opened from one
   * renders as an empty window -- its stylesheet and script never load. Zotero
   * plugins therefore register a chrome:// package and open dialogs from that.
   */
  private registerChrome(): void {
    const aomStartup = Components.classes["@mozilla.org/addons/addon-manager-startup;1"]
      .getService(Components.interfaces.amIAddonManagerStartup);
    const manifestURI = Services.io.newURI(`${this.rootURI}manifest.json`);
    this.chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", CHROME_PACKAGE, "content/"],
    ]);
  }

  /** Registers the chrome package and the File menu entry. */
  register(): void {
    this.registerChrome();
    const menuID = Zotero.MenuManager.registerMenu({
      menuID: "folder-import-main-file-menu",
      pluginID: this.pluginID,
      target: "main/menubar/file",
      menus: [{
        menuType: "menuitem",
        enableForTabTypes: ["library"],
        onShowing: (event: any, context: any) => {
          const menuElem = context?.menuElem;
          if (!menuElem) return;
          menuElem.setAttribute("label", menuLabel());
          // Only My Library and real collections can receive files. Views like
          // My Publications, Duplicate Items, Unfiled Items and Trash list
          // existing items and are not import targets, so hide the entry there
          // rather than silently falling back to the library root.
          const window = event?.target?.ownerGlobal ?? menuElem.ownerGlobal;
          menuElem.hidden = !this.canImportHere(window);
        },
        onCommand: (event: any) => {
          const window = event.target.ownerGlobal;
          void this.run(window).catch((error) => {
            Zotero.logError(error);
            Services.prompt.alert(window, "Folder Import", error instanceof Error ? error.message : String(error));
          });
        },
      }],
    });
    if (!menuID) throw new Error("Unable to register Folder Import menu");
    this.registeredMenuID = menuID;
  }

  /** True when the current collections-pane selection can receive an import. */
  private canImportHere(window: any): boolean {
    try {
      const rows = selectedRows(window);
      return rows.length === 1 && canImportInto(rows[0], Zotero.Libraries.userLibraryID);
    } catch (error) {
      Zotero.debug(`[Folder Import] selection check failed: ${error}`);
      return false;
    }
  }

  /** Removes the menu entry and releases the chrome registration. */
  unregister(): void {
    if (this.registeredMenuID) Zotero.MenuManager.unregisterMenu(this.registeredMenuID);
    this.registeredMenuID = undefined;
    this.chromeHandle?.destruct();
    this.chromeHandle = undefined;
  }

  /** Shows the folder picker; resolves undefined if the user cancels. */
  private async chooseFolder(window: any): Promise<string | undefined> {
    const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
    const picker = new FilePicker();
    picker.init(window, "Import Folder", picker.modeGetFolder);
    const result = await picker.show();
    return result === picker.returnOK ? picker.file : undefined;
  }

  /**
   * Scans the chosen folder, builds an import plan, and opens the preview
   * dialog. Nothing is written to the library until the user confirms there.
   */
  async run(window: any): Promise<void> {
    const destination = resolveDestination(
      selectedRows(window),
      Zotero.Libraries.userLibraryID,
    );
    const sourcePath = await this.chooseFolder(window);
    if (!sourcePath) return;

    const fileSystem = new ZoteroFileSystemPort();
    const scan = await scanFolder(sourcePath, fileSystem);
    const hashed = await hashSourceFiles(scan.files);
    const scanErrors = [...scan.errors, ...hashed.errors];
    if (!hashed.files.length) {
      Services.prompt.alert(window, "Folder Import", "No readable PDF or EPUB files were found in this folder.");
      return;
    }

    const collections = getLibraryCollections(destination.libraryID);
    const attachments = await getExistingAttachments(
      destination.libraryID,
      hashed.files,
      (error) => scanErrors.push(error),
    );
    const plan = buildImportPlan({
      rootName: rootName(sourcePath),
      baseCollectionID: destination.baseCollectionID,
      files: hashed.files,
      collections,
      attachments,
    });
    const port = new ZoteroImportPort(destination.libraryID, collections, attachments);

    const dialogData: any = {
      locale: Zotero.locale ?? "en-US",
      sourcePath,
      destinationPath: `${destination.baseLabel} / ${plan.rootName}`,
      plan,
      unsupportedCount: scan.unsupportedCount,
      scanErrors,
      onConfirm: async (
        actions: DialogActions,
        onProgress: (progress: ImportProgress) => void,
      ) => executeImport(resolvedPlan(plan, actions), port, onProgress),
    };
    // Zotero's own dialogs self-reference here (see fileInterface.js) so that
    // both `arg` and `arg.wrappedJSObject` resolve to the same object. Passing
    // { wrappedJSObject: data } instead hands the dialog an outer wrapper whose
    // own fields are empty.
    dialogData.wrappedJSObject = dialogData;
    window.openDialog(
      `chrome://${CHROME_PACKAGE}/content/dialog.xhtml`,
      "folder-import-dialog",
      // Not modal: a modal dialog spins a nested event loop that blocks this
      // window, so the import -- which runs on this side -- could not proceed
      // and the progress bar sat frozen until the dialog was closed.
      "chrome,centerscreen,resizable,dialog=no,width=1000,height=760",
      dialogData,
    );
  }
}
