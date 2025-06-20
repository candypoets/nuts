use gloo_timers::future::TimeoutFuture;
use std::sync::{Arc, Once};
use tracing::info;
use wasm_bindgen::prelude::*;

use instant::Duration;
use tokio::sync::oneshot;

// Local modules
pub mod config;
pub mod db;
pub mod network;
pub mod parser;
pub mod relays;
pub mod signer;
pub mod types;
pub mod utils;

// Re-export types
pub use db::NostrDB;
pub use network::NetworkManager;
pub use parser::Parser;
pub use signer::{PrivateKeySigner, Signer, SignerManager, SignerManagerImpl};
pub use types::*;

use crate::relays::ConnectionRegistry;

// Type aliases to match Go implementation
pub type NostrEvent = Event;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);

    #[wasm_bindgen(js_namespace = ["self"])]
    fn postMessage(data: &JsValue);

    #[wasm_bindgen(js_namespace = console)]
    fn error(s: &str);
}

#[macro_export]
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[macro_export]
macro_rules! console_error {
    ($($t:tt)*) => (error(&format_args!($($t)*).to_string()))
}

fn setup_panic_hook() {
    std::panic::set_hook(Box::new(|panic_info| {
        let mut message = String::new();

        // Get location information
        if let Some(location) = panic_info.location() {
            message.push_str(&format!(
                "RUST PANIC in '{}' at line {}, column {}: ",
                location.file(),
                location.line(),
                location.column()
            ));
        } else {
            message.push_str("RUST PANIC at unknown location: ");
        }

        // Get panic message
        if let Some(payload) = panic_info.payload().downcast_ref::<&str>() {
            message.push_str(payload);
        } else if let Some(payload) = panic_info.payload().downcast_ref::<String>() {
            message.push_str(payload);
        } else {
            message.push_str("Unknown panic payload");
        }

        console_error!("{}", message);

        // Also use the console_error_panic_hook for browser integration
        console_error_panic_hook::hook(panic_info);
    }));
}

static TRACING_INIT: Once = Once::new();

fn setup_tracing() {
    TRACING_INIT.call_once(|| {
        use tracing_subscriber::{fmt, prelude::*};

        // Simple console writer for Web Workers
        struct ConsoleWriter;

        impl std::io::Write for ConsoleWriter {
            fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
                let message = String::from_utf8_lossy(buf);
                log(&message);
                Ok(buf.len())
            }

            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }

        // Try to set up a simple subscriber - if it fails, just continue
        let _ = tracing_subscriber::fmt()
            .with_writer(|| ConsoleWriter)
            .without_time()
            .with_target(false)
            .with_max_level(tracing::Level::DEBUG)
            .try_init();

        console_log!("Tracing subscriber initialized for Web Worker");
    });
}

// Debug mode flag
const DEBUG_MODE: bool = true;

// Default relay configurations to match Go implementation
const DEFAULT_RELAYS: &[&str] = &[
    "wss://relay.snort.social",
    "wss://relay.damus.io",
    "wss://relay.primal.net",
];

const INDEXER_RELAYS: &[&str] = &[
    "wss://user.kindpag.es",
    "wss://relay.nos.social",
    "wss://purplepag.es",
    "wss://relay.nostr.band",
];

#[wasm_bindgen]
pub struct NostrClient {
    database: Arc<NostrDB>,
    connection_registry: Arc<ConnectionRegistry>,
    parser: Arc<Parser>,
    signer_manager: Arc<SignerManagerImpl>,
    network_manager: Arc<NetworkManager>,
}

