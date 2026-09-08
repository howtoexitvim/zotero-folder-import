# Folder Import Plugin

Private, clean-room Zotero 10 plugin for importing PDF and EPUB directory trees as managed attachments. Folder structure becomes nested collections; filenames are preserved and no metadata lookup or renaming is performed.

## Commands

```bash
npm install
npm test
npm run typecheck
npm run build
npm run verify
```

`npm run build` writes `dist/folder-import-<version>.xpi`, taking the version from `addon/manifest.json`. Runtime code has no third-party dependencies, network calls, telemetry, or functional updater. Zotero 10 requires an `update_url` in every installable manifest, so this private build uses a reserved `.invalid` address that cannot host an update service. The build uses TypeScript and esbuild; tests use Vitest.

## Architecture

- `src/core/`: filesystem-independent scanner, destination resolver, import planner, conflict policy, and ordered executor.
- `src/runtime/`: Zotero 10 adapters for MenuManager, FilePicker, collections, stored attachments, hashing, annotations, Trash, and full-text indexing.
- `src/dialog.ts`: preview, conflict selection, progress, and completion UI.
- `addon/`: manifest, XUL dialog, CSS, and icon, copied to the XPI root.
- `tests/`: behavior tests for planning and mutation ordering.

The executor refuses plans with unresolved conflicts. Replace imports first and trashes old attachments only after the new attachment has succeeded. Runtime annotation checks remain active even after preview.

### How a file is classified

| Status |判据 | 行为 |
| --- | --- | --- |
| **New** | 库里没有相同内容 | 复制进 Zotero storage,保留原文件名 |
| **Already in library** | size + MD5 与库中某附件完全一致 | 把**已有的 item** 加进目标 collection。不复制、不改名、不询问 |
| **Conflict** | 目标 collection 内已有**同名**文件,但内容不同 | 让用户选 Replace / Keep Both / Ignore |

Zotero 的 item 可以同时属于多个 collection,所以 "already in library" 不需要询问 —— Keep Both 会得到两份逐字节相同的文件,Replace 用 A 换 A 是空操作。但这也意味着**共享 item 就共享一切**:标注、笔记、标签,以及删除。

删除行为取决于按键:在 collection 里按 Delete 走 `removeFromCollection`(其他位置保留);Cmd+Delete 或在 My Library 根删除走 `trashTx`(所有位置一起消失)。提示语分别是 "Remove from Collection" 和 "Move to Trash"。

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
| **P1** | "Already in library" 强制共享 item | 只要库中任何位置有同内容文件就复用同一个 item,标注/笔记/删除全部联动。**这是本插件的设计选择,不是 Zotero 限制** —— 见下方「为什么 MD5 匹配是可选的」 | 改为 Finder 心智:只在**目标 collection 内按文件名**判重,不重名就独立导入。MD5 降级为可选提示(「库中已有,可改为引用」),默认独立。顺带消除下面的 P2 |
| **P2** | MD5 匹配要遍历全库 | `getExistingAttachments()` 拉取全库附件,对 size 匹配的算 MD5。已复用 `attachmentSyncedHash` 并每 25 条让出主线程,但仍是 O(库大小) | 若采纳上面的方案则**自然消失**(只查目标 collection,O(collection))。若保留 MD5 匹配,则走 `Zotero.DB` 在 SQL 层按 size 过滤 |

### 为什么 MD5 匹配是可选的

一度以为「Zotero 底层按 MD5 认文件,所以必须匹配,否则 Cmd+Delete 会误删另一份」。**查证后确认这是错的**:

- attachment 的存储目录按**随机 item key** 分(`attachments.js:2773` → `dataObject.js:1585` → `randomString(8)`),与内容无关。两个同内容 PDF 存在两个独立目录,各一份物理副本。
- `importFromFile` 里**没有任何 hash 去重逻辑**。
- Duplicate Items 视图按 **ISBN / DOI / 标题+作者** 匹配(`duplicates.js:194-276`),不按 MD5。
- MD5(`attachmentSyncedHash`)**只用于 storage sync**(`storageLocal.js` / `webdav.js` / `zfs.js`),判断云端与本地是否需要重传,与删除、去重无关。

结论:独立副本之间**互不影响**,删一个不会动另一个。当前的联动删除完全来自本插件的 `linkExisting()` 复用同一 item,是可以改的。

## Compatibility and privacy

- Plugin ID: `folder-import@shuqi.local`
- Zotero: `10.0` through `10.0.*`
- Package license field: `UNLICENSED`
- No working remote repository or release channel is configured; the required update URL uses the reserved `.invalid` top-level domain.

Do not publish the repository or XPI without first making an explicit licensing and distribution decision.
