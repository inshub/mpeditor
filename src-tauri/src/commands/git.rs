use std::{fs, path::Path, path::PathBuf};

struct GitRemoteReferenceInfo {
    default_branch: Option<String>,
    branches: Vec<String>,
    is_empty: bool,
}

fn inspect_remote_references(remote_url: &str) -> Result<GitRemoteReferenceInfo, String> {
    let output =
        crate::run_git_command(&["ls-remote", "--symref", "--heads", remote_url])?;

    let mut branches = Vec::new();
    let mut default_branch = None;

    for line in output.lines() {
        if let Some(rest) = line.strip_prefix("ref: refs/heads/") {
            let mut parts = rest.split('\t');
            if let Some(branch_name) = parts.next() {
                default_branch = Some(branch_name.to_string());
            }
            continue;
        }
        if let Some(branch_ref) = line.split('\t').nth(1) {
            if let Some(branch_name) = branch_ref.strip_prefix("refs/heads/") {
                branches.push(branch_name.to_string());
            }
        }
    }

    branches.sort();
    branches.dedup();

    Ok(GitRemoteReferenceInfo {
        is_empty: branches.is_empty(),
        default_branch,
        branches,
    })
}

#[tauri::command]
pub fn sync_remote_git_repository(
    app: tauri::AppHandle,
    request: crate::GitSyncRequest,
) -> Result<crate::GitRepositorySnapshot, String> {
    let repo_url = request.repo_url.trim();
    if !repo_url.starts_with("https://") {
        return Err("仅支持 HTTPS Git 仓库地址".to_string());
    }
    crate::ensure_git_available()?;

    let repo_name = crate::normalize_repo_name(request.repo_name.as_deref(), repo_url)?;
    let remote_url = crate::build_git_remote_url(repo_url, request.auth.as_ref())?;
    let remote_info = inspect_remote_references(remote_url.as_str())?;
    let repo_root = crate::ensure_git_repository_root(&app)?;
    let repo_path = repo_root.join(&repo_name);
    let repo_path_value = crate::repo_path_string(&repo_path)?;
    let requested_branch = request
        .branch
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let target_branch = requested_branch
        .as_deref()
        .or(remote_info.default_branch.as_deref());

    if repo_path.join(".git").exists() {
        crate::run_git_command(&[
            "-C",
            repo_path_value.as_str(),
            "remote",
            "set-url",
            "origin",
            remote_url.as_str(),
        ])?;
        crate::run_git_command(&["-C", repo_path_value.as_str(), "fetch", "--all", "--prune"])?;
        crate::run_git_command(&["-C", repo_path_value.as_str(), "clean", "-fd"])?;
        if !remote_info.is_empty {
            if let Some(branch_name) = target_branch {
                crate::run_git_command(&[
                    "-C",
                    repo_path_value.as_str(),
                    "checkout",
                    "-B",
                    branch_name,
                    &format!("origin/{branch_name}"),
                ])?;
                crate::run_git_command(&[
                    "-C",
                    repo_path_value.as_str(),
                    "reset",
                    "--hard",
                    &format!("origin/{branch_name}"),
                ])?;
            } else {
                crate::run_git_command(&["-C", repo_path_value.as_str(), "reset", "--hard"])?;
                crate::run_git_command(&["-C", repo_path_value.as_str(), "pull", "--ff-only"])?;
            }
        }
        crate::run_git_command(&[
            "-C",
            repo_path_value.as_str(),
            "remote",
            "set-url",
            "origin",
            repo_url,
        ])?;
    } else {
        let mut args = vec!["clone"];
        if !remote_info.is_empty {
            args.push("--depth");
            args.push("1");
        }
        if let Some(branch_name) = target_branch.filter(|_| !remote_info.is_empty) {
            args.push("--branch");
            args.push(branch_name);
        }
        args.push(remote_url.as_str());
        args.push(repo_path_value.as_str());
        crate::run_git_command(&args)?;
        crate::run_git_command(&[
            "-C",
            repo_path_value.as_str(),
            "remote",
            "set-url",
            "origin",
            repo_url,
        ])?;
    }

    crate::build_git_snapshot_from_path(&repo_path)
}

