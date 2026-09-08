import { allConflictsResolved, applyConflictChoice } from "./core/conflicts";
import type { ImportProgress, ImportResult } from "./core/importer";
import type { ConflictAction, ImportPlan, PlannedFile } from "./core/planner";

interface DialogData {
  locale: string;
  sourcePath: string;
  destinationPath: string;
  plan: ImportPlan;
  unsupportedCount: number;
  scanErrors: Array<{ path: string; message: string }>;
  onConfirm(
    actions: Record<string, ConflictAction>,
    onProgress: (progress: ImportProgress) => void,
  ): Promise<ImportResult>;
}

function readDialogData(): DialogData {
  const argument = (window as any).arguments?.[0];
  if (!argument) throw new Error("Folder Import dialog was opened without data");
  // openDialog may hand back the object directly or wrapped in an XPCOM
  // holder depending on how the caller passed it; accept both.
  const unwrapped = argument.wrappedJSObject ?? argument;
  if (!unwrapped?.plan) throw new Error("Folder Import dialog data is missing an import plan");
  return unwrapped as DialogData;
}

let data: DialogData;
let files: PlannedFile[] = [];
let zh = false;
let words: Record<string, string>;

function initWords(): void {
  words = zh
    ? {
      new: "新导入",
      reused: "复用",
      conflict: "冲突",
      annotated: "含标注或存在多个旧附件，不能替换",
      unresolved: "请选择…",
      replace: "替换",
      ignore: "忽略",
      keepBoth: "两者都保留",
      done: "导入完成",
      failed: "失败",
    }
    : {
      new: "New",
      reused: "Reuse",
      conflict: "Conflict",
      annotated: "Annotations or multiple existing files; Replace unavailable",
      unresolved: "Choose…",
      replace: "Replace",
      ignore: "Ignore",
      keepBoth: "Keep Both",
      done: "Import complete",
      failed: "Failed",
    };
}

const HTML_NS = "http://www.w3.org/1999/xhtml";

// The dialog root is a XUL <window>, so document.createElement() would build
// XUL elements. Everything we build at runtime is HTML.
function html<T extends HTMLElement>(tag: string): T {
  return document.createElementNS(HTML_NS, tag) as unknown as T;
}

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

function xul(tag: string): Element {
  return document.createElementNS(XUL_NS, tag);
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    // Report what the DOM actually contains, so a missing element says why
    // rather than just which id failed.
    const root = document.documentElement;
    const ids = Array.from(root.querySelectorAll("[id]")).map((e) => e.id);
    throw new Error(
      `Missing dialog element ${id}\n`
      + `documentElement: <${root.nodeName}> children=${root.children.length}\n`
      + `ids present (${ids.length}): ${ids.join(", ") || "(none)"}\n`
      + `readyState=${document.readyState}`,
    );
  }
  return element as T;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

// XUL uses a hidden="true" attribute rather than the HTML hidden property.
function setHidden(element: Element, hidden: boolean): void {
  if (hidden) element.setAttribute("hidden", "true");
  else element.removeAttribute("hidden");
}

function appendCell(row: HTMLElement, text: string, className?: string): HTMLElement {
  const cell = html<HTMLElement>("span");
  cell.textContent = text;
  if (className) cell.setAttribute("class", className);
  row.append(cell);
  return cell;
}

function appendListItem(list: Element, text: string): void {
  const item = html<HTMLElement>("div");
  item.setAttribute("class", "list-item");
  item.textContent = text;
  list.append(item);
}

function renderSummary(): void {
  byId("source-path").textContent = data.sourcePath;
  byId("destination-path").textContent = data.destinationPath;
  byId("count-total").textContent = String(data.plan.summary.total);
  byId("count-size").textContent = formatBytes(data.plan.summary.bytes);
  byId("count-new").textContent = String(data.plan.summary.new);
  byId("count-reused").textContent = String(data.plan.summary.reused);
  byId("count-conflicts").textContent = String(data.plan.summary.conflict);
  byId("count-unsupported").textContent = String(data.unsupportedCount);
  byId("count-errors").textContent = String(data.scanErrors.length);

  setHidden(byId("scan-error-group"), data.scanErrors.length === 0);
  const scanErrorList = byId("scan-error-list");
  scanErrorList.replaceChildren();
  for (const error of data.scanErrors) {
    appendListItem(scanErrorList, `${error.path}: ${error.message}`);
  }

  const collections = byId("collection-list");
  collections.replaceChildren();
  for (const segments of data.plan.collectionsToCreate) {
    appendListItem(collections, segments.join(" / "));
  }
  if (!data.plan.collectionsToCreate.length) {
    appendListItem(collections, zh ? "全部复用现有 collection" : "All collections already exist");
  }
}

