//! The desktop application's only local HTTP host.
//!
//! `start` and `LocalApiHandle::stop` are the complete public interface.  The
//! implementation owns HTTP authentication, Actix-Web lifecycle and the
//! private Python protocol.  Python remains a domain adapter during the Rust
//! migration, but it never binds a TCP port or exposes an HTTP interface.

use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use futures_channel::mpsc as futures_mpsc;
use serde::Deserialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, LazyLock, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

mod router;

use router::{parse_query, raw_route, route, stream_route, Route};

const MAX_REQUEST_BYTES: usize = 96 * 1024 * 1024;
const SESSION_HEADER: &str = "x-studypilot-session";

/// Routes owned natively by Rust.  Each maps to a Python domain callable.
/// Routes that are not (yet) in this table fall back to the legacy Python
/// passthrough so the app keeps working during the gateway migration.
static ROUTES: LazyLock<Vec<Route>> = LazyLock::new(|| {
    vec![
        route("GET", "/api/health", "health"),
        route("GET", "/api/system/status", "system.status"),
        route("GET", "/api/settings", "settings.list"),
        route(
            "GET",
            "/api/settings/active-course",
            "settings.active_course",
        ),
        route("PUT", "/api/settings/{key}", "settings.update"),
        route("GET", "/api/courses", "courses.list"),
        route("POST", "/api/courses", "courses.create"),
        route("PATCH", "/api/courses/{course_id}", "courses.update"),
        route("GET", "/api/courses/trash", "courses.trash"),
        route(
            "POST",
            "/api/courses/{course_id}/activate",
            "courses.activate",
        ),
        route("GET", "/api/courses/{course_id}/home", "courses.home"),
        route("GET", "/api/courses/{course_id}/stats", "courses.stats"),
        route("DELETE", "/api/courses/{course_id}", "courses.delete"),
        route(
            "POST",
            "/api/courses/{course_id}/restore",
            "courses.restore",
        ),
        route(
            "DELETE",
            "/api/courses/{course_id}/permanent",
            "courses.purge",
        ),
        route("GET", "/api/courses/{course_id}/roadmap", "courses.roadmap"),
        route("GET", "/api/roadmaps", "roadmap"),
        route("GET", "/api/today", "today"),
        route("GET", "/api/tasks", "tasks.list"),
        route("POST", "/api/tasks", "tasks.create"),
        route("GET", "/api/tasks/{task_id}", "tasks.get"),
        route("PATCH", "/api/tasks/{task_id}", "tasks.update"),
        route("DELETE", "/api/tasks/{task_id}", "tasks.delete"),
        route(
            "POST",
            "/api/tasks/{task_id}/evidence",
            "tasks.evidence.add",
        ),
        route(
            "GET",
            "/api/courses/{course_id}/documents",
            "documents.list",
        ),
        route("GET", "/api/documents", "documents.list"),
        route("GET", "/api/documents/{document_id}", "documents.get"),
        route(
            "GET",
            "/api/documents/{document_id}/content",
            "documents.content",
        ),
        route("GET", "/api/search", "search"),
        route("GET", "/api/library", "library"),
        route("GET", "/api/knowledge", "knowledge.graph"),
        route("GET", "/api/knowledge/nodes", "knowledge.nodes.list"),
        route("POST", "/api/knowledge/nodes", "knowledge.nodes.create"),
        route(
            "PATCH",
            "/api/knowledge/nodes/{node_id}",
            "knowledge.nodes.update",
        ),
        route(
            "DELETE",
            "/api/knowledge/nodes/{node_id}",
            "knowledge.nodes.delete",
        ),
        route(
            "GET",
            "/api/knowledge/nodes/{node_id}/prerequisites",
            "knowledge.nodes.prerequisites",
        ),
        route("POST", "/api/knowledge/edges", "knowledge.edges.create"),
        route(
            "DELETE",
            "/api/knowledge/edges/{edge_id}",
            "knowledge.edges.delete",
        ),
        route("GET", "/api/mastery", "mastery"),
        route(
            "GET",
            "/api/courses/{course_id}/notebooks",
            "notebooks.list",
        ),
        route(
            "POST",
            "/api/courses/{course_id}/notebooks",
            "notebooks.create",
        ),
        route(
            "PATCH",
            "/api/courses/{course_id}/notebooks/{notebook_id}",
            "notebooks.update",
        ),
        route(
            "DELETE",
            "/api/courses/{course_id}/notebooks/{notebook_id}",
            "notebooks.trash",
        ),
        route(
            "GET",
            "/api/courses/{course_id}/notebooks/{notebook_id}/graph",
            "notebooks.graph",
        ),
        route(
            "POST",
            "/api/courses/{course_id}/notebooks/{notebook_id}/nodes",
            "notebooks.nodes.create",
        ),
        route(
            "PATCH",
            "/api/courses/{course_id}/notebooks/{notebook_id}/nodes/{node_id}",
            "notebooks.nodes.update",
        ),
        route(
            "DELETE",
            "/api/courses/{course_id}/notebooks/{notebook_id}/nodes/{node_id}",
            "notebooks.nodes.delete",
        ),
        route(
            "POST",
            "/api/courses/{course_id}/notebooks/{notebook_id}/edges",
            "notebooks.edges.create",
        ),
        route(
            "DELETE",
            "/api/courses/{course_id}/notebooks/{notebook_id}/edges/{edge_id}",
            "notebooks.edges.delete",
        ),
        route("GET", "/api/vocabulary", "vocabulary.list"),
        route("POST", "/api/vocabulary", "vocabulary.create"),
        route(
            "POST",
            "/api/vocabulary/{item_id}/review",
            "vocabulary.review",
        ),
        route("POST", "/api/vocabulary/check-in", "vocabulary.check_in"),
        route("GET", "/api/reviews", "reviews"),
        route(
            "POST",
            "/api/mastery/{knowledge_id}/evidence",
            "mastery.evidence",
        ),
        route("GET", "/api/language/packs", "language.packs"),
        route(
            "GET",
            "/api/courses/{course_id}/language/materials",
            "language.materials",
        ),
        route(
            "GET",
            "/api/courses/{course_id}/language/journey",
            "language.journey",
        ),
        route(
            "POST",
            "/api/courses/{course_id}/language/start",
            "language.start",
        ),
        route(
            "GET",
            "/api/courses/{course_id}/language/lessons/{lesson_id}",
            "language.lesson",
        ),
        route(
            "POST",
            "/api/courses/{course_id}/language/lessons/{lesson_id}/complete",
            "language.complete_lesson",
        ),
        route(
            "GET",
            "/api/courses/{course_id}/language/overview",
            "language.overview",
        ),
        route(
            "POST",
            "/api/courses/{course_id}/language/practice",
            "language.practice",
        ),
        route(
            "GET",
            "/api/courses/{course_id}/language/sessions",
            "language.sessions",
        ),
        route("PATCH", "/api/documents/{document_id}", "documents.update"),
        route("DELETE", "/api/documents/{document_id}", "documents.delete"),
        route(
            "POST",
            "/api/documents/{document_id}/restore",
            "documents.restore",
        ),
        route("GET", "/api/agent/providers", "agent.providers.list"),
        route("GET", "/api/agent/threads", "agent.threads.list"),
        route("POST", "/api/agent/threads", "agent.threads.create"),
        route("GET", "/api/agent/threads/{thread_id}", "agent.threads.get"),
        route(
            "PATCH",
            "/api/agent/threads/{thread_id}",
            "agent.threads.update",
        ),
        route(
            "DELETE",
            "/api/agent/threads/{thread_id}",
            "agent.threads.delete",
        ),
        route("GET", "/api/python/runs", "python.runs.list"),
        route("GET", "/api/python", "python.runs.list"),
        route("GET", "/api/python/runs/{run_id}", "python.runs.get"),
        route("POST", "/api/python/runs/{run_id}/stop", "python.runs.stop"),
        route("GET", "/api/speech/engine", "speech.engine"),
        route("POST", "/api/system/shutdown", "system.shutdown"),
        route("GET", "/api/quizzes", "quiz.history"),
        route("GET", "/api/documents/{document_id}/file", "documents.file"),
        route(
            "POST",
            "/api/documents/{document_id}/export",
            "documents.export",
        ),
        route(
            "GET",
            "/api/settings/wallpaper/image",
            "settings.wallpaper.image",
        ),
        route(
            "DELETE",
            "/api/settings/wallpaper",
            "settings.wallpaper.clear",
        ),
        route("GET", "/api/media/images/{asset_id}", "media.images.get"),
        route(
            "GET",
            "/api/courses/{course_id}/media/images/{asset_id}",
            "media.course_image",
        ),
        route(
            "POST",
            "/api/courses/{course_id}/notebooks/{notebook_id}/export",
            "notebooks.export",
        ),
        route("POST", "/api/knowledge/export", "knowledge.export"),
        route(
            "GET",
            "/api/documents/{document_id}/revisions",
            "documents.revisions.list",
        ),
        route(
            "POST",
            "/api/documents/{document_id}/revisions",
            "documents.revisions.create",
        ),
        route(
            "POST",
            "/api/documents/{document_id}/revisions/undo",
            "documents.revisions.undo",
        ),
        route(
            "POST",
            "/api/documents/{document_id}/revisions/redo",
            "documents.revisions.redo",
        ),
        route(
            "GET",
            "/api/documents/{document_id}/annotations",
            "documents.annotations.list",
        ),
        route(
            "POST",
            "/api/documents/{document_id}/annotations",
            "documents.annotations.create",
        ),
        route(
            "PATCH",
            "/api/documents/{document_id}/annotations/{annotation_id}",
            "documents.annotations.update",
        ),
        route(
            "DELETE",
            "/api/documents/{document_id}/annotations/{annotation_id}",
            "documents.annotations.delete",
        ),
        route(
            "POST",
            "/api/documents/{document_id}/highlights",
            "documents.highlights.create",
        ),
        route("GET", "/api/backups", "backups.list"),
        route("POST", "/api/backups", "backups.create"),
        route("GET", "/api/python/environments", "python.environments"),
        route("POST", "/api/python/runs", "python.runs.start"),
        route("POST", "/api/quizzes/grade", "quiz.grade"),
        route(
            "PUT",
            "/api/agent/providers/{provider_id}",
            "agent.providers.update",
        ),
        route(
            "DELETE",
            "/api/agent/providers/{provider_id}",
            "agent.providers.delete",
        ),
        route(
            "POST",
            "/api/agent/providers/{provider_id}/test",
            "agent.providers.test",
        ),
        route(
            "POST",
            "/api/agent/providers/{provider_id}/diagnostics",
            "agent.providers.diagnostics",
        ),
        route(
            "POST",
            "/api/agent/threads/{thread_id}/generate-title",
            "agent.threads.generate_title",
        ),
        route(
            "POST",
            "/api/agent/threads/{thread_id}/messages",
            "agent.threads.messages.create",
        ),
        stream_route(
            "POST",
            "/api/agent/threads/{thread_id}/messages/stream",
            "agent.messages.stream",
        ),
        route(
            "POST",
            "/api/agent/action-plans/{plan_id}/confirm",
            "agent.actions.confirm",
        ),
        route(
            "POST",
            "/api/agent/action-plans/{plan_id}/cancel",
            "agent.actions.cancel",
        ),
        route(
            "POST",
            "/api/agent/action-plans/{plan_id}/undo",
            "agent.actions.undo",
        ),
        route(
            "POST",
            "/api/courses/{course_id}/roadmap/generate",
            "courses.roadmap.generate",
        ),
        // Multipart uploads: raw body forwarded to the domain callable.
        raw_route(
            "POST",
            "/api/settings/wallpaper",
            "settings.wallpaper.upload",
        ),
        raw_route("POST", "/api/documents/import", "documents.import"),
        raw_route("POST", "/api/backups/restore", "backups.restore"),
        raw_route("POST", "/api/media/images", "media.images.upload"),
        // Generic collections (validated against GENERIC_COLLECTIONS in Python).
        route("GET", "/api/{collection}", "generic.list"),
        route("POST", "/api/{collection}", "generic.create"),
        route("GET", "/api/{collection}/{item_id}", "generic.get"),
        route("PATCH", "/api/{collection}/{item_id}", "generic.update"),
        route("DELETE", "/api/{collection}/{item_id}", "generic.delete"),
    ]
});

