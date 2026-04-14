mod commands;
mod plugins;

use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use hmac::{Hmac, Mac};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView};
use rand::{distributions::Alphanumeric, Rng};
use reqwest::header::CONTENT_TYPE;
use reqwest::Url;
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use sha1::Sha1;
use std::collections::HashMap;
use std::error::Error as _;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use std::{fs, path::Path, path::PathBuf, time::Duration};
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;

pub(crate) const DEFAULT_MODELSCOPE_ENDPOINT: &str = "https://api-inference.modelscope.cn/v1";
pub(crate) const DEFAULT_MODELSCOPE_MODEL: &str = "Tongyi-MAI/Z-Image-Turbo";
pub(crate) const DEFAULT_MODELSCOPE_API_KEY: &str = "";
const GIT_REPOSITORIES_DIR: &str = "git-repositories";
const WECHAT_UPLOADIMG_TARGET_BYTES: usize = 900 * 1024;
const WECHAT_UPLOADIMG_MAX_BYTES: usize = 1024 * 1024;
const WECHAT_TOKEN_REFRESH_BUFFER_SECS: u64 = 200;
const WECHAT_PROXY_UPLOAD_COOLDOWN_SECS: u64 = 180;

#[derive(Clone)]
struct CachedWechatToken {
    token: String,
    refresh_at: Instant,
}

static WECHAT_TOKEN_CACHE: OnceLock<Mutex<HashMap<String, CachedWechatToken>>> = OnceLock::new();
static WECHAT_PROXY_UPLOAD_COOLDOWN_UNTIL: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn update_tray_menu(
    app: tauri::AppHandle,
    show_text: String,
    quit_text: String,
) -> Result<(), String> {
    plugins::system_tray::update_tray_menu(&app, &show_text, &quit_text)
}

#[tauri::command]
fn save_file_via_dialog(
    default_file_name: String,
    file_ext: String,
    content_base64: String,
) -> Result<Option<String>, String> {
    let bytes = general_purpose::STANDARD
        .decode(content_base64)
        .map_err(|err| format!("Failed to decode base64 content: {err}"))?;

    let mut dialog = FileDialog::new().set_file_name(&default_file_name);
    if !file_ext.is_empty() {
        let ext = file_ext.trim_start_matches('.').to_owned();
        dialog = dialog.add_filter(&ext, &[&ext]);
    }

    let selected_path = match dialog.save_file() {
        Some(path) => path,
        None => return Ok(None),
    };

    let normalized_ext = file_ext.trim_start_matches('.');
    let final_path = with_extension_if_missing(selected_path, normalized_ext);
    fs::write(&final_path, bytes)
        .map_err(|err| format!("Failed to save file to {}: {err}", final_path.display()))?;

    Ok(Some(final_path.to_string_lossy().to_string()))
}

