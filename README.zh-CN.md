<div align="center">

# Zotero Folder Import

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

![Zotero](https://img.shields.io/badge/Zotero-10-CC2936)
![Type](https://img.shields.io/badge/type-Plugin-2563eb)
![Privacy](https://img.shields.io/badge/privacy-no%20network-059669)

</div>

你的硬盘里堆着多年来按文件夹整理好的 PDF，而 Zotero 只肯一个一个地收。

Zotero Folder Import 直接接收整棵目录树。文件夹会变成嵌套的分类（collections），文件名原样保留，不重命名，也不联网查元数据。你在访达里看到的样子，就是它在 Zotero 里的样子。

在写入任何内容之前，你会先看到一个审阅界面：各项统计、将要创建的分类、以及每一个文件的状态。然后由你来决定。

## 为什么选择 Folder Import

- 📁 **保留你的文件夹结构**：目录树变成嵌套分类，文件名原样保留。不查元数据，不重命名。
- 👀 **先看清，再动手**：审阅对话框会显示总计数量、即将创建的分类，以及逐个文件的状态——在任何文件被移动之前。
- 🤝 **冲突由你决定**：逐个文件选择替换（Replace）、两者都保留（Keep Both）或忽略（Ignore）。替换会先导入新文件，确认成功之后才把旧文件移入回收站。
- ⏹️ **随时可以停下**：导入途中取消，已经导入的内容会原样保留。
- 🧩 **副本彼此独立**：每次导入都是独立的附件，在一个分类里删除或标注，不会影响另一个分类。
- 🔒 **隐私是默认设计**：无网络请求，无遥测，不查元数据。从不读取或哈希文件内容——只在目标分类内按文件名匹配。

## 截图

<div align="center">
  <img src="assets/review-import.png" width="90%" alt="审阅导入对话框：显示来源路径、目标分类、63 个文件 650.0 MB 共 63 个新增 0 个冲突的统计块、将要创建的 14 个分类列表，以及带逐文件状态的文件表格" />
</div>

<br/>

<table>
	<tr>
		<td align="center"><strong>“文件”菜单中的 Import Folder…</strong></td>
		<td align="center"><strong>插件管理器中已安装</strong></td>
	</tr>
	<tr>
		<td align="center"><img src="assets/menu-entry.png" alt="展开的 Zotero 文件菜单，其中包含本插件添加的 Import Folder 条目" height="260" /></td>
		<td align="center"><img src="assets/plugins-manager.png" alt="Zotero 插件管理器中显示 Folder Import，作者 Shuqi，版本 0.1.21" height="260" /></td>
	</tr>
	<tr>
		<td align="center" colspan="2"><strong>导入完成</strong></td>
	</tr>
	<tr>
		<td align="center" colspan="2"><img src="assets/import-complete.png" alt="导入完成对话框：进度条已满，显示 5 / 5 个文件，以及新增 5、替换 0、两者保留 0、忽略 0、失败 0 的统计" /></td>
	</tr>
</table>

## 安装

前往 [发布页面](https://github.com/howtoexitvim/zotero-folder-import/releases) 下载 `.xpi` 文件。当前版本为 **v0.1.21**。

在 Zotero 中打开 **工具 → 插件 → 齿轮图标 → 从文件安装插件…**，选择刚下载的文件，若提示重启则重启。

然后选择 **文件 → Import Folder…**，或者右键点击任意分类。

需要 Zotero 10。

## 从源码构建

```bash
npm install
npm test
npm run build
```

`npm run build` 会生成 `dist/folder-import-<version>.xpi`。

## 说明

本插件没有自动更新通道——新版本的安装方式与首次安装完全相同。

## License

[MIT](LICENSE)
