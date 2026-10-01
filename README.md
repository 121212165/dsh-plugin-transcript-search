# dsh-plugin-transcript-search

**EN** · Full-text search over the transcripts dsh-plugin-transcript writes: `/find <words>` and the `session_search` tool return ranked hits with excerpts, reading the month JSONL files directly. · 5 `node --test` green · the line-format contract is kept field-for-field with the writer · not live-mounted.

DeepSeek Harness (dsh) 插件：在归档的会话转录里做跨会话全文搜索。数据源是 [dsh-plugin-transcript](https://github.com/121212165/dsh-plugin-transcript) 的按月 JSONL 边车（同一 schema、同一默认目录，两个插件按契约互通、不互相 import）——只装搜索也能用，但没数据；建议两个一起装。

同系列：[cost-ledger](https://github.com/121212165/dsh-plugin-cost-ledger) · [session-insights](https://github.com/121212165/dsh-plugin-session-insights) · [relay-quota](https://github.com/121212165/dsh-plugin-relay-quota)。

## 功能

- **`/find 关键词1 关键词2`**：多关键词 AND、大小写折叠（CJK 天然无大小写）、按会话分组、按命中数排序，每会话给最近几条命中摘录（摘录在命中位置附近截断，CJK 上下文不丢）。
- **`session_search` 模型工具**：agent 被问"之前那次对话说过什么"时自己查。
- **容错**：空查询、无命中、缺目录都是可读输出；损坏行跳过并忽略。

## 配置

```yaml
- insert:
    - id: transcript-search
      name: dsh-plugin-transcript-search
      config:
        enabled: true
        # dataDir: ~/.dsh/transcripts   # 默认与 transcript 插件一致
        sessionLimit: 20
        snippetLimit: 3
        snippetWidth: 160
```

## 安装

三步，实测于 `@deepseek-ai/dsh@0.1.7-alpha.1`（需 `pnpm` 在 PATH 上）：

```sh
# ① 装进 profile：dsh plugin 把参数原样转发给 pnpm，git 包会自动跑 prepare 构建 lib/
dsh plugin --profile web add github:121212165/dsh-plugin-transcript-search
```

② 把本仓库根目录 `cordis.patch.yml` 的内容**并进** `$DSH_HOME/profiles/web/cordis.patch.yml`。
该文件默认是 `[]`，所以要么整份替换，要么把 insert 条目并进同一个数组；**不要直接追加**——
追加会形成两个 YAML 文档，启动即报
`failed to parse overlay ... end of the stream or a document separator is expected`（本机实测踩过）。

③ 重启 dsh。配置层与 client 半都要重启才生效（客户端按 boot 时算出的内容 rev 下发，硬刷新浏览器没用）。

自检挂载：`dsh --profile web --dump-config | grep dsh-plugin-transcript-search`，应看到该条目。
## 验证状态

- 搜索/摘录/渲染为纯函数，5 个 node --test 测试全绿。
- JSONL 契约与 transcript 插件逐字段一致（line.ts 同源复制）。
- 未在运行中的 dsh 里 live mount 验证本插件自身（同系列插件已验证同一加载路径）。
