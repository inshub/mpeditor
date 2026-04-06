use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Manager, Runtime,
};

fn show_and_focus_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn set_main_tray_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_visible(visible);
    }
}

// Update tray menu with localized text
pub fn update_tray_menu(app: &AppHandle, show_text: &str, quit_text: &str) -> Result<(), String> {
    let menu = Menu::with_id_and_items(
        app,
        "system-tray",
        &[
            &MenuItem::with_id(app, "show_window", show_text, true, None::<&str>)
                .map_err(|e| e.to_string())?,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            &MenuItem::with_id(app, "quit", quit_text, true, None::<&str>)
                .map_err(|e| e.to_string())?,
        ],
    )
    .map_err(|e| e.to_string())?;

    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("system-tray")
        .setup(|app, _| {
            let menu = Menu::with_id_and_items(
                app,
                "system-tray",
                &[
                    &MenuItem::with_id(app, "show_window", "打开界面", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?,
                ],
            )?;

            // Build tray icon
            TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("微信公众号编辑助手")
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show_window" => {
                        show_and_focus_main_window(app);
                        set_main_tray_visible(app, false);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            set_main_tray_visible(app, false);
            Ok(())
        })
        .on_window_ready(move |window| {
            let window_clone = window.clone();
            set_main_tray_visible(&window.app_handle(), false);
            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        // Hide window instead of exiting when close is requested.
                        let _ = window_clone.hide();
                        set_main_tray_visible(&window_clone.app_handle(), true);
                        api.prevent_close();
                    }
                    tauri::WindowEvent::Focused(true) => {
                        set_main_tray_visible(&window_clone.app_handle(), false);
                    }
                    _ => {}
                }
            });
        })
        .build()
}
