use js_sys::{Object, Uint8Array};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;
use web_sys::{MessageEvent, Worker};

mod types;
mod utils;
use types::MainToWorkerMessage;

use crate::types::{RelayStatusUpdate, Request, SubscribeKind, WorkerToMainMessage, EOSE};
use crate::utils::hash_string;

// Use `wee_alloc` as the global allocator for smaller WASM size
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

// Common macros
#[macro_export]
macro_rules! console_log {
    ($($t:tt)*) => {
        web_sys::console::log_1(&format_args!($($t)*).to_string().into());
    }
}

#[macro_export]
macro_rules! console_error {
    ($($t:tt)*) => {
        web_sys::console::error_1(&format_args!($($t)*).to_string().into());
    }
}

#[derive(Debug, Clone)]
pub struct SubscriptionOptions {
    pub close_on_eose: bool,
    pub skip_cache: bool,
    pub force: bool,
}

impl Default for SubscriptionOptions {
    fn default() -> Self {
        Self {
            close_on_eose: false,
            skip_cache: false,
            force: false,
        }
    }
}

// JavaScript callback types
#[wasm_bindgen]
extern "C" {
    pub type SubscriptionCallback;

    #[wasm_bindgen(method, js_name = "call")]
    pub fn call_subscription_callback(
        this: &SubscriptionCallback,
        thisarg: &JsValue,
        data: &JsValue,
        event_type: &str,
    );

    pub type PublishCallback;

    #[wasm_bindgen(method, js_name = "call")]
    pub fn call_publish_callback(
        this: &PublishCallback,
        thisarg: &JsValue,
        data: &JsValue,
        event_type: &str,
    );
}

struct Subscription {
    callback: SubscriptionCallback,
    options: SubscriptionOptions,
}

struct Publish {
    callback: Option<PublishCallback>,
}

#[wasm_bindgen]
pub struct NostrManager {
    worker: Worker,
    subscriptions: Arc<RwLock<HashMap<String, Subscription>>>,
    signers: Arc<RwLock<HashMap<String, js_sys::Function>>>,
    publishes: Arc<RwLock<HashMap<String, Publish>>>,
}

#[wasm_bindgen]
impl NostrManager {
    // Helper function to post MessagePack data with transfer
    fn post_message_with_msgpack_transfer(
        worker: &Worker,
        message: &MainToWorkerMessage,
    ) -> Result<(), JsValue> {
        let message_bytes = rmp_serde::to_vec_named(message)
            .map_err(|e| JsValue::from_str(&format!("Failed to encode message: {}", e)))?;

        let uint8_array = Uint8Array::new_with_length(message_bytes.len() as u32);
        uint8_array.copy_from(&message_bytes);

        let transfer_array = js_sys::Array::new();
        transfer_array.push(&uint8_array.buffer());

        worker.post_message_with_transfer(&uint8_array, &transfer_array)
    }

    #[wasm_bindgen(constructor)]
    pub fn new(worker: Worker) -> Result<NostrManager, JsValue> {
        // Check if we're in SSR
        if let Ok(_window) = web_sys::window().ok_or("No window object") {
            // We're in browser
        } else {
            return Err(JsValue::from_str("SSR environment detected"));
        }

        let manager = NostrManager {
            worker,
            subscriptions: Arc::new(RwLock::new(HashMap::new())),
            signers: Arc::new(RwLock::new(HashMap::new())),
            publishes: Arc::new(RwLock::new(HashMap::new())),
        };

        manager.setup_worker_handlers()?;
        Ok(manager)
    }

    fn setup_worker_handlers(&self) -> Result<(), JsValue> {
        let subscriptions = Arc::clone(&self.subscriptions);
        let signers = Arc::clone(&self.signers);
        let publishes = Arc::clone(&self.publishes);

        let onmessage_callback = Closure::wrap(Box::new(move |event: MessageEvent| {
            let subscriptions = Arc::clone(&subscriptions);
            let signers = Arc::clone(&signers);
            let publishes = Arc::clone(&publishes);

            spawn_local(async move {
                if let Err(e) =
                    Self::handle_worker_message(event, subscriptions, signers, publishes)
                {
                    console_error!("Error handling worker message: {:?}", e);
                }
            });
        }) as Box<dyn FnMut(_)>);

        self.worker
            .set_onmessage(Some(onmessage_callback.as_ref().unchecked_ref()));
        onmessage_callback.forget();

        Ok(())
    }

