# GitHub PR 数据抓取

`fetch-github-pr.js` 使用 GitHub REST API 抓取 PR 详情及相关数据，不需要安装第三方依赖。

要求 Node.js 18 或更高版本。

## 抓取目标 PR

```bash
node fetch-github-pr.js
// hello

```

默认抓取 `https://github.com/vuejs/core/pull/15125`，并将 GitHub API 返回的完整数据写入脚本同级目录的 `vue-core-pr-15125.json`。

## 保存到文件

```bash
node fetch-github-pr.js -o vue-core-pr-15125.json
```

也可以传入其他 PR URL：

```bash
node fetch-github-pr.js https://github.com/vuejs/core/pull/15125 -o pr.json
```

脚本会保存完整 JSON，不会只保存摘要，内容包括：

- PR 基本信息
- commits
- 修改文件及 patch
- Issue comments
- reviews
- review comments

相对输出路径会相对于脚本所在目录解析，绝对路径则直接使用。

公开仓库可以匿名调用，但 GitHub API 有请求频率限制。脚本从 `GITHUB_TOKENS` 中读取 Token，按逗号拆分并使用第一个非空字符串：

```bash
GITHUB_TOKENS=ghp_xxx,ghp_yyy node fetch-github-pr.js
```

也可以通过命令行显式覆盖 Token：

```bash
node fetch-github-pr.js --token ghp_xxx
```
