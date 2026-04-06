#[tauri::command]
pub async fn upload_image_to_host(
    request: crate::UploadImageRequest,
) -> Result<crate::UploadImageResponse, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&request.content_base64)
        .map_err(|err| format!("Failed to decode image base64: {err}"))?;
    if bytes.is_empty() {
        return Err("Image data is empty".to_string());
    }

    match request.provider.as_str() {
        "wechat" => {
            let config = request
                .wechat
                .ok_or_else(|| "Missing wechat image host config".to_string())?;
            let (bytes, mime_type, file_name) = crate::normalize_wechat_uploadimg_asset(
                bytes,
                &request.mime_type,
                &request.file_name,
            )?;
            let url = crate::upload_to_wechat(
                &file_name,
                &mime_type,
                bytes,
                &config,
                request.network_proxy.as_ref(),
            )
            .await?;
            Ok(crate::UploadImageResponse {
                provider: "wechat".to_string(),
                url,
                object_key: None,
            })
        }
        "aliyun" => {
            let config = request
                .aliyun
                .ok_or_else(|| "Missing aliyun image host config".to_string())?;
            let (url, object_key) = crate::upload_to_aliyun_oss(
                &request.file_name,
                &request.mime_type,
                bytes,
                &config,
                request.network_proxy.as_ref(),
            )
            .await?;
            Ok(crate::UploadImageResponse {
                provider: "aliyun".to_string(),
                url,
                object_key: Some(object_key),
            })
        }
        _ => Err(format!(
            "Unsupported image host provider: {}",
            request.provider
        )),
    }
}

#[tauri::command]
pub async fn upload_image_source_to_host(
    request: crate::UploadImageSourceRequest,
) -> Result<crate::UploadImageResponse, String> {
    let (bytes, mime_type, file_name) =
        crate::load_image_source(&request.src, request.network_proxy.as_ref()).await?;
    eprintln!(
        "[image-source-upload] provider={} src={} file={} mime={} bytes={}",
        request.provider,
        request.src,
        file_name,
        mime_type,
        bytes.len()
    );
    if bytes.is_empty() {
        return Err("Image data is empty".to_string());
    }

    match request.provider.as_str() {
        "wechat" => {
            let config = request
                .wechat
                .ok_or_else(|| "Missing wechat image host config".to_string())?;
            let (bytes, normalized_mime_type, normalized_file_name) =
                crate::normalize_wechat_uploadimg_asset(bytes, &mime_type, &file_name)?;
            let url = crate::upload_to_wechat(
                &normalized_file_name,
                &normalized_mime_type,
                bytes,
                &config,
                request.network_proxy.as_ref(),
            )
            .await?;
            Ok(crate::UploadImageResponse {
                provider: "wechat".to_string(),
                url,
                object_key: None,
            })
        }
        "aliyun" => {
            let config = request
                .aliyun
                .ok_or_else(|| "Missing aliyun image host config".to_string())?;
            let (url, object_key) = crate::upload_to_aliyun_oss(
                &file_name,
                &mime_type,
                bytes,
                &config,
                request.network_proxy.as_ref(),
            )
            .await?;
            Ok(crate::UploadImageResponse {
                provider: "aliyun".to_string(),
                url,
                object_key: Some(object_key),
            })
        }
        _ => Err(format!(
            "Unsupported image host provider: {}",
            request.provider
        )),
    }
}

#[tauri::command]
pub async fn test_wechat_account(
    app_id: String,
    app_secret: String,
    proxy_domain: Option<String>,
    network_proxy: Option<crate::NetworkProxyConfig>,
) -> Result<String, String> {
    let app_id = app_id.trim();
    let app_secret = app_secret.trim();
    if app_id.is_empty() || app_secret.is_empty() {
        return Err("请填写 AppID 和 AppSecret".to_string());
    }

    eprintln!(
        "[wechat-test] start app_id_prefix={} proxy={}",
        app_id.chars().take(8).collect::<String>(),
        proxy_domain.as_deref().unwrap_or("")
    );
    let _token = crate::fetch_wechat_access_token(
        proxy_domain.as_deref(),
        app_id,
        app_secret,
        network_proxy.as_ref(),
    )
    .await?;
    eprintln!(
        "[wechat-test] success app_id_prefix={}",
        app_id.chars().take(8).collect::<String>()
    );
    Ok("ok".to_string())
}

#[tauri::command]
pub async fn publish_wechat_draft(
    app_id: String,
    app_secret: String,
    proxy_domain: Option<String>,
    title: String,
    content_html: String,
    author: Option<String>,
    network_proxy: Option<crate::NetworkProxyConfig>,
) -> Result<String, String> {
    let app_id = app_id.trim();
    let app_secret = app_secret.trim();
    if app_id.is_empty() || app_secret.is_empty() {
        return Err("请先配置公众号 AppID/AppSecret".to_string());
    }
    if title.trim().is_empty() || content_html.trim().is_empty() {
        return Err("发布草稿需要标题和正文内容".to_string());
    }

    let access_token = crate::fetch_wechat_access_token(
        proxy_domain.as_deref(),
        app_id,
        app_secret,
        network_proxy.as_ref(),
    )
    .await?;
    let cover_src = crate::extract_first_image_src(&content_html)
        .ok_or_else(|| "发布到草稿箱至少需要一张图片，首图将作为封面".to_string())?;
    let (cover_bytes, cover_mime_type, cover_file_name) =
        crate::load_image_source(&cover_src, network_proxy.as_ref()).await?;
    let (cover_mime_type, cover_file_name) =
        crate::normalize_wechat_cover_asset(&cover_bytes, &cover_mime_type, &cover_file_name)?;
    eprintln!(
        "[wechat-publish] first image src={} bytes={} mime={} file={}",
        cover_src,
        cover_bytes.len(),
        cover_mime_type,
        cover_file_name
    );

    let thumb_media_id = crate::upload_wechat_cover(
        proxy_domain.as_deref(),
        &access_token,
        &cover_file_name,
        &cover_mime_type,
        cover_bytes,
        network_proxy.as_ref(),
    )
    .await?;

    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/draft/add?access_token={}",
        access_token
    );
    let payload = serde_json::json!({
        "articles": [{
            "title": title,
            "author": author.unwrap_or_default(),
            "digest": "",
            "content": content_html,
            "content_source_url": "",
            "thumb_media_id": thumb_media_id
        }]
    });

    let json = crate::send_wechat_json_request(
        proxy_domain.as_deref(),
        &url,
        "POST",
        Some(payload),
        network_proxy.as_ref(),
    )
    .await?;
    let draft: crate::WechatDraftResponse =
        serde_json::from_value(json).map_err(|err| format!("解析草稿响应失败: {err}"))?;

    if let Some(media_id) = draft.media_id {
        return Ok(media_id);
    }

    Err(format!(
        "创建草稿失败: {} {}",
        draft.errcode.unwrap_or_default(),
        draft.errmsg.unwrap_or_else(|| "unknown".to_string())
    ))
}
use base64::Engine as _;