    fn handle_worker_message(
        event: MessageEvent,
        subscriptions: Arc<RwLock<HashMap<String, Subscription>>>,
        signers: Arc<RwLock<HashMap<String, js_sys::Function>>>,
        publishes: Arc<RwLock<HashMap<String, Publish>>>,
    ) -> Result<(), JsValue> {
        let data = event.data();

        // Decode MessagePack data into strongly-typed message
        let message_bytes = if data.is_instance_of::<Uint8Array>() {
            let uint8_array: Uint8Array = data.dyn_into()?;
            uint8_array.to_vec()
        } else {
            return Err(JsValue::from_str("Expected Uint8Array message"));
        };

        let worker_message: WorkerToMainMessage = rmp_serde::from_slice(&message_bytes)
            .map_err(|e| JsValue::from_str(&format!("Failed to decode message: {}", e)))?;

        match worker_message {
            WorkerToMainMessage::PublishStatus { publish_id, status } => {
                Self::handle_publish_event(publish_id, status, publishes)?;
            }
            WorkerToMainMessage::SignedEvent {
                content,
                signed_event,
            } => {
                let signers_guard = signers.read().unwrap();
                if let Some(callback) = signers_guard.get(&content) {
                    let event_js = serde_wasm_bindgen::to_value(&signed_event).map_err(|e| {
                        JsValue::from_str(&format!("Failed to serialize event: {}", e))
                    })?;
                    let _ = callback.call1(&JsValue::NULL, &event_js);
                }
                drop(signers_guard);

                let mut signers_guard = signers.write().unwrap();
                signers_guard.remove(&content);
            }
            WorkerToMainMessage::Debug { message, data } => {
                console_log!("Debug: {} - {:?}", message, data);
            }
            WorkerToMainMessage::SubscriptionEvent {
                subscription_id,
                event_type,
                event_data,
            } => {
                Self::handle_subscription_event(
                    subscription_id,
                    event_type,
                    event_data,
                    subscriptions,
                )?;
            }
            WorkerToMainMessage::Count {
                subscription_id,
                count,
            } => {
                Self::handle_subscription_count(subscription_id, count, subscriptions)?;
            }
            WorkerToMainMessage::Eose {
                subscription_id,
                data,
            } => {
                Self::handle_subscription_eose(subscription_id, data, subscriptions)?;
            }
            WorkerToMainMessage::Eoce { subscription_id } => {
                Self::handle_subscription_eoce(subscription_id, subscriptions)?;
            }
            WorkerToMainMessage::PublicKey { public_key } => {
                let signers_guard = signers.read().unwrap();
                if let Some(callback) = signers_guard.get("getPublicKey") {
                    let _ = callback.call1(&JsValue::NULL, &JsValue::from_str(&public_key));
                }
                drop(signers_guard);

                let mut signers_guard = signers.write().unwrap();
                signers_guard.remove("getPublicKey");
            }
        }

        Ok(())
    }

    fn handle_publish_event(
        publish_id: String,
        status: RelayStatusUpdate,
        publishes: Arc<RwLock<HashMap<String, Publish>>>,
    ) -> Result<(), JsValue> {
        let publishes_guard = publishes.read().unwrap();

        // Convert status to JS value
        let status_js = serde_wasm_bindgen::to_value(&status)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize status: {}", e)))?;

        // Handle specific publish callback
        if let Some(publish) = publishes_guard.get(&publish_id) {
            if let Some(callback) = &publish.callback {
                callback.call_publish_callback(&JsValue::NULL, &status_js, "PUBLISH_STATUS");
            }
        }

        // Handle global publish callback
        if let Some(publish) = publishes_guard.get("*") {
            if let Some(callback) = &publish.callback {
                callback.call_publish_callback(&JsValue::NULL, &status_js, "PUBLISH_STATUS");
            }
        }

        Ok(())
    }

