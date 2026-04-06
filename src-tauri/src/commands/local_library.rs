use std::{fs, path::Path, path::PathBuf, time::UNIX_EPOCH};

fn ensure_workspace_root(local_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(local_path.trim());
    if root.as_os_str().is_empty() {
        return Err("工作区目录不能为空".to_string());
    }
    if !root.exists() {
        fs::create_dir_all(&root)
            .map_err(|err| format!("创建工作区目录失败({}): {err}", root.display()))?;
    }
    if !root.is_dir() {
        return Err(format!("工作区路径不是目录: {}", root.display()));
    }
    Ok(root)
}

fn validate_relative_path<'a>(path: &'a str, field_name: &str) -> Result<&'a str, String> {
    let normalized = path.trim();
    if normalized.is_empty() {
        return Err(format!("{field_name}不能为空"));
    }
    if normalized.contains("..") || normalized.starts_with('/') || normalized.starts_with('\\') {
        return Err("不允许的路径".to_string());
    }
    Ok(normalized)
}

#[tauri::command]
pub fn list_local_workspace_tree(
    request: crate::ListLocalLibraryDocumentsRequest,
) -> Result<crate::LocalWorkspaceTreeSnapshot, String> {
    let root = ensure_workspace_root(&request.local_path)?;
    Ok(crate::LocalWorkspaceTreeSnapshot {
        files: collect_workspace_markdown_files(&root, &root)?,
        folders: collect_workspace_folders(&root, &root)?,
    })
}

#[tauri::command]
pub fn list_local_library_documents(
    request: crate::ListLocalLibraryDocumentsRequest,
) -> Result<Vec<crate::LocalLibraryDocumentSnapshot>, String> {
    let root = PathBuf::from(request.local_path.trim());
    if root.as_os_str().is_empty() {
        return Err("本地库目录不能为空".to_string());
    }
    if !root.exists() || !root.is_dir() {
        return Err(format!("本地库目录不存在: {}", root.display()));
    }

    let entries = collect_local_library_markdown_files(&root, &root)?;
    let mut snapshots = Vec::new();
    for path in entries {
        let content = fs::read_to_string(&path)
            .map_err(|err| format!("读取本地库文件失败({}): {err}", path.display()))?;
        let file_path = path
            .strip_prefix(&root)
            .ok()
            .and_then(|v| v.to_str())
            .map(|v| v.replace('\\', "/"))
            .ok_or_else(|| format!("无法构建相对路径: {}", path.display()))?;
        let file_name = path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("untitled.md")
            .to_string();
        let title = infer_title(&content, &file_name);
        let updated_at = fs::metadata(&path)
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|dur| dur.as_millis() as i64)
            .unwrap_or_default();

        snapshots.push(crate::LocalLibraryDocumentSnapshot {
            file_path,
            title,
            content,
            updated_at,
        });
    }
    snapshots.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(snapshots)
}

fn collect_workspace_folders(
    root: &Path,
    current: &Path,
) -> Result<Vec<crate::LocalWorkspaceFolderNode>, String> {
    let entries = fs::read_dir(current)
        .map_err(|err| format!("读取本地库目录失败({}): {err}", current.display()))?;

    let mut folders = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|err| format!("读取目录项失败: {err}"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|v| v.to_str()).map(|v| v.to_string()) else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .ok()
            .and_then(|value| value.to_str())
            .map(|value| value.replace('\\', "/"))
            .unwrap_or_else(|| name.clone());

        let children = collect_workspace_folders(root, &path)?;
        let files = collect_workspace_markdown_files(root, &path)?;

        folders.push(crate::LocalWorkspaceFolderNode {
            name,
            path: relative,
            files,
            children,
        });
    }

    folders.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(folders)
}

fn collect_workspace_markdown_files(
    root: &Path,
    current: &Path,
) -> Result<Vec<crate::LocalWorkspaceFileNode>, String> {
    let entries = fs::read_dir(current)
        .map_err(|err| format!("读取本地库目录失败({}): {err}", current.display()))?;
    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|err| format!("读取目录项失败: {err}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|v| v.to_str()).map(|v| v.to_string()) else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }
        let Some(ext) = path.extension().and_then(|v| v.to_str()) else {
            continue;
        };
        if !ext.eq_ignore_ascii_case("md") {
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .ok()
            .and_then(|value| value.to_str())
            .map(|value| value.replace('\\', "/"))
            .unwrap_or(name.clone());
        files.push(crate::LocalWorkspaceFileNode {
            name,
            path: relative,
        });
    }
    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(files)
}

fn collect_local_library_markdown_files(root: &Path, current: &Path) -> Result<Vec<PathBuf>, String> {
    let entries =
        fs::read_dir(current).map_err(|err| format!("读取本地库目录失败({}): {err}", current.display()))?;
    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|err| format!("读取目录项失败: {err}"))?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|v| v.to_str()) else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            files.extend(collect_local_library_markdown_files(root, &path)?);
            continue;
        }
        if !path.is_file() {
            continue;
        }
        let Some(ext) = path.extension().and_then(|v| v.to_str()) else {
            continue;
        };
        if ext.eq_ignore_ascii_case("md") {
            files.push(path);
        }
    }

    files.sort_by(|a, b| {
        let a_rel = a.strip_prefix(root).ok().and_then(|p| p.to_str()).unwrap_or_default();
        let b_rel = b.strip_prefix(root).ok().and_then(|p| p.to_str()).unwrap_or_default();
        a_rel.cmp(b_rel)
    });
    Ok(files)
}

