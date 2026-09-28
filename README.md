# dsh-plugin-transcript-search

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

克隆或 npm 安装到 profile 的 node_modules；从源码安装需要先构建：`npm install` 经 `prepare` 自动产出 `lib/`。

## 验证状态

- 搜索/摘录/渲染为纯函数，5 个 node --test 测试全绿。
- JSONL 契约与 transcript 插件逐字段一致（line.ts 同源复制）。
- 未在运行中的 dsh 里 live mount 验证本插件自身（同系列插件已验证同一加载路径）。
