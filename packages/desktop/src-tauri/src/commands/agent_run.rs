use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use tauri::{AppHandle, Emitter, State};

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

    let mut cmd = match runtime {
        AgentRuntime::ClaudeCode => {
            let mut c = Command::new("claude");
            c.args(["-p", &prompt, "--output-format", "stream-json"]);
            if let Some(ref dir) = workdir {
                c.args(["--cwd", dir]);
                c.current_dir(dir);
            }
            c
        }
        AgentRuntime::Codex => {
            let mut c = Command::new("codex");
            c.arg(&prompt);
            if let Some(ref dir) = workdir {
                c.args(["--cwd", dir]);
                c.current_dir(dir);
            }
            c
        }
    };

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
    let bin = match runtime {
        AgentRuntime::ClaudeCode => "claude",
        AgentRuntime::Codex => "codex",
    };

    let output = Command::new(bin)
        .arg("--version")
        .output()
        .map_err(|_| format!("{bin} not found in PATH"))?;

    if !output.status.success() {
        return Err(format!("Failed to query {bin} version"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