#[wasm_bindgen]
impl NostrClient {
    #[wasm_bindgen(constructor)]
    pub async fn new() -> Self {
        // Set up enhanced panic handling
        setup_panic_hook();
        setup_tracing();

        info!("Initializing NostrClient...");
        let database = Arc::new(NostrDB::with_relays(
            DEFAULT_RELAYS.iter().map(|s| s.to_string()).collect(),
            INDEXER_RELAYS.iter().map(|s| s.to_string()).collect(),
        ));
        database
            .initialize()
            .await
            .map_err(|e| {
                console_error!("Failed to initialize database: {}", e);
                e
            })
            .expect("Database initialization failed");
        let signer_manager = Arc::new(SignerManagerImpl::new());
        let connection_registry = Arc::new(ConnectionRegistry::new());
        let parser = Arc::new(Parser::new(database.clone()));
        let network_manager = Arc::new(NetworkManager::new(
            database.clone(),
            connection_registry.clone() as Arc<ConnectionRegistry>,
            parser.clone(),
        ));

        info!("NostrClient components initialized");

        Self {
            database,
            connection_registry,
            parser,
            signer_manager,
            network_manager,
        }
    }

    #[wasm_bindgen(js_name = openSubscription)]
    pub async fn open_subscription(
        &self,
        subscription_id: String,
        requests_data: &[u8],
    ) -> Result<(), JsValue> {
        let requests: Vec<Request> = rmp_serde::from_slice(requests_data).map_err(|e| {
            JsValue::from_str(&format!("Failed to parse requests from msgpack: {}", e))
        })?;

        self.network_manager
            .open_subscription(subscription_id, requests)
            .await
            .map_err(|e| JsValue::from_str(&format!("Failed to open subscription: {}", e)))
    }

    #[wasm_bindgen(js_name = closeSubscription)]
    pub async fn close_subscription(&self, subscription_id: String) -> Result<(), JsValue> {
        self.network_manager
            .close_subscription(subscription_id)
            .await
            .map_err(|e| JsValue::from_str(&format!("Failed to close subscription: {}", e)))
    }

    #[wasm_bindgen(js_name = publishEvent)]
    pub async fn publish_event(&self, publish_id: String, event: &[u8]) -> Result<String, JsValue> {
        let mut event: Event = rmp_serde::from_slice(&event)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse event: {}", e)))?;
        let summary = self
            .network_manager
            .publish_event(publish_id, &mut event)
            .await
            .map_err(|e| JsValue::from_str(&format!("Failed to publish event: {}", e)))?;

        serde_json::to_string(&summary)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize summary: {}", e)))
    }

    #[wasm_bindgen(js_name = getActiveSubscriptionCount)]
    pub async fn get_active_subscription_count(&self) -> u32 {
        self.network_manager.get_active_subscription_count().await
    }

    #[wasm_bindgen(js_name = getConnectionCount)]
    pub async fn get_connection_count(&self) -> u32 {
        self.connection_registry
            .active_subscription_ids()
            .await
            .len() as u32
    }

    // Private method to start monitoring (matching Go goroutine monitoring)
    fn start_monitoring(&self) {
        // if DEBUG_MODE {
        //     let relay_manager = self.relay_manager.clone();
        //     wasm_bindgen_futures::spawn_local(async move {
        //         loop {
        //             let connection_count = relay_manager.get_connection_count().await;

        //             let debug_data = js_sys::Object::new();
        //             js_sys::Reflect::set(
        //                 &debug_data,
        //                 &JsValue::from_str("type"),
        //                 &JsValue::from_str("DEBUG"),
        //             )
        //             .unwrap();
        //             js_sys::Reflect::set(
        //                 &debug_data,
        //                 &JsValue::from_str("connections"),
        //                 &JsValue::from_f64(connection_count as f64),
        //             )
        //             .unwrap();
        //             js_sys::Reflect::set(
        //                 &debug_data,
        //                 &JsValue::from_str("timestamp"),
        //                 &JsValue::from_f64(js_sys::Date::now()),
        //             )
        //             .unwrap();

        //             postMessage(&debug_data.into());

        //             TimeoutFuture::new(500).await;
        //         }
        //     });
        // }
    }
}

// pub struct SubscriptionHandle {
//     pub id: String,
//     pub cancel_tx: oneshot::Sender<()>,
// }

// #[wasm_bindgen(start)]
// pub fn main() {
//     // std::panic::set_hook(Box::new(console_error_panic_hook::hook));
//     // initialize_nostr();
//     // console_log!("Nutscash Nostr Rust Client initialized");
// }