/// The command used to start the private Python domain adapter.
#[derive(Clone)]
pub struct PythonWorkerConfig {
    pub program: PathBuf,
    pub arguments: Vec<String>,
    pub working_directory: PathBuf,
    pub data_directory: PathBuf,
    pub session_token: String,
}

/// Configuration for the Rust-owned local HTTP host.
#[derive(Clone)]
pub struct LocalApiConfig {
    pub port: u16,
    pub public_session_token: String,
    pub python_worker: PythonWorkerConfig,
}

/// A request/response seam for future Rust domain modules and Python adapters.
///
/// The local HTTP host has one adapter today.  It deliberately accepts a
/// protocol-neutral request so a Rust implementation can replace a Python
/// route group without changing the renderer or HTTP lifecycle code.
pub trait RouteAdapter: Send + Sync {
    /// Dispatch to a named domain callable (Rust owns routing).  Adapters that
    /// do not support native function dispatch return an error by default.
    fn dispatch_call(
        &self,
        _function: &str,
        _args: serde_json::Value,
    ) -> Result<AdapterResponse, String> {
        Err("native routing not supported by this adapter".to_string())
    }
    /// Open a streaming domain call that relays NDJSON event lines back to the
    /// caller.  The returned channel ends with `StreamEvent::Done`.
    fn stream_call(
        &self,
        _function: &str,
        _args: serde_json::Value,
    ) -> Result<mpsc::Receiver<StreamEvent>, String> {
        Err("native streaming not supported by this adapter".to_string())
    }
}

