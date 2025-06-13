use crate::{
    network::subscriptions::interfaces::NetworkProcessor as NetworkProcessorTrait,
    relays::ConnectionRegistry,
};

use crate::types::*;
use anyhow::Result;
use async_trait::async_trait;
use futures::future::join_all;
use instant::Duration;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, error, warn};

pub struct NetworkProcessor {
    connection_registry: Arc<ConnectionRegistry>,
    connection_timeout: Duration,
    subscription_timeout: Duration,
}

impl NetworkProcessor {
    pub fn new(connection_registry: Arc<ConnectionRegistry>) -> Self {
        Self {
            connection_registry,
            connection_timeout: Duration::from_secs(10),
            subscription_timeout: Duration::from_secs(30),
        }
    }

    async fn process_single_request(
        &self,
        request: Request,
        event_tx: mpsc::Sender<NetworkEvent>,
    ) -> Result<()> {
        debug!(
            "Processing network request for {} relays",
            request.relays.len()
        );

        let filter = request.to_filter()?;

        // self.connection_registry.subscribe()

        Ok(())
    }

    async fn process_relay_subscription(
        connection_registry: Arc<ConnectionRegistry>,
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
            connection_registry: self.connection_registry.clone(),
            connection_timeout: self.connection_timeout,
            subscription_timeout: self.subscription_timeout,
        }
    }
}
