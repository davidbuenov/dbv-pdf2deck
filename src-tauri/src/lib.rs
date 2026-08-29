use std::net::TcpListener;
use std::sync::{Mutex, OnceLock};

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

static BACKEND_PORT: OnceLock<u16> = OnceLock::new();

enum BackendChild {
    Sidecar(CommandChild),
    Process(std::process::Child),
}

impl BackendChild {
    fn kill(self) -> std::io::Result<()> {
        match self {
            BackendChild::Sidecar(child) => {
                child.kill().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
            }
            BackendChild::Process(mut child) => child.kill(),
        }
    }
}

struct BackendProcess(Mutex<Option<BackendChild>>);

/// Indica si el binario en ejecución se instaló como paquete MSIX (Microsoft
/// Store), detectado porque esas instalaciones siempre viven bajo
/// `...\WindowsApps\...`. Sirve para ocultar ahí la interfaz del actualizador:
/// los paquetes de tienda se actualizan por la Store, y descargar y ejecutar el
/// instalador NSIS dentro de ese sandbox fallaría o crearía una segunda
/// instalación desconectada de la primera.
#[tauri::command]
fn is_packaged_app() -> bool {
    std::env::current_exe()
        .map(|path| {
            path.components().any(|component| {
                component
                    .as_os_str()
                    .to_str()
                    .map(|segment| segment.eq_ignore_ascii_case("WindowsApps"))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

/// Escribe en disco los bytes de una exportacion, en la ruta que el usuario
/// acaba de elegir con el dialogo nativo (`dialog.save`).
///
/// WebView2 no tiene gestor de descargas: dentro de Tauri un `<a download>`
/// con una blob URL se ignora en silencio y el usuario no ve ningun dialogo ni
/// encuentra el fichero. El frontend pide la ruta y nos pasa el contenido en
/// base64, porque el IPC de Tauri serializa a JSON y un array de bytes crudo
/// multiplicaria por tres el tamanyo del mensaje.
#[tauri::command]
fn save_binary_file(path: String, contents_base64: String) -> Result<(), String> {
    use base64::Engine as _;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(contents_base64.as_bytes())
        .map_err(|error| format!("Contenido de exportacion no valido: {error}"))?;

    std::fs::write(&path, bytes)
        .map_err(|error| format!("No se pudo guardar «{path}»: {error}"))
}

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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

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

            #[cfg(debug_assertions)]
            {
                let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
                let project_root = manifest_dir.parent().unwrap_or(&manifest_dir);
                let venv_python = project_root.join("backend").join("venv").join("Scripts").join("python.exe");
                let main_py = project_root.join("backend").join("main.py");

                if venv_python.exists() && main_py.exists() {
                    println!("[DBV Tauri] Modo desarrollo: arrancando backend Python desde venv local en puerto {port}...");
                    let mut cmd = std::process::Command::new(&venv_python);
                    cmd.arg(&main_py)
                        .args(["--port", &port.to_string()])
                        .env("PYTHONUNBUFFERED", "1")
                        .env("PYTHONIOENCODING", "utf-8")
                        .env("PYTHONLEGACYWINDOWSSTDIO", "0")
                        .stdout(std::process::Stdio::piped())
                        .stderr(std::process::Stdio::piped());

                    match cmd.spawn() {
                        Ok(mut child) => {
                            if let Some(stdout) = child.stdout.take() {
                                std::thread::spawn(move || {
                                    use std::io::{BufRead, BufReader};
                                    let reader = BufReader::new(stdout);
                                    for line in reader.lines().map_while(Result::ok) {
                                        println!("[Backend Dev] {line}");
                                    }
                                });
                            }
                            if let Some(stderr) = child.stderr.take() {
                                std::thread::spawn(move || {
                                    use std::io::{BufRead, BufReader};
                                    let reader = BufReader::new(stderr);
                                    for line in reader.lines().map_while(Result::ok) {
                                        eprintln!("[Backend Dev ERR] {line}");
                                    }
                                });
                            }

                            let process = app.state::<BackendProcess>();
                            *process
                                .0
                                .lock()
                                .map_err(|_| "No se pudo guardar el proceso del backend".to_string())? =
                                Some(BackendChild::Process(child));
                            return Ok(());
                        }
                        Err(error) => {
                            eprintln!("[DBV Tauri] Error al iniciar backend de desarrollo: {error}");
                        }
                    }
                }
            }

            match app.shell().sidecar("dbv-pdf2deck-sidecar") {
                Ok(cmd) => {
                    match cmd.args(["--port", &port.to_string()]).spawn() {
                        Ok((mut rx, child)) => {
                            tauri::async_runtime::spawn(async move {
                                use tauri_plugin_shell::process::CommandEvent;
                                while let Some(event) = rx.recv().await {
                                    match event {
                                        CommandEvent::Stdout(line) => {
                                            if let Ok(text) = std::str::from_utf8(&line) {
                                                print!("[Sidecar OCR] {text}");
                                            }
                                        }
                                        CommandEvent::Stderr(line) => {
                                            if let Ok(text) = std::str::from_utf8(&line) {
                                                eprint!("[Sidecar OCR ERR] {text}");
                                            }
                                        }
                                        CommandEvent::Error(err) => {
                                            eprintln!("[Sidecar OCR EventErr] {err}");
                                        }
                                        CommandEvent::Terminated(payload) => {
                                            println!("[Sidecar OCR Terminado] código: {:?}", payload.code);
                                        }
                                        _ => {}
                                    }
                                }
                            });

                            let process = app.state::<BackendProcess>();
                            *process
                                .0
                                .lock()
                                .map_err(|_| "No se pudo guardar el proceso del backend".to_string())? =
                                Some(BackendChild::Sidecar(child));
                        }
                        Err(error) => {
                            eprintln!("[DBV Tauri] Advertencia al arrancar sidecar: {error}");
                        }
                    }
                }
                Err(error) => {
                    eprintln!("[DBV Tauri] Advertencia al localizar sidecar: {error}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_backend_port, is_packaged_app, save_binary_file])
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
