import { resolveDestination, type SelectedRow } from "../core/destination";
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

interface DialogActions {
  [relativePath: string]: ConflictAction;
}

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

function rootName(path: string): string {
  return PathUtils.filename(path.replace(/[\\/]+$/, ""));
}

function resolvedPlan(plan: ImportPlan, actions: DialogActions): ImportPlan {
  return {
    ...plan,
    files: plan.files.map((file) => file.classification === "conflict"
      ? { ...file, conflictAction: actions[file.relativePath] ?? "unresolved" }
      : file),
  };
}

export class FolderImportController {
  private registeredMenuID?: string;

  constructor(
    private readonly pluginID: string,
    private readonly rootURI: string,
  ) {}

  register(): void {
    const menuID = Zotero.MenuManager.registerMenu({
      menuID: "folder-import-main-file-menu",
      pluginID: this.pluginID,
      target: "main/menubar/file",
      menus: [{
        menuType: "menuitem",
        l10nID: "folder-import-menu-import-folder",
        enableForTabTypes: ["library"],
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

  unregister(): void {
    if (this.registeredMenuID) Zotero.MenuManager.unregisterMenu(this.registeredMenuID);
    this.registeredMenuID = undefined;
  }

  private async chooseFolder(window: any): Promise<string | undefined> {
    const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
    const picker = new FilePicker();
    picker.init(window, "Import Folder", picker.modeGetFolder);
    const result = await picker.show();
    return result === picker.returnOK ? picker.file : undefined;
  }

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
      `${this.rootURI}content/dialog.xhtml`,
      "folder-import-dialog",
      "chrome,centerscreen,resizable,modal,width=1000,height=760",
      dialogData,
    );
  }
}
