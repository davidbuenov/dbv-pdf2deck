use std::net::TcpListener;
use std::sync::{Mutex, OnceLock};

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

static BACKEND_PORT: OnceLock<u16> = OnceLock::new();

struct BackendProcess(Mutex<Option<CommandChild>>);

#[tauri::command]
fn get_backend_port() -> Result<u16, String> {
    BACKEND_PORT
        .get()
        .copied()
        .ok_or_else(|| "El backend todavía no ha iniciado".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            let listener = TcpListener::bind("127.0.0.1:0")
                .map_err(|error| format!("No se pudo reservar puerto para el backend: {error}"))?;
            let port = listener
                .local_addr()
                .map_err(|error| format!("No se pudo leer el puerto del backend: {error}"))?
                .port();
            drop(listener);
            BACKEND_PORT
                .set(port)
                .map_err(|_| "El puerto del backend ya estaba configurado".to_string())?;

            let (_, child) = app
                .shell()
                .sidecar("dbv-pdf2deck-sidecar")
                .map_err(|error| format!("No se pudo localizar el sidecar: {error}"))?
                .args(["--port", &port.to_string()])
                .spawn()
                .map_err(|error| format!("No se pudo iniciar el sidecar: {error}"))?;
            let process = app.state::<BackendProcess>();
            *process
                .0
                .lock()
                .map_err(|_| "No se pudo guardar el proceso del backend".to_string())? = Some(child);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_backend_port])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                if let Some(process) = app.try_state::<BackendProcess>() {
                    if let Ok(mut lock) = process.0.lock() {
                        if let Some(child) = lock.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
}
