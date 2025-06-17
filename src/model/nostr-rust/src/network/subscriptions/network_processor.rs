use crate::network::subscriptions::SubscriptionContext;
use crate::relays::utils::{normalize_relay_url, validate_relay_url};
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
    context: Arc<SubscriptionContext>,
    connection_timeout: Duration,
    subscription_timeout: Duration,
}

impl NetworkProcessor {
    pub fn new(context: Arc<SubscriptionContext>) -> Self {
        Self {
            context,
            connection_timeout: Duration::from_secs(10),
            subscription_timeout: Duration::from_secs(30),
        }
    }

    pub async fn process_network_requests(
        &self,
        subscription_id: String,
        requests: Vec<Request>,
        // event_tx: mpsc::Sender<NetworkEvent>,
    ) -> Result<()> {
        debug!(
            "Processing network requests for subscription {}: {} requests",
            subscription_id,
            requests.len()
        );
        let relay_filters = self.group_requests_by_relay(requests)?;
        // Subscribe to all relays using ConnectionRegistry
        let subscription_handle = self
            .context
            .connection_registry
            .subscribe(subscription_id, relay_filters)
            .await?;

        // Process events from the subscription handle
        spawn_local(async move {
            let mut handle = subscription_handle;
            while let Some(event) = handle.next_event().await {
                debug!("Received event from relay: {:?}", event);
            }
        });

        Ok(())
    }

    fn group_requests_by_relay(
        &self,
        requests: Vec<Request>,
    ) -> Result<HashMap<String, Vec<Filter>>, anyhow::Error> {
        let mut relay_filters_map: HashMap<String, Vec<Filter>> = HashMap::new();

        for mut request in requests {
            request = self.set_request_relay(request)?;
            // Convert the request to a filter
            let filter = request.to_filter()?;

            // Add the filter to each relay in the request
            for relay_url in request.relays {
                validate_relay_url(&relay_url)?;
                relay_filters_map
                    .entry(normalize_relay_url(&relay_url))
                    .or_insert_with(Vec::new)
                    .push(filter.clone());
            }
        }

        Ok(relay_filters_map)
    }

    fn set_request_relay(&self, mut request: Request) -> Result<Request> {
        let filter = request.to_filter()?;
        if request.relays.is_empty() {
            // Use Parser.get_relays to get appropriate relays based on the request kind and pubkey
            let pubkey = match filter.authors.as_ref() {
                Some(authors) => {
                    if !authors.is_empty() {
                        authors.iter().next().unwrap().to_string()
                    } else {
                        String::new()
                    }
                }
                None => String::new(),
            };

            let kind = match filter.kinds.as_ref() {
                Some(kinds) => {
                    if !kinds.is_empty() {
                        kinds.iter().next().unwrap().as_u64()
                    } else {
                        0
                    }
                }
                None => 0,
            };

            let relays = self.context.parser.get_relays(kind, &pubkey, None);

            if relays.is_empty() {
                warn!("No relays found for request. Using default relays.");
                // Add default relays if Parser didn't provide any
                let default_relays = vec![
                    "wss://relay.damus.io".to_string(),
                    "wss://nos.lol".to_string(),
                    "wss://relay.primal.net".to_string(),
                ];
                request.relays.extend(default_relays);
            } else {
                debug!("Found {} relays for request", relays.len());
                request.relays.extend(relays);
            }
        }

        Ok(request)
    }

    async fn process_relay_subscription(
        &self,
        relay_url: String,
        filter: nostr::Filter,
        event_tx: mpsc::Sender<NetworkEvent>,
        close_on_eose: bool,
    ) -> Result<()> {
        debug!("Starting subscription to relay: {}", relay_url);

        // // Get relay connection
        // let relay = match connection_registry.get_relay(&relay_url).await {
        //     Ok(relay) => relay,
        //     Err(e) => {
        //         error!("Failed to connect to relay {}: {}", relay_url, e);
        //         let error_event = NetworkEvent {
        //             event_type: NetworkEventType::Error,
        //             event: None,
        //             error: Some(format!("Connection failed: {}", e)),
        //             relay: relay_url.clone(),
        //             eose: None,
        //         };
        //         let _ = event_tx.send(error_event).await;
        //         return Err(e);
        //     }
        // };

        // // Subscribe to relay - pass empty subscription options to avoid Send issues
        // match relay.subscribe(vec![filter], Vec::new()).await {
        //     Ok(sub) => sub,
        //     Err(e) => {
        //         error!("Failed to subscribe to relay {}: {}", relay_url, e);
        //         let error_event = NetworkEvent {
        //             event_type: NetworkEventType::Error,
        //             event: None,
        //             error: Some(format!("Subscription failed: {}", e)),
        //             relay: relay_url.clone(),
        //             eose: None,
        //         };
        //         let _ = event_tx.send(error_event).await;
        //         return Err(e);
        //     }
        // };

        debug!("Finished subscription to relay: {}", relay_url);
        Ok(())
    }
}

impl Clone for NetworkProcessor {
    fn clone(&self) -> Self {
        Self {
            context: self.context.clone(),
            connection_timeout: self.connection_timeout,
            subscription_timeout: self.subscription_timeout,
        }
    }
}
