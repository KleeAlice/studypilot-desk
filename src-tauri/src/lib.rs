use local_host::{LocalApiConfig, LocalApiHandle, PythonWorkerConfig};
use rand::distr::Alphanumeric;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, RunEvent, State, WebviewWindow};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const MAX_EXPORT_BYTES: usize = 64 * 1024 * 1024;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeConfig {
    api_base: String,
    data_dir: String,
    platform: &'static str,
    session_token: String,
}

struct BackendState {
    runtime: RuntimeConfig,
    export_directory: PathBuf,
    local_api: Mutex<Option<LocalApiHandle>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveRequest {
    suggested_name: String,
    bytes: Vec<u8>,
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    drop(listener);
    Ok(port)
}

fn session_token() -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(48)
        .map(char::from)
        .collect()
}

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri must have a workspace parent")
        .to_path_buf()
}

fn python_worker_command(app: &AppHandle) -> Result<(PathBuf, Vec<String>, PathBuf), String> {
    if cfg!(debug_assertions) {
        let root = project_root();
        let python = if cfg!(target_os = "windows") {
            root.join(".venv").join("Scripts").join("python.exe")
        } else {
            root.join(".venv").join("bin").join("python")
        };
        if !python.exists() {
            return Err(format!("未找到项目 Python 环境：{}", python.display()));
        }
        return Ok((
            python,
            vec!["-m".into(), "backend.app.worker_bridge".into()],
            root,
        ));
    }

    let executable = if cfg!(target_os = "windows") {
        app.path()
            .resource_dir()
            .map_err(|error| error.to_string())?
            .join("backend")
            .join("StudyPilotPythonWorker.exe")
    } else {
        app.path()
            .resource_dir()
            .map_err(|error| error.to_string())?
            .join("backend")
            .join("StudyPilotPythonWorker")
    };
    if !executable.exists() {
        return Err(format!(
            "未找到已打包的 Python 领域 Worker：{}",
            executable.display()
        ));
    }
    let cwd = executable
        .parent()
        .ok_or_else(|| "Python 领域 Worker 路径无效".to_string())?
        .to_path_buf();
    Ok((executable, Vec::new(), cwd))
}

#[cfg(desktop)]
fn start_backend(app: &AppHandle) -> Result<BackendState, String> {
    let data_dir = app_data_dir(app)?;
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    let export_directory = data_dir.join("exports");
    fs::create_dir_all(&export_directory).map_err(|error| error.to_string())?;
    let api_port = free_port()?;
    let public_token = session_token();
    let worker_token = session_token();
    let (program, arguments, cwd) = python_worker_command(app)?;
    let local_api = local_host::start(LocalApiConfig {
        port: api_port,
        public_session_token: public_token.clone(),
        python_worker: PythonWorkerConfig {
            program,
            arguments,
            working_directory: cwd,
            data_directory: data_dir.clone(),
            session_token: worker_token,
        },
    })?;
    Ok(BackendState {
        runtime: RuntimeConfig {
            api_base: format!("http://127.0.0.1:{api_port}"),
            data_dir: data_dir.to_string_lossy().into_owned(),
            platform: "tauri",
            session_token: public_token,
        },
        export_directory,
        local_api: Mutex::new(Some(local_api)),
    })
}

#[cfg(mobile)]
fn mobile_api_base() -> Result<String, String> {
    let configured = option_env!("STUDYPILOT_MOBILE_API_BASE")
        .map(str::to_owned)
        .or_else(|| std::env::var("STUDYPILOT_MOBILE_API_BASE").ok())
        .unwrap_or_default();
    let api_base = configured.trim().trim_end_matches('/').to_owned();

    if !(api_base.starts_with("https://") || api_base.starts_with("http://")) {
        return Err(
            "移动端需要设置 STUDYPILOT_MOBILE_API_BASE 为 HTTPS API 地址；移动端不启动本地 Python Worker。"
                .to_string(),
        );
    }
    Ok(api_base)
}

#[cfg(mobile)]
fn start_backend(app: &AppHandle) -> Result<BackendState, String> {
    let data_dir = app_data_dir(app)?;
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    let export_directory = data_dir.join("exports");
    fs::create_dir_all(&export_directory).map_err(|error| error.to_string())?;

    Ok(BackendState {
        runtime: RuntimeConfig {
            api_base: mobile_api_base()?,
            data_dir: data_dir.to_string_lossy().into_owned(),
            platform: "tauri-mobile",
            session_token: String::new(),
        },
        export_directory,
        local_api: Mutex::new(None),
    })
}

