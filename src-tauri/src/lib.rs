use std::net::TcpListener;
use std::sync::{Mutex, OnceLock};

use tauri::{Emitter, Manager, RunEvent};
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

/// Barra de menú nativa de macOS. Estructura y patrón portados literalmente de
/// `dbv-md-reader` (`src-tauri/src/lib.rs`), ya probados por un usuario real de
/// macOS — ver punto 10 de §6 en `dbv-specs-ops/docs/NATIVE_DESKTOP_APPS.md`.
/// Solo File y View cambian, para apuntar a las acciones reales de PDF2Deck en
/// vez de a las de un editor de Markdown.
#[cfg(target_os = "macos")]
mod macos_menu {
    use tauri::menu::{
        AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID,
        WINDOW_SUBMENU_ID,
    };
    use tauri::{AppHandle, Runtime};

    /// Los items predefinidos de macOS (Cortar/Copiar/Pegar…) los localiza el
    /// propio sistema según su idioma — nuestros items propios (Abrir archivo,
    /// Exportar…) no tienen esa magia gratis, así que replican el mismo
    /// criterio a mano para no acabar con un menú medio español medio inglés
    /// según el idioma del Mac. Independiente del selector de idioma ES/EN de
    /// la propia app (ese vive solo en el frontend/localStorage, no accesible
    /// todavía desde Rust en el momento en que se construye el menú, al
    /// arrancar antes de que cargue la webview).
    fn is_spanish_system() -> bool {
        sys_locale::get_locale()
            .map(|l| l.to_lowercase().starts_with("es"))
            .unwrap_or(false)
    }

    pub fn build<R: Runtime>(handle: &AppHandle<R>) -> tauri::Result<Menu<R>> {
        let es = is_spanish_system();
        let pkg_info = handle.package_info();
        let config = handle.config();
        let about_metadata = AboutMetadata {
            name: Some(pkg_info.name.clone()),
            version: Some(pkg_info.version.to_string()),
            copyright: config.bundle.copyright.clone(),
            authors: config.bundle.publisher.clone().map(|p| vec![p]),
            ..Default::default()
        };

        let app_menu = Submenu::with_items(
            handle,
            pkg_info.name.clone(),
            true,
            &[
                &PredefinedMenuItem::about(handle, None, Some(about_metadata))?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::services(handle, None)?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::hide(handle, None)?,
                &PredefinedMenuItem::hide_others(handle, None)?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::quit(handle, None)?,
            ],
        )?;

        let new_file_item = MenuItem::with_id(
            handle,
            "new_file",
            if es { "Nuevo" } else { "New" },
            true,
            Some("CmdOrCtrl+N"),
        )?;
        let open_file_item = MenuItem::with_id(
            handle,
            "open_file",
            if es { "Abrir archivo…" } else { "Open File…" },
            true,
            Some("CmdOrCtrl+O"),
        )?;
        let export_item = MenuItem::with_id(
            handle,
            "export",
            if es { "Exportar…" } else { "Export…" },
            true,
            None::<&str>,
        )?;
        let file_menu = Submenu::with_items(
            handle,
            "File",
            true,
            &[
                &new_file_item,
                &PredefinedMenuItem::separator(handle)?,
                &open_file_item,
                &PredefinedMenuItem::separator(handle)?,
                &export_item,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::close_window(handle, None)?,
            ],
        )?;

        // Deshacer/Rehacer reales del canvas (pila propia en canvas_engine.js), no
        // los del WebView: los predefinidos de Tauri solo deshacen edición de texto
        // nativa y no tocan el estado del lienzo.
        let undo_item = MenuItem::with_id(
            handle,
            "undo",
            if es { "Deshacer" } else { "Undo" },
            true,
            Some("CmdOrCtrl+Z"),
        )?;
        let redo_item = MenuItem::with_id(
            handle,
            "redo",
            if es { "Rehacer" } else { "Redo" },
            true,
            Some("CmdOrCtrl+Shift+Z"),
        )?;
        let edit_menu = Submenu::with_items(
            handle,
            "Edit",
            true,
            &[
                &undo_item,
                &redo_item,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::cut(handle, None)?,
                &PredefinedMenuItem::copy(handle, None)?,
                &PredefinedMenuItem::paste(handle, None)?,
                &PredefinedMenuItem::select_all(handle, None)?,
            ],
        )?;

        // Sin acelerador propio: la app ya usa la tecla "P" sola (sin Cmd) para no
        // chocar con Cmd+P, reservado por el sistema para Imprimir.
        let toggle_preview_item = MenuItem::with_id(
            handle,
            "toggle_preview",
            if es { "Alternar vista previa" } else { "Toggle Preview" },
            true,
            None::<&str>,
        )?;
        let view_menu = Submenu::with_items(
            handle,
            "View",
            true,
            &[
                &toggle_preview_item,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::fullscreen(handle, None)?,
            ],
        )?;

        let window_menu = Submenu::with_id_and_items(
            handle,
            WINDOW_SUBMENU_ID,
            "Window",
            true,
            &[
                &PredefinedMenuItem::minimize(handle, None)?,
                &PredefinedMenuItem::maximize(handle, None)?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::close_window(handle, None)?,
            ],
        )?;

        let help_menu = Submenu::with_id_and_items(handle, HELP_SUBMENU_ID, "Help", true, &[])?;

        Menu::with_items(
            handle,
            &[
                &app_menu,
                &file_menu,
                &edit_menu,
                &view_menu,
                &window_menu,
                &help_menu,
            ],
        )
    }
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

