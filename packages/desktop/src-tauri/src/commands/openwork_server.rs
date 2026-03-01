use tauri::State;

use crate::openwork_server::manager::OpenworkServerManager;
use crate::types::DoWhatServerInfo;

fn snapshot_server_info(manager: State<OpenworkServerManager>) -> DoWhatServerInfo {
    let mut state = manager
        .inner
        .lock()
        .expect("openwork server mutex poisoned");
    OpenworkServerManager::snapshot_locked(&mut state)
}

#[tauri::command]
pub fn dowhat_server_info(manager: State<OpenworkServerManager>) -> DoWhatServerInfo {
    snapshot_server_info(manager)
}

// start/stop are handled by engine lifecycle