fn safe_filename(name: &str) -> Result<String, String> {
    let candidate = Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if candidate.is_empty() || candidate != name || candidate.contains(['/', '\\']) {
        return Err("导出文件名无效".to_string());
    }
    Ok(candidate.to_string())
}

fn save_to_directory(directory: &Path, request: SaveRequest) -> Result<String, String> {
    if request.bytes.is_empty() || request.bytes.len() > MAX_EXPORT_BYTES {
        return Err("导出文件为空或超过 64 MB".to_string());
    }
    let filename = safe_filename(&request.suggested_name)?;
    let target = directory.join(filename);
    native_core::atomic_write(&target, &request.bytes).map_err(|error| error.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn runtime_config(state: State<'_, BackendState>) -> RuntimeConfig {
    state.runtime.clone()
}

#[tauri::command]
fn window_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|error| error.to_string())
}

#[tauri::command]
fn window_toggle_maximize(window: WebviewWindow) -> Result<bool, String> {
    if window.is_maximized().map_err(|error| error.to_string())? {
        window.unmaximize().map_err(|error| error.to_string())?;
        Ok(false)
    } else {
        window.maximize().map_err(|error| error.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
fn window_close(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|error| error.to_string())
}

#[tauri::command]
fn save_export(
    app: AppHandle,
    state: State<'_, BackendState>,
    request: SaveRequest,
) -> Result<Option<String>, String> {
    let file = app
        .dialog()
        .file()
        .set_file_name(&request.suggested_name)
        .blocking_save_file();
    let Some(file) = file else {
        return Ok(None);
    };
    let target = file
        .as_path()
        .ok_or_else(|| "无法写入非本地导出路径".to_string())?;
    if request.bytes.is_empty() || request.bytes.len() > MAX_EXPORT_BYTES {
        return Err("导出文件为空或超过 64 MB".to_string());
    }
    let target_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "导出文件名无效".to_string())?;
    let target = target
        .parent()
        .ok_or_else(|| "导出路径无效".to_string())?
        .join(safe_filename(target_name)?);
    native_core::atomic_write(&target, &request.bytes).map_err(|error| error.to_string())?;
    let _ = &state.export_directory;
    Ok(Some(target.to_string_lossy().into_owned()))
}

#[tauri::command]
fn export_directory(state: State<'_, BackendState>) -> String {
    state.export_directory.to_string_lossy().into_owned()
}

#[tauri::command]
fn choose_export_directory() -> Option<String> {
    None
}

#[tauri::command]
fn reset_export_directory(state: State<'_, BackendState>) -> Result<String, String> {
    fs::create_dir_all(&state.export_directory).map_err(|error| error.to_string())?;
    Ok(state.export_directory.to_string_lossy().into_owned())
}

#[tauri::command]
fn save_to_archive(
    state: State<'_, BackendState>,
    request: SaveRequest,
) -> Result<Option<String>, String> {
    save_to_directory(&state.export_directory, request).map(Some)
}

#[tauri::command]
fn open_export_directory(app: AppHandle, state: State<'_, BackendState>) -> Result<(), String> {
    app.opener()
        .open_path(
            state.export_directory.to_string_lossy().into_owned(),
            None::<String>,
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_system_fonts() -> Vec<String> {
    Vec::new()
}

#[tauri::command]
fn set_zoom_factor(_factor: f64) {}

#[tauri::command]
fn clipboard_read_text(app: AppHandle) -> Result<String, String> {
    app.clipboard()
        .read_text()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn clipboard_write_text(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard()
        .write_text(text)
        .map_err(|error| error.to_string())
}

impl BackendState {
    fn stop(&self) {
        if let Ok(mut local_api) = self.local_api.lock() {
            if let Some(local_api) = local_api.as_mut() {
                local_api.stop();
            }
            *local_api = None;
        }
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(start_backend(app.handle())?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_config,
            window_minimize,
            window_toggle_maximize,
            window_close,
            save_export,
            export_directory,
            choose_export_directory,
            reset_export_directory,
            save_to_archive,
            open_export_directory,
            list_system_fonts,
            set_zoom_factor,
            clipboard_read_text,
            clipboard_write_text,
        ])
        .build(tauri::generate_context!())
        .expect("error while building StudyPilot Desk");

    app.run(|app, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            if let Some(state) = app.try_state::<BackendState>() {
                state.stop();
            }
        }
    });
}
