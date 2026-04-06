use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelScopeGenerateCoverRequest {
    api_endpoint: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    prompt: String,
    size: Option<String>,
    poll_interval_ms: Option<u64>,
    timeout_ms: Option<u64>,
    network_proxy: Option<crate::NetworkProxyConfig>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelScopeConnectionTestRequest {
    api_endpoint: Option<String>,
    api_key: Option<String>,
    network_proxy: Option<crate::NetworkProxyConfig>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelScopeGenerateCoverResponse {
    task_id: String,
    image_url: String,
    task_status: String,
}

#[derive(Debug, Deserialize)]
struct ModelScopeTaskSubmitResponse {
    task_id: Option<String>,
}

#[tauri::command]
pub async fn generate_cover_with_modelscope(
    request: ModelScopeGenerateCoverRequest,
) -> Result<ModelScopeGenerateCoverResponse, String> {
    let endpoint = normalize_modelscope_endpoint(request.api_endpoint.as_deref());
    let model = request
        .model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(crate::DEFAULT_MODELSCOPE_MODEL)
        .to_string();
    let prompt = request.prompt.trim();
    if prompt.is_empty() {
        return Err("请输入封面描述词（Prompt）".to_string());
    }
    let api_key = resolve_modelscope_api_key(request.api_key.as_deref())?;
    let poll_interval = request.poll_interval_ms.unwrap_or(2000).clamp(1000, 10000);
    let timeout_ms = request.timeout_ms.unwrap_or(120000).clamp(30000, 300000);

    let submit_url = format!("{}/images/generations", endpoint);
    let task_base_url = format!("{}/tasks", endpoint);
    let client = crate::build_http_client(request.network_proxy.as_ref())?;

    let mut payload = serde_json::json!({
        "model": model,
        "prompt": prompt
    });
    if let Some(size) = request
        .size
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        payload["size"] = serde_json::Value::String(size.to_string());
    }

    let submit_response = client
        .post(&submit_url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json")
        .header("X-ModelScope-Async-Mode", "true")
        .json(&payload)
        .send()
        .await
        .map_err(|err| format!("提交封面生成任务失败: {err}"))?;

    if !submit_response.status().is_success() {
        let status = submit_response.status();
        let body = submit_response.text().await.unwrap_or_default();
        return Err(format!("提交封面生成任务失败: HTTP {} {}", status, body));
    }

    let submit_json: ModelScopeTaskSubmitResponse = submit_response
        .json()
        .await
        .map_err(|err| format!("解析任务提交响应失败: {err}"))?;
    let task_id = submit_json
        .task_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "任务提交成功，但未返回 task_id".to_string())?;

    let start = std::time::Instant::now();
    loop {
        if start.elapsed().as_millis() >= u128::from(timeout_ms) {
            return Err(format!(
                "封面生成超时（>{}秒），请稍后重试",
                timeout_ms / 1000
            ));
        }

        let status_url = format!("{task_base_url}/{task_id}");
        let status_response = client
            .get(&status_url)
            .header("Authorization", format!("Bearer {api_key}"))
            .header("X-ModelScope-Task-Type", "image_generation")
            .send()
            .await
            .map_err(|err| format!("查询任务状态失败: {err}"))?;

        if !status_response.status().is_success() {
            let status = status_response.status();
            let body = status_response.text().await.unwrap_or_default();
            return Err(format!("查询任务状态失败: HTTP {} {}", status, body));
        }

        let body: serde_json::Value = status_response
            .json()
            .await
            .map_err(|err| format!("解析任务状态响应失败: {err}"))?;
        let task_status = body
            .get("task_status")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();

        match task_status.as_str() {
            "SUCCEED" => {
                let image_url = extract_modelscope_image_url(&body)?;
                return Ok(ModelScopeGenerateCoverResponse {
                    task_id,
                    image_url,
                    task_status,
                });
            }
            "FAILED" => {
                let error_message = body
                    .get("error")
                    .and_then(|value| value.as_str())
                    .or_else(|| body.get("message").and_then(|value| value.as_str()))
                    .unwrap_or("Unknown error");
                return Err(format!("封面生成失败: {error_message}"));
            }
            _ => {
                tokio::time::sleep(Duration::from_millis(poll_interval)).await;
            }
        }
    }
}

#[tauri::command]
pub async fn test_modelscope_connection(
    request: ModelScopeConnectionTestRequest,
) -> Result<String, String> {
    let endpoint = normalize_modelscope_endpoint(request.api_endpoint.as_deref());
    let api_key = resolve_modelscope_api_key(request.api_key.as_deref())?;
    let url = format!("{endpoint}/tasks/connection_test");
    let client = crate::build_http_client(request.network_proxy.as_ref())?;

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("X-ModelScope-Task-Type", "image_generation")
        .send()
        .await
        .map_err(|err| format!("连接失败：{err}"))?;

    let status = response.status();
    if status.is_success() || status.is_client_error() {
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err("连接成功，但 API Key 无效或无权限".to_string());
        }
        return Ok("ok".to_string());
    }

    let body = response.text().await.unwrap_or_default();
    Err(format!("连接失败: HTTP {} {}", status, body))
}

fn normalize_modelscope_endpoint(endpoint: Option<&str>) -> String {
    let default = crate::DEFAULT_MODELSCOPE_ENDPOINT.to_string();
    let trimmed = endpoint.unwrap_or("").trim();
    if trimmed.is_empty() {
        return default;
    }
    trimmed.trim_end_matches('/').to_string()
}

fn resolve_modelscope_api_key(api_key: Option<&str>) -> Result<String, String> {
    let provided = api_key.unwrap_or("").trim();
    if !provided.is_empty() {
        return Ok(provided.to_string());
    }

    if !crate::DEFAULT_MODELSCOPE_API_KEY.trim().is_empty() {
        return Ok(crate::DEFAULT_MODELSCOPE_API_KEY.to_string());
    }

    Err("缺少 API Key，请先在 AI 实验室中配置".to_string())
}

fn extract_modelscope_image_url(body: &serde_json::Value) -> Result<String, String> {
    let Some(images) = body.get("output_images").and_then(|value| value.as_array()) else {
        return Err("任务完成但未返回 output_images".to_string());
    };

    let first = images
        .first()
        .ok_or_else(|| "任务完成但 output_images 为空".to_string())?;

    if let Some(url) = first
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(url.to_string());
    }

    if let Some(url) = first
        .get("url")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(url.to_string());
    }

    if let Some(url) = first
        .get("image_url")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(url.to_string());
    }

    Err("任务完成但未返回可用图片 URL".to_string())
}