    fn handle_subscription_event(
        subscription_id: String,
        event_type: SubscribeKind,
        event_data: Vec<serde_json::Value>,
        subscriptions: Arc<RwLock<HashMap<String, Subscription>>>,
    ) -> Result<(), JsValue> {
        let subscriptions_guard = subscriptions.read().unwrap();

        if let Some(subscription) = subscriptions_guard.get(&subscription_id) {
            match event_type {
                SubscribeKind::CachedEvent => {
                    for event in &event_data {
                        subscription.callback.call_subscription_callback(
                            &JsValue::NULL,
                            &js_sys::JSON::parse(
                                &serde_json::to_string(event)
                                    .map_err(|_| "Failed to serialize event")?,
                            )
                            .map_err(|_| "Failed to serialize event")?,
                            "CACHED_EVENT",
                        );
                    }
                }
                SubscribeKind::FetchedEvent => subscription.callback.call_subscription_callback(
                    &JsValue::NULL,
                    &js_sys::JSON::parse(
                        &serde_json::to_string(&event_data)
                            .map_err(|_| "Failed to serialize event")?,
                    )
                    .map_err(|_| "Failed to serialize event")?,
                    "FETCHED_EVENT",
                ),
                SubscribeKind::Count => subscription.callback.call_subscription_callback(
                    &JsValue::NULL,
                    &serde_wasm_bindgen::to_value(&event_data).unwrap_or_else(|_| JsValue::from(0)),
                    "COUNT",
                ),
                SubscribeKind::Eose => subscription.callback.call_subscription_callback(
                    &JsValue::NULL,
                    &js_sys::JSON::parse(
                        &serde_json::to_string(&event_data)
                            .map_err(|_| "Failed to serialize event")?,
                    )
                    .map_err(|_| "Failed to serialize event")?,
                    "EOSE",
                ),
                SubscribeKind::Eoce => subscription.callback.call_subscription_callback(
                    &JsValue::NULL,
                    &js_sys::Array::new().into(),
                    "EOCE",
                ),
            };
        }

        Ok(())
    }

    fn handle_subscription_count(
        subscription_id: String,
        count: u32,
        subscriptions: Arc<RwLock<HashMap<String, Subscription>>>,
    ) -> Result<(), JsValue> {
        let subscriptions_guard = subscriptions.read().unwrap();

        if let Some(subscription) = subscriptions_guard.get(&subscription_id) {
            let count_js = JsValue::from_f64(count as f64);
            subscription
                .callback
                .call_subscription_callback(&JsValue::NULL, &count_js, "COUNT");
        }

        Ok(())
    }

    fn handle_subscription_eose(
        subscription_id: String,
        eose: EOSE,
        subscriptions: Arc<RwLock<HashMap<String, Subscription>>>,
    ) -> Result<(), JsValue> {
        let subscriptions_guard = subscriptions.read().unwrap();

        if let Some(subscription) = subscriptions_guard.get(&subscription_id) {
            subscription.callback.call_subscription_callback(
                &JsValue::NULL,
                &js_sys::JSON::parse(
                    &serde_json::to_string(&eose).map_err(|_| "Failed to serialize eose")?,
                )
                .map_err(|_| "Failed to serialize eose")?,
                "EOSE",
            );

            // Handle EOSE with closeOnEose option
            if subscription.options.close_on_eose {
                drop(subscriptions_guard);
                let mut subscriptions_guard = subscriptions.write().unwrap();
                subscriptions_guard.remove(&subscription_id);
            }
        }

        Ok(())
    }

    fn handle_subscription_eoce(
        subscription_id: String,
        subscriptions: Arc<RwLock<HashMap<String, Subscription>>>,
    ) -> Result<(), JsValue> {
        let subscriptions_guard = subscriptions.read().unwrap();

        if let Some(subscription) = subscriptions_guard.get(&subscription_id) {
            subscription.callback.call_subscription_callback(
                &JsValue::NULL,
                &js_sys::Array::new().into(),
                "EOCE",
            );
        }

        Ok(())
    }