function renderFiles(): void {
  const body = byId("file-table-body");
  body.replaceChildren();
  files.forEach((file, index) => {
    const row = html<HTMLElement>("div");
    row.setAttribute("class", "trow");
    appendCell(row, file.relativePath, "file-path");
    appendCell(row, file.extension.toUpperCase());
    appendCell(row, formatBytes(file.size));
    const status = file.classification === "new"
      ? words.new
      : file.classification === "reused"
        ? words.reused
        : words.conflict;
    appendCell(row, status, `status status-${file.classification}`);

    if (file.classification !== "conflict") {
      appendCell(row, "");
      body.append(row);
      return;
    }

    // XUL menulist, not <select>: the XUL parser does not build HTML form
    // controls beyond input/textarea, so an <option> list never appears.
    const actionCell = html<HTMLElement>("span");
    const menulist = xul("menulist");
    menulist.setAttribute("native", "true");
    const popup = xul("menupopup");
    const options: Array<[ConflictAction, string, boolean]> = [
      ["unresolved", words.unresolved, false],
      ["replace", file.replaceAllowed ? words.replace : `${words.replace} — ${words.annotated}`, !file.replaceAllowed],
      ["ignore", words.ignore, false],
      ["keep-both", words.keepBoth, false],
    ];
    for (const [value, label, disabled] of options) {
      const item = xul("menuitem");
      item.setAttribute("value", value);
      item.setAttribute("label", label);
      if (disabled) item.setAttribute("disabled", "true");
      popup.append(item);
    }
    menulist.append(popup);
    menulist.setAttribute("value", file.conflictAction ?? "unresolved");
    menulist.addEventListener("command", () => {
      const action = (menulist as any).value as ConflictAction;
      if (action === "unresolved") return;
      files = applyConflictChoice(
        files,
        index,
        action,
        (byId("apply-all") as any).checked,
      );
      renderFiles();
      updateImportButton();
    });
    actionCell.append(menulist);
    row.append(actionCell);
    body.append(row);
  });
}

function updateImportButton(): void {
  const disabled = !files.length || !allConflictsResolved(files);
  const button = byId("import-button");
  if (disabled) button.setAttribute("disabled", "true");
  else button.removeAttribute("disabled");
}

function showProgress(): void {
  setHidden(byId("preview-view"), true);
  setHidden(byId("progress-view"), false);
  setHidden(byId("cancel-button"), true);
  setHidden(byId("import-button"), true);
}

function updateProgress(progress: ImportProgress): void {
  const meter = byId<HTMLProgressElement>("progress-meter");
  meter.max = progress.total;
  meter.value = progress.completed;
  byId("progress-label").textContent = `${progress.completed} / ${progress.total} — ${progress.path}`;
}

function renderResult(result: ImportResult): void {
  byId("progress-title").textContent = words.done;
  byId("result-summary").textContent = [
    `${words.new}: ${result.imported}`,
    `${words.reused}: ${result.reused}`,
    `${words.replace}: ${result.replaced}`,
    `${words.keepBoth}: ${result.keptBoth}`,
    `${words.ignore}: ${result.ignored}`,
    `${words.failed}: ${result.failed}`,
  ].join(" · ");
  const errors = byId("result-errors");
  errors.replaceChildren();
  for (const error of result.errors) {
    appendListItem(errors, `${error.path}: ${error.message}`);
  }
  setHidden(byId("close-button"), false);
}

async function beginImport(): Promise<void> {
  if (!allConflictsResolved(files)) return;
  showProgress();
  const actions = Object.fromEntries(
    files
      .filter((file) => file.classification === "conflict")
      .map((file) => [file.relativePath, file.conflictAction!]),
  );
  try {
    const result = await data.onConfirm(actions, updateProgress);
    renderResult(result);
  } catch (error) {
    renderResult({
      imported: 0,
      reused: 0,
      ignored: 0,
      replaced: 0,
      keptBoth: 0,
      failed: 1,
      importedAttachmentIDs: [],
      errors: [{ path: data.sourcePath, message: error instanceof Error ? error.message : String(error) }],
    });
  }
}

function reportFatal(error: unknown): void {
  // A dialog that throws during setup would otherwise stay blank with no way
  // to tell what went wrong, so paint the failure into the window itself.
  // This is a XUL document, so there is no document.body and createElement()
  // would build XUL elements -- create HTML ones explicitly.
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  const root = document.getElementById("folder-import-root") ?? document.documentElement;
  const pre = document.createElementNS(HTML_NS, "pre");
  pre.setAttribute("class", "fatal");
  pre.textContent = message;
  const close = document.createElementNS(HTML_NS, "button");
  close.textContent = "Close";
  close.addEventListener("click", () => window.close());
  root.replaceChildren(pre, close);
}

function render(): void {
  try {
    data = readDialogData();
    files = data.plan.files.map((file) => ({ ...file }));
    zh = (data.locale ?? "en-US").toLowerCase().startsWith("zh");
    initWords();
    renderSummary();
    renderFiles();
    updateImportButton();
    byId("cancel-button").addEventListener("command", () => window.close());
    byId("close-button").addEventListener("command", () => window.close());
    byId("import-button").addEventListener("command", () => void beginImport());
  } catch (error) {
    reportFatal(error);
  }
}

function init(): void {
  // onload can fire before the parser has finished building the window's
  // children, in which case getElementById finds nothing. Wait for the last
  // element in the markup to exist before rendering.
  if (document.getElementById("close-button")) {
    render();
    return;
  }
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (document.getElementById("close-button")) {
      window.clearInterval(timer);
      render();
    } else if (attempts > 100) {
      window.clearInterval(timer);
      render(); // let byId report the real DOM state
    }
  }, 10);
}

// loadSubScript runs this with the window as its scope object, so publish the
// entry point on both that scope and the window itself; the onload attribute
// resolves against the window.
// The XUL <window> calls FolderImportDialog.init() from its onload attribute,
// matching how Zotero's own dialogs bootstrap.
const entryPoint = { init };
Object.assign(globalThis, { FolderImportDialog: entryPoint });
if (typeof window !== "undefined") {
  (window as any).FolderImportDialog = entryPoint;
}
