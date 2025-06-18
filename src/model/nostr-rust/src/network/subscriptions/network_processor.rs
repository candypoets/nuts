use crate::network::subscriptions::SubscriptionContext;
use crate::relays::utils::{normalize_relay_url, validate_relay_url};
use crate::relays::SubscriptionHandle;
use crate::{
    network::subscriptions::interfaces::NetworkProcessor as NetworkProcessorTrait,
    relays::ConnectionRegistry,
};

use crate::types::*;
use anyhow::Result;
use async_trait::async_trait;
use futures::future::join_all;
use instant::Duration;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, error, warn};
use wasm_bindgen_futures::spawn_local;

pub struct NetworkProcessor {
    connection_registry: ConnectionRegistry,
    connection_timeout: Duration,
    subscription_timeout: Duration,
}

impl NetworkProcessor {
    pub fn new() -> Self {
        Self {
            connection_registry: ConnectionRegistry::new(),
            connection_timeout: Duration::from_secs(10),
            subscription_timeout: Duration::from_secs(30),
        }
    }

    pub async fn process_network_requests(
        &self,
        subscription_id: String,
        relay_filters: HashMap<String, Vec<Filter>>,
    ) -> Result<SubscriptionHandle> {
        debug!(
            "Processing network requests for subscription {}",
            subscription_id,
        );

        // Subscribe to all relays using ConnectionRegistry
        let subscription_handle = self
            .connection_registry
            .subscribe(subscription_id.clone(), relay_filters)
            .await?;

        Ok(subscription_handle)
    }
}

impl Clone for NetworkProcessor {
    fn clone(&self) -> Self {
        Self {
            connection_registry: self.connection_registry.clone(),
            connection_timeout: self.connection_timeout,
            subscription_timeout: self.subscription_timeout,
        }
    }
}
