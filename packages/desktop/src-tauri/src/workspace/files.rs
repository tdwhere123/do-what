use std::fs;
use std::path::PathBuf;

use crate::types::{OpencodeCommand, WorkspaceDoWhatConfig};
use crate::utils::now_ms;
use crate::workspace::commands::{sanitize_command_name, serialize_command_frontmatter};

fn seed_workspace_guide(skill_root: &PathBuf) -> Result<(), String> {
    let guide_dir = skill_root.join("workspace-guide");
    if guide_dir.exists() {
        return Ok(());
    }

    fs::create_dir_all(&guide_dir)
        .map_err(|e| format!("Failed to create {}: {e}", guide_dir.display()))?;

    let doc = r#"---
name: workspace-guide
description: Workspace guide for do-what onboarding.
---

# Welcome to do-what

Use this workspace guide when a user asks how to get started.

## Default behavior
- Keep responses concise and practical.
- Prefer workspace-safe actions first (read/summarize before write).
- Confirm intent before destructive file changes.

## Suggested first steps
1) Ask what outcome the user wants.
2) Inspect the workspace files relevant to that outcome.
3) Propose a short plan and execute step by step.

## Helpful prompts
- "Summarize this workspace."
- "Show me where to start."
- "Draft an implementation plan for this repo."
"#;

    fs::write(guide_dir.join("SKILL.md"), doc)
        .map_err(|e| format!("Failed to write SKILL.md: {e}"))?;

    Ok(())
}

fn seed_get_started_skill(skill_root: &PathBuf) -> Result<(), String> {
    let skill_dir = skill_root.join("get-started");
    if skill_dir.exists() {
        return Ok(());
    }

    fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create {}: {e}", skill_dir.display()))?;

    let doc = r#"---
name: get-started
description: Guide users through the get started setup and Chrome DevTools demo.
---

## When to use
- Always load this skill when the user says \"get started\".

## What to do
- Reply with these four lines, exactly and in order:
  1) hey there welcome this is do-what
  2) we've pre-configured you with a couple tools
  3) Get Started
  4) write \"hey go on google.com\"

## Then
- If the user writes \"go on google.com\" (or \"hey go on google.com\"), use the chrome-devtools MCP to open the site.
- After the navigation completes, reply: \"I'm on <site>\" where <site> is the final URL or page title they asked for.
"#;

    fs::write(skill_dir.join("SKILL.md"), doc)
        .map_err(|e| format!("Failed to write SKILL.md: {e}"))?;

    Ok(())
}

fn seed_commands(commands_dir: &PathBuf, preset: &str) -> Result<(), String> {
    if fs::read_dir(commands_dir)
        .map_err(|e| format!("Failed to read {}: {e}", commands_dir.display()))?
        .next()
        .is_some()
    {
        return Ok(());
    }

    let defaults = vec![
    OpencodeCommand {
      name: "learn-files".to_string(),
      description: Some("Safe, practical file workflows".to_string()),
      template: "Show me how to interact with files in this workspace. Include safe examples for reading, summarizing, and editing.".to_string(),
      agent: None,
      model: None,
      subtask: None,
    },
    OpencodeCommand {
      name: "learn-skills".to_string(),
      description: Some("How skills work and how to create your own".to_string()),
      template: "Explain what skills are, how to use them, and how to create a new skill for this workspace.".to_string(),
      agent: None,
      model: None,
      subtask: None,
    },
    OpencodeCommand {
      name: "learn-plugins".to_string(),
      description: Some("What plugins are and how to install them".to_string()),
      template: "Explain what plugins are and how to install them in this workspace.".to_string(),
      agent: None,
      model: None,
      subtask: None,
    },
  ];

    let mut defaults = defaults;
    if preset == "starter" {
        defaults.push(OpencodeCommand {
            name: "Get Started".to_string(),
            description: Some("Get started".to_string()),
            template: "get started".to_string(),
            agent: None,
            model: None,
            subtask: None,
        });
    }

    for command in defaults {
        let Some(name) = sanitize_command_name(&command.name) else {
            continue;
        };

        let file_path = commands_dir.join(format!("{name}.md"));
        if file_path.exists() {
            continue;
        }

        let serialized = serialize_command_frontmatter(&command)?;
        fs::write(&file_path, serialized)
            .map_err(|e| format!("Failed to write {}: {e}", file_path.display()))?;
    }

    Ok(())
}

pub fn ensure_workspace_files(workspace_path: &str, preset: &str) -> Result<(), String> {
    let root = PathBuf::from(workspace_path);

    let skill_root = root.join(".opencode").join("skills");
    fs::create_dir_all(&skill_root)
        .map_err(|e| format!("Failed to create .opencode/skills: {e}"))?;
    seed_workspace_guide(&skill_root)?;
    if preset == "starter" {
        seed_get_started_skill(&skill_root)?;
    }

    let agents_dir = root.join(".opencode").join("agents");
    fs::create_dir_all(&agents_dir)
        .map_err(|e| format!("Failed to create .opencode/agents: {e}"))?;

    let commands_dir = root.join(".opencode").join("commands");
    fs::create_dir_all(&commands_dir)
        .map_err(|e| format!("Failed to create .opencode/commands: {e}"))?;
    seed_commands(&commands_dir, preset)?;

    let config_path_jsonc = root.join("opencode.jsonc");
    let config_path_json = root.join("opencode.json");
    let config_path = if config_path_jsonc.exists() {
        config_path_jsonc
    } else if config_path_json.exists() {
        config_path_json
    } else {
        config_path_jsonc
    };

    let config_exists = config_path.exists();
    let mut config_changed = !config_exists;
    let mut config: serde_json::Value = if config_exists {
        let raw = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read {}: {e}", config_path.display()))?;
        json5::from_str(&raw).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({
          "$schema": "https://opencode.ai/config.json"
        })
    };

    if !config.is_object() {
        config = serde_json::json!({
          "$schema": "https://opencode.ai/config.json"
        });
        config_changed = true;
    }

    if config_changed {
        fs::write(
            &config_path,
            serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?,
        )
        .map_err(|e| format!("Failed to write {}: {e}", config_path.display()))?;
    }

    let openwork_path = root.join(".opencode").join("openwork.json");
    if !openwork_path.exists() {
        let openwork = WorkspaceDoWhatConfig::new(workspace_path, preset, now_ms());

        fs::create_dir_all(openwork_path.parent().unwrap())
            .map_err(|e| format!("Failed to create {}: {e}", openwork_path.display()))?;

        fs::write(
            &openwork_path,
            serde_json::to_string_pretty(&openwork).map_err(|e| e.to_string())?,
        )
        .map_err(|e| format!("Failed to write {}: {e}", openwork_path.display()))?;
    }

    Ok(())
}
