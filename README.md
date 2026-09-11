# Zotero Folder Import

A clean-room Zotero 10 plugin for importing PDF and EPUB directory trees as managed attachments. Folder structure becomes nested collections; filenames are preserved and no metadata lookup or renaming is performed.

No third-party runtime dependencies, no network calls, no telemetry.

## Install

Download the `.xpi` from the [releases page](../../releases), then in Zotero: **Tools → Add-ons → gear icon → Install Add-on From File…** and pick the downloaded file.

Then right-click any collection (or use Tools) and choose the folder-import entry to pick a directory tree.

Requires Zotero 10.

## Commands

```bash
npm install
npm test
npm run typecheck
npm run build
npm run verify
```

`npm run build` writes `dist/folder-import-<version>.xpi`, taking the version from `addon/manifest.json`. Runtime code has no third-party dependencies, network calls, telemetry, or functional updater. Zotero 10 requires an `update_url` in every installable manifest, so the build points at a reserved `.invalid` address that cannot host an update service — there is no auto-update; grab new versions from the releases page. The build uses TypeScript and esbuild; tests use Vitest.

## Architecture

- `src/core/`: filesystem-independent scanner, destination resolver, import planner, conflict policy, and ordered executor.
- `src/runtime/`: Zotero 10 adapters for MenuManager, FilePicker, collections, stored attachments, annotations, Trash, and full-text indexing. No hashing: files are matched by name in the destination collection, so content is never read.
- `src/dialog.ts`: preview, conflict selection, progress, and completion UI.
- `addon/`: manifest, XUL dialog, CSS, and icon, copied to the XPI root.
- `tests/`: behaviour tests for planning, conflict handling and mutation ordering, plus source-text assertions pinning the XUL/chrome/menu wiring this build had to discover empirically.

The executor refuses plans with unresolved conflicts. Replace imports first and trashes old attachments only after the new attachment has succeeded. Runtime annotation checks remain active even after preview.

### How a file is classified

判据只有一条:**目标 collection 里有没有同名文件**。和文件管理器一致 —— 不看内容,不扫全库。

| Status | 判据 | 行为 |
| --- | --- | --- |
| **New** | 目标 collection 内无同名文件 | 复制进 Zotero storage,保留原文件名 |
| **Conflict** | 目标 collection 内已有同名文件 | 让用户选 Replace / Keep Both / Ignore |

每次导入都产生**自己的 attachment**。同一个 PDF 导进两个 collection 就是两个独立 item、两个独立 storage 目录 —— 在一处 Cmd+Delete、加标注、改标题,都**不影响另一处**。代价是各占一份磁盘空间,这与 Finder 里复制文件到两个文件夹的行为一致。

删除行为取决于按键:在 collection 里按 Delete 走 `removeFromCollection`(把 item 从这个 collection 摘掉);Cmd+Delete 或在 My Library 根删除走 `trashTx`(item 本体进垃圾桶)。提示语分别是 "Remove from Collection" 和 "Move to Trash"。

### 已知的 Zotero 10 约束

这些不是本插件的选择,是平台限制,记录下来避免重复踩:

- 插件对话框必须开在注册过的 `chrome://` URL 下。已安装 XPI 的 `rootURI` 是 `jar:` URL,从那儿开的窗口样式和脚本都加载不了,渲染成空白。
- 对话框 body 必须是纯 XUL。混入 HTML 元素会让解析器丢弃整个 body(`documentElement.children.length === 0`)。
- 插件自带的 Fluent 文件在菜单和对话框里都解析不出来(`menuManager.js` 里加载插件 l10n 的代码是注释掉的),所以所有文案由脚本直接设置。
- Zotero 源码在 `/Applications/Zotero.app/Contents/Resources/**app**/omni.ja`,解包即可查证 API,不要靠猜。

## TODO

| 优先级 | 问题 | 现状 | 更优雅的方案 |
| --- | --- | --- | --- |
| ~~P1~~ | ~~导入无法取消~~ | **已完成 (0.1.17)**:导入中 Cancel 变为「停止导入」,循环每轮检查标志位。已导入的保留,未导入的跳过,结果页标记为「已取消导入」 | — |
| ~~P1~~ | ~~"Already in library" 强制共享 item~~ | **已完成 (0.1.18)**:改为只按目标 collection 内的文件名判重,每次导入产生独立 attachment。删除、标注不再跨位置联动 | — |
| ~~P2~~ | ~~MD5 匹配要遍历全库~~ | **已随上一条消失 (0.1.18)**:不再计算任何哈希,也不再读取文件内容 | — |

### 为什么不按 MD5 判重(查证记录)

一度以为「Zotero 底层按 MD5 认文件,所以必须匹配,否则 Cmd+Delete 会误删另一份」。**查证后确认这是错的**,0.1.18 据此把判重改成了纯文件名:

- attachment 的存储目录按**随机 item key** 分(`attachments.js:2773` → `dataObject.js:1585` → `randomString(8)`),与内容无关。两个同内容 PDF 存在两个独立目录,各一份物理副本。
- `importFromFile` 里**没有任何 hash 去重逻辑**。
- Duplicate Items 视图按 **ISBN / DOI / 标题+作者** 匹配(`duplicates.js:194-276`),不按 MD5。
- MD5(`attachmentSyncedHash`)**只用于 storage sync**(`storageLocal.js` / `webdav.js` / `zfs.js`),判断云端与本地是否需要重传,与删除、去重无关。

结论:独立副本之间**互不影响**,删一个不会动另一个。此前观察到的「Cmd+Delete 删掉另一边」完全来自本插件早期用 `linkExisting()` 复用同一个 item —— 两边看到的是同一条记录,所以删本体时处处消失。0.1.18 移除了这条路径。

## Compatibility and privacy

- Plugin ID: `folder-import@shuqi.local`
- Zotero: `10.0` through `10.0.*`
- No network calls, no telemetry, no metadata lookup. Files are matched by name within the destination collection; content is never read or hashed.
- No auto-update channel: the manifest's required `update_url` points at a reserved `.invalid` address. Install new versions from the releases page.

## License

[MIT](LICENSE)
