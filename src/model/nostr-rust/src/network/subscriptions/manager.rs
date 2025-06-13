use super::interfaces::{
    SubscriptionOptimizer as SubscriptionOptimizerTrait,
    SubscriptionRegistry as SubscriptionRegistryTrait,
};
use super::*;
use crate::config::SubscriptionConfig;
use crate::db::NostrDB;
use crate::parser::Parser;
use crate::relays::RelayManager;
use crate::types::*;
use crate::utils::spawner::TaskSpawner;
use anyhow::Result;
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
        relay_manager: Arc<dyn RelayManager>,
        parser: Arc<Parser>,
    ) -> Self {
        let context =
            SubscriptionContext::new(database.clone(), relay_manager.clone(), parser.clone());
        let spawner = TaskSpawner::new();
        let registry = Arc::new(SubscriptionRegistry::new());
        let cache_processor = Arc::new(CacheProcessor::new(database.clone(), parser.clone()));
        let network_processor = Arc::new(NetworkProcessor::new(relay_manager.clone()));
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
        let optimized_requests = if requests.iter().any(|r| r.no_optimize) {
            requests
        } else {
            SubscriptionOptimizerTrait::optimize_subscriptions(&*self.optimizer, requests)
        };

        // Clone necessary data for the task
        let sub_id = subscription_id.clone();
        let cache_processor = self.cache_processor.clone();
        let network_processor = self.network_processor.clone();
        let registry = self.registry.clone();
        let config = self.context.config.clone();

        // Spawn subscription processing task
        let subscription_future = async move {
            Self::process_subscription(
                sub_id,
                optimized_requests,
                cache_processor,
                network_processor,
                registry,
                config,
            )
            .await;
        };

        self.spawner
            .spawn_task(subscription_id.clone(), subscription_future)
            .map_err(|e| anyhow::anyhow!("Failed to spawn subscription task: {}", e))?;

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

    async fn process_subscription(
        subscription_id: String,
        _requests: Vec<Request>,
        _cache_processor: Arc<CacheProcessor>,
        _network_processor: Arc<NetworkProcessor>,
        _registry: Arc<SubscriptionRegistry>,
        _config: SubscriptionConfig,
    ) {
        debug!("Processing subscription: {}", subscription_id);

        // Get subscription from registry
        let _subscription =
            match SubscriptionRegistryTrait::get(&*_registry, &subscription_id).await {
                Some(sub) => sub,
                None => {
                    error!("Subscription {} not found in registry", subscription_id);
                    return;
                }
            };

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
        let data = match serde_json::to_string(&serde_json::json!({
            "type": "EVENT",
            "subscriptionId": subscription_id,
            "event": event
        })) {
            Ok(json) => json,
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

    async fn send_cached_events(
        subscription_id: &str,
        events: &[ParsedEvent],
        is_first_batch: bool,
    ) {
        let event_type = if is_first_batch {
            "CACHED_EVENT"
        } else {
            "FETCHED_EVENT"
        };

        let data = match serde_json::to_string(&serde_json::json!({
            "type": event_type,
            "subscriptionId": subscription_id,
            "events": events
        })) {
            Ok(json) => json,
            Err(e) => {
                error!(
                    "Failed to serialize cached events for subscription {}: {}",
                    subscription_id, e
                );
                return;
            }
        };

        Self::post_message(event_type, subscription_id, &data).await;
    }

    async fn send_eose(subscription_id: &str) {
        let data = match serde_json::to_string(&serde_json::json!({
            "type": "EOSE",
            "subscriptionId": subscription_id
        })) {
            Ok(json) => json,
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

    async fn post_message(_event_type: &str, _subscription_id: &str, data: &str) {
        let js_data = match js_sys::JSON::parse(data) {
            Ok(value) => value,
            Err(e) => {
                error!("Failed to parse JSON for message: {:?}", e);
                return;
            }
        };

        // Post message to JavaScript context
        web_sys::js_sys::global()
            .dyn_ref::<web_sys::DedicatedWorkerGlobalScope>()
            .unwrap()
            .post_message(&js_data)
            .unwrap_or_else(|e| {
                error!("Failed to post message: {:?}", e);
            });
    }
}