pub struct AdapterResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

pub struct LocalApiHandle {
    server: actix_web::dev::ServerHandle,
    thread: Option<JoinHandle<()>>,
    worker: PythonWorker,
}

impl LocalApiHandle {
    pub fn stop(&mut self) {
        let server = self.server.clone();
        actix_web::rt::System::new().block_on(server.stop(true));
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        self.worker.stop();
    }
}

impl Drop for LocalApiHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

#[derive(Clone)]
struct LocalApiState {
    public_session_token: String,
    adapter: Arc<dyn RouteAdapter>,
}

/// Starts Actix-Web on loopback and starts the private non-HTTP Python worker.
pub fn start(config: LocalApiConfig) -> Result<LocalApiHandle, String> {
    let worker = PythonWorker::start(config.python_worker)?;
    let state = LocalApiState {
        public_session_token: config.public_session_token,
        adapter: Arc::new(worker.clone()),
    };
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    let (server_tx, server_rx) = mpsc::sync_channel(1);
    let thread = thread::Builder::new()
        .name("studypilot-actix-api".into())
        .spawn(move || {
            let system = actix_web::rt::System::new();
            system.block_on(async move {
                let server = match HttpServer::new(move || {
                    App::new()
                        .app_data(web::Data::new(state.clone()))
                        .app_data(web::PayloadConfig::new(MAX_REQUEST_BYTES))
                        .default_service(web::route().to(dispatch))
                })
                .disable_signals()
                .bind(("127.0.0.1", config.port))
                {
                    Ok(server) => server.run(),
                    Err(error) => {
                        let _ = ready_tx.send(Err(format!("无法监听 Rust Actix API：{error}")));
                        return;
                    }
                };
                let _ = server_tx.send(server.handle());
                let _ = ready_tx.send(Ok(()));
                let _ = server.await;
            });
        })
        .map_err(|error| format!("无法启动 Rust Actix API：{error}"))?;

    match ready_rx.recv_timeout(Duration::from_secs(8)) {
        Ok(Ok(())) => match server_rx.recv_timeout(Duration::from_secs(2)) {
            Ok(server) => Ok(LocalApiHandle {
                server,
                thread: Some(thread),
                worker,
            }),
            Err(error) => {
                worker.stop();
                let _ = thread.join();
                Err(format!("无法取得 Rust Actix API 控制句柄：{error}"))
            }
        },
        Ok(Err(error)) => {
            worker.stop();
            let _ = thread.join();
            Err(error)
        }
        Err(error) => {
            worker.stop();
            let _ = thread.join();
            Err(format!("Rust Actix API 启动超时：{error}"))
        }
    }
}

