use std::env;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeInstallState {
    Installed,
    NotInstalled,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeLoginState {
    LoggedIn,
    LoggedOut,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAssistantStatus {
    pub id: String,
    pub name: String,
    pub binary: String,
    pub installed: bool,
    pub install_state: RuntimeInstallState,
    pub logged_in: bool,
    pub login_state: RuntimeLoginState,
    pub version: Option<String>,
    pub details: Vec<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAssistantStatusSnapshot {
    pub checked_at: u64,
    pub assistants: Vec<RuntimeAssistantStatus>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn summarize_output(bytes: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(bytes);
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| {
            let mut line = line.to_string();
            if line.len() > 180 {
                line.truncate(180);
                line.push_str("...");
            }
            line
        })
}

fn version_probe(binary: &str, args: &[&str], details: &mut Vec<String>) -> (bool, Option<String>) {
    match Command::new(binary).args(args).output() {
        Ok(output) => {
            if output.status.success() {
                let version = summarize_output(&output.stdout).or_else(|| summarize_output(&output.stderr));
                return (true, version);
            }

            let code = output.status.code().unwrap_or(-1);
            details.push(format!(
                "`{binary} {}` returned non-zero exit code ({code}) during version probe",
                args.join(" ")
            ));
            if let Some(stderr) = summarize_output(&output.stderr) {
                details.push(format!("stderr: {stderr}"));
            }
            (true, summarize_output(&output.stdout))
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {
            details.push(format!("`{binary}` not found in PATH"));
            (false, None)
        }
        Err(error) => {
            details.push(format!("Failed to execute `{binary}`: {error}"));
            (false, None)
        }
    }
}

fn has_env_login(keys: &[&str], details: &mut Vec<String>) -> bool {
    for key in keys {
        if let Ok(value) = env::var(key) {
            if !value.trim().is_empty() {
                details.push(format!("Detected credential from environment variable `{key}`"));
                return true;
            }
        }
    }
    false
}

fn push_env_path(paths: &mut Vec<PathBuf>, env_key: &str, relative: &str) {
    if let Ok(value) = env::var(env_key) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            paths.push(PathBuf::from(trimmed).join(relative));
        }
    }
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut unique = Vec::<PathBuf>::new();
    for path in paths {
        if unique.iter().any(|existing| existing == &path) {
            continue;
        }
        unique.push(path);
    }
    unique
}

fn has_file_login(paths: &[PathBuf], details: &mut Vec<String>) -> bool {
    for path in paths {
        if path.is_file() {
            details.push(format!("Detected credential file at {}", path.display()));
            return true;
        }
    }
    false
}

fn opencode_auth_paths() -> Vec<PathBuf> {
    let mut paths = Vec::<PathBuf>::new();
    if let Some(home) = crate::paths::home_dir() {
        paths.push(home.join(".opencode").join("auth.json"));
        paths.push(home.join(".config").join("opencode").join("auth.json"));
    }
    push_env_path(&mut paths, "XDG_CONFIG_HOME", "opencode/auth.json");
    push_env_path(&mut paths, "APPDATA", "opencode/auth.json");
    push_env_path(&mut paths, "LOCALAPPDATA", "opencode/auth.json");
    dedupe_paths(paths)
}

fn claude_auth_paths() -> Vec<PathBuf> {
    let mut paths = Vec::<PathBuf>::new();
    if let Some(home) = crate::paths::home_dir() {
        paths.push(home.join(".claude").join(".credentials.json"));
        paths.push(home.join(".claude").join("credentials.json"));
        paths.push(home.join(".config").join("claude").join(".credentials.json"));
        paths.push(home.join(".config").join("claude").join("credentials.json"));
    }
    push_env_path(&mut paths, "XDG_CONFIG_HOME", "claude/.credentials.json");
    push_env_path(&mut paths, "XDG_CONFIG_HOME", "claude/credentials.json");
    push_env_path(&mut paths, "APPDATA", "Claude/credentials.json");
    push_env_path(
        &mut paths,
        "APPDATA",
        "Anthropic/claude-code/credentials.json",
    );
    dedupe_paths(paths)
}

fn codex_auth_paths() -> Vec<PathBuf> {
    let mut paths = Vec::<PathBuf>::new();
    if let Some(home) = crate::paths::home_dir() {
        paths.push(home.join(".codex").join("auth.json"));
        paths.push(home.join(".config").join("codex").join("auth.json"));
    }
    push_env_path(&mut paths, "XDG_CONFIG_HOME", "codex/auth.json");
    push_env_path(&mut paths, "APPDATA", "codex/auth.json");
    push_env_path(&mut paths, "LOCALAPPDATA", "codex/auth.json");
    dedupe_paths(paths)
}

fn build_runtime_status(
    id: &str,
    name: &str,
    binary: &str,
    version_args: &[&str],
    login_env_keys: &[&str],
    login_paths: Vec<PathBuf>,
) -> RuntimeAssistantStatus {
    let mut details = Vec::<String>::new();
    let (installed, version) = version_probe(binary, version_args, &mut details);

    let logged_in = if installed {
        has_env_login(login_env_keys, &mut details) || has_file_login(&login_paths, &mut details)
    } else {
        false
    };

    if installed && !logged_in {
        details.push("No local login signal detected (env var or credential file)".to_string());
    }

    RuntimeAssistantStatus {
        id: id.to_string(),
        name: name.to_string(),
        binary: binary.to_string(),
        installed,
        install_state: if installed {
            RuntimeInstallState::Installed
        } else {
            RuntimeInstallState::NotInstalled
        },
        logged_in,
        login_state: if logged_in {
            RuntimeLoginState::LoggedIn
        } else {
            RuntimeLoginState::LoggedOut
        },
        version,
        details,
    }
}

fn probe_opencode_status() -> RuntimeAssistantStatus {
    build_runtime_status(
        "opencode",
        "OpenCode",
        "opencode",
        &["--version"],
        &["OPENCODE_API_KEY", "OPENAI_API_KEY"],
        opencode_auth_paths(),
    )
}

fn probe_claude_code_status() -> RuntimeAssistantStatus {
    build_runtime_status(
        "claude-code",
        "Claude Code",
        "claude",
        &["--version"],
        &["ANTHROPIC_API_KEY"],
        claude_auth_paths(),
    )
}

fn probe_codex_status() -> RuntimeAssistantStatus {
    build_runtime_status(
        "codex",
        "Codex",
        "codex",
        &["--version"],
        &["OPENAI_API_KEY"],
        codex_auth_paths(),
    )
}

#[tauri::command]
pub async fn check_opencode_status() -> Result<RuntimeAssistantStatus, String> {
    Ok(probe_opencode_status())
}

#[tauri::command]
pub async fn check_claude_code_status() -> Result<RuntimeAssistantStatus, String> {
    Ok(probe_claude_code_status())
}

#[tauri::command]
pub async fn check_codex_status() -> Result<RuntimeAssistantStatus, String> {
    Ok(probe_codex_status())
}

#[tauri::command]
pub async fn check_assistant_statuses() -> Result<RuntimeAssistantStatusSnapshot, String> {
    Ok(RuntimeAssistantStatusSnapshot {
        checked_at: now_ms(),
        assistants: vec![
            probe_opencode_status(),
            probe_claude_code_status(),
            probe_codex_status(),
        ],
    })
}
