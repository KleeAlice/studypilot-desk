# Changelog

本项目遵循语义化版本。版本 PR、标签和 GitHub Release 由 Release Please 根据 Conventional Commits 自动维护。

## [0.2.1](https://github.com/c76d3656e/studypilot-desk/compare/v0.2.0...v0.2.1) (2026-08-07)


### Bug Fixes

* declare bundle icon list for AppImage bundling ([af8c6eb](https://github.com/c76d3656e/studypilot-desk/commit/af8c6eb42dd0445a648eaadd51b061ea46e54040))
* pass --repo to gh release upload so publish works without checkout ([326d81b](https://github.com/c76d3656e/studypilot-desk/commit/326d81b98555d3795570da3b0b9b2122fd007ec3))

## 0.2.0

- 将桌面运行时从 Electron 迁移到 Tauri 2。
- 使用 Rust Actix-Web 作为唯一桌面 HTTP 调度入口。
- 将 Python 收口为不监听端口的私有 stdio Worker。