/// CORS origin allowlist — mirrors the FastAPI middleware that previously
/// guarded the loopback API.  Only loopback / localhost / tauri origins pass.
fn cors_allows_origin(origin: &str) -> bool {
    if origin == "tauri://localhost" {
        return true;
    }
    let rest = origin
        .strip_prefix("http://")
        .or_else(|| origin.strip_prefix("https://"))
        .unwrap_or("");
    let host = rest.split(':').next().unwrap_or("");
    matches!(host, "127.0.0.1" | "localhost" | "tauri.localhost")
}

/// Entry point for every local HTTP request.  Handles CORS preflight and adds
/// CORS headers to every response so the renderer's cross-origin fetch (with
/// the custom session header) is not blocked by the browser.
async fn dispatch(
    request: HttpRequest,
    body: web::Bytes,
    state: web::Data<LocalApiState>,
) -> HttpResponse {
    let allow_origin = request
        .headers()
        .get("origin")
        .and_then(|value| value.to_str().ok())
        .filter(|origin| cors_allows_origin(origin))
        .map(str::to_owned);

    if request.method() == actix_web::http::Method::OPTIONS {
        let mut response = HttpResponse::Ok();
        if let Some(origin) = allow_origin.as_deref() {
            response.insert_header(("access-control-allow-origin", origin));
            if let Some(headers) = request
                .headers()
                .get("access-control-request-headers")
                .and_then(|value| value.to_str().ok())
            {
                response.insert_header(("access-control-allow-headers", headers));
            }
            if let Some(method) = request
                .headers()
                .get("access-control-request-method")
                .and_then(|value| value.to_str().ok())
            {
                response.insert_header(("access-control-allow-methods", method));
            }
            response.insert_header(("access-control-max-age", "600"));
        }
        return response.finish();
    }

    let mut response = dispatch_inner(request, body, state).await;
    if let Some(origin) = allow_origin {
        if let Ok(value) = actix_web::http::header::HeaderValue::from_str(&origin) {
            response
                .headers_mut()
                .insert(actix_web::http::header::ACCESS_CONTROL_ALLOW_ORIGIN, value);
        }
    }
    response
}

