use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use tokio::sync::mpsc;
use tokio_with_wasm::task::JoinHandle;
use tracing::{debug, error};
use wasm_bindgen_futures::spawn_local;

pub enum TaskCommand {
    Spawn {
        task_id: String,
        task: Pin<Box<dyn Future<Output = ()> + Send + 'static>>,
    },
    Cancel {
        task_id: String,
    },
}

pub struct TaskSpawner {
    command_tx: mpsc::UnboundedSender<TaskCommand>,
    active_tasks: HashMap<String, JoinHandle<()>>,
}

impl TaskSpawner {
    pub fn new() -> Self {
        let (command_tx, mut command_rx) = mpsc::unbounded_channel::<TaskCommand>();

        // Spawn the main task manager on the main thread
        spawn_local(async move {
            let mut active_tasks: HashMap<String, JoinHandle<()>> = HashMap::new();

            while let Some(command) = command_rx.recv().await {
                match command {
                    TaskCommand::Spawn { task_id, task } => {
                        debug!("Spawning task: {}", task_id);
                        let handle = tokio_with_wasm::spawn(task);
                        active_tasks.insert(task_id, handle);
                    }
                    TaskCommand::Cancel { task_id } => {
                        debug!("Cancelling task: {}", task_id);
                        if let Some(handle) = active_tasks.remove(&task_id) {
                            handle.abort();
                        }
                    }
                }
            }
        });

        Self {
            command_tx,
            active_tasks: HashMap::new(),
        }
    }

    pub fn spawn_task<F>(&self, task_id: String, future: F) -> Result<(), String>
    where
        F: Future<Output = ()> + Send + 'static,
    {
        let command = TaskCommand::Spawn {
            task_id,
            task: Box::pin(future),
        };

        self.command_tx
            .send(command)
            .map_err(|_| "Failed to send spawn command".to_string())
    }

    pub fn cancel_task(&self, task_id: String) -> Result<(), String> {
        let command = TaskCommand::Cancel { task_id };

        self.command_tx
            .send(command)
            .map_err(|_| "Failed to send cancel command".to_string())
    }
}
