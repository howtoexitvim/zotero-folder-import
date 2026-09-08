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

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing dialog element ${id}`);
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

function appendCell(row: HTMLTableRowElement, text: string, className?: string): HTMLTableCellElement {
  const cell = row.insertCell();
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
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

  const scanErrorDetails = byId<HTMLDetailsElement>("scan-error-details");
  scanErrorDetails.hidden = data.scanErrors.length === 0;
  const scanErrorList = byId("scan-error-list");
  scanErrorList.replaceChildren();
  for (const error of data.scanErrors) {
    const item = document.createElement("li");
    item.textContent = `${error.path}: ${error.message}`;
    scanErrorList.append(item);
  }

  const collections = byId("collection-list");
  collections.replaceChildren();
  for (const segments of data.plan.collectionsToCreate) {
    const item = document.createElement("li");
    item.textContent = segments.join(" / ");
    collections.append(item);
  }
  if (!data.plan.collectionsToCreate.length) {
    const item = document.createElement("li");
    item.textContent = zh ? "全部复用现有 collection" : "All collections already exist";
    collections.append(item);
  }
}

function renderFiles(): void {
  const body = byId<HTMLTableSectionElement>("file-table-body");
  body.replaceChildren();
  files.forEach((file, index) => {
    const row = body.insertRow();
    appendCell(row, file.relativePath, "file-path");
    appendCell(row, file.extension.toUpperCase());
    appendCell(row, formatBytes(file.size));
    const status = file.classification === "new"
      ? words.new
      : file.classification === "reused"
        ? words.reused
        : words.conflict;
    appendCell(row, status, `status status-${file.classification}`);
    const actionCell = row.insertCell();
    if (file.classification !== "conflict") return;

    const select = document.createElement("select");
    select.dataset.index = String(index);
    const options: Array<[ConflictAction, string, boolean]> = [
      ["unresolved", words.unresolved, false],
      ["replace", file.replaceAllowed ? words.replace : `${words.replace} — ${words.annotated}`, !file.replaceAllowed],
      ["ignore", words.ignore, false],
      ["keep-both", words.keepBoth, false],
    ];
    for (const [value, label, disabled] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.disabled = disabled;
      option.selected = file.conflictAction === value;
      select.append(option);
    }
    select.addEventListener("change", () => {
      const action = select.value as ConflictAction;
      if (action === "unresolved") return;
      files = applyConflictChoice(
        files,
        index,
        action,
        byId<HTMLInputElement>("apply-all").checked,
      );
      renderFiles();
      updateImportButton();
    });
    actionCell.append(select);
  });
}

function updateImportButton(): void {
  byId<HTMLButtonElement>("import-button").disabled = !files.length || !allConflictsResolved(files);
}

function showProgress(): void {
  byId("preview-view").hidden = true;
  byId("progress-view").hidden = false;
  byId("cancel-button").hidden = true;
  byId("import-button").hidden = true;
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
    const item = document.createElement("li");
    item.textContent = `${error.path}: ${error.message}`;
    errors.append(item);
  }
  byId<HTMLButtonElement>("close-button").hidden = false;
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
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  const pre = document.createElement("pre");
  pre.className = "fatal";
  pre.textContent = message;
  document.body?.replaceChildren(pre);
  const close = document.createElement("button");
  close.textContent = "Close";
  close.addEventListener("click", () => window.close());
  document.body?.append(close);
}

function start(): void {
  try {
    data = readDialogData();
    files = data.plan.files.map((file) => ({ ...file }));
    zh = (data.locale ?? "en-US").toLowerCase().startsWith("zh");
    initWords();
    renderSummary();
    renderFiles();
    updateImportButton();
    byId("cancel-button").addEventListener("click", () => window.close());
    byId("close-button").addEventListener("click", () => window.close());
    byId("import-button").addEventListener("click", () => void beginImport());
  } catch (error) {
    reportFatal(error);
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
