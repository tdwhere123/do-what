use std::io::ErrorKind;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use tauri::{AppHandle, Emitter, State};

use crate::platform::configure_hidden;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub enum AgentRuntime {
    #[serde(rename = "claude-code")]
    ClaudeCode,
    #[serde(rename = "codex")]
    Codex,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunConfig {
    pub mcp_config_path: Option<String>,
    pub rules_prefix: Option<String>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunChunk {
    pub chunk: String,
    pub timestamp: u64,
}

pub type RunMap = Arc<Mutex<std::collections::HashMap<String, u32>>>;

fn runtime_binaries(runtime: &AgentRuntime) -> &'static [&'static str] {
    match runtime {
        AgentRuntime::ClaudeCode => &["claude", "claude.cmd", "claude-code", "claude-code.cmd"],
        AgentRuntime::Codex => &["codex", "codex.cmd"],
    }
}

fn command_for_candidate(binary: &str) -> Command {
    #[cfg(windows)]
    {
        let lower = binary.to_ascii_lowercase();
        if lower.ends_with(".cmd") || lower.ends_with(".bat") {
            let mut command = Command::new("cmd");
            command.arg("/C").arg(binary);
            configure_hidden(&mut command);
            return command;
        }
    }

    let mut command = Command::new(binary);
    configure_hidden(&mut command);
    command
}

fn resolve_runtime_binary(runtime: &AgentRuntime) -> Result<String, String> {
    let binaries = runtime_binaries(runtime);
    let mut details: Vec<String> = Vec::new();

    for binary in binaries {
        let probe = command_for_candidate(binary).arg("--version").output();
        match probe {
            Ok(_) => return Ok((*binary).to_string()),
            Err(error) if error.kind() == ErrorKind::NotFound => continue,
            Err(error) => details.push(format!("{binary}: {error}")),
        }
    }

    let names = binaries.join(", ");
    if details.is_empty() {
        Err(format!("Runtime executable not found in PATH ({names})"))
    } else {
        Err(format!(
            "Runtime executable not found in PATH ({names}). Probe errors: {}",
            details.join("; ")
        ))
    }
}

fn build_runtime_command(
    runtime: &AgentRuntime,
    prompt: &str,
    workdir: Option<&String>,
) -> Result<Command, String> {
    let binary = resolve_runtime_binary(runtime)?;
    let mut command = command_for_candidate(&binary);

    match runtime {
        AgentRuntime::ClaudeCode => {
            command.args(["-p", prompt, "--output-format", "stream-json"]);
            if let Some(dir) = workdir {
                command.args(["--cwd", dir]);
                command.current_dir(dir);
            }
        }
        AgentRuntime::Codex => {
            command.arg(prompt);
            if let Some(dir) = workdir {
                command.args(["--cwd", dir]);
                command.current_dir(dir);
            }
        }
    }

    Ok(command)
}

fn summarize_output(bytes: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(bytes);
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToString::to_string)
}

fn terminate_pid(pid: u32) {
    #[cfg(unix)]
    {
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status();
    }
}

pub fn abort_all_runs(run_map: &RunMap) {
    let pids = match run_map.lock() {
        Ok(mut map) => {
            let values = map.values().copied().collect::<Vec<u32>>();
            map.clear();
            values
        }
        Err(_) => return,
    };

    for pid in pids {
        terminate_pid(pid);
    }
}

#[tauri::command]
pub async fn agent_run_start(
    app: AppHandle,
    run_id: String,
    runtime: AgentRuntime,
    prompt: String,
    workdir: Option<String>,
    _config: AgentRunConfig,
    run_map: State<'_, RunMap>,
) -> Result<(), String> {
    let event_name = format!("agent-run-output/{run_id}");

    let mut cmd = build_runtime_command(&runtime, &prompt, workdir.as_ref())?;

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    {
        let mut map = run_map.lock().map_err(|e| e.to_string())?;
        map.insert(run_id.clone(), child.id());
    }

    let stdout = child.stdout.take().ok_or_else(|| "no stdout".to_string())?;
    let app_clone = app.clone();
    let run_map_clone = run_map.inner().clone();
    let run_id_clone = run_id.clone();

    thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stdout);

        for line in reader.lines().map_while(Result::ok) {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;

            let _ = app_clone.emit(
                &event_name,
                AgentRunChunk {
                    chunk: line,
                    timestamp: now,
                },
            );
        }

        let exit_code = child
            .wait()
            .ok()
            .and_then(|status| status.code())
            .unwrap_or(-1);
        let _ = app_clone.emit(
            &event_name,
            AgentRunChunk {
                chunk: format!(r#"{{"type":"done","exitCode":{exit_code}}}"#),
                timestamp: 0,
            },
        );

        if let Ok(mut map) = run_map_clone.lock() {
            map.remove(&run_id_clone);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn agent_run_abort(run_id: String, run_map: State<'_, RunMap>) -> Result<(), String> {
    let pid = {
        let mut map = run_map.lock().map_err(|e| e.to_string())?;
        map.remove(&run_id)
    };

    if let Some(pid) = pid {
        terminate_pid(pid);
    }

    Ok(())
}

#[tauri::command]
pub async fn check_runtime_available(runtime: AgentRuntime) -> Result<String, String> {
    let bin = resolve_runtime_binary(&runtime)?;
    let output = command_for_candidate(&bin)
        .arg("--version")
        .output()
        .map_err(|error| format!("Failed to execute {bin}: {error}"))?;

    if !output.status.success() {
        let code = output.status.code().unwrap_or(-1);
        return Err(format!("Failed to query {bin} version (exit code {code})"));
    }

    Ok(summarize_output(&output.stdout)
        .or_else(|| summarize_output(&output.stderr))
        .unwrap_or_else(|| "available".to_string()))
}