    #[wasm_bindgen]
    pub fn publish(
        &self,
        publish_id: String,
        event: &JsValue,
        callback: Option<PublishCallback>,
    ) -> Result<(), JsValue> {
        // Store the publish callback
        let mut publishes_guard = self.publishes.write().unwrap();
        publishes_guard.insert(publish_id.clone(), Publish { callback });
        drop(publishes_guard);

        // Encode as MessagePack
        let parsed_event: serde_json::Value = serde_wasm_bindgen::from_value(event.clone())
            .map_err(|e| JsValue::from_str(&format!("Failed to deserialize event: {}", e)))?;

        let message = MainToWorkerMessage::Publish {
            publish_id: publish_id.clone(),
            event: parsed_event,
        };

        Self::post_message_with_msgpack_transfer(&self.worker, &message)?;
        Ok(())
    }

    #[wasm_bindgen(js_name = "addPublishCallbackAll")]
    pub fn add_publish_callback_all(&self, callback: PublishCallback) -> Result<(), JsValue> {
        let mut publishes_guard = self.publishes.write().unwrap();
        publishes_guard.insert(
            "*".to_string(),
            Publish {
                callback: Some(callback),
            },
        );
        Ok(())
    }

    #[wasm_bindgen]
    pub fn subscribe(
        &self,
        subscription_id: String,
        requests: &JsValue,
        callback: SubscriptionCallback,
        options: Option<Object>,
    ) -> Result<js_sys::Function, JsValue> {
        let mut final_subscription_id = subscription_id;

        if final_subscription_id.is_empty() {
            return Err(JsValue::from_str("Subscription ID is required"));
        }

        if final_subscription_id.len() > 64 {
            // Generate a shorter hash-based ID
            let hash = hash_string(&final_subscription_id);
            final_subscription_id = hash;
        }

        // Parse options
        let mut sub_options = SubscriptionOptions::default();
        if let Some(opts) = options {
            if let Ok(close_on_eose) =
                js_sys::Reflect::get(&opts, &JsValue::from_str("closeOnEose"))
            {
                sub_options.close_on_eose = close_on_eose.as_bool().unwrap_or(false);
            }
            if let Ok(skip_cache) = js_sys::Reflect::get(&opts, &JsValue::from_str("skipCache")) {
                sub_options.skip_cache = skip_cache.as_bool().unwrap_or(false);
            }
            if let Ok(force) = js_sys::Reflect::get(&opts, &JsValue::from_str("force")) {
                sub_options.force = force.as_bool().unwrap_or(false);
            }
        }

        // Store the subscription
        let mut subscriptions_guard = self.subscriptions.write().unwrap();
        subscriptions_guard.insert(
            final_subscription_id.clone(),
            Subscription {
                callback,
                options: sub_options,
            },
        );
        drop(subscriptions_guard);

        // Convert JavaScript requests to JSON first, then parse with serde_json
        let requests_json = js_sys::JSON::stringify(&requests)
            .map_err(|_| JsValue::from_str("Failed to stringify requests"))?;

        let parsed_requests: Vec<Request> =
            serde_json::from_str(&requests_json.as_string().unwrap_or_default())
                .map_err(|e| JsValue::from_str(&format!("Failed to parse requests JSON: {}", e)))?;

        let message = MainToWorkerMessage::Subscribe {
            subscription_id: final_subscription_id.clone(),
            requests: parsed_requests,
        };

        Self::post_message_with_msgpack_transfer(&self.worker, &message)?;

        // Return unsubscribe function
        let manager_subscriptions = Arc::clone(&self.subscriptions);
        let manager_worker = self.worker.clone();
        let sub_id_for_closure = final_subscription_id.clone();

        let unsubscribe_closure = Closure::wrap(Box::new(move || {
            let subscriptions = Arc::clone(&manager_subscriptions);
            let worker = manager_worker.clone();
            let sub_id = sub_id_for_closure.clone();

            spawn_local(async move {
                let mut subscriptions_guard = subscriptions.write().unwrap();
                if subscriptions_guard.remove(&sub_id).is_some() {
                    let message = MainToWorkerMessage::Unsubscribe {
                        subscription_id: sub_id,
                    };

                    let _ = Self::post_message_with_msgpack_transfer(&worker, &message);
                }
            });
        }) as Box<dyn FnMut()>);

        let unsubscribe_fn = unsubscribe_closure
            .as_ref()
            .unchecked_ref::<js_sys::Function>()
            .clone();
        unsubscribe_closure.forget();

        Ok(unsubscribe_fn)
    }

