// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Runtime;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Self-hosted update install. The stock opener plugin cannot launch the Android
// package installer (its mobile open_path sends a bare String to a Kotlin
// command expecting an object, and its Intent lacks a FileProvider URI / APK
// MIME / read-URI grant), so we register an app-local InstallerPlugin on Android
// and fall back to the opener on desktop.
//
// `install_apk` is a top-level app command (not a plugin command) so it needs no
// capability permission entry; the `installer` plugin exists only to register the
// Android side and stash its handle in managed state.
#[cfg(target_os = "android")]
struct InstallerHandle<R: Runtime>(tauri::plugin::PluginHandle<R>);

fn installer_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("installer")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                let handle =
                    _api.register_android_plugin("com.grimfeld.factoria", "InstallerPlugin")?;
                _app.manage(InstallerHandle(handle));
            }
            Ok(())
        })
        .build()
}

#[tauri::command]
fn install_apk<R: Runtime>(app: tauri::AppHandle<R>, path: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        use serde::Serialize;
        use tauri::Manager;

        #[derive(Serialize)]
        struct Payload {
            path: String,
        }

        let state = app.state::<InstallerHandle<R>>();
        state
            .0
            .run_mobile_plugin::<()>("install_apk", Payload { path })
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = &app;
        // Desktop dev fallback: opener's desktop open_path works fine here.
        tauri_plugin_opener::open_path(path, None::<&str>).map_err(|e| e.to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .plugin(installer_plugin())
        .invoke_handler(tauri::generate_handler![greet, install_apk])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