#[tauri::command]
pub fn save_local_library_document(
    request: crate::SaveLocalLibraryDocumentRequest,
) -> Result<(), String> {
    let root = ensure_workspace_root(&request.local_path)?;
    let relative_path = validate_relative_path(&request.file_path, "文件路径")?;
    let path = Path::new(relative_path);
    let extension = path.extension().and_then(|v| v.to_str()).unwrap_or("");
    if !extension.eq_ignore_ascii_case("md") {
        return Err("本地库仅支持保存 Markdown 文件".to_string());
    }

    let full_path = root.join(path);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("创建目录失败({}): {err}", parent.display()))?;
    }
    fs::write(&full_path, request.content.as_bytes())
        .map_err(|err| format!("写入本地库文件失败({}): {err}", full_path.display()))?;
    Ok(())
}

#[tauri::command]
pub fn delete_local_library_document(
    request: crate::DeleteLocalLibraryDocumentRequest,
) -> Result<(), String> {
    let root = ensure_workspace_root(&request.local_path)?;
    let relative_path = validate_relative_path(&request.file_path, "文件路径")?;

    let full_path = root.join(relative_path);
    if !full_path.exists() {
        return Ok(());
    }
    fs::remove_file(&full_path)
        .map_err(|err| format!("删除本地库文件失败({}): {err}", full_path.display()))?;
    Ok(())
}

#[tauri::command]
pub fn save_workspace_file(request: crate::SaveWorkspaceFileRequest) -> Result<(), String> {
    let root = ensure_workspace_root(&request.local_path)?;
    let relative_path = validate_relative_path(&request.file_path, "文件路径")?;
    let full_path = root.join(relative_path);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("创建目录失败({}): {err}", parent.display()))?;
    }
    fs::write(&full_path, request.content.as_bytes())
        .map_err(|err| format!("写入工作区文件失败({}): {err}", full_path.display()))?;
    Ok(())
}

#[tauri::command]
pub fn create_workspace_file(request: crate::CreateWorkspaceFileRequest) -> Result<(), String> {
    let root = ensure_workspace_root(&request.local_path)?;
    let relative_path = validate_relative_path(&request.file_path, "文件路径")?;
    let full_path = root.join(relative_path);
    if full_path.exists() {
        return Err(format!("目标已存在: {}", full_path.display()));
    }
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("创建目录失败({}): {err}", parent.display()))?;
    }
    fs::write(&full_path, request.content.as_bytes())
        .map_err(|err| format!("创建工作区文件失败({}): {err}", full_path.display()))?;
    Ok(())
}

#[tauri::command]
pub fn delete_workspace_file(request: crate::DeleteWorkspaceFileRequest) -> Result<(), String> {
    let root = ensure_workspace_root(&request.local_path)?;
    let relative_path = validate_relative_path(&request.file_path, "文件路径")?;
    let full_path = root.join(relative_path);
    if !full_path.exists() {
        return Ok(());
    }
    if !full_path.is_file() {
        return Err("目标不是文件".to_string());
    }
    fs::remove_file(&full_path)
        .map_err(|err| format!("删除工作区文件失败({}): {err}", full_path.display()))?;
    Ok(())
}

#[tauri::command]
pub fn create_workspace_folder(request: crate::WorkspaceFolderRequest) -> Result<(), String> {
    let root = ensure_workspace_root(&request.local_path)?;
    let folder_path = validate_relative_path(&request.folder_path, "文件夹路径")?;
    let full_path = root.join(folder_path);
    if full_path.exists() {
        return Err(format!("目标已存在: {}", full_path.display()));
    }
    fs::create_dir_all(&full_path)
        .map_err(|err| format!("创建文件夹失败({}): {err}", full_path.display()))?;
    Ok(())
}

#[tauri::command]
pub fn delete_workspace_folder(request: crate::WorkspaceFolderRequest) -> Result<(), String> {
    let root = ensure_workspace_root(&request.local_path)?;
    let folder_path = validate_relative_path(&request.folder_path, "文件夹路径")?;
    let full_path = root.join(folder_path);
    if !full_path.exists() {
        return Ok(());
    }
    if !full_path.is_dir() {
        return Err("目标不是文件夹".to_string());
    }
    fs::remove_dir_all(&full_path)
        .map_err(|err| format!("删除文件夹失败({}): {err}", full_path.display()))?;
    Ok(())
}

#[tauri::command]
pub fn move_workspace_entry(request: crate::MoveWorkspaceEntryRequest) -> Result<(), String> {
    let root = ensure_workspace_root(&request.local_path)?;
    let from_path = validate_relative_path(&request.from_path, "来源路径")?;
    let to_path = validate_relative_path(&request.to_path, "目标路径")?;
    let from_full = root.join(from_path);
    if !from_full.exists() {
        return Err("来源路径不存在".to_string());
    }
    let to_full = root.join(to_path);
    if from_full == to_full {
        return Ok(());
    }
    if to_full.exists() {
        return Err(format!("目标已存在: {}", to_full.display()));
    }
    if let Some(parent) = to_full.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("创建目标目录失败({}): {err}", parent.display()))?;
    }
    fs::rename(&from_full, &to_full).map_err(|err| {
        format!(
            "移动条目失败({} -> {}): {err}",
            from_full.display(),
            to_full.display()
        )
    })?;
    Ok(())
}

fn infer_title(content: &str, fallback_file_name: &str) -> String {
    let heading = content
        .lines()
        .map(|line| line.trim().trim_start_matches('#').trim())
        .find(|line| !line.is_empty())
        .unwrap_or_default();

    if !heading.is_empty() {
        return heading.chars().take(32).collect();
    }

    fallback_file_name
        .trim_end_matches(".md")
        .chars()
        .take(32)
        .collect()
}
