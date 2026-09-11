<div align="center">

# Zotero Folder Import

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

![Zotero](https://img.shields.io/badge/Zotero-10-CC2936)
![Type](https://img.shields.io/badge/type-Plugin-2563eb)
![Privacy](https://img.shields.io/badge/privacy-no%20network-059669)

</div>

Zotero Folder Import 是一个 Zotero 10 插件，用于把整个 PDF、EPUB 文件夹导入为托管附件。

文件夹结构会变成嵌套的 collection。文件名原样保留，不做任何元数据查询或重命名 —— 你在 Finder 里看到什么，导进 Zotero 就是什么。

没有第三方运行时依赖，不发起网络请求，不做任何遥测。

## 安装

从 [releases 页面](https://github.com/howtoexitvim/zotero-folder-import/releases)下载 `.xpi`，然后在 Zotero 中打开 **Tools → Add-ons → 齿轮图标 → Install Add-on From File…**，选择刚下载的文件。

之后右键点击任意 collection，选择文件夹导入条目，即可挑选要导入的目录树。

需要 Zotero 10。当前版本为 **v0.1.21**。

本插件没有自动更新通道。Zotero 10 要求每个可安装的 manifest 都带 `update_url`，因此构建时指向了一个保留的 `.invalid` 地址，它不可能承载更新服务。新版本请用同样的方式安装。

## 文件是如何判定的

判据只有一条：**目标 collection 里有没有同名文件**。这与文件管理器的行为一致 —— 不读取内容，也不扫描整个文库。

| 状态 | 判据 | 行为 |
| --- | --- | --- |
| **New** | 目标 collection 内无同名文件 | 复制进 Zotero storage，保留原文件名 |
| **Conflict** | 目标 collection 内已有同名文件 | 由你选择 Replace / Keep Both / Ignore |

每次导入都会产生**自己的 attachment**。同一个 PDF 导入两个 collection，就是两个独立 item、两个独立 storage 目录，在一处删除、加标注、改标题都**不影响另一处**。代价是每个位置各占一份磁盘空间 —— 这与在 Finder 里把文件复制到两个文件夹是同一种取舍。

删除行为取决于按键。在 collection 里按 Delete 走 `removeFromCollection`，只是把 item 从这个 collection 摘掉；Cmd+Delete 或在 My Library 根目录删除走 `trashTx`，item 本体进入垃圾桶。两者的提示语分别是 "Remove from Collection" 和 "Move to Trash"。

Replace 会先导入新附件，确认成功之后才把旧的扔进垃圾桶——导入失败不会让你两份都没有。

导入过程可以取消。导入中 Cancel 会变为停止导入，循环每轮检查标志位：已导入的保留，未导入的跳过，结果页会标记为已取消。执行器拒绝运行任何仍存在未解决冲突的计划。

## 为什么不按 MD5 判重

早期曾以为 Zotero 底层按 MD5 认文件，所以插件必须匹配哈希，否则 Cmd+Delete 会误删另一份。查证源码后确认这是错的，0.1.18 据此把判重改成了纯文件名：

- attachment 的存储目录按**随机 item key** 划分，与内容无关，两个内容相同的 PDF 会存在两个目录里，各有一份物理副本。
- `importFromFile` 中**没有任何哈希去重逻辑**。
- Duplicate Items 视图按 **ISBN / DOI / 标题 + 作者**匹配，不按 MD5。
- MD5（`attachmentSyncedHash`）**只用于 storage sync**，用来判断文件是否需要重新上传，与删除和去重无关。

因此独立副本之间互不影响。此前观察到的「删一边另一边也消失」，完全来自本插件早期用 `linkExisting()` 复用同一个 item，该路径已被移除。

## 已知的 Zotero 10 约束

这些不是本插件的选择，而是平台限制，记录在此，或许能帮其他插件作者省下一些时间：

- 插件对话框必须开在注册过的 `chrome://` URL 下。已安装 XPI 的 `rootURI` 是 `jar:` URL，从那里打开的窗口样式和脚本都加载不了，只会渲染成空白。
- 对话框 body 必须是纯 XUL。混入一个 HTML 元素就会让解析器丢弃整个 body（`documentElement.children.length === 0`）。
- 插件自带的 Fluent 文件在菜单和对话框里都解析不出来，所以所有文案都由脚本直接设置。
- Zotero 源码位于 `/Applications/Zotero.app/Contents/Resources/app/omni.ja`，解包即可查证 API，不要靠猜。

## 命令

```bash
npm install
npm test
npm run typecheck
npm run build
npm run verify
```

`npm run build` 会生成 `dist/folder-import-<version>.xpi`，版本号取自 `addon/manifest.json`。构建使用 TypeScript 和 esbuild，测试使用 Vitest，共 57 个测试全部通过。

## 架构

- `src/core/`：与文件系统解耦的扫描器、目标解析器、导入计划器、冲突策略和有序执行器。
- `src/runtime/`：Zotero 10 适配层，覆盖 MenuManager、FilePicker、collection、存储附件、标注、垃圾桶和全文索引。
- `src/dialog.ts`：预览、冲突选择、进度和完成界面。
- `addon/`：manifest、XUL 对话框、CSS 和图标，会被复制到 XPI 根目录。
- `tests/`：针对计划、冲突处理和变更顺序的行为测试，以及固定 XUL / chrome / 菜单接线方式的源码文本断言 —— 这些接线是本项目一点点试出来的。

## 兼容性与隐私

- 插件 ID：`folder-import@shuqi.local`
- Zotero：`10.0` 至 `10.0.*`
- 不发起网络请求，不做遥测，不查询元数据。文件仅按目标 collection 内的文件名匹配，内容既不会被读取也不会被哈希。

## 许可证

[MIT](LICENSE)
