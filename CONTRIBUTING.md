# Contributing

## Pull request 门禁

提交 PR 到 `main` 后，GitHub Actions 会执行 TypeScript、前端测试、Python 3.10/3.12/3.14、Rust workspace、依赖审计、CodeQL 和 Windows NSIS 打包。合并前应将 `CI` 与 `Security` 中的检查设为必需检查。

本地至少运行：

```powershell
npm.cmd run check:versions
npm.cmd run typecheck
npm.cmd test
.\.venv\Scripts\python.exe -m ruff check backend scripts
.\.venv\Scripts\python.exe -m pytest backend\tests -q
cargo clippy --manifest-path src-tauri\Cargo.toml --workspace --all-targets --locked -- -D warnings
cargo test --manifest-path src-tauri\Cargo.toml --workspace --all-targets --locked
```

## 提交与版本

提交信息采用 Conventional Commits，例如 `feat: ...`、`fix: ...`、`docs: ...`、`chore: ...`。合并到 `main` 后，Release Please 会维护版本 PR，并同步以下版本源：

- `package.json` 与 `package-lock.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml` 与 `src-tauri/Cargo.lock`
- `pyproject.toml`
- `backend/app/__init__.py`

版本 PR 合并后，GitHub Actions 自动创建 `vX.Y.Z` 标签和 GitHub Release，并构建 Windows NSIS、Linux DEB/AppImage 与 macOS DMG。发布前应配置对应平台的代码签名和公证密钥；未配置时产物为未签名构建。

建议在仓库 Actions secrets 中配置 `RELEASE_PLEASE_TOKEN`（具有 contents 与 pull requests 权限的 fine-grained PAT），使自动版本 PR 也能触发完整 CI。未配置时会回退到 `GITHUB_TOKEN`，但 GitHub 不会为该令牌创建的 PR 自动派生新的工作流运行。

RustSec 对新增漏洞或警告采用失败策略。`.cargo/audit.toml` 仅允许当前 Tauri 2 上游链路中已审查、暂无兼容替代版本的 GTK3/URL pattern 公告；升级 Tauri 后应及时移除已经不再需要的例外。
