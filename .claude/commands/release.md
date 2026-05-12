---
description: 分析改动、升版本（patch/minor）、打 tag、推送并发布到 npm
---

执行 snipdom 的发布流程。严格按顺序执行，遇到错误立即停止并报告。

## 1. 分析最近改动

并行运行以下命令了解上次发布以来的变更：

- `git describe --tags --abbrev=0 2>/dev/null` 拿到上一个 tag（没有则视为首次发布）
- `git log <last-tag>..HEAD --oneline`（若无 tag 则 `git log --oneline -20`）
- `git status` 确认工作区干净（不干净则停止）
- 读取 `package.json` 拿到当前版本号

总结改动属于 **patch**（修复/文档/内部调整）还是 **minor**（新功能/增强）。**绝不升级 major**。

## 2. 更新版本号

根据分析结果选 `patch` 或 `minor`，使用 `npm version <patch|minor> -m "chore: release v%s"`。

这一步会：
- 修改 `package.json` 的版本号
- 创建一个 commit
- 创建一个 `v<version>` tag

⚠️ 不要手动改 `package.json` 版本号，让 `npm version` 处理。

## 3 & 4. 推送 commit 和 tag

```
git push && git push --tags
```

## 5. 发布到 npm

```
npm publish
```

`prepublishOnly` 钩子会自动先跑 `npm run build`。

## 完成后报告

输出新版本号、tag 名、变更摘要（按 patch/minor 分类的 bullet 列表）。
