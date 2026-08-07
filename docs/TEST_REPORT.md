# 测试报告

测试日期：2026-07-16（桌面基线），2026-07-18（移动端增量）；平台：Windows，Node.js 24.14.1，Electron 37，项目 Python 虚拟环境。

| 命令 | 结果 | 覆盖 |
|---|---:|---|
| `.venv\\Scripts\\python.exe -m pytest -q` | 75 passed | schema v5、课程软删除/恢复/永久清理、多知识笔记本隔离与迁移、图片资产隔离、资料引用、解释器发现、运行隔离/停止/截断、含图片的备份恢复 |
| `.venv\\Scripts\\python.exe -m compileall -q backend` | 通过 | 后端 Python 语法与模块编译 |
| `npm.cmd test` | 82 passed | 全局课程书架、两步课程向导、课程主页、多知识笔记本、Hash 路由兼容、知识画布 23 项、原生剪贴板字节导入、字体与动效策略、Python 工作台 28 项、Electron 后端管理器、PowerShell 5.1 脚本解析 |
| `npm.cmd run typecheck` | 通过 | React、Electron、Playwright TypeScript |
| `.venv\\Scripts\\python.exe scripts\\smoke_test.py` | 通过 | 24 周路线、任务持久化、资料检索、真实 Python 运行、备份业务链 |
| `npm.cmd run build` | 通过 | Vite 生产包与 Electron 主进程/预加载包 |
| `npm.cmd run smoke` | 通过 | 隔离用户目录下的生产窗口、preload/剪贴板桥、首屏、横向溢出、后端停止与正常退出 |
| `npm.cmd run test:e2e` | 1 passed | 首启画像、全局课程书架、两步新建课程、课程主页、创建并直达知识笔记、系统剪贴板 PNG 解码与课程图片地址、画布非等待光标、关系增删、拖动重载、选区引用、字体持久化、真实解释器运行、控制台主题、1366×768/1920×1080 视口边界 |

原生窗口检查覆盖知识画布工具栏/画布，以及 Python 工具栏/编辑器/底部面板/状态栏；两种分辨率下关键区域均在视口内，根节点无横向溢出。Python 实验室的 1366×768 与 1920×1080 截图另经人工检查。

## 2026-07-18 移动端增量验证

| 命令 | 结果 | 覆盖 |
|---|---:|---|
| `npx.cmd vitest run --config vitest.config.ts --maxWorkers=1` | 27 files / 121 passed | 原桌面回归，以及移动数据源、四项导航、今日任务、课程、图谱、统计、动效、构建和 Capacitor 契约 |
| `npm.cmd run typecheck` | 通过 | React Mobile、桌面 React 与 Electron TypeScript |
| `npm.cmd run build` | 通过 | 桌面 Vite 包与 Electron 主进程/预加载包 |
| `npm.cmd run mobile:build` | 通过 | 移动生产包；JS 212.16 kB（gzip 67.26 kB），CSS 21.72 kB（gzip 5.15 kB） |
| `npx.cmd cap sync android` | 通过 | Capacitor 8 Web 资源复制、配置生成和 Android 插件同步 |
| `python scripts\verify_mobile_ui.py`（由测试服务器托管） | 通过 | 393×852 手机视口；首页、完成反馈、底栏切换、图谱详情、统计页，浏览器控制台零错误 |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\bootstrap-mobile-android.ps1 -AcceptAndroidLicenses` | 通过 | 校验并使用便携 JDK 21、Android SDK 36 与 Gradle 8.14.3；Android 单测与 `assembleDebug` 成功，APK 9,568,638 字节 |

移动端截图经人工检查：页面切换为约 240ms 的短距离进入；点击卡片有 2–3px 下沉；任务完成只播放一次局部勾选、进度推进和 620ms 粒子；图谱详情由底部升起；没有空闲循环漂浮、呼吸或大幅缩放。明暗主题与 `prefers-reduced-motion` 均有专门样式。Debug APK 的 SHA-256 为 `705c31d4b5b9be3e61dc178a8bb66c504472831c17acbf5f6708b0d108d3222d`；真机安装与触控验收仍待执行。

## 本轮测试中发现并修复

- 知识画布原有 550px 硬最小高度会在 1366×768 下超出窗口；改为可收缩的整页 flex 高度链，同时保留桌面大屏扩展空间。
- 课程切换后摘要刷新尚未完成时可重复打开菜单，导致旧异步动作关闭新菜单；切换期间现在锁定入口，并在忙碌结束后恢复键盘焦点。
- Python 旧运行记录或最小响应缺少 `stdout`/`stderr` 时会触发 `.slice` 崩溃；所有入口统一归一为空字符串并增加兼容回归。
- 知识检查器自动保存增加课程级本地待同步日志、失败重试和重新进入恢复，避免防抖窗口或瞬时网络失败丢失编辑。
- Node 环境测试曾直接访问浏览器全局；测试初始化现在按运行环境隔离，浏览器与 Electron 管理器套件可在同一全量命令中运行。
- E2E 改为等待实际解释器发现响应，并断言后端至少暴露当前解释器，避免依赖固定延时。
- schema v4 后旧备份测试仍固定断言版本 3；已更新为当前版本，并把 `media/` 图片目录纳入备份与恢复清单。
- 已有 StudyPilot 实例会触发 Electron 单实例锁，使 smoke/E2E 测试窗口正常退出却被误判失败；测试现使用临时 `--user-data-dir`，不会关闭或干扰用户正在运行的实例。
- 知识网络导航回归测试已按新信息架构更新为先验证“知识笔记本”，再打开课程进入画布。
- Electron 的 `file://` 页面会把绝对 History 路由解释成 `file:///C:/courses/...`，导致地址变化但仍渲染书架；生产环境现使用 `#/courses/...`，开发服务器继续使用普通路径，并兼容旧路径解析。
- E2E 曾直接复用旧构建产物；`test:e2e` 现在先执行完整生产构建，确保原生验收与当前源码一致。
- 课程书架、课程主页、知识画布和 Python 实验室均以真实 Electron 截图复核；书架移除木板/纸页拟物与无限漂浮背景，统一系统字体、SVG 图标、单主色材质和 180–380ms 的目的性动效。
- 生产 CSP 曾阻止 `file://` 渲染页读取本地后端图片，导致上传成功但画布显示破图；图片源现只放行 `127.0.0.1` 随机端口，资源 URL 同时绑定课程，切换课程不会产生瞬时 404。
- 原生剪贴板曾在主进程转 Base64、渲染进程同步解码，容易产生内存峰值和卡顿；现直接通过 IPC 传递 PNG 字节，并在真实 Electron 中验证图片完成解码。
- 取消极光漂移、书架扫光、呼吸点、空画布漂浮和连接脉冲等空闲持续动画；大面积常驻模糊层改为低成本材质，只保留弹窗、卡片和操作反馈的短时动效。
- 全局与课程内设置新增界面字体/代码字体白名单及即时预览，Python 编辑器与控制台同步应用；主题选中态和成功提示颜色也完成一致性修复。

FastAPI TestClient 运行时有一条来自依赖栈的 Starlette/httpx 弃用警告，不影响通过结果；见已知限制。