#[tauri::command]
pub fn inspect_git_repository_access(
    request: crate::GitRepositoryAccessRequest,
) -> Result<crate::GitRepositoryAccessResponse, String> {
    let repo_url = request.repo_url.trim();
    if !repo_url.starts_with("https://") {
        return Err("仅支持 HTTPS Git 仓库地址".to_string());
    }
    crate::ensure_git_available()?;

    let remote_url = crate::build_git_remote_url(repo_url, request.auth.as_ref())?;
    let repo_name = crate::normalize_repo_name(None, repo_url)?;
    let remote_info = inspect_remote_references(remote_url.as_str())?;

    Ok(crate::GitRepositoryAccessResponse {
        repo_name,
        default_branch: remote_info.default_branch,
        branches: remote_info.branches,
        is_empty: remote_info.is_empty,
    })
}

#[tauri::command]
pub fn list_synced_git_repositories(
    app: tauri::AppHandle,
) -> Result<Vec<crate::GitRepositorySnapshot>, String> {
    crate::ensure_git_available()?;
    let repo_root = crate::ensure_git_repository_root(&app)?;
    let entries = fs::read_dir(&repo_root)
        .map_err(|err| format!("读取 Git 仓库目录失败({}): {err}", repo_root.display()))?;
    let mut repositories = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|err| format!("读取 Git 仓库目录项失败: {err}"))?;
        let path = entry.path();
        if !path.is_dir() || !path.join(".git").exists() {
            continue;
        }
        if let Ok(snapshot) = crate::build_git_snapshot_from_path(&path) {
            repositories.push(snapshot);
        }
    }
    repositories.sort_by(|a, b| a.repo_name.cmp(&b.repo_name));
    Ok(repositories)
}

#[tauri::command]
pub fn delete_synced_git_repository(
    app: tauri::AppHandle,
    request: crate::DeleteGitRepositoryRequest,
) -> Result<(), String> {
    let repo_root = crate::ensure_git_repository_root(&app)?;
    let repo_path = PathBuf::from(&request.local_path);

    if !repo_path.starts_with(&repo_root) {
        return Err("只允许删除应用管理的仓库缓存".to_string());
    }

    if !repo_path.exists() {
        return Ok(());
    }

    if !repo_path.is_dir() {
        return Err(format!("仓库路径不是目录: {}", repo_path.display()));
    }

    fs::remove_dir_all(&repo_path)
        .map_err(|err| format!("删除仓库缓存失败({}): {err}", repo_path.display()))?;
    Ok(())
}

