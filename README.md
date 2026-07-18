# StudyPilot Desk

> 本地优先的桌面学习操作系统：把课程、路线、任务、资料、知识图谱、实验和复习组织成一个持续推进的学习工作台。

StudyPilot Desk 使用 Electron、React、FastAPI 与 SQLite 构建，不依赖云端即可使用。数据默认保存在本机，适合管理长期课程、学习路线、知识画布、资料引用、Python 实验和复习统计。

## 项目状态

- 桌面端核心学习闭环、课程书架、知识笔记、资料书架、实验室、统计与备份已经可用。
- Android 伴侣应用正在设计与开发，计划支持加密 `.spack` 数据包、离线只读快照和电脑在线时的安全访问。
- 移动端设计见 [Mobile 与加密数据包规格](docs/superpowers/specs/2026-07-18-mobile-app-data-pack-design.md)。
- 当前为持续开发版本，升级前建议使用应用内备份功能保存数据。

## 直接启动

Windows 双击 `start.bat`，或在 PowerShell 中运行：

```powershell
.\start.ps1
```

首次启动会创建 `.venv`、安装 Python/Node 依赖并构建桌面端。需要 Node.js 20+、Python 3.10+ 和可访问 npm/PyPI 的网络。运行数据默认保存在 `data/`，该目录已从 Git 排除，仅保留确定性的演示 seed。

开发模式：

```powershell
.\dev.bat
```

重置演示数据（会先旁路保存原数据）：

```powershell
.\reset_demo.bat
```

## 已实现的核心闭环

- 真实 DOCX 路线导入：W1-W24、六阶段、G1-G6、周任务、周交付物、阶段验收与补救规则。
- 无边框单实例桌面窗口：窗口状态恢复、最大化/还原/最小化/关闭，Electron 统一管理随机端口 FastAPI 子进程。
- 本地 SQLite：全局课程书架、课程主页、多知识笔记本、任务、证据、自由知识画布、资料引用、代码运行、测验、掌握度、复习、项目研究条目和设置；旧数据库自动迁移到当前 schema。
- 学习驾驶舱：当前周、阶段门、交付契约、任务新增与完成状态。
- 课程与知识画布：启动先进入全局课程书架，课程主页再统一进入各学习模块；每门课程可创建多个独立知识笔记，概念、纸质便签、可翻面记忆卡、资料引用卡和思维分支可拖动、平移、缩放、自动适合视野、连线与删除；支持文件导入、系统剪贴板图片粘贴和课程级图片持久化。
- 资料书架：PDF、DOCX、Markdown、TXT 真解析，SHA-256 去重，SQLite FTS5/BM25 全文检索，原文片段返回。
- Python 实验室：发现当前/项目虚拟环境、PATH、Windows py 与 Conda 解释器并安全选择；具备编辑/测试标签、资源/运行/历史侧栏、问题/控制台/历史面板、System/Light/Dark 终端、字号/超时/输出限制、停止、草稿恢复、撤销替换和运行快照。
- 学习科学闭环：确定性测验评分、Beta-Binomial 掌握度、错因记录和间隔复习队列。
- 本地备份：带清单与 SHA-256 校验的 ZIP，恢复前自动留恢复点，拒绝 Zip Slip 路径。
- 深色/浅色/跟随系统主题、界面与代码字体选择、中文首启向导、尊重 reduced-motion 的目的性动效、键盘操作与多分辨率响应式验证。

项目/研究、论文、实验、错误、面试、周复盘等 P0 工作台已具备统一 CRUD 持久化底座和页面入口，但其领域表单、统计和自动编排深度有限；见 [产品范围](docs/PRODUCT_SCOPE.md) 与 [已知限制](docs/KNOWN_LIMITATIONS.md)。

## 常用验证命令

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run smoke
npm.cmd run test:e2e
.\.venv\Scripts\python.exe scripts\smoke_test.py
```

Electron/Playwright 命令需要桌面会话。详见 [测试报告](docs/TEST_REPORT.md)。

## 技术结构

```text
backend/          FastAPI、SQLite、领域服务、Python 运行器
electron/         主进程、预加载桥、窗口与后端生命周期
frontend/         React 工作台与设计系统
data/seeds/       从源 DOCX 生成的结构化路线
scripts/          路线抽取、开发启动、烟雾测试、演示重置
tests/            前端、Electron 与 Playwright 测试
docs/             产品、架构、安全、测试与导入报告
mobile/           规划中的 Capacitor Android 工程
```

## 数据、安全与隐私

后端仅监听 `127.0.0.1`，每次 Electron 启动生成会话令牌；渲染进程不开 Node.js，只能使用受限 preload API。默认没有遥测、账号或外部 AI 请求。

`data/`、`.env`、本地数据库、媒体、备份、虚拟环境、依赖和构建产物不会上传到 GitHub。Python 实验使用本机子进程与资源边界，但不是操作系统级安全沙箱，不应运行不受信任的代码。详见 [安全说明](docs/SECURITY.md)。

## 路线数据

仓库包含结构化演示路线 `data/seeds/roadmap.json`。如需从自己的 DOCX 重新生成：

```powershell
.\.venv\Scripts\python.exe scripts\extract_roadmap.py "C:\path\to\roadmap.docx"
```

字段映射与解析规则见 [路线导入报告](docs/ROADMAP_IMPORT_REPORT.md)。

## 文档

- [产品范围](docs/PRODUCT_SCOPE.md)
- [系统架构](docs/ARCHITECTURE.md)
- [数据模型](docs/DATA_MODEL.md)
- [设计系统](docs/DESIGN_SYSTEM.md)
- [安全说明](docs/SECURITY.md)
- [测试计划](docs/TEST_PLAN.md)
- [已知限制](docs/KNOWN_LIMITATIONS.md)
- [手机版与数据包设计](docs/superpowers/specs/2026-07-18-mobile-app-data-pack-design.md)

## 许可证

本仓库当前未附带开源许可证。公开可见不代表授予复制、修改或分发许可；在许可证明确前保留全部权利。
