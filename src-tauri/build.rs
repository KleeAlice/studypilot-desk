use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    // `tauri::generate_context!` validates every declared bundle resource even
    // for a plain `cargo build`. The private Python Worker is created by
    // `npm run build:backend-runtime` before `tauri build`, but developers
    // should still be able to compile and test Rust independently.
    let workspace_root = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest path"))
        .parent()
        .expect("src-tauri must have a workspace parent")
        .to_path_buf();
    let worker_dir = workspace_root
        .join("build")
        .join("backend-runtime")
        .join("StudyPilotPythonWorker");

    if !worker_dir.exists() {
        fs::create_dir_all(&worker_dir).expect("create worker placeholder directory");
        let executable = if cfg!(target_os = "windows") {
            worker_dir.join("StudyPilotPythonWorker.exe")
        } else {
            worker_dir.join("StudyPilotPythonWorker")
        };
        fs::write(
            executable,
            "StudyPilot Python Worker placeholder. Run npm run build:backend-runtime before packaging.\n",
        )
        .expect("write worker placeholder");
        println!("cargo:warning=using a placeholder Python Worker; it will be replaced by npm run build:backend-runtime during packaging");
    }

    println!("cargo:rerun-if-changed=../build/backend-runtime/StudyPilotPythonWorker");
    tauri_build::build()
}