            // macOS espera la barra de menú superior del SO (Cmd+Q, Cmd+H, Editar
            // con Cortar/Copiar/Pegar, etc.) — sin ella la app no se siente nativa.
            // Windows/Linux ya tienen su propia UI para esto dentro de la ventana,
            // así que se deja intacto.
            #[cfg(target_os = "macos")]
            {
                let menu = macos_menu::build(app.handle())?;
                app.handle().set_menu(menu)?;
            }

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

            // El sidecar viaja como recurso de Tauri (carpeta `sidecar/`), no como
            // `externalBin` de un solo fichero: PyInstaller `--onefile` descarta en
            // silencio las DLL nativas de PyTorch (`torch/lib/*.dll`) en este build,
            // y el .exe resultante se cae al arrancar. `--onedir` sí las incluye, pero
            // el mecanismo `externalBin`/`.sidecar()` de Tauri asume un único fichero,
            // así que se lanza con `.command()` sobre la ruta resuelta del recurso.
            match app.path().resource_dir() {
                Ok(resource_dir) => {
                    let sidecar_exe_name = if cfg!(windows) {
                        "dbv-pdf2deck-sidecar.exe"
                    } else {
                        "dbv-pdf2deck-sidecar"
                    };
                    let sidecar_path = resource_dir.join("sidecar").join(sidecar_exe_name);

                    match app
                        .shell()
                        .command(&sidecar_path)
                        .args(["--port", &port.to_string()])
                        .spawn()
                    {
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
                    eprintln!("[DBV Tauri] Advertencia al resolver el recurso del sidecar: {error}");
                }
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            // Los items propios del menú de macOS (Nuevo/Abrir/Exportar/Deshacer/
            // Rehacer/Alternar vista previa) reusan el flujo que ya tiene el
            // frontend para su botón de barra o atajo de teclado equivalente —
            // solo hace falta avisar a la ventana, no reimplementar la lógica en
            // Rust. Lista blanca contra los ítems predefinidos (about/quit/hide/...),
            // que no deben reenviarse como evento. `app.emit` (no una ventana
            // concreta por etiqueta) para no acoplarse al nombre "main" de
            // `tauri.conf.json` ni fallar en silencio si esa ventana no existiera.
            const MENU_ACTION_IDS: &[&str] =
                &["new_file", "open_file", "export", "undo", "redo", "toggle_preview"];
            let id = event.id().as_ref();
            if MENU_ACTION_IDS.contains(&id) {
                let _ = app.emit(&format!("menu-{}", id.replace('_', "-")), ());
            }
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
