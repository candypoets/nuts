use crate::network::subscriptions::interfaces::NetworkProcessor as NetworkProcessorTrait;
use crate::relays::RelayManager;
use crate::types::*;
use anyhow::Result;
use async_trait::async_trait;
use futures::future::join_all;
use instant::Duration;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, error, warn};

pub struct NetworkProcessor {
    relay_manager: Arc<dyn RelayManager>,
    connection_timeout: Duration,
    subscription_timeout: Duration,
}

impl NetworkProcessor {
    pub fn new(relay_manager: Arc<dyn RelayManager>) -> Self {
        Self {
            relay_manager,
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
        let mut relay_tasks = Vec::new();

        for relay_url in request.relays {
            let relay_manager = self.relay_manager.clone();
            let filter = filter.clone();
            let event_tx = event_tx.clone();
            let relay_url_clone = relay_url.clone();
            let close_on_eose = request.close_on_eose;

            let task = tokio::spawn(async move {
                Self::process_relay_subscription(
                    relay_manager,
                    relay_url_clone,
                    filter,
                    event_tx,
                    close_on_eose,
                )
                .await
            });

            relay_tasks.push(task);
        }

        // Wait for all relay tasks to complete
        let results = join_all(relay_tasks).await;

        for (i, result) in results.into_iter().enumerate() {
            match result {
                Ok(Ok(())) => {
                    debug!("Relay task {} completed successfully", i);
                }
                Ok(Err(e)) => {
                    warn!("Relay task {} failed: {}", i, e);
                }
                Err(e) => {
                    error!("Relay task {} panicked: {}", i, e);
                }
            }
        }

        Ok(())
    }

    async fn process_relay_subscription(
        relay_manager: Arc<dyn RelayManager>,
        relay_url: String,
        filter: nostr::Filter,
        event_tx: mpsc::Sender<NetworkEvent>,
        close_on_eose: bool,
    ) -> Result<()> {
        debug!("Starting subscription to relay: {}", relay_url);

        // Get relay connection
        let relay = match relay_manager.get_relay(&relay_url).await {
            Ok(relay) => relay,
            Err(e) => {
                error!("Failed to connect to relay {}: {}", relay_url, e);
                let error_event = NetworkEvent {
                    event_type: NetworkEventType::Error,
                    event: None,
                    error: Some(format!("Connection failed: {}", e)),
                    relay: relay_url.clone(),
                    eose: None,
                };
                let _ = event_tx.send(error_event).await;
                return Err(e);
            }
        };

        // Subscribe to relay - pass empty subscription options to avoid Send issues
        match relay.subscribe(vec![filter], Vec::new()).await {
            Ok(sub) => sub,
            Err(e) => {
                error!("Failed to subscribe to relay {}: {}", relay_url, e);
                let error_event = NetworkEvent {
                    event_type: NetworkEventType::Error,
                    event: None,
                    error: Some(format!("Subscription failed: {}", e)),
                    relay: relay_url.clone(),
                    eose: None,
                };
                let _ = event_tx.send(error_event).await;
                return Err(e);
            }
        };

        debug!("Finished subscription to relay: {}", relay_url);
        Ok(())
    }
}

#[async_trait(?Send)]
impl NetworkProcessorTrait for NetworkProcessor {
    async fn process_network_requests(
        &self,
        requests: Vec<Request>,
    ) -> mpsc::Receiver<NetworkEvent> {
        let (event_tx, event_rx) = mpsc::channel::<NetworkEvent>(1000);

        debug!("Processing {} network requests", requests.len());

        // Process each request in parallel
        for request in requests {
            let event_tx = event_tx.clone();
            let processor = self.clone();

            tokio::spawn(async move {
                if let Err(e) = processor.process_single_request(request, event_tx).await {
                    error!("Error processing network request: {}", e);
                }
            });
        }

        event_rx
    }
}

impl Clone for NetworkProcessor {
    fn clone(&self) -> Self {
        Self {
            relay_manager: self.relay_manager.clone(),
            connection_timeout: self.connection_timeout,
            subscription_timeout: self.subscription_timeout,
        }
    }
}
