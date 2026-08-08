# 测试计划

## 层级

1. 后端单元/集成：种子、数据库迁移、统一 API、文档解析/检索、DAG、Python 运行、学习闭环、备份恢复。
2. 前端/平台 interface 单元：导航、首启、真实 API 交互、错误提示、Python 轮询、Web/Tauri adapter 与会话令牌。
3. Python 端到端烟雾：以临时目录完成路线、任务证据、资料检索、代码运行、备份和重启持久化。
4. Tauri 烟雾：生产构建、Rust command、Actix-Web 会话校验、首屏内容、无水平溢出和 Python Worker 停止。
5. Tauri WebDriver/E2E：首启、健康检查、窗口控件、全部导航、三种分辨率、截图、控制台错误、关窗端口释放。

## 必测异常

- 空标题/无效状态/不存在资源。
- 重复文档、DAG 环、自恢复备份、恶意 ZIP 路径。
- Python 语法错误、超时、停止、输出截断、公开测试失败。
- 后端不可达和 API 业务错误的用户提示。
- 生产 Tauri WebView 资源加载、Actix-Web / Python Worker 关闭竞态与 Web/PWA 运行时配置。

## 完成门槛

- 所有自动化命令退出码 0。
- 1366×768、1440×900、1920×1080 无异常水平滚动。
- E2E 页面错误与控制台 error/warning 列表为空。
- 关窗后健康端点不可访问。
- `start.bat` 走 Tauri 开发启动路径；`npm run build:tauri` 产出正式安装包。