#[tauri::command]
pub fn read_git_file(
    request: crate::ReadGitFileRequest,
) -> Result<crate::ReadGitFileResponse, String> {
    let repo_path = Path::new(&request.local_path);
    let file_path = repo_path.join(&request.file_path);

    if !file_path.exists() {
        return Err(format!("文件不存在: {}", file_path.display()));
    }

    if !file_path.is_file() {
        return Err(format!("路径不是文件: {}", file_path.display()));
    }

    let mime_type = crate::infer_mime_from_path(file_path.to_string_lossy().as_ref());
    if mime_type.starts_with("image/") {
        return Ok(crate::ReadGitFileResponse {
            content: String::new(),
            mime_type,
            is_binary: true,
            local_file_path: file_path.to_string_lossy().to_string(),
        });
    }

    let content = fs::read_to_string(&file_path)
        .map_err(|err| format!("读取文件失败({}): {err}", file_path.display()))?;

    Ok(crate::ReadGitFileResponse {
        content,
        mime_type,
        is_binary: false,
        local_file_path: file_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn save_git_file(
    app: tauri::AppHandle,
    request: crate::SaveGitFileRequest,
) -> Result<(), String> {
    let repo_root = crate::ensure_git_repository_root(&app)?;
    let repo_path = PathBuf::from(&request.local_path);
    if !repo_path.starts_with(&repo_root) {
        return Err("只允许写入应用管理的仓库目录".to_string());
    }
    if !repo_path.join(".git").exists() {
        return Err(format!("仓库不存在: {}", repo_path.display()));
    }

    let relative_path = request.file_path.trim();
    if relative_path.is_empty() {
        return Err("文件路径不能为空".to_string());
    }
    if relative_path.contains("..")
        || relative_path.starts_with('/')
        || relative_path.starts_with('\\')
    {
        return Err("不允许的文件路径".to_string());
    }

    let file_path = repo_path.join(relative_path);
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("创建目录失败({}): {err}", parent.display()))?;
    }
    fs::write(&file_path, request.content.as_bytes())
        .map_err(|err| format!("写入文件失败({}): {err}", file_path.display()))?;
    Ok(())
}

#[tauri::command]
pub fn git_commit_and_push(
    app: tauri::AppHandle,
    request: crate::GitCommitPushRequest,
) -> Result<crate::GitCommitPushResponse, String> {
    let repo_root = crate::ensure_git_repository_root(&app)?;
    let repo_path = PathBuf::from(&request.local_path);
    if !repo_path.starts_with(&repo_root) {
        return Err("只允许操作应用管理的仓库目录".to_string());
    }
    if !repo_path.join(".git").exists() {
        return Err(format!("仓库不存在: {}", repo_path.display()));
    }

    let relative_path = request.file_path.trim();
    if relative_path.is_empty() {
        return Err("文件路径不能为空".to_string());
    }
    if relative_path.contains("..")
        || relative_path.starts_with('/')
        || relative_path.starts_with('\\')
    {
        return Err("不允许的文件路径".to_string());
    }

    let commit_message = request.commit_message.trim();
    if commit_message.is_empty() {
        return Err("提交信息不能为空".to_string());
    }

    let repo_path_value = crate::repo_path_string(&repo_path)?;
    crate::run_git_command(&["-C", repo_path_value.as_str(), "add", "--", relative_path])?;

    let staged = crate::run_git_command(&[
        "-C",
        repo_path_value.as_str(),
        "diff",
        "--cached",
        "--name-only",
        "--",
        relative_path,
    ])?;
    if staged.trim().is_empty() {
        return Ok(crate::GitCommitPushResponse {
            status: "no_changes".to_string(),
            commit_id: None,
            branch: current_branch_name(&repo_path_value)?,
            message: "没有可提交的变更".to_string(),
        });
    }

    crate::run_git_command(&[
        "-C",
        repo_path_value.as_str(),
        "commit",
        "-m",
        commit_message,
        "--",
        relative_path,
    ])?;
    let commit_id = crate::run_git_command(&["-C", repo_path_value.as_str(), "rev-parse", "HEAD"])?;
    let branch = current_branch_name(&repo_path_value)?;

    let original_remote = crate::run_git_command(&[
        "-C",
        repo_path_value.as_str(),
        "remote",
        "get-url",
        "origin",
    ])?;
    let mut remote_rewritten = false;
    if let Some(auth) = request.auth.as_ref().filter(|auth| {
        auth.token
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_some()
    }) {
        let remote_with_auth = crate::build_git_remote_url(&original_remote, Some(auth))?;
        crate::run_git_command(&[
            "-C",
            repo_path_value.as_str(),
            "remote",
            "set-url",
            "origin",
            remote_with_auth.as_str(),
        ])?;
        remote_rewritten = true;
    }

    let push_result = crate::run_git_command(&[
        "-C",
        repo_path_value.as_str(),
        "push",
        "origin",
        branch.as_str(),
    ]);

    if remote_rewritten {
        let _ = crate::run_git_command(&[
            "-C",
            repo_path_value.as_str(),
            "remote",
            "set-url",
            "origin",
            original_remote.as_str(),
        ]);
    }

    push_result?;

    Ok(crate::GitCommitPushResponse {
        status: "pushed".to_string(),
        commit_id: Some(commit_id),
        branch,
        message: "提交并推送成功".to_string(),
    })
}

#[tauri::command]
pub fn git_commit_and_push_workspace(
    app: tauri::AppHandle,
    request: crate::GitWorkspaceSyncRequest,
) -> Result<crate::GitCommitPushResponse, String> {
    let repo_root = crate::ensure_git_repository_root(&app)?;
    let repo_path = PathBuf::from(&request.local_path);
    if !repo_path.starts_with(&repo_root) {
        return Err("只允许操作应用管理的仓库目录".to_string());
    }
    if !repo_path.join(".git").exists() {
        return Err(format!("仓库不存在: {}", repo_path.display()));
    }

    let commit_message = request.commit_message.trim();
    if commit_message.is_empty() {
        return Err("提交信息不能为空".to_string());
    }

    let repo_path_value = crate::repo_path_string(&repo_path)?;
    crate::run_git_command(&["-C", repo_path_value.as_str(), "add", "-A"])?;

    let staged = crate::run_git_command(&["-C", repo_path_value.as_str(), "diff", "--cached", "--name-only"])?;
    if staged.trim().is_empty() {
        return Ok(crate::GitCommitPushResponse {
            status: "no_changes".to_string(),
            commit_id: None,
            branch: current_branch_name(&repo_path_value)?,
            message: "没有可提交的变更".to_string(),
        });
    }

    crate::run_git_command(&["-C", repo_path_value.as_str(), "commit", "-m", commit_message])?;
    let commit_id = crate::run_git_command(&["-C", repo_path_value.as_str(), "rev-parse", "HEAD"])?;
    let branch = current_branch_name(&repo_path_value)?;

    let original_remote = crate::run_git_command(&[
        "-C",
        repo_path_value.as_str(),
        "remote",
        "get-url",
        "origin",
    ])?;
    let mut remote_rewritten = false;
    if let Some(auth) = request.auth.as_ref().filter(|auth| {
        auth.token
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_some()
    }) {
        let remote_with_auth = crate::build_git_remote_url(&original_remote, Some(auth))?;
        crate::run_git_command(&[
            "-C",
            repo_path_value.as_str(),
            "remote",
            "set-url",
            "origin",
            remote_with_auth.as_str(),
        ])?;
        remote_rewritten = true;
    }

    let push_result = crate::run_git_command(&[
        "-C",
        repo_path_value.as_str(),
        "push",
        "origin",
        branch.as_str(),
    ]);

    if remote_rewritten {
        let _ = crate::run_git_command(&[
            "-C",
            repo_path_value.as_str(),
            "remote",
            "set-url",
            "origin",
            original_remote.as_str(),
        ]);
    }

    push_result?;

    Ok(crate::GitCommitPushResponse {
        status: "pushed".to_string(),
        commit_id: Some(commit_id),
        branch,
        message: "工作区提交并推送成功".to_string(),
    })
}

#[tauri::command]
pub fn configure_git_repository_remote(
    app: tauri::AppHandle,
    request: crate::GitConfigureRemoteRequest,
) -> Result<crate::GitRepositorySnapshot, String> {
    crate::ensure_git_available()?;

    let repo_url = request.repo_url.trim();
    if repo_url.is_empty() {
        return Err("仓库地址不能为空".to_string());
    }
    if !repo_url.starts_with("https://") {
        return Err("仅支持 HTTPS Git 仓库地址".to_string());
    }

    let repo_root = crate::ensure_git_repository_root(&app)?;
    let repo_path = PathBuf::from(&request.local_path);
    if !repo_path.starts_with(&repo_root) {
        return Err("只允许操作应用管理的仓库目录".to_string());
    }
    if !repo_path.join(".git").exists() {
        return Err(format!("仓库不存在: {}", repo_path.display()));
    }

    let remote_url = crate::build_git_remote_url(repo_url, request.auth.as_ref())?;
    crate::run_git_command(&["ls-remote", "--heads", remote_url.as_str()])?;

    let repo_path_value = crate::repo_path_string(&repo_path)?;
    crate::run_git_command(&[
        "-C",
        repo_path_value.as_str(),
        "remote",
        "set-url",
        "origin",
        repo_url,
    ])?;

    crate::build_git_snapshot_from_path(&repo_path)
}

fn current_branch_name(repo_path_value: &str) -> Result<String, String> {
    crate::run_git_command(&["-C", repo_path_value, "rev-parse", "--abbrev-ref", "HEAD"])
}