async fn dispatch_inner(
    request: HttpRequest,
    body: web::Bytes,
    state: web::Data<LocalApiState>,
) -> HttpResponse {
    if body.len() > MAX_REQUEST_BYTES {
        return error_response(413, "PAYLOAD_TOO_LARGE", "请求超过本地 API 限制");
    }
    let is_health = request.path() == "/api/health";
    if !is_health && !session_is_valid(&request, &state.public_session_token) {
        return error_response(401, "UNAUTHORIZED", "本地会话令牌无效");
    }

    // Native Rust routing: every route is owned by Rust now.  Unmatched
    // methods/paths are a 404 (the generic /api/{collection} routes handle the
    // document-style collections; anything else is not an endpoint).
    if let Some((matched, path_params)) =
        router::match_route(request.method().as_str(), request.path(), &ROUTES)
    {
        if matched.streaming {
            return dispatch_stream(request, body, state, matched, &path_params).await;
        }
        return dispatch_native(request, body, state, matched, &path_params).await;
    }

    error_response(404, "ROUTE_NOT_FOUND", "接口不存在")
}

/// Route handler for the routes Rust owns natively.  Parses path/query/body
/// and calls the Python domain function by name over the worker bridge.
async fn dispatch_native(
    request: HttpRequest,
    body: web::Bytes,
    state: web::Data<LocalApiState>,
    matched: &'static Route,
    path_params: &HashMap<String, String>,
) -> HttpResponse {
    let mut query = parse_query(request.query_string());
    if matched.raw_body {
        let content_type = request
            .headers()
            .get(actix_web::http::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_string();
        query.insert(
            "content_type".to_string(),
            serde_json::Value::String(content_type),
        );
    }
    let body_value: serde_json::Value = if matched.raw_body {
        serde_json::Value::String(BASE64.encode(&body))
    } else if body.is_empty() {
        serde_json::Value::Null
    } else {
        serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null)
    };
    let args = serde_json::json!({
        "path": path_params,
        "query": query,
        "body": body_value,
    });
    let adapter = state.adapter.clone();
    let function = matched.function;
    let result = web::block(move || adapter.dispatch_call(function, args)).await;
    match result {
        Ok(Ok(response)) => adapter_response(response),
        Ok(Err(error)) => error_response(502, "PYTHON_ADAPTER_UNAVAILABLE", &error),
        Err(error) => error_response(500, "LOCAL_API_ERROR", &error.to_string()),
    }
}

/// Streams NDJSON events from a Python generator-backed domain callable to the
/// HTTP client.  Events arrive on the worker bridge as they are produced.
async fn dispatch_stream(
    request: HttpRequest,
    body: web::Bytes,
    state: web::Data<LocalApiState>,
    matched: &'static Route,
    path_params: &HashMap<String, String>,
) -> HttpResponse {
    let query = parse_query(request.query_string());
    let body_value: serde_json::Value = if body.is_empty() {
        serde_json::Value::Null
    } else {
        serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null)
    };
    let args = serde_json::json!({
        "path": path_params,
        "query": query,
        "body": body_value,
    });
    let adapter = state.adapter.clone();
    let function = matched.function;
    let receiver = match web::block(move || adapter.stream_call(function, args)).await {
        Ok(Ok(receiver)) => receiver,
        Ok(Err(error)) => return error_response(502, "PYTHON_ADAPTER_UNAVAILABLE", &error),
        Err(error) => return error_response(500, "LOCAL_API_ERROR", &error.to_string()),
    };
    let (tx, rx) = futures_mpsc::unbounded::<web::Bytes>();
    std::thread::spawn(move || loop {
        match receiver.recv_timeout(Duration::from_secs(600)) {
            Ok(StreamEvent::Event(line)) => {
                if tx.unbounded_send(web::Bytes::from(line + "\n")).is_err() {
                    break;
                }
            }
            Ok(StreamEvent::Done) => break,
            Err(_) => break,
        }
    });
    use futures_util::StreamExt;
    HttpResponse::Ok()
        .content_type("application/x-ndjson; charset=utf-8")
        .insert_header(("cache-control", "no-cache, no-transform"))
        .insert_header(("x-content-type-options", "nosniff"))
        .streaming(rx.map(Result::<web::Bytes, actix_web::Error>::Ok))
}

