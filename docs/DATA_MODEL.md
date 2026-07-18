# 数据模型

| 表 | 作用 | 关键关系/约束 |
|---|---|---|
| `courses` | 学习空间 | 一个活动课程由 settings 指向 |
| `phases`, `weeks` | 六阶段与 24 周路线 | `(course_id, phase/week)` 唯一 |
| `tasks`, `task_evidence` | 执行与验收证据 | 证据随任务级联删除；状态枚举约束 |
| `knowledge_nodes`, `knowledge_edges` | 课程知识画布 | 节点保存类型、正文、颜色、坐标和引用来源；关系边唯一，前置关系拒绝环 |
| `captures`, `notes`, `mindmaps` | 收集、笔记、导图 | 均按课程隔离；导图保存节点/边 JSON |
| `documents`, `document_fts` | 资料与全文索引 | 课程内 SHA-256 唯一；触发器同步 FTS5 |
| `document_highlights` | 原文高亮与批注 | 文档删除时级联 |
| `python_runs` | 代码、输出与运行状态 | UUID；保存退出码、耗时、截断标记及环境 ID、解释器路径/版本运行快照 |
| `quiz_attempts` | 测验结果与错因 | 可关联知识点 |
| `reviews` | 间隔复习队列 | 关联知识点、到期日、间隔和质量 |
| `generic_items` | P0 工作台通用条目 | `collection` 区分项目/论文/实验/面试等 |
| `settings` | 首启、主题、活动课程等 | JSON 值，键唯一 |

所有写操作使用参数化 SQL 和事务；连接启用 `foreign_keys` 与 WAL。当前 schema 版本是 3，v1/v2 数据库与备份会幂等迁移，新增列不破坏已有数据。`data/studypilot.db` 是运行数据库，`data/seeds/roadmap.json` 是默认路线种子，不应把构建产物当作数据源。
