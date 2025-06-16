use super::interfaces::{
    SubscriptionOptimizer as SubscriptionOptimizerTrait,
    SubscriptionRegistry as SubscriptionRegistryTrait,
};
use super::*;
use crate::config::SubscriptionConfig;
use crate::db::NostrDB;
use crate::network::subscriptions::interfaces::CacheProcessor as CacheProcessorTrait;
use crate::network::subscriptions::CacheProcessor;
use crate::parser::Parser;
use crate::types::*;
use crate::utils::spawner::TaskSpawner;
use anyhow::Result;
use js_sys::{SharedArrayBuffer, Uint8Array};
use rmp_serde;
use std::sync::Arc;
use tokio::sync::oneshot;
use tracing::{debug, error, info};
use wasm_bindgen::prelude::*;

pub struct SubscriptionManager {
    context: SubscriptionContext,
    spawner: TaskSpawner,
    registry: Arc<SubscriptionRegistry>,
    cache_processor: Arc<CacheProcessor>,
    network_processor: Arc<NetworkProcessor>,
    optimizer: Arc<SubscriptionOptimizer>,
}

impl SubscriptionManager {
    pub fn new(
        database: Arc<NostrDB>,
        connection_registry: Arc<ConnectionRegistry>,
        parser: Arc<Parser>,
    ) -> Self {
        let context = SubscriptionContext::new(
            database.clone(),
            connection_registry.clone(),
            parser.clone(),
        );
        let spawner = TaskSpawner::new();
        let registry = Arc::new(SubscriptionRegistry::new());
        let cache_processor = Arc::new(CacheProcessor::new(database.clone(), parser.clone()));
        let network_processor = Arc::new(NetworkProcessor::new(connection_registry.clone()));
        let optimizer = Arc::new(SubscriptionOptimizer::new());

        Self {
            context,
            spawner,
            registry,
            cache_processor,
            network_processor,
            optimizer,
        }
    }

    pub async fn open_subscription(
        &self,
        subscription_id: String,
        requests: Vec<Request>,
    ) -> Result<()> {
        debug!("Opening subscription: {}", subscription_id);

        // Create subscription
        let _subscription =
            SubscriptionRegistryTrait::create(&*self.registry, subscription_id.clone()).await;

        // Optimize requests
        // let optimized_requests = if requests.iter().any(|r| r.no_optimize) {
        //     requests
        // } else {
        //     SubscriptionOptimizerTrait::optimize_subscriptions(&*self.optimizer, requests)
        // };

        // Clone necessary data for the task
        let sub_id = subscription_id.clone();
        // let cache_processor = self.cache_processor.clone();
        // let network_processor = self.network_processor.clone();
        // let registry = self.registry.clone();
        // let config = self.context.config.clone();

        // Spawn subscription processing task
        self.process_subscription(sub_id, requests).await;

        info!("Subscription {} opened successfully", subscription_id);
        Ok(())
    }

    pub async fn close_subscription(&self, subscription_id: String) {
        debug!("Closing subscription: {}", subscription_id);

        // Cancel the task via the task spawner
        if let Err(e) = self.spawner.cancel_task(subscription_id.clone()) {
            error!("Failed to cancel subscription {}: {}", subscription_id, e);
        }

        // Remove from registry
        SubscriptionRegistryTrait::remove(&*self.registry, &subscription_id).await;

        info!("Subscription {} closed", subscription_id);
    }

    pub async fn get_active_subscription_count(&self) -> u32 {
        SubscriptionRegistryTrait::count(&*self.registry).await as u32
    }