fn adapter_response(response: AdapterResponse) -> HttpResponse {
    let status = actix_web::http::StatusCode::from_u16(response.status)
        .unwrap_or(actix_web::http::StatusCode::BAD_GATEWAY);
    let mut builder = HttpResponse::build(status);
    for (name, value) in response.headers {
        if is_hop_by_hop(&name) {
            continue;
        }
        if let (Ok(name), Ok(value)) = (
            actix_web::http::header::HeaderName::try_from(name),
            actix_web::http::header::HeaderValue::try_from(value),
        ) {
            builder.append_header((name, value));
        }
    }
    builder.body(response.body)
}

fn error_response(status: u16, code: &str, message: &str) -> HttpResponse {
    HttpResponse::build(
        actix_web::http::StatusCode::from_u16(status)
            .unwrap_or(actix_web::http::StatusCode::INTERNAL_SERVER_ERROR),
    )
    .content_type("application/json; charset=utf-8")
    .body(format!(
        r#"{{"error":{{"code":"{code}","message":"{message}"}}}}"#
    ))
}

fn session_is_valid(request: &HttpRequest, expected: &str) -> bool {
    if request
        .headers()
        .get(SESSION_HEADER)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|provided| provided == expected)
    {
        return true;
    }
    // Raw file / media loads (PDF iframe, <img>, CSS background) cannot set a
    // custom header, so accept the session token in the query string too.
    parse_query(request.query_string())
        .get("session")
        .and_then(|value| value.as_str())
        .is_some_and(|provided| provided == expected)
}

fn is_hop_by_hop(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
            | "host"
    )
}

#[derive(Clone)]
struct PythonWorker {
    inner: Arc<PythonWorkerInner>,
}

struct PythonWorkerInner {
    stdin: Mutex<ChildStdin>,
    child: Mutex<Option<Child>>,
    pending: Mutex<HashMap<u64, mpsc::SyncSender<Result<WireResponse, String>>>>,
    streams: Mutex<HashMap<u64, mpsc::SyncSender<StreamEvent>>>,
    next_id: AtomicU64,
}

#[derive(Deserialize)]
struct WireResponse {
    id: u64,
    status: u16,
    headers: Vec<(String, String)>,
    body_base64: String,
}

/// A frame arriving from the worker on stdout: either a normal request
/// response or a streaming event frame.
#[derive(Deserialize)]
#[serde(untagged)]
enum WorkerFrame {
    Response(WireResponse),
    Event { id: u64, event: String },
}

/// Events delivered to a streaming caller.
pub enum StreamEvent {
    Event(String),
    Done,
}

