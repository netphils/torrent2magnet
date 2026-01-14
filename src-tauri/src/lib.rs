use magnet_url::{Magnet, MagnetBuilder};
use rs_torrent_magnet::magnet_from_torrent_file;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

fn is_torrent_file<P: AsRef<Path>>(path: P) -> bool {
    path.as_ref()
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("torrent"))
        .unwrap_or(false)
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command(rename_all = "snake_case")]
async fn torrent_to_magnet(app: AppHandle, path_list: Vec<String>, full_link: bool) {
    for path in &path_list {
        let path_buf = PathBuf::from(path);
        let file_name = path_buf
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let current_path = path.clone();

        if is_torrent_file(&path_buf) {
            let torrent_link = match magnet_from_torrent_file(path_buf) {
                Ok(link_result) => link_result,
                Err(_) => {
                    continue;
                }
            };

            let magnet = match Magnet::new(&torrent_link) {
                Ok(magnet) => magnet,
                Err(_) => {
                    continue;
                }
            };

            if full_link {
                let link_str = magnet.to_string();
                let _ = send_torrent_to_frontend(&app, file_name, current_path, link_str);
            } else {
                let link_str = match magnet.display_name() {
                    Some(s) => {
                        let link = MagnetBuilder::new()
                            .display_name(s)
                            .hash_type(magnet.hash_type().unwrap())
                            .hash(magnet.hash().unwrap())
                            .build();
                        link.to_string()
                    }
                    None => {
                        let link = MagnetBuilder::new()
                            .hash_type(magnet.hash_type().unwrap())
                            .hash(magnet.hash().unwrap())
                            .build();
                        link.to_string()
                    }
                };
                let _ = send_torrent_to_frontend(&app, file_name, current_path, link_str);
            }
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TableContents {
    name: String,
    path: String,
    link: String,
    id: f64
}

#[tauri::command(rename_all = "snake_case")]
fn filter_data(table_data: Vec<TableContents>, keyword: String, search_type: String) -> Vec<TableContents> {
    let keyword_lower = keyword.trim().to_lowercase();
    if keyword_lower.is_empty() {
        return table_data; // 如果关键词为空，返回所有数据
    }

    match search_type.as_str() {
        "link" => table_data.into_iter()
            .filter(|item| item.link.to_lowercase().contains(&keyword_lower))
            .collect(),
        "name" => table_data.into_iter()
            .filter(|item| item.name.to_lowercase().contains(&keyword_lower))
            .collect(),
        _ => table_data, // 未知搜索类型则返回全部
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TorrentInfo {
    name: String,
    path: String,
    link: String,
}

fn send_torrent_to_frontend(
    app: &AppHandle,
    name: String,
    path: String,
    link: String,
) -> Result<(), tauri::Error> {
    app.emit("send_torrent", TorrentInfo { name, path, link })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            torrent_to_magnet,
            filter_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