    async fn process_subscription(&self, subscription_id: String, _requests: Vec<Request>) {
        debug!("Processing subscription: {}", subscription_id);

        // Get subscription from registry
        let _subscription =
            match SubscriptionRegistryTrait::get(&*self.registry, &subscription_id).await {
                Some(sub) => sub,
                None => {
                    error!("Subscription {} not found in registry", subscription_id);
                    return;
                }
            };

        let events = match self
            .cache_processor
            .process_local_requests(_requests, 3)
            .await
        {
            Ok((_, events)) => events,
            Err(e) => {
                error!(
                    "Failed to process local requests for subscription {}: {}",
                    subscription_id, e
                );
                return;
            }
        };

        // Send the parsed events back to the main thread
        if !events.is_empty() {
            Self::send_cached_events(&subscription_id, &events).await;
        }

        // For now, just send EOSE to complete the subscription
        // TODO: Implement proper caching and network processing
        Self::send_eose(&subscription_id).await;
    }

    async fn process_network_requests(
        subscription_id: String,
        _requests: Vec<Request>,
        _network_processor: Arc<NetworkProcessor>,
        _cancel_rx: oneshot::Receiver<()>,
    ) {
        debug!(
            "Processing network requests for subscription: {}",
            subscription_id
        );

        // Simplified processing - just send EOSE
        Self::send_eose(&subscription_id).await;

        debug!("Finished processing subscription: {}", subscription_id);
    }

    async fn send_event(subscription_id: &str, event: &ParsedEvent) {
        let data = match rmp_serde::to_vec_named(&serde_json::json!({
            "type": "EVENT",
            "subscriptionId": subscription_id,
            "event": event
        })) {
            Ok(msgpack) => msgpack,
            Err(e) => {
                error!(
                    "Failed to serialize event for subscription {}: {}",
                    subscription_id, e
                );
                return;
            }
        };

        Self::post_message("EVENT", subscription_id, &data).await;
    }

    async fn send_cached_events(subscription_id: &str, events: &[Vec<ParsedEvent>]) {
        let event_type = "CACHED_EVENT";

        let shared_buffer = match rmp_serde::to_vec_named(&(event_type, subscription_id, events)) {
            Ok(msgpack) => {
                // Create SharedArrayBuffer for efficient zero-copy message passing
                let shared_buffer = SharedArrayBuffer::new(msgpack.len() as u32);

                // Create a Uint8Array view of the SharedArrayBuffer
                let shared_array = Uint8Array::new(&shared_buffer);

                // Copy data into the SharedArrayBuffer
                shared_array.copy_from(&msgpack);

                shared_buffer
            }
            Err(e) => {
                error!(
                    "Failed to serialize cached events for subscription {}: {}",
                    subscription_id, e
                );
                return;
            }
        };

        // Post the SharedArrayBuffer to JavaScript context
        web_sys::js_sys::global()
            .dyn_ref::<web_sys::DedicatedWorkerGlobalScope>()
            .unwrap()
            .post_message(&shared_buffer)
            .unwrap_or_else(|e| {
                error!("Failed to post cached events: {:?}", e);
            });
    }

    async fn send_eose(subscription_id: &str) {
        let data = match rmp_serde::to_vec_named(&serde_json::json!({
            "type": "EOSE",
            "subscriptionId": subscription_id
        })) {
            Ok(msgpack) => msgpack,
            Err(e) => {
                error!(
                    "Failed to serialize EOSE for subscription {}: {}",
                    subscription_id, e
                );
                return;
            }
        };

        Self::post_message("EOSE", subscription_id, &data).await;
    }

    async fn post_message(_event_type: &str, _subscription_id: &str, data: &[u8]) {
        // Create SharedArrayBuffer for efficient zero-copy message passing
        let shared_buffer = SharedArrayBuffer::new(data.len() as u32);

        // Create a Uint8Array view of the SharedArrayBuffer
        let shared_array = Uint8Array::new(&shared_buffer);

        // Copy data into the SharedArrayBuffer
        shared_array.copy_from(data);

        // Post the SharedArrayBuffer to JavaScript context
        web_sys::js_sys::global()
            .dyn_ref::<web_sys::DedicatedWorkerGlobalScope>()
            .unwrap()
            .post_message(&shared_buffer)
            .unwrap_or_else(|e| {
                error!("Failed to post message: {:?}", e);
            });
    }
}