impl PythonWorker {
    fn start(config: PythonWorkerConfig) -> Result<Self, String> {
        let mut command = Command::new(&config.program);
        command
            .args(&config.arguments)
            .current_dir(&config.working_directory)
            .env("PYTHONIOENCODING", "utf-8")
            .env("STUDYPILOT_DATA_DIR", &config.data_directory)
            .env("STUDYPILOT_SESSION_TOKEN", &config.session_token)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // The packaged worker is a console-subsystem executable; launch it
            // with a hidden console so the desktop app does not pop a terminal
            // window (CREATE_NO_WINDOW) on every start.
            command.creation_flags(0x08000000);
        }
        let mut child = command
            .spawn()
            .map_err(|error| format!("无法启动 Python 领域 Worker：{error}"))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Python 领域 Worker 没有标准输入".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Python 领域 Worker 没有标准输出".to_string())?;
        let inner = Arc::new(PythonWorkerInner {
            stdin: Mutex::new(stdin),
            child: Mutex::new(Some(child)),
            pending: Mutex::new(HashMap::new()),
            streams: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
        });
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let reader_inner = inner.clone();
        thread::Builder::new()
            .name("studypilot-python-worker-protocol".into())
            .spawn(move || read_worker_responses(stdout, reader_inner, ready_tx))
            .map_err(|error| format!("无法读取 Python 领域 Worker：{error}"))?;
        match ready_rx.recv_timeout(Duration::from_secs(12)) {
            Ok(Ok(())) => Ok(Self { inner }),
            Ok(Err(error)) => {
                let worker = Self { inner };
                worker.stop();
                Err(error)
            }
            Err(error) => {
                let worker = Self { inner };
                worker.stop();
                Err(format!("Python 领域 Worker 启动超时：{error}"))
            }
        }
    }

    /// Send one JSON frame to the worker on stdin and await its response.
    fn send_frame(&self, frame: serde_json::Value) -> Result<AdapterResponse, String> {
        let id = self.inner.next_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = mpsc::sync_channel(1);
        self.inner
            .pending
            .lock()
            .map_err(|_| "Python Worker 请求队列损坏".to_string())?
            .insert(id, sender);
        let mut frame = frame;
        frame["id"] = serde_json::json!(id);
        let encoded = frame.to_string();
        let write_result = (|| {
            let mut stdin = self
                .inner
                .stdin
                .lock()
                .map_err(|_| std::io::Error::other("Python Worker 输入已关闭"))?;
            stdin.write_all(encoded.as_bytes())?;
            stdin.write_all(b"\n")?;
            stdin.flush()
        })();
        if let Err(error) = write_result {
            let _ = self
                .inner
                .pending
                .lock()
                .map(|mut pending| pending.remove(&id));
            return Err(format!("无法向 Python Worker 发送请求：{error}"));
        }
        match receiver.recv_timeout(Duration::from_secs(600)) {
            Ok(Ok(response)) => Ok(AdapterResponse {
                status: response.status,
                headers: response.headers,
                body: BASE64
                    .decode(response.body_base64)
                    .map_err(|error| format!("Python Worker 返回了无效内容：{error}"))?,
            }),
            Ok(Err(error)) => Err(error),
            Err(_) => {
                let _ = self
                    .inner
                    .pending
                    .lock()
                    .map(|mut pending| pending.remove(&id));
                Err("Python Worker 响应超时".to_string())
            }
        }
    }

    /// Send a streaming request and return a channel of NDJSON event lines.
    /// The channel ends with `StreamEvent::Done`.
    fn stream_call_impl(
        &self,
        function: &str,
        args: serde_json::Value,
    ) -> Result<mpsc::Receiver<StreamEvent>, String> {
        let id = self.inner.next_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = mpsc::sync_channel(64);
        self.inner
            .streams
            .lock()
            .map_err(|_| "Python Worker 流队列损坏".to_string())?
            .insert(id, sender);
        let wire = serde_json::json!({
            "id": id,
            "kind": "stream",
            "function": function,
            "args": args,
        });
        let encoded = wire.to_string();
        let write_result = (|| {
            let mut stdin = self
                .inner
                .stdin
                .lock()
                .map_err(|_| std::io::Error::other("Python Worker 输入已关闭"))?;
            stdin.write_all(encoded.as_bytes())?;
            stdin.write_all(b"\n")?;
            stdin.flush()
        })();
        if let Err(error) = write_result {
            let _ = self
                .inner
                .streams
                .lock()
                .map(|mut streams| streams.remove(&id));
            return Err(format!("无法向 Python Worker 发送流式请求：{error}"));
        }
        Ok(receiver)
    }

    fn stop(&self) {
        if let Ok(mut child) = self.inner.child.lock() {
            if let Some(process) = child.as_mut() {
                let _ = process.kill();
                let _ = process.wait();
            }
            *child = None;
        }
    }
}

impl RouteAdapter for PythonWorker {
    fn dispatch_call(
        &self,
        function: &str,
        args: serde_json::Value,
    ) -> Result<AdapterResponse, String> {
        let wire = serde_json::json!({
            "kind": "call",
            "function": function,
            "args": args,
        });
        self.send_frame(wire)
    }

    fn stream_call(
        &self,
        function: &str,
        args: serde_json::Value,
    ) -> Result<mpsc::Receiver<StreamEvent>, String> {
        self.stream_call_impl(function, args)
    }
}