    #[wasm_bindgen]
    pub fn unsubscribe(&self, subscription_id: String) -> Result<(), JsValue> {
        let mut subscriptions_guard = self.subscriptions.write().unwrap();
        if subscriptions_guard.remove(&subscription_id).is_none() {
            return Ok(()); // Already unsubscribed
        }
        drop(subscriptions_guard);

        let message = MainToWorkerMessage::Unsubscribe { subscription_id };

        Self::post_message_with_msgpack_transfer(&self.worker, &message)?;
        Ok(())
    }

    #[wasm_bindgen(js_name = "setSigner")]
    pub fn set_signer(&self, signer_type: String, pk: String) -> Result<(), JsValue> {
        let message = MainToWorkerMessage::SetSigner {
            signer_type,
            private_key: pk,
        };

        Self::post_message_with_msgpack_transfer(&self.worker, &message)?;
        Ok(())
    }

    #[wasm_bindgen(js_name = "signEvent")]
    pub fn sign_event(&self, event: &JsValue) -> Result<JsValue, JsValue> {
        let content = js_sys::Reflect::get(event, &JsValue::from_str("content"))?
            .as_string()
            .unwrap_or_default();

        let promise = js_sys::Promise::new(&mut |resolve, reject| {
            let signers_guard_fut = self.signers.clone();
            let worker = self.worker.clone();
            let event_clone = event.clone();
            let content_clone = content.clone();

            spawn_local(async move {
                let mut signers_guard = signers_guard_fut.write().unwrap();
                signers_guard.insert(content_clone.clone(), resolve);
                drop(signers_guard);

                // Encode as MessagePack
                let parsed_event: serde_json::Value =
                    match serde_wasm_bindgen::from_value(event_clone.clone()) {
                        Ok(event) => event,
                        Err(_) => {
                            let mut signers_guard = signers_guard_fut.write().unwrap();
                            signers_guard.remove(&content_clone);
                            let _ = reject
                                .call1(&JsValue::NULL, &JsValue::from_str("Failed to parse event"));
                            return;
                        }
                    };

                let message = MainToWorkerMessage::SignEvent {
                    event: parsed_event,
                };

                if Self::post_message_with_msgpack_transfer(&worker, &message).is_err() {
                    let mut signers_guard = signers_guard_fut.write().unwrap();
                    signers_guard.remove(&content_clone);
                    let _ = reject.call1(
                        &JsValue::NULL,
                        &JsValue::from_str("Failed to send sign event message"),
                    );
                }
            });
        });

        Ok(promise.into())
    }

    #[wasm_bindgen(js_name = "getPublicKey")]
    pub fn get_public_key(&self) -> Result<JsValue, JsValue> {
        let promise = js_sys::Promise::new(&mut |resolve, reject| {
            let signers_guard_fut = self.signers.clone();
            let worker = self.worker.clone();
            let callback_key = "getPublicKey".to_string();

            spawn_local(async move {
                let mut signers_guard = signers_guard_fut.write().unwrap();
                signers_guard.insert(callback_key.clone(), resolve);
                drop(signers_guard);

                let message = MainToWorkerMessage::GetPublicKey;

                if Self::post_message_with_msgpack_transfer(&worker, &message).is_err() {
                    let mut signers_guard = signers_guard_fut.write().unwrap();
                    signers_guard.remove(&callback_key);
                    let _ = reject.call1(
                        &JsValue::NULL,
                        &JsValue::from_str("Failed to send get public key message"),
                    );
                }
            });
        });

        Ok(promise.into())
    }

    #[wasm_bindgen]
    pub fn destroy(&self) {
        self.worker.terminate();
    }
}

// Export singleton instance
#[wasm_bindgen]
pub fn get_nostr_manager(worker: Worker) -> Result<NostrManager, JsValue> {
    NostrManager::new(worker)
}

#[wasm_bindgen(start)]
pub fn init_main() {
    console_error_panic_hook::set_once();
    console_log!("NostrManager Rust implementation initialized");
}
