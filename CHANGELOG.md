# Changelog

本项目遵循语义化版本。版本 PR、标签和 GitHub Release 由 Release Please 根据 Conventional Commits 自动维护。

## [0.3.0](https://github.com/KleeAlice/studypilot-desk/compare/v0.2.1...v0.3.0) (2026-08-08)


### Features

* full responsive shell + mobile layout pass ([2ac2cf5](https://github.com/KleeAlice/studypilot-desk/commit/2ac2cf573cdf88ee26e001384b33d2f10e174c4e))
* migrate ~95 routes to native Rust gateway ([59c7340](https://github.com/KleeAlice/studypilot-desk/commit/59c7340c622d7b4a60b44340fb642cb6cb774f4d))
* migrate desktop runtime to Tauri ([0346088](https://github.com/KleeAlice/studypilot-desk/commit/03460880a54c2a895d907f35b773b893e5eef87b))
* native Rust gateway routing + robust boot + no console window ([85cf24b](https://github.com/KleeAlice/studypilot-desk/commit/85cf24b57a8775e3f0d3b404a93c2ed3eac6d75d))
* remove FastAPI from the worker runtime; migrate every route to Rust ([bed4203](https://github.com/KleeAlice/studypilot-desk/commit/bed4203fbc3eceb9802c5dd88e55ec69e285bb2e))


### Bug Fixes

* add CORS preflight + non-blocking connection state ([10ba95f](https://github.com/KleeAlice/studypilot-desk/commit/10ba95f9ac717d39ed6684b87c70b7d98df327fe))
* authenticate raw file/media loads via session query param ([5e90231](https://github.com/KleeAlice/studypilot-desk/commit/5e90231a3dff47fdd627fdc60c870ba74d519e17))
* bump Cargo.lock to 0.2.1 for release-please version sync ([91424e4](https://github.com/KleeAlice/studypilot-desk/commit/91424e4a867b067c0d0c626d17c33cc345663b3a))
* declare bundle icon list for AppImage bundling ([af8c6eb](https://github.com/KleeAlice/studypilot-desk/commit/af8c6eb42dd0445a648eaadd51b061ea46e54040))
* make CI checks cross-platform ([67159aa](https://github.com/KleeAlice/studypilot-desk/commit/67159aaca04c6b60311b765368de24257f29c658))
* pass --repo to gh release upload so publish works without checkout ([326d81b](https://github.com/KleeAlice/studypilot-desk/commit/326d81b98555d3795570da3b0b9b2122fd007ec3))
* resolve Python in clean package runners ([e9e1ab2](https://github.com/KleeAlice/studypilot-desk/commit/e9e1ab239e8a9925b18a89a5ef40accc337e814d))


### Performance Improvements

* defer document workspace assets ([cd71732](https://github.com/KleeAlice/studypilot-desk/commit/cd71732d2d62c3727ded460da39907b8f5a30781))

## [0.2.1](https://github.com/c76d3656e/studypilot-desk/compare/v0.2.0...v0.2.1) (2026-08-07)


### Bug Fixes

* declare bundle icon list for AppImage bundling ([af8c6eb](https://github.com/c76d3656e/studypilot-desk/commit/af8c6eb42dd0445a648eaadd51b061ea46e54040))
* pass --repo to gh release upload so publish works without checkout ([326d81b](https://github.com/c76d3656e/studypilot-desk/commit/326d81b98555d3795570da3b0b9b2122fd007ec3))

## 0.2.0

- 将桌面运行时从 Electron 迁移到 Tauri 2。
- 使用 Rust Actix-Web 作为唯一桌面 HTTP 调度入口。
- 将 Python 收口为不监听端口的私有 stdio Worker。