#[tauri::command]
fn pick_local_library_directory() -> Result<Option<String>, String> {
    Ok(FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
async fn image_to_data_url_fallback(src: String) -> Result<String, String> {
    if src.starts_with("data:") {
        return Ok(src);
    }

    let (bytes, mime_type) = if src.starts_with("http://") || src.starts_with("https://") {
        let response = reqwest::get(&src)
            .await
            .map_err(|err| format!("Failed to fetch image in Rust fallback: {err}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Image request failed in Rust fallback: HTTP {}",
                response.status()
            ));
        }

        let mime = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(';').next())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| infer_mime_from_path(&src));

        let bytes = response
            .bytes()
            .await
            .map_err(|err| format!("Failed to read image bytes in Rust fallback: {err}"))?
            .to_vec();

        (bytes, mime)
    } else {
        let path = parse_local_path(&src)?;
        let bytes = fs::read(&path).map_err(|err| {
            format!(
                "Failed to read local image for Rust fallback ({}): {err}",
                path.display()
            )
        })?;
        (bytes, infer_mime_from_path(path.to_string_lossy().as_ref()))
    };

    if bytes.is_empty() {
        return Err("Image bytes are empty in Rust fallback".to_string());
    }

    let encoded = general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{};base64,{}", mime_type, encoded))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UploadImageRequest {
    pub(crate) provider: String,
    pub(crate) file_name: String,
    pub(crate) mime_type: String,
    pub(crate) content_base64: String,
    pub(crate) network_proxy: Option<NetworkProxyConfig>,
    pub(crate) wechat: Option<WechatImageHostConfig>,
    pub(crate) aliyun: Option<AliyunOssConfig>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UploadImageSourceRequest {
    pub(crate) provider: String,
    pub(crate) src: String,
    pub(crate) network_proxy: Option<NetworkProxyConfig>,
    pub(crate) wechat: Option<WechatImageHostConfig>,
    pub(crate) aliyun: Option<AliyunOssConfig>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WechatImageHostConfig {
    pub(crate) proxy_domain: String,
    pub(crate) app_id: String,
    pub(crate) app_secret: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NetworkProxyConfig {
    enabled: bool,
    socks_proxy: String,
    http_proxy: String,
    https_proxy: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AliyunOssConfig {
    pub(crate) access_key_id: String,
    pub(crate) access_key_secret: String,
    pub(crate) bucket: String,
    pub(crate) region: String,
    pub(crate) use_ssl: bool,
    pub(crate) cdn_domain: String,
    pub(crate) path_prefix: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UploadImageResponse {
    pub(crate) provider: String,
    pub(crate) url: String,
    pub(crate) object_key: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WechatTokenResponse {
    access_token: Option<String>,
    expires_in: Option<u64>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WechatDraftResponse {
    pub(crate) media_id: Option<String>,
    pub(crate) errcode: Option<i64>,
    pub(crate) errmsg: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WechatMaterialUploadResponse {
    media_id: Option<String>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitSyncRequest {
    pub(crate) repo_url: String,
    pub(crate) repo_name: Option<String>,
    pub(crate) branch: Option<String>,
    pub(crate) auth: Option<GitAuthRequest>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitAuthRequest {
    pub(crate) username: Option<String>,
    pub(crate) token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitRepositoryAccessRequest {
    pub(crate) repo_url: String,
    pub(crate) auth: Option<GitAuthRequest>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitRepositoryAccessResponse {
    pub(crate) repo_name: String,
    pub(crate) default_branch: Option<String>,
    pub(crate) branches: Vec<String>,
    pub(crate) is_empty: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitFileNode {
    name: String,
    path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitFolderNode {
    name: String,
    path: String,
    files: Vec<GitFileNode>,
    children: Vec<GitFolderNode>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitRepositorySnapshot {
    pub(crate) repo_url: String,
    pub(crate) repo_name: String,
    pub(crate) branch: String,
    pub(crate) local_path: String,
    pub(crate) is_empty: bool,
    pub(crate) files: Vec<GitFileNode>,
    pub(crate) folders: Vec<GitFolderNode>,
    pub(crate) last_synced_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadGitFileRequest {
    pub(crate) local_path: String,
    pub(crate) file_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadGitFileResponse {
    pub(crate) content: String,
    pub(crate) mime_type: String,
    pub(crate) is_binary: bool,
    pub(crate) local_file_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteGitRepositoryRequest {
    pub(crate) local_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveGitFileRequest {
    pub(crate) local_path: String,
    pub(crate) file_path: String,
    pub(crate) content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListLocalLibraryDocumentsRequest {
    pub(crate) local_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalLibraryDocumentSnapshot {
    pub(crate) file_path: String,
    pub(crate) title: String,
    pub(crate) content: String,
    pub(crate) updated_at: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalWorkspaceFileNode {
    pub(crate) name: String,
    pub(crate) path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalWorkspaceFolderNode {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) files: Vec<LocalWorkspaceFileNode>,
    pub(crate) children: Vec<LocalWorkspaceFolderNode>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalWorkspaceTreeSnapshot {
    pub(crate) files: Vec<LocalWorkspaceFileNode>,
    pub(crate) folders: Vec<LocalWorkspaceFolderNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveLocalLibraryDocumentRequest {
    pub(crate) local_path: String,
    pub(crate) file_path: String,
    pub(crate) content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteLocalLibraryDocumentRequest {
    pub(crate) local_path: String,
    pub(crate) file_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveWorkspaceFileRequest {
    pub(crate) local_path: String,
    pub(crate) file_path: String,
    pub(crate) content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateWorkspaceFileRequest {
    pub(crate) local_path: String,
    pub(crate) file_path: String,
    pub(crate) content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteWorkspaceFileRequest {
    pub(crate) local_path: String,
    pub(crate) file_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceFolderRequest {
    pub(crate) local_path: String,
    pub(crate) folder_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MoveWorkspaceEntryRequest {
    pub(crate) local_path: String,
    pub(crate) from_path: String,
    pub(crate) to_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitCommitPushRequest {
    pub(crate) local_path: String,
    pub(crate) file_path: String,
    pub(crate) commit_message: String,
    pub(crate) auth: Option<GitAuthRequest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitWorkspaceSyncRequest {
    pub(crate) local_path: String,
    pub(crate) commit_message: String,
    pub(crate) auth: Option<GitAuthRequest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitConfigureRemoteRequest {
    pub(crate) local_path: String,
    pub(crate) repo_url: String,
    pub(crate) auth: Option<GitAuthRequest>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitCommitPushResponse {
    pub(crate) status: String,
    pub(crate) commit_id: Option<String>,
    pub(crate) branch: String,
    pub(crate) message: String,
}

pub(crate) async fn upload_wechat_cover(
    proxy_domain: Option<&str>,
    access_token: &str,
    file_name: &str,
    mime_type: &str,
    bytes: Vec<u8>,
    network_proxy: Option<&NetworkProxyConfig>,
) -> Result<String, String> {
    let upload_url = format!(
        "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={access_token}&type=image"
    );
    let json = upload_to_wechat_image(
        proxy_domain,
        &upload_url,
        file_name,
        mime_type,
        bytes,
        network_proxy,
    )
    .await?;

    let response: WechatMaterialUploadResponse =
        serde_json::from_value(json).map_err(|err| format!("解析封面素材响应失败: {err}"))?;

    response.media_id.ok_or_else(|| {
        format!(
            "上传封面素材失败: {} {}",
            response.errcode.unwrap_or_default(),
            response.errmsg.unwrap_or_else(|| "unknown".to_string())
        )
    })
}

pub(crate) async fn upload_to_wechat(
    file_name: &str,
    mime_type: &str,
    bytes: Vec<u8>,
    config: &WechatImageHostConfig,
    network_proxy: Option<&NetworkProxyConfig>,
) -> Result<String, String> {
    let app_id = config.app_id.trim();
    let app_secret = config.app_secret.trim();
    if app_id.is_empty() || app_secret.is_empty() {
        return Err("公众号图床上传需要填写 appID 和 appsecret".to_string());
    }

    let access_token = fetch_wechat_access_token(
        Some(config.proxy_domain.as_str()),
        app_id,
        app_secret,
        network_proxy,
    )
    .await?;
    let upload_url =
        format!("https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token={access_token}");
    let json = upload_to_wechat_image(
        Some(config.proxy_domain.as_str()),
        &upload_url,
        file_name,
        mime_type,
        bytes,
        network_proxy,
    )
    .await?;

    if let Some(url) = json.get("url").and_then(|value| value.as_str()) {
        return Ok(url.to_string());
    }

    let errcode = json
        .get("errcode")
        .and_then(|value| value.as_i64())
        .unwrap_or_default();
    let errmsg = json
        .get("errmsg")
        .and_then(|value| value.as_str())
        .unwrap_or("unknown");
    Err(format!(
        "Wechat image upload failed: {} {}",
        errcode, errmsg
    ))
}

pub(crate) async fn fetch_wechat_access_token(
    proxy_domain: Option<&str>,
    app_id: &str,
    app_secret: &str,
    network_proxy: Option<&NetworkProxyConfig>,
) -> Result<String, String> {
    let cache_key = format!(
        "{}|{}|{}",
        proxy_domain.unwrap_or("").trim(),
        app_id.trim(),
        app_secret.trim()
    );
    if let Some(cached) = get_cached_wechat_token(&cache_key) {
        eprintln!(
            "[wechat-token] cache_hit app_id_prefix={}",
            app_id.chars().take(8).collect::<String>()
        );
        return Ok(cached);
    }

    let mut last_error = String::new();
    for attempt in 1..=2 {
        match fetch_wechat_access_token_remote(proxy_domain, app_id, app_secret, network_proxy)
            .await
        {
            Ok((token, expires_in)) => {
                cache_wechat_token(&cache_key, &token, expires_in);
                eprintln!(
                    "[wechat-token] cache_store app_id_prefix={} expires_in={}",
                    app_id.chars().take(8).collect::<String>(),
                    expires_in
                );
                return Ok(token);
            }
            Err(err) => {
                last_error = err;
                if attempt == 1 {
                    clear_cached_wechat_token(&cache_key);
                    tokio::time::sleep(Duration::from_millis(180)).await;
                }
            }
        }
    }

    Err(last_error)
}

fn wechat_token_cache() -> &'static Mutex<HashMap<String, CachedWechatToken>> {
    WECHAT_TOKEN_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn wechat_proxy_upload_cooldown() -> &'static Mutex<Option<Instant>> {
    WECHAT_PROXY_UPLOAD_COOLDOWN_UNTIL.get_or_init(|| Mutex::new(None))
}

fn start_wechat_proxy_upload_cooldown(reason: &str) {
    if let Ok(mut guard) = wechat_proxy_upload_cooldown().lock() {
        let until = Instant::now() + Duration::from_secs(WECHAT_PROXY_UPLOAD_COOLDOWN_SECS);
        *guard = Some(until);
        eprintln!(
            "[wechat-proxy-upload] cooldown_start seconds={} reason={}",
            WECHAT_PROXY_UPLOAD_COOLDOWN_SECS, reason
        );
    }
}

fn get_cached_wechat_token(cache_key: &str) -> Option<String> {
    let guard = wechat_token_cache().lock().ok()?;
    let cached = guard.get(cache_key)?;
    if cached.refresh_at > Instant::now() {
        return Some(cached.token.clone());
    }
    None
}

fn clear_cached_wechat_token(cache_key: &str) {
    if let Ok(mut guard) = wechat_token_cache().lock() {
        guard.remove(cache_key);
    }
}

fn cache_wechat_token(cache_key: &str, token: &str, expires_in: u64) {
    let effective_ttl = expires_in
        .saturating_sub(WECHAT_TOKEN_REFRESH_BUFFER_SECS)
        .max(60);
    let refresh_at = Instant::now() + Duration::from_secs(effective_ttl);
    if let Ok(mut guard) = wechat_token_cache().lock() {
        guard.insert(
            cache_key.to_string(),
            CachedWechatToken {
                token: token.to_string(),
                refresh_at,
            },
        );
    }
}

async fn fetch_wechat_access_token_remote(
    proxy_domain: Option<&str>,
    app_id: &str,
    app_secret: &str,
    network_proxy: Option<&NetworkProxyConfig>,
) -> Result<(String, u64), String> {
    // Use stable_token to avoid invalidating previous tokens
    // See: https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/getStableAccessToken.html
    let url = "https://api.weixin.qq.com/cgi-bin/stable_token";
    let payload = serde_json::json!({
        "grant_type": "client_credential",
        "appid": app_id,
        "secret": app_secret,
        "forcerefresh": false
    });
    let json = send_wechat_json_request(proxy_domain, &url, "POST", Some(payload), network_proxy)
        .await?;
    let token_body: WechatTokenResponse = serde_json::from_value(json)
        .map_err(|err| format!("Failed to parse wechat stable_token response: {err}"))?;
    let token = token_body.access_token.ok_or_else(|| {
        format!(
            "Failed to get wechat stable_token: {} {}",
            token_body.errcode.unwrap_or_default(),
            token_body.errmsg.unwrap_or_else(|| "unknown".to_string())
        )
    })?;
    let expires_in = token_body.expires_in.unwrap_or(7200);
    Ok((token, expires_in))
}

async fn upload_to_wechat_image(
    proxy_domain: Option<&str>,
    upload_url: &str,
    file_name: &str,
    mime_type: &str,
    bytes: Vec<u8>,
    network_proxy: Option<&NetworkProxyConfig>,
) -> Result<serde_json::Value, String> {
    let proxy_enabled = network_proxy.map(|p| p.enabled).unwrap_or(false);
    let proxy_configured = normalize_proxy_endpoint(proxy_domain, proxy_enabled).is_some();
    eprintln!(
        "[wechat-upload] via_proxy=false proxy_configured={} file={} mime={} bytes={} url={}",
        proxy_configured,
        file_name,
        mime_type,
        bytes.len(),
        upload_url
    );
    upload_to_wechat_image_direct(upload_url, file_name, mime_type, bytes, network_proxy).await
}

async fn upload_to_wechat_image_direct(
    upload_url: &str,
    file_name: &str,
    mime_type: &str,
    bytes: Vec<u8>,
    network_proxy: Option<&NetworkProxyConfig>,
) -> Result<serde_json::Value, String> {
    eprintln!(
        "[wechat-upload-direct] request file={} mime={} bytes={} url={}",
        file_name,
        mime_type,
        bytes.len(),
        upload_url
    );
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(file_name.to_string())
        .mime_str(mime_type)
        .map_err(|err| format!("Invalid mime type for wechat upload: {err}"))?;
    let form = reqwest::multipart::Form::new().part("media", part);
    let client = build_http_client(network_proxy)?;
    let upload_resp = client
        .post(upload_url)
        .multipart(form)
        .send()
        .await
        .map_err(|err| format!("Failed to upload image to wechat: {err}"))?;
    if !upload_resp.status().is_success() {
        let status = upload_resp.status();
        let body = upload_resp.text().await.unwrap_or_default();
        return Err(format!(
            "Wechat upload API failed: HTTP {} {}",
            status, body
        ));
    }
    let body = upload_resp
        .text()
        .await
        .map_err(|err| format!("Failed to read wechat upload response: {err}"))?;
    serde_json::from_str(&body)
        .map_err(|err| format!("Invalid wechat upload response: {err}; body={body}"))
}

pub(crate) async fn send_wechat_json_request(
    proxy_domain: Option<&str>,
    target_url: &str,
    method: &str,
    data: Option<serde_json::Value>,
    network_proxy: Option<&NetworkProxyConfig>,
) -> Result<serde_json::Value, String> {
    let proxy_enabled = network_proxy.map(|p| p.enabled).unwrap_or(false);
    eprintln!(
        "[wechat-http] request method={} via_proxy={} url={}",
        method,
        normalize_proxy_endpoint(proxy_domain, proxy_enabled).is_some(),
        target_url
    );
    if let Some(proxy) = normalize_proxy_endpoint(proxy_domain, proxy_enabled) {
        let payload = serde_json::json!({
            "url": target_url,
            "method": method,
            "data": data.clone()
        });
        match send_proxy_request(&proxy, payload, network_proxy).await {
            Ok(json) => return Ok(json),
            Err(proxy_err) => {
                if is_retryable_proxy_error(&proxy_err) {
                    start_wechat_proxy_upload_cooldown("proxy_json_timeout_or_connect_error");
                }
                if proxy_enabled {
                    eprintln!(
                        "[wechat-http] proxy_failed_then_fallback_direct method={} proxy={} url={} error={}",
                        method, proxy, target_url, proxy_err
                    );
                    // continue with direct request below
                } else {
                    return Err(proxy_err);
                }
            }
        }
    }

    let client = build_http_client(network_proxy)?;
    let request = match method {
        "POST" => client.post(target_url),
        _ => client.get(target_url),
    };
    let request = if let Some(body) = data {
        request.json(&body)
    } else {
        request
    };
    let response = request
        .send()
        .await
        .map_err(|err| format!("Wechat API request failed: {err}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Wechat API HTTP error: {} {}", status, body));
    }
    let body = response
        .text()
        .await
        .map_err(|err| format!("Failed to read wechat API response: {err}"))?;
    serde_json::from_str(&body)
        .map_err(|err| format!("Invalid wechat API response: {err}; body={body}"))
}

pub(crate) async fn probe_network_connectivity(
    network_proxy: Option<&NetworkProxyConfig>,
) -> Result<(), String> {
    let client = build_http_client(network_proxy)?;
    let response = client
        .get("https://api.weixin.qq.com/cgi-bin/getcallbackip")
        .send()
        .await
        .map_err(|err| format!("Network probe failed: {err}"))?;
    eprintln!(
        "[network-probe] direct status={} proxy_enabled={}",
        response.status(),
        network_proxy.map(|cfg| cfg.enabled).unwrap_or(false)
    );
    Ok(())
}

pub(crate) async fn probe_wechat_proxy_connectivity(
    proxy_domain: Option<&str>,
    network_proxy: Option<&NetworkProxyConfig>,
) -> Result<(), String> {
    let proxy_enabled = network_proxy.map(|cfg| cfg.enabled).unwrap_or(false);
    let Some(proxy) = normalize_proxy_endpoint(proxy_domain, proxy_enabled) else {
        return Err("Wechat proxy URL is empty or app proxy is disabled".to_string());
    };

    let payload = serde_json::json!({
        "url": "https://api.weixin.qq.com/cgi-bin/getcallbackip",
        "method": "GET",
        "data": null
    });
    let _ = send_proxy_request(&proxy, payload, network_proxy).await?;
    eprintln!("[network-probe] wechat_proxy status=ok proxy={}", proxy);
    Ok(())
}

async fn send_proxy_request(
    proxy_url: &str,
    payload: serde_json::Value,
    network_proxy: Option<&NetworkProxyConfig>,
) -> Result<serde_json::Value, String> {
    let payload_method = payload
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("UNKNOWN");
    let payload_url = payload.get("url").and_then(|v| v.as_str()).unwrap_or("");
    let payload_file_name = payload
        .get("fileName")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let payload_mime = payload
        .get("mimeType")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let payload_file_data_len = payload
        .get("fileData")
        .and_then(|v| v.as_str())
        .map(|v| v.len())
        .unwrap_or(0);
    eprintln!(
        "[wechat-proxy] request method={} proxy={} url={} file={} mime={} base64_len={}",
        payload_method,
        proxy_url,
        payload_url,
        payload_file_name,
        payload_mime,
        payload_file_data_len
    );
    let client = build_wechat_proxy_client(proxy_url, network_proxy)?;
    let response = client
        .post(proxy_url)
        .json(&payload)
        .send()
        .await
        .map_err(|err| {
            let detail = format_reqwest_error(&err);
            eprintln!(
                "[wechat-proxy] send_failed method={} proxy={} url={} file={} mime={} base64_len={} error={}",
                payload_method,
                proxy_url,
                payload_url,
                payload_file_name,
                payload_mime,
                payload_file_data_len,
                detail
            );
            format!(
                "Proxy request failed: {detail}. Please verify app proxy settings and Worker URL reachability."
            )
        })?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        eprintln!(
            "[wechat-proxy] http_error status={} body_snippet={}",
            status,
            body.chars().take(200).collect::<String>()
        );
        return Err(format!("Proxy HTTP error: {} {}", status, body));
    }
    let text = response
        .text()
        .await
        .map_err(|err| format!("Failed to read proxy response: {err}"))?;
    eprintln!(
        "[wechat-proxy] response_ok body_snippet={}",
        text.chars().take(200).collect::<String>()
    );
    serde_json::from_str(&text).map_err(|err| format!("Invalid proxy response: {err}; body={text}"))
}

fn is_retryable_proxy_error(message: &str) -> bool {
    message.contains("kind=timeout")
        || message.contains("timed out")
        || message.contains("kind=connect")
}

fn normalize_proxy_endpoint(
    proxy_domain: Option<&str>,
    network_proxy_enabled: bool,
) -> Option<String> {
    // Only use WeChat proxy Worker when app proxy is enabled
    if !network_proxy_enabled {
        return None;
    }
    let trimmed = proxy_domain.unwrap_or("").trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.contains("api.weixin.qq.com") {
        return None;
    }
    Some(trimmed.trim_end_matches('/').to_string())
}

pub(crate) fn extract_first_image_src(content_html: &str) -> Option<String> {
    let img_pos = content_html.find("<img")?;
    let html = &content_html[img_pos..];

    if let Some(src_idx) = html.find("src=\"") {
        let start = src_idx + 5;
        let rest = &html[start..];
        let end = rest.find('"')?;
        let value = rest[..end].trim();
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }

    if let Some(src_idx) = html.find("src='") {
        let start = src_idx + 5;
        let rest = &html[start..];
        let end = rest.find('\'')?;
        let value = rest[..end].trim();
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }

    None
}

pub(crate) async fn load_image_source(
    src: &str,
    network_proxy: Option<&NetworkProxyConfig>,
) -> Result<(Vec<u8>, String, String), String> {
    if src.starts_with("data:") {
        let (mime_type, bytes) = decode_data_url(src)?;
        let file_name = build_file_name_from_mime("cover", &mime_type);
        eprintln!(
            "[image-source] type=data file={} mime={} bytes={}",
            file_name,
            mime_type,
            bytes.len()
        );
        return Ok((bytes, mime_type, file_name));
    }

    if src.starts_with("http://") || src.starts_with("https://") {
        let client = build_http_client(network_proxy)?;
        let response = client
            .get(src)
            .send()
            .await
            .map_err(|err| format!("获取封面图片失败: {err}"))?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("获取封面图片失败: HTTP {} {}", status, body));
        }
        let mime_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(';').next())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| infer_mime_from_path(src));
        let bytes = response
            .bytes()
            .await
            .map_err(|err| format!("读取封面图片失败: {err}"))?
            .to_vec();
        let file_name = file_name_from_src(src)
            .unwrap_or_else(|| build_file_name_from_mime("cover", &mime_type));
        eprintln!(
            "[image-source] type=remote src={} file={} mime={} bytes={}",
            src,
            file_name,
            mime_type,
            bytes.len()
        );
        return Ok((bytes, mime_type, file_name));
    }

    let path = parse_local_path(src)?;
    let bytes = fs::read(&path)
        .map_err(|err| format!("读取本地封面图片失败({}): {err}", path.display()))?;
    let mime_type = infer_mime_from_path(path.to_string_lossy().as_ref());
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| build_file_name_from_mime("cover", &mime_type));
    eprintln!(
        "[image-source] type=local src={} file={} mime={} bytes={}",
        src,
        file_name,
        mime_type,
        bytes.len()
    );
    Ok((bytes, mime_type, file_name))
}

fn decode_data_url(src: &str) -> Result<(String, Vec<u8>), String> {
    let Some((meta, payload)) = src.split_once(',') else {
        return Err("无效的 data URL".to_string());
    };
    let mime_type = meta
        .strip_prefix("data:")
        .and_then(|rest| rest.split(';').next())
        .filter(|value| !value.is_empty())
        .unwrap_or("application/octet-stream")
        .to_string();

    let bytes = if meta.contains(";base64") {
        general_purpose::STANDARD
            .decode(payload)
            .map_err(|err| format!("解析 data URL 失败: {err}"))?
    } else {
        payload.as_bytes().to_vec()
    };

    Ok((mime_type, bytes))
}

fn build_file_name_from_mime(prefix: &str, mime_type: &str) -> String {
    let ext = match mime_type {
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "jpg",
    };
    format!("{prefix}.{ext}")
}

fn file_name_from_src(src: &str) -> Option<String> {
    let clean = src.split('?').next().unwrap_or(src).trim_end_matches('/');
    let name = clean.rsplit('/').next()?;
    if name.is_empty() {
        return None;
    }
    Some(name.to_string())
}

pub(crate) fn normalize_wechat_cover_asset(
    bytes: &[u8],
    mime_type: &str,
    file_name: &str,
) -> Result<(String, String), String> {
    let detected_mime = detect_image_mime(bytes).unwrap_or_else(|| mime_type.to_string());
    let normalized_mime = match detected_mime.as_str() {
        "image/jpeg" | "image/png" | "image/gif" => detected_mime,
        "image/webp" => {
            return Err(
                "封面图片为 WebP，微信公众号封面素材不支持该格式，请改用 JPG/PNG/GIF".to_string(),
            );
        }
        _ => {
            return Err(format!(
                "封面图片格式不受支持：{}，请改用 JPG/PNG/GIF",
                detected_mime
            ));
        }
    };

    let extension = match normalized_mime.as_str() {
        "image/png" => "png",
        "image/gif" => "gif",
        _ => "jpg",
    };

    let normalized_file_name = ensure_file_extension(file_name, extension);
    Ok((normalized_mime, normalized_file_name))
}

pub(crate) fn normalize_wechat_uploadimg_asset(
    bytes: Vec<u8>,
    mime_type: &str,
    file_name: &str,
) -> Result<(Vec<u8>, String, String), String> {
    let detected_mime = detect_image_mime(&bytes).unwrap_or_else(|| mime_type.to_string());
    let extension = match detected_mime.as_str() {
        "image/png" => "png",
        "image/gif" => "gif",
        _ => "jpg",
    };
    let normalized_file_name = ensure_file_extension(file_name, extension);

    let need_transcode = bytes.len() > WECHAT_UPLOADIMG_TARGET_BYTES
        || !matches!(
            detected_mime.as_str(),
            "image/jpeg" | "image/png" | "image/gif"
        );
    if !need_transcode {
        return Ok((bytes, detected_mime, normalized_file_name));
    }

    let image = image::load_from_memory(&bytes)
        .map_err(|err| format!("图片预处理失败，无法解码源图像({}): {err}", detected_mime))?;

    let (compressed, final_mime) = compress_image_for_wechat_uploadimg(&image)?;
    if compressed.len() > WECHAT_UPLOADIMG_MAX_BYTES {
        return Err(format!(
            "图片压缩后仍超过 uploadimg 推荐限制（{}KB），请手动压缩后重试",
            WECHAT_UPLOADIMG_MAX_BYTES / 1024
        ));
    }
    let final_file_name = ensure_file_extension(
        &normalized_file_name,
        if final_mime == "image/png" {
            "png"
        } else {
            "jpg"
        },
    );
    eprintln!(
        "[wechat-uploadimg-normalize] src_mime={} src_bytes={} out_mime={} out_bytes={} file={}",
        detected_mime,
        bytes.len(),
        final_mime,
        compressed.len(),
        final_file_name
    );
    Ok((compressed, final_mime.to_string(), final_file_name))
}

fn compress_image_for_wechat_uploadimg(
    image: &DynamicImage,
) -> Result<(Vec<u8>, &'static str), String> {
    let mut current = image.clone();
    let mut best: Option<Vec<u8>> = None;

    for _ in 0..4 {
        for quality in [85u8, 75, 65, 55] {
            let encoded = encode_jpeg(&current, quality)?;
            if encoded.len() <= WECHAT_UPLOADIMG_TARGET_BYTES {
                return Ok((encoded, "image/jpeg"));
            }
            if best
                .as_ref()
                .map(|existing| encoded.len() < existing.len())
                .unwrap_or(true)
            {
                best = Some(encoded);
            }
        }

        let (w, h) = current.dimensions();
        if w <= 640 || h <= 640 {
            break;
        }
        let next_w = ((w as f32) * 0.82).round() as u32;
        let next_h = ((h as f32) * 0.82).round() as u32;
        current = current.resize(next_w.max(640), next_h.max(640), FilterType::Triangle);
    }

    match best {
        Some(encoded) => Ok((encoded, "image/jpeg")),
        None => Err("图片压缩失败，未生成有效输出".to_string()),
    }
}

fn encode_jpeg(image: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut output, quality);
    encoder
        .encode_image(image)
        .map_err(|err| format!("图片压缩编码失败: {err}"))?;
    Ok(output)
}

fn detect_image_mime(bytes: &[u8]) -> Option<String> {
    if bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
        return Some("image/jpeg".to_string());
    }
    if bytes.len() >= 8 && &bytes[..8] == b"\x89PNG\r\n\x1a\n" {
        return Some("image/png".to_string());
    }
    if bytes.len() >= 6 && (&bytes[..6] == b"GIF87a" || &bytes[..6] == b"GIF89a") {
        return Some("image/gif".to_string());
    }
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("image/webp".to_string());
    }
    None
}

fn ensure_file_extension(file_name: &str, extension: &str) -> String {
    let trimmed = file_name.trim();
    if trimmed.is_empty() {
        return format!("cover.{extension}");
    }

    let path = Path::new(trimmed);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("cover");

    match path.extension().and_then(|value| value.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case(extension) => trimmed.to_string(),
        _ => format!("{stem}.{extension}"),
    }
}

pub(crate) async fn upload_to_aliyun_oss(
    file_name: &str,
    mime_type: &str,
    bytes: Vec<u8>,
    config: &AliyunOssConfig,
    network_proxy: Option<&NetworkProxyConfig>,
) -> Result<(String, String), String> {
    let access_key_id = config.access_key_id.trim();
    let access_key_secret = config.access_key_secret.trim();
    let bucket = config.bucket.trim();
    let region = config.region.trim();

    if access_key_id.is_empty()
        || access_key_secret.is_empty()
        || bucket.is_empty()
        || region.is_empty()
    {
        return Err("阿里云 OSS 上传需要填写 AccessKey、Bucket 和区域".to_string());
    }

    let object_key = build_oss_object_key(&config.path_prefix, file_name);
    let host = format!("{bucket}.{region}.aliyuncs.com");
    let path = format!("/{object_key}");
    let scheme = if config.use_ssl { "https" } else { "http" };
    let upload_url = format!("{scheme}://{host}{path}");
    let date = Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
    let string_to_sign = format!("PUT\n\n{mime_type}\n{date}\n/{bucket}{path}");
    let signature = sign_oss_hmac_sha1(access_key_secret, &string_to_sign)?;
    let authorization = format!("OSS {access_key_id}:{signature}");

    let client = build_http_client(network_proxy)?;
    let response = client
        .put(&upload_url)
        .header("Date", &date)
        .header("Content-Type", mime_type)
        .header("Authorization", authorization)
        .body(bytes)
        .send()
        .await
        .map_err(|err| format!("Failed to upload image to aliyun OSS: {err}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Aliyun OSS upload failed: HTTP {} {}",
            status, body
        ));
    }

    let final_url = if config.cdn_domain.trim().is_empty() {
        upload_url
    } else {
        format!(
            "{}/{}",
            config.cdn_domain.trim().trim_end_matches('/'),
            object_key
        )
    };

    Ok((final_url, object_key))
}

fn build_oss_object_key(prefix: &str, file_name: &str) -> String {
    let ext = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .unwrap_or("png");

    let now = Utc::now();
    let date_path = now.format("%Y/%m/%d").to_string();
    let time = now.format("%H%M%S").to_string();
    let rand_suffix: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(8)
        .map(char::from)
        .collect();
    let file = format!("img_{time}_{rand_suffix}.{ext}");

    let cleaned_prefix = prefix.trim().trim_matches('/');
    if cleaned_prefix.is_empty() {
        format!("{date_path}/{file}")
    } else {
        format!("{cleaned_prefix}/{date_path}/{file}")
    }
}

fn sign_oss_hmac_sha1(secret: &str, data: &str) -> Result<String, String> {
    let mut mac =
        Hmac::<Sha1>::new_from_slice(secret.as_bytes()).map_err(|err| format!("{err}"))?;
    mac.update(data.as_bytes());
    let signed = mac.finalize().into_bytes();
    Ok(general_purpose::STANDARD.encode(signed))
}

pub(crate) fn build_http_client(
    proxy: Option<&NetworkProxyConfig>,
) -> Result<reqwest::Client, String> {
    let app_proxy_enabled = proxy.map(|cfg| cfg.enabled).unwrap_or(false);
    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(8));

    if let Some(proxy) = proxy.filter(|cfg| cfg.enabled) {
        if !proxy.socks_proxy.trim().is_empty() {
            let socks = reqwest::Proxy::all(proxy.socks_proxy.trim())
                .map_err(|err| format!("Invalid SOCKS proxy: {err}"))?;
            builder = builder.proxy(socks);
        }
        if !proxy.http_proxy.trim().is_empty() {
            let http = reqwest::Proxy::http(proxy.http_proxy.trim())
                .map_err(|err| format!("Invalid HTTP proxy: {err}"))?;
            builder = builder.proxy(http);
        }
        if !proxy.https_proxy.trim().is_empty() {
            let https = reqwest::Proxy::https(proxy.https_proxy.trim())
                .map_err(|err| format!("Invalid HTTPS proxy: {err}"))?;
            builder = builder.proxy(https);
        }
    }

    eprintln!(
        "[http-client] app_proxy_enabled={} timeout_seconds={} has_socks={} has_http={} has_https={}",
        app_proxy_enabled,
        8,
        proxy.map(|cfg| !cfg.socks_proxy.trim().is_empty()).unwrap_or(false),
        proxy.map(|cfg| !cfg.http_proxy.trim().is_empty()).unwrap_or(false),
        proxy.map(|cfg| !cfg.https_proxy.trim().is_empty()).unwrap_or(false)
    );

    builder
        .build()
        .map_err(|err| format!("Failed to build http client: {err}"))
}

fn build_wechat_proxy_client(
    proxy_url: &str,
    proxy: Option<&NetworkProxyConfig>,
) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(8));

    // Apply app proxy settings for accessing the Worker
    if let Some(proxy) = proxy.filter(|cfg| cfg.enabled) {
        if !proxy.socks_proxy.trim().is_empty() {
            let socks = reqwest::Proxy::all(proxy.socks_proxy.trim())
                .map_err(|err| format!("Invalid SOCKS proxy: {err}"))?;
            builder = builder.proxy(socks);
        }
        if !proxy.http_proxy.trim().is_empty() {
            let http = reqwest::Proxy::http(proxy.http_proxy.trim())
                .map_err(|err| format!("Invalid HTTP proxy: {err}"))?;
            builder = builder.proxy(http);
        }
        if !proxy.https_proxy.trim().is_empty() {
            let https = reqwest::Proxy::https(proxy.https_proxy.trim())
                .map_err(|err| format!("Invalid HTTPS proxy: {err}"))?;
            builder = builder.proxy(https);
        }
    }

    let client = builder
        .build()
        .map_err(|err| format!("Failed to build wechat proxy client: {err}"))?;
    eprintln!(
        "[wechat-proxy] direct_client proxy_url={} app_proxy_enabled={} timeout_seconds={}",
        proxy_url,
        proxy.map(|cfg| cfg.enabled).unwrap_or(false),
        8
    );
    Ok(client)
}

fn format_reqwest_error(err: &reqwest::Error) -> String {
    let mut parts = vec![err.to_string()];
    let mut current = err.source();
    while let Some(source) = current {
        parts.push(source.to_string());
        current = source.source();
    }
    if err.is_timeout() {
        parts.push("kind=timeout".to_string());
    }
    if err.is_connect() {
        parts.push("kind=connect".to_string());
    }
    if err.is_request() {
        parts.push("kind=request".to_string());
    }
    if err.is_body() {
        parts.push("kind=body".to_string());
    }
    parts.join(" | caused_by=")
}

fn with_extension_if_missing(path: PathBuf, ext: &str) -> PathBuf {
    if ext.is_empty() || path.extension().is_some() {
        return path;
    }
    path.with_extension(ext)
}

fn parse_local_path(src: &str) -> Result<PathBuf, String> {
    if let Some(rest) = src.strip_prefix("file://") {
        #[cfg(target_os = "windows")]
        {
            let path = rest.strip_prefix('/').unwrap_or(rest).replace('/', "\\");
            return Ok(PathBuf::from(path));
        }
        #[cfg(not(target_os = "windows"))]
        {
            return Ok(PathBuf::from(rest));
        }
    }

    Ok(PathBuf::from(src))
}

pub(crate) fn infer_mime_from_path(path: &str) -> String {
    mime_guess::from_path(path)
        .first_raw()
        .unwrap_or("application/octet-stream")
        .to_string()
}

pub(crate) fn ensure_git_available() -> Result<(), String> {
    run_git_command(&["--version"]).map(|_| ())
}

pub(crate) fn run_git_command(args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|err| format!("执行 git 命令失败: {err}"))?;

    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let details = if stderr.is_empty() { stdout } else { stderr };
    Err(format!(
        "git {} 失败: {}",
        args.join(" "),
        if details.is_empty() {
            "未知错误".to_string()
        } else {
            details
        }
    ))
}

pub(crate) fn ensure_git_repository_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("获取应用数据目录失败: {err}"))?;
    let root = app_data_dir.join(GIT_REPOSITORIES_DIR);
    fs::create_dir_all(&root)
        .map_err(|err| format!("创建 Git 仓库存储目录失败({}): {err}", root.display()))?;
    Ok(root)
}

pub(crate) fn repo_path_string(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(|value| value.to_string())
        .ok_or_else(|| format!("无效的仓库路径: {}", path.display()))
}

pub(crate) fn normalize_repo_name(input: Option<&str>, repo_url: &str) -> Result<String, String> {
    let candidate = input
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| extract_repo_name_from_url(repo_url));
    let raw_name = candidate.ok_or_else(|| "无法从仓库地址解析仓库名称".to_string())?;
    let sanitized = raw_name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if sanitized.is_empty() {
        return Err("仓库名称无效，请手动输入".to_string());
    }
    Ok(sanitized)
}

pub(crate) fn build_git_remote_url(
    repo_url: &str,
    auth: Option<&GitAuthRequest>,
) -> Result<String, String> {
    let Some(auth) = auth else {
        return Ok(repo_url.to_string());
    };

    let username = auth.username.as_deref().unwrap_or("oauth2").trim();
    let token = auth.token.as_deref().unwrap_or("").trim();
    if token.is_empty() {
        return Ok(repo_url.to_string());
    }

    let mut url = Url::parse(repo_url).map_err(|err| format!("仓库地址无效: {err}"))?;
    url.set_username(username)
        .map_err(|_| "无法设置仓库认证用户名".to_string())?;
    url.set_password(Some(token))
        .map_err(|_| "无法设置仓库认证口令".to_string())?;
    Ok(url.to_string())
}

fn extract_repo_name_from_url(repo_url: &str) -> Option<String> {
    let tail = repo_url.trim_end_matches('/').rsplit('/').next()?;
    let clean = tail.trim_end_matches(".git").trim();
    if clean.is_empty() {
        return None;
    }
    Some(clean.to_string())
}

pub(crate) fn build_git_snapshot_from_path(
    repo_path: &Path,
) -> Result<GitRepositorySnapshot, String> {
    let repo_path_value = repo_path_string(repo_path)?;
    let is_empty = run_git_command(&["-C", repo_path_value.as_str(), "rev-parse", "--verify", "HEAD"]).is_err();
    let repo_url = run_git_command(&[
        "-C",
        repo_path_value.as_str(),
        "remote",
        "get-url",
        "origin",
    ])
    .unwrap_or_default();
    let branch = run_git_command(&[
        "-C",
        repo_path_value.as_str(),
        "rev-parse",
        "--abbrev-ref",
        "HEAD",
    ])
    .unwrap_or_else(|_| "unknown".to_string());
    let repo_name = repo_path
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .ok_or_else(|| format!("无法解析仓库名称: {}", repo_path.display()))?;
    let files = collect_files_in_folder(repo_path, "")?;
    let folders = collect_directory_tree(repo_path, repo_path)?;
    Ok(GitRepositorySnapshot {
        repo_url,
        repo_name,
        branch,
        local_path: repo_path_value,
        is_empty,
        files,
        folders,
        last_synced_at: Utc::now().timestamp(),
    })
}

fn collect_directory_tree(
    root_path: &Path,
    current_path: &Path,
) -> Result<Vec<GitFolderNode>, String> {
    let entries = fs::read_dir(current_path)
        .map_err(|err| format!("读取目录失败({}): {err}", current_path.display()))?;

    let mut child_folders: Vec<GitFolderNode> = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|err| format!("读取目录项失败: {err}"))?;
        let path = entry.path();

        let Some(name) = path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.to_string())
        else {
            continue;
        };

        // Skip hidden directories and common ignore patterns
        if name == ".git" || name == "node_modules" || name == "target" || name.starts_with('.') {
            continue;
        }

        let relative = path
            .strip_prefix(root_path)
            .ok()
            .and_then(|value| value.to_str())
            .map(|value| value.replace('\\', "/"))
            .unwrap_or_else(|| name.clone());

        if path.is_dir() {
            let subfolder = collect_directory_tree(root_path, &path)?;
            let files = collect_files_in_folder(root_path, &relative)?;
            child_folders.push(GitFolderNode {
                name,
                path: relative,
                files,
                children: subfolder,
            });
        }
    }

    child_folders.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(child_folders)
}

fn collect_files_in_folder(
    root_path: &Path,
    folder_path: &str,
) -> Result<Vec<GitFileNode>, String> {
    let full_path = root_path.join(folder_path);
    let entries = fs::read_dir(&full_path)
        .map_err(|err| format!("读取目录失败({}): {err}", full_path.display()))?;

    let mut files = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|err| format!("读取目录项失败: {err}"))?;
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let Some(name) = path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.to_string())
        else {
            continue;
        };

        // Skip hidden files
        if name.starts_with('.') {
            continue;
        }

        // Keep markdown and image assets in the tree, skip only obvious binaries.
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let should_skip = matches!(
            ext,
            "ico"
                | "mp4"
                | "webm"
                | "mov"
                | "avi"
                | "mp3"
                | "wav"
                | "ogg"
                | "zip"
                | "tar"
                | "gz"
                | "rar"
                | "7z"
                | "exe"
                | "dll"
                | "so"
                | "dylib"
                | "pdf"
                | "doc"
                | "docx"
                | "xls"
                | "xlsx"
                | "ppt"
                | "pptx"
                | "ttf"
                | "otf"
                | "woff"
                | "woff2"
                | "eot"
        );

        if !should_skip {
            let relative = path
                .strip_prefix(root_path)
                .ok()
                .and_then(|value| value.to_str())
                .map(|value| value.replace('\\', "/"))
                .unwrap_or_else(|| name.clone());

            files.push(GitFileNode {
                name,
                path: relative,
            });
        }
    }

    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When attempting to start a second instance, focus the existing main window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
                let _ = window.show();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(plugins::system_tray::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            update_tray_menu,
            save_file_via_dialog,
            pick_local_library_directory,
            image_to_data_url_fallback,
            commands::wechat::test_wechat_account,
            commands::wechat::test_network_proxy_connection,
            commands::wechat::publish_wechat_draft,
            commands::wechat::upload_image_to_host,
            commands::wechat::upload_image_source_to_host,
            commands::cover::generate_cover_with_modelscope,
            commands::cover::test_modelscope_connection,
            commands::local_library::list_local_library_documents,
            commands::local_library::list_local_workspace_tree,
            commands::local_library::save_local_library_document,
            commands::local_library::delete_local_library_document,
            commands::local_library::save_workspace_file,
            commands::local_library::create_workspace_file,
            commands::local_library::delete_workspace_file,
            commands::local_library::create_workspace_folder,
            commands::local_library::delete_workspace_folder,
            commands::local_library::move_workspace_entry,
            commands::git::inspect_git_repository_access,
            commands::git::sync_remote_git_repository,
            commands::git::list_synced_git_repositories,
            commands::git::delete_synced_git_repository,
            commands::git::read_git_file,
            commands::git::save_git_file,
            commands::git::git_commit_and_push,
            commands::git::git_commit_and_push_workspace,
            commands::git::configure_git_repository_remote
        ]);

    // Only enable updater in release mode
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } = event
        {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }

            if let Some(tray) = app_handle.tray_by_id("main-tray") {
                let _ = tray.set_visible(false);
            }
        }
    });
}
