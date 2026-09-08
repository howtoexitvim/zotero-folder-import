/**
 * The preview dialog's page script.
 *
 * The dialog is a XUL document, which constrains everything here: elements are
 * built in the XUL namespace, <label> shows its "value" attribute rather than
 * text content, visibility is the hidden="true" attribute, and buttons fire
 * "command" rather than "click". Text is set from the words table below because
 * a plugin's Fluent bundle does not resolve in this window.
 */
import { allConflictsResolved, applyConflictChoice } from "./core/conflicts";
import type { ImportProgress, ImportResult } from "./core/importer";
import type { ConflictAction, ImportPlan, PlannedFile } from "./core/planner";

/** Everything the controller hands the dialog through window.arguments. */
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
    shouldCancel?: () => boolean,
  ): Promise<ImportResult>;
}

/** Reads the argument object, accepting both wrapped and bare forms. */
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
/** Set when the user stops a running import; polled between files. */
let cancelRequested = false;
/** True while the import loop is running, which changes what Cancel does. */
let importing = false;
let zh = false;
let words: Record<string, string>;

/** Fills the UI string table for the active locale. */
function initWords(): void {
  words = zh
    ? {
      new: "新导入",
      reused: "已在库中，加入此 collection",
      conflict: "冲突",
      annotated: "含标注或存在多个旧附件，不能替换",
      unresolved: "请选择…",
      replace: "替换",
      ignore: "忽略",
      keepBoth: "两者都保留",
      done: "导入完成",
      failed: "失败",
      applyAll: "对其余冲突也这样处理",
      conflictHint: "以下文件在目标 collection 里已有同名文件，请选择如何处理：",
      title: "检查导入",
      colSource: "来源",
      colDestination: "目标",
      colFile: "文件",
      colSize: "大小",
      colStatus: "状态",
      colAction: "操作",
      mFiles: "个文件",
      mSize: "总大小",
      mNew: "新导入",
      mReused: "已在库中",
      mConflicts: "冲突",
      mUnsupported: "不支持",
      mErrors: "错误",
      collections: "将创建的 collection",
      scanErrors: "扫描时无法读取的文件",
      allExist: "全部使用现有 collection",
      importing: "正在导入…",
      cancel: "取消",
      stop: "停止导入",
      stopping: "正在停止…",
      cancelled: "已取消导入",
      confirm: "导入",
      close: "关闭",
    }
    : {
      new: "New",
      reused: "Already in library — added here",
      conflict: "Conflict",
      annotated: "Annotations or multiple existing files; Replace unavailable",
      unresolved: "Choose…",
      replace: "Replace",
      ignore: "Ignore",
      keepBoth: "Keep Both",
      done: "Import complete",
      failed: "Failed",
      applyAll: "Do the same for the remaining conflicts",
      conflictHint: "These files already exist under the same name in the target collection. Choose what to do:",
      title: "Review import",
      colSource: "Source",
      colDestination: "Destination",
      colFile: "File",
      colSize: "Size",
      colStatus: "Status",
      colAction: "Action",
      mFiles: "files",
      mSize: "total size",
      mNew: "new",
      mReused: "already in library",
      mConflicts: "conflicts",
      mUnsupported: "unsupported",
      mErrors: "errors",
      collections: "Collections to create",
      scanErrors: "Files unavailable during scanning",
      allExist: "All collections already exist",
      importing: "Importing…",
      cancel: "Cancel",
      stop: "Stop import",
      stopping: "Stopping…",
      cancelled: "Import cancelled",
      confirm: "Import",
      close: "Close",
    };
}

/** Only used by reportFatal, which needs real HTML for its error panel. */
const HTML_NS = "http://www.w3.org/1999/xhtml";

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

/** Creates a XUL element; the dialog's own widgets live in this namespace. */
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

/** Human-readable file size, e.g. "1.89 MB". */
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

// XUL <label> renders its value attribute, not textContent.
function setText(element: Element, text: string): void {
  element.setAttribute("value", text);
}

// Long paths are cropped in the middle by the label; keep the full text on the
// tooltip so nothing is actually lost.
function setPath(element: Element, text: string): void {
  element.setAttribute("value", text);
  element.setAttribute("tooltiptext", text);
}