fn read_worker_responses(
    stdout: impl std::io::Read,
    inner: Arc<PythonWorkerInner>,
    ready_tx: mpsc::SyncSender<Result<(), String>>,
) {
    let reader = BufReader::new(stdout);
    let mut ready = false;
    for line in reader.lines() {
        let line = match line {
            Ok(line) => line,
            Err(error) => {
                if !ready {
                    let _ = ready_tx.send(Err(format!("读取 Python Worker 失败：{error}")));
                }
                break;
            }
        };
        if !ready {
            ready = true;
            if line.trim() == r#"{"kind":"ready"}"# {
                let _ = ready_tx.send(Ok(()));
                continue;
            }
            let _ = ready_tx.send(Err(format!("Python Worker 未就绪：{line}")));
            break;
        }
        if let Ok(frame) = serde_json::from_str::<WorkerFrame>(&line) {
            match frame {
                WorkerFrame::Response(response) => {
                    let id = response.id;
                    if let Ok(mut pending) = inner.pending.lock() {
                        if let Some(sender) = pending.remove(&id) {
                            let _ = sender.send(Ok(response));
                            continue;
                        }
                    }
                    // Not a pending request: treat as stream completion.
                    if let Ok(mut streams) = inner.streams.lock() {
                        if let Some(sender) = streams.remove(&id) {
                            let _ = sender.send(StreamEvent::Done);
                        }
                    }
                }
                WorkerFrame::Event { id, event } => {
                    if let Ok(streams) = inner.streams.lock() {
                        if let Some(sender) = streams.get(&id) {
                            let _ = sender.send(StreamEvent::Event(event));
                        }
                    }
                }
            }
        }
    }
    if !ready {
        let _ = ready_tx.send(Err("Python Worker 意外退出".to_string()));
    }
    if let Ok(mut pending) = inner.pending.lock() {
        for (_, sender) in pending.drain() {
            let _ = sender.send(Err("Python Worker 已退出".to_string()));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{http::StatusCode, test, App};

    #[derive(Clone)]
    struct EchoAdapter;

    impl RouteAdapter for EchoAdapter {
        fn dispatch_call(
            &self,
            function: &str,
            _args: serde_json::Value,
        ) -> Result<AdapterResponse, String> {
            Ok(AdapterResponse {
                status: 200,
                headers: vec![("content-type".into(), "application/json".into())],
                body: format!(r#"{{"function":"{function}"}}"#).into_bytes(),
            })
        }
    }

    fn state() -> LocalApiState {
        LocalApiState {
            public_session_token: "public-token".into(),
            adapter: Arc::new(EchoAdapter),
        }
    }

    #[actix_web::test]
    async fn rejects_missing_public_session_token() {
        let app = test::init_service(
            App::new()
                .app_data(web::Data::new(state()))
                .app_data(web::PayloadConfig::new(MAX_REQUEST_BYTES))
                .default_service(web::route().to(dispatch)),
        )
        .await;
        let response = test::call_service(
            &app,
            test::TestRequest::get().uri("/api/courses").to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[actix_web::test]
    async fn routes_native_path_to_domain_callable() {
        let app = test::init_service(
            App::new()
                .app_data(web::Data::new(state()))
                .app_data(web::PayloadConfig::new(MAX_REQUEST_BYTES))
                .default_service(web::route().to(dispatch)),
        )
        .await;
        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/courses")
                .insert_header((SESSION_HEADER, "public-token"))
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = test::read_body(response).await;
        assert!(String::from_utf8_lossy(&body).contains(r#""function":"courses.list""#));
    }

    #[actix_web::test]
    async fn unknown_path_returns_404() {
        let app = test::init_service(
            App::new()
                .app_data(web::Data::new(state()))
                .app_data(web::PayloadConfig::new(MAX_REQUEST_BYTES))
                .default_service(web::route().to(dispatch)),
        )
        .await;
        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/not-a-route/1/extra")
                .insert_header((SESSION_HEADER, "public-token"))
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[actix_web::test]
    async fn cors_preflight_for_tauri_origin() {
        let app = test::init_service(
            App::new()
                .app_data(web::Data::new(state()))
                .app_data(web::PayloadConfig::new(MAX_REQUEST_BYTES))
                .default_service(web::route().to(dispatch)),
        )
        .await;
        let response = test::call_service(
            &app,
            test::TestRequest::default()
                .method(actix_web::http::Method::OPTIONS)
                .uri("/api/settings")
                .insert_header(("origin", "http://tauri.localhost"))
                .insert_header(("access-control-request-method", "GET"))
                .insert_header(("access-control-request-headers", "x-studypilot-session"))
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get("access-control-allow-origin")
                .and_then(|v| v.to_str().ok()),
            Some("http://tauri.localhost")
        );
        assert_eq!(
            response
                .headers()
                .get("access-control-allow-headers")
                .and_then(|v| v.to_str().ok()),
            Some("x-studypilot-session")
        );
    }

    #[actix_web::test]
    async fn cors_rejects_non_loopback_origin() {
        let app = test::init_service(
            App::new()
                .app_data(web::Data::new(state()))
                .app_data(web::PayloadConfig::new(MAX_REQUEST_BYTES))
                .default_service(web::route().to(dispatch)),
        )
        .await;
        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/courses")
                .insert_header((SESSION_HEADER, "public-token"))
                .insert_header(("origin", "https://evil.example.com"))
                .to_request(),
        )
        .await;
        assert!(
            response
                .headers()
                .get("access-control-allow-origin")
                .is_none(),
            "non-loopback origin must not be echoed back"
        );
    }

    #[actix_web::test]
    async fn session_token_in_query_param_is_accepted() {
        let app = test::init_service(
            App::new()
                .app_data(web::Data::new(state()))
                .app_data(web::PayloadConfig::new(MAX_REQUEST_BYTES))
                .default_service(web::route().to(dispatch)),
        )
        .await;
        // Raw file/media loads (iframe/<img>) cannot set the custom header, so
        // the token may also travel as a query parameter.
        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/api/documents/1/file?session=public-token")
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
    }
}