function appendCell(row: Element, text: string, className?: string): Element {
  const cell = xul("label");
  cell.setAttribute("value", text);
  cell.setAttribute("crop", "end");
  if (className) cell.setAttribute("class", className);
  row.append(cell);
  return cell;
}

function appendListItem(list: Element, text: string): void {
  const item = xul("label");
  item.setAttribute("class", "list-item");
  item.setAttribute("value", text);
  item.setAttribute("crop", "center");
  list.append(item);
}

/** Paints the static labels, paths, counts and collection list. */
function renderSummary(): void {
  setPath(byId("source-path"), data.sourcePath);
  setPath(byId("destination-path"), data.destinationPath);
  setText(byId("preview-title"), words.title);
  setText(byId("lbl-source"), words.colSource);
  setText(byId("lbl-destination"), words.colDestination);
  setText(byId("lbl-files"), words.mFiles);
  setText(byId("lbl-size"), words.mSize);
  setText(byId("lbl-new"), words.mNew);
  setText(byId("lbl-reused"), words.mReused);
  setText(byId("lbl-conflicts"), words.mConflicts);
  setText(byId("lbl-unsupported"), words.mUnsupported);
  setText(byId("lbl-errors"), words.mErrors);
  setText(byId("lbl-collections"), words.collections);
  setText(byId("lbl-scan-errors"), words.scanErrors);
  setText(byId("head-file"), words.colFile);
  setText(byId("head-size"), words.colSize);
  setText(byId("head-status"), words.colStatus);
  setText(byId("head-action"), words.colAction);
  setText(byId("progress-title"), words.importing);
  byId("cancel-button").setAttribute("label", words.cancel);
  byId("import-button").setAttribute("label", words.confirm);
  byId("close-button").setAttribute("label", words.close);

  // Conflict controls are meaningless with no conflicts, so keep them and the
  // Action column out of the way entirely until there is something to resolve.
  const hasConflicts = data.plan.summary.conflict > 0;
  setHidden(byId("conflict-toolbar"), !hasConflicts);
  setHidden(byId("head-action"), !hasConflicts);
  setText(byId("conflict-hint"), words.conflictHint);
  byId("apply-all").setAttribute("label", words.applyAll);
  setText(byId("count-total"), String(data.plan.summary.total));
  setText(byId("count-size"), formatBytes(data.plan.summary.bytes));
  setText(byId("count-new"), String(data.plan.summary.new));
  setText(byId("count-reused"), String(data.plan.summary.reused));
  setText(byId("count-conflicts"), String(data.plan.summary.conflict));
  setText(byId("count-unsupported"), String(data.unsupportedCount));
  setText(byId("count-errors"), String(data.scanErrors.length));

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

/**
 * Rebuilds the file table. Called again after each conflict choice, which is
 * why the conflict menulists are recreated rather than mutated.
 */
function renderFiles(): void {
  const body = byId("file-table-body");
  const anyConflicts = files.some((file) => file.classification === "conflict");
  body.replaceChildren();
  files.forEach((file, index) => {
    const row = xul("hbox");
    row.setAttribute("class", "trow");
    row.setAttribute("align", "center");
    const fileCell = appendCell(row, file.relativePath, "col-file");
    fileCell.setAttribute("crop", "center");
    fileCell.setAttribute("tooltiptext", file.relativePath);
    appendCell(row, formatBytes(file.size), "col-size");
    const status = file.classification === "new"
      ? words.new
      : file.classification === "reused"
        ? words.reused
        : words.conflict;
    appendCell(row, status, `col-status status-${file.classification}`);

    if (file.classification !== "conflict") {
      if (anyConflicts) appendCell(row, "", "col-action");
      body.append(row);
      return;
    }

    // XUL menulist, not <select>: the XUL parser does not build HTML form
    // controls beyond input/textarea, so an <option> list never appears.
    const actionCell = xul("hbox");
    actionCell.setAttribute("class", "col-action");
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

/** Import stays disabled until every conflict has a decision. */
function updateImportButton(): void {
  const disabled = !files.length || !allConflictsResolved(files);
  const button = byId("import-button");
  if (disabled) button.setAttribute("disabled", "true");
  else button.removeAttribute("disabled");
}

/**
 * Swaps the preview for the progress view once the import starts, and shrinks
 * the window to fit: the progress panel is a few lines, so keeping the
 * preview's height would leave most of the window empty.
 */
function showProgress(): void {
  setHidden(byId("preview-view"), true);
  setHidden(byId("progress-view"), false);
  setHidden(byId("import-button"), true);
  // The Cancel button becomes Stop: a long import needs a way out, and closing
  // the window no longer stops anything now that the dialog is not modal.
  const stopButton = byId("cancel-button");
  stopButton.setAttribute("label", words.stop);
  stopButton.removeAttribute("disabled");
  // Let the panel shrink to its content instead of filling the preview's height.
  byId("scroll-area").removeAttribute("flex");
  resizeToContent();
}

/**
 * Shrinks the window to the height its content actually needs.
 *
 * XUL only sizes to content at load, so switching panels leaves the window at
 * the preview's height with the progress view stranded in empty space. Measured
 * from the laid-out root rather than a guessed constant, so the error list
 * grows the window and a clean result stays compact.
 */
function resizeToContent(): void {
  // Measure on the next frame so the panel swap has been laid out.
  window.requestAnimationFrame(() => {
    try {
      const root = byId("folder-import-root");
      const content = root.getBoundingClientRect().height;
      const chrome = window.outerHeight - window.innerHeight;
      const height = Math.min(
        Math.max(Math.ceil(content + chrome), 220),
        window.screen?.availHeight ?? 800,
      );
      window.resizeTo(window.outerWidth, height);
    } catch {
      // Resizing is cosmetic; a window manager refusing it must not break the run.
    }
  });
}

/** Advances the progress bar; called once per file by the importer. */
function updateProgress(progress: ImportProgress): void {
  const meter = byId<HTMLProgressElement>("progress-meter");
  meter.max = progress.total;
  meter.value = progress.completed;
  setText(byId("progress-label"), `${progress.completed} / ${progress.total} — ${progress.path}`);
}

/** Shows the final tally and any per-file errors. */
function renderResult(result: ImportResult): void {
  setText(byId("progress-title"), result.cancelled ? words.cancelled : words.done);
  setHidden(byId("cancel-button"), true);
  setText(byId("result-summary"), [
    `${words.new}: ${result.imported}`,
    `${words.reused}: ${result.reused}`,
    `${words.replace}: ${result.replaced}`,
    `${words.keepBoth}: ${result.keptBoth}`,
    `${words.ignore}: ${result.ignored}`,
    `${words.failed}: ${result.failed}`,
  ].join(" · "));
  const errors = byId("result-errors");
  errors.replaceChildren();
  for (const error of result.errors) {
    appendListItem(errors, `${error.path}: ${error.message}`);
  }
  setHidden(byId("close-button"), false);
  resizeToContent();
}

/** Runs the import and renders the outcome, including on failure. */
async function beginImport(): Promise<void> {
  if (!allConflictsResolved(files)) return;
  importing = true;
  showProgress();
  const actions = Object.fromEntries(
    files
      .filter((file) => file.classification === "conflict")
      .map((file) => [file.relativePath, file.conflictAction!]),
  );
  try {
    const result = await data.onConfirm(actions, updateProgress, () => cancelRequested);
    importing = false;
    renderResult(result);
  } catch (error) {
    importing = false;
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

/** Builds the whole preview from the handed-over plan. */
function render(): void {
  try {
    data = readDialogData();
    files = data.plan.files.map((file) => ({ ...file }));
    zh = (data.locale ?? "en-US").toLowerCase().startsWith("zh");
    initWords();
    renderSummary();
    renderFiles();
    updateImportButton();
    resizeToContent();
    byId("cancel-button").addEventListener("command", () => {
      if (!importing) {
        window.close();
        return;
      }
      cancelRequested = true;
      const button = byId("cancel-button");
      button.setAttribute("label", words.stopping);
      button.setAttribute("disabled", "true");
    });
    byId("close-button").addEventListener("command", () => window.close());
    byId("import-button").addEventListener("command", () => void beginImport());
  } catch (error) {
    reportFatal(error);
  }
}

/** Entry point called from the window's onload attribute. */
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
