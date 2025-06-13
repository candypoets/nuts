//! Connection Registry - Main Entry Point for Relay Operations
//!
//! This module provides the main interface for creating subscriptions and publishing events
//! to Nostr relays. It manages one WebSocket connection per relay URL and tracks multiple
//! subscriptions and publishes per connection.

use crate::relays::{
    connection::RelayConnection,
    types::{
        ClientMessage, ConnectionStatus, PublishStatus, RelayConfig, RelayError, RelayMessage,
        RelayResponse,
    },
    utils::{normalize_relay_url, validate_relay_url},
};
use futures::StreamExt;
use nostr::{Event, EventId, Filter};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use wasm_bindgen_futures::spawn_local;

/// Main connection registry for managing relay operations
pub struct ConnectionRegistry {
    /// Active relay connections (one per relay URL)
    connections: Arc<RwLock<HashMap<String, Arc<RelayConnection>>>>,
    /// Global configuration
    config: RelayConfig,
    /// Active subscriptions tracker (subscription_id -> relay_urls)
    active_subscriptions: Arc<RwLock<HashMap<String, Vec<String>>>>,
    /// Active publishes tracker (event_id -> relay_urls)
    active_publishes: Arc<RwLock<HashMap<EventId, Vec<String>>>>,
    /// Event receivers for subscriptions (subscription_id -> sender)
    subscription_senders: Arc<RwLock<HashMap<String, mpsc::UnboundedSender<Event>>>>,
    /// Publish result receivers (event_id -> sender)
    publish_result_senders: Arc<RwLock<HashMap<EventId, mpsc::UnboundedSender<PublishResult>>>>,
}

/// Result of a publish operation
#[derive(Debug, Clone)]
pub struct PublishResult {
    pub event_id: EventId,
    pub relay_url: String,
    pub status: PublishStatus,
    pub message: String,
    pub accepted: bool,
    pub timestamp: instant::Instant,
}

/// Handle for a subscription that allows event streaming and cancellation
pub struct SubscriptionHandle {
    subscription_id: String,
    relay_urls: Vec<String>,
    event_receiver: mpsc::UnboundedReceiver<Event>,
    registry: Arc<ConnectionRegistry>,
}

impl SubscriptionHandle {
    /// Get the subscription ID
    pub fn id(&self) -> &str {
        &self.subscription_id
    }

    /// Get relay URLs this subscription is active on
    pub fn relay_urls(&self) -> &[String] {
        &self.relay_urls
    }

    /// Get the next event from the subscription
    pub async fn next_event(&mut self) -> Option<Event> {
        self.event_receiver.recv().await
    }

    /// Cancel the subscription
    pub async fn cancel(self) {
        let _ = self
            .registry
            .close_subscription(&self.subscription_id)
            .await;
    }
}

impl futures::Stream for SubscriptionHandle {
    type Item = Event;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        self.event_receiver.poll_recv(cx)
    }
}

/// Handle for a publish operation that allows tracking results
pub struct PublishHandle {
    event_id: EventId,
    relay_urls: Vec<String>,
    result_receiver: mpsc::UnboundedReceiver<PublishResult>,
    registry: Arc<ConnectionRegistry>,
}

impl PublishHandle {
    /// Get the event ID
    pub fn event_id(&self) -> &EventId {
        &self.event_id
    }

    /// Get relay URLs this publish is targeting
    pub fn relay_urls(&self) -> &[String] {
        &self.relay_urls
    }

    /// Get the next publish result
    pub async fn next_result(&mut self) -> Option<PublishResult> {
        self.result_receiver.recv().await
    }

    /// Wait for all publish results
    pub async fn wait_for_all_results(&mut self) -> Vec<PublishResult> {
        let mut results = Vec::new();
        let expected_count = self.relay_urls.len();

        while results.len() < expected_count {
            if let Some(result) = self.next_result().await {
                results.push(result);
            } else {
                break;
            }
        }

        results
    }

    /// Cancel the publish operation
    pub async fn cancel(self) {
        let _ = self.registry.cancel_publish(&self.event_id).await;
    }
}

impl ConnectionRegistry {
    /// Create a new connection registry
    pub fn new() -> Self {
        Self::with_config(RelayConfig::default())
    }

    /// Create a new connection registry with custom configuration
    pub fn with_config(config: RelayConfig) -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
            config,
            active_subscriptions: Arc::new(RwLock::new(HashMap::new())),
            active_publishes: Arc::new(RwLock::new(HashMap::new())),
            subscription_senders: Arc::new(RwLock::new(HashMap::new())),
            publish_result_senders: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a subscription to one or more relays
    pub async fn subscribe(
        &self,
        subscription_id: String,
        filters: Vec<Filter>,
        relay_urls: Vec<String>,
    ) -> Result<SubscriptionHandle, RelayError> {
        if relay_urls.is_empty() {
            return Err(RelayError::InvalidUrl("No relay URLs provided".to_string()));
        }

        // Check if subscription already exists
        {
            let active_subs = self.active_subscriptions.read().await;
            if active_subs.contains_key(&subscription_id) {
                return Err(RelayError::ProtocolError(format!(
                    "Subscription {} already exists",
                    subscription_id
                )));
            }
        }

        // Validate and normalize URLs
        let mut normalized_urls = Vec::new();
        for url in relay_urls {
            validate_relay_url(&url)?;
            normalized_urls.push(normalize_relay_url(&url));
        }

        // Create event channel for this subscription
        let (event_sender, event_receiver) = mpsc::unbounded_channel();

        // Store subscription tracking
        {
            let mut active_subs = self.active_subscriptions.write().await;
            active_subs.insert(subscription_id.clone(), normalized_urls.clone());
        }
        {
            let mut senders = self.subscription_senders.write().await;
            senders.insert(subscription_id.clone(), event_sender);
        }

        // Ensure connections to all relays and send REQ messages
        for url in &normalized_urls {
            let connection = self.ensure_connection(url).await?;

            // Add subscription to connection tracking
            connection
                .add_subscription(subscription_id.clone(), filters.len())
                .await;

            // Start message processing for this connection if not already started
            self.ensure_message_processing(url.clone(), connection.clone())
                .await;

            // Send REQ message
            let req_message = ClientMessage::req(subscription_id.clone(), filters.clone());
            if let Err(e) = connection.send_message(req_message).await {
                tracing::error!(relay = %url, error = %e, "Failed to send REQ message");
                connection.remove_subscription(&subscription_id).await;
                continue;
            }
        }

        Ok(SubscriptionHandle {
            subscription_id,
            relay_urls: normalized_urls,
            event_receiver,
            registry: Arc::new(self.clone()),
        })
    }

    /// Publish an event to one or more relays
    pub async fn publish(
        &self,
        event: Event,
        relay_urls: Vec<String>,
    ) -> Result<PublishHandle, RelayError> {
        if relay_urls.is_empty() {
            return Err(RelayError::InvalidUrl("No relay URLs provided".to_string()));
        }

        let event_id = event.id;

        // Validate and normalize URLs
        let mut normalized_urls = Vec::new();
        for url in relay_urls {
            validate_relay_url(&url)?;
            normalized_urls.push(normalize_relay_url(&url));
        }

        // Create result channel for this publish
        let (result_sender, result_receiver) = mpsc::unbounded_channel();

        // Store publish tracking
        {
            let mut active_pubs = self.active_publishes.write().await;
            active_pubs.insert(event_id, normalized_urls.clone());
        }
        {
            let mut senders = self.publish_result_senders.write().await;
            senders.insert(event_id, result_sender);
        }

        // Ensure connections to all relays and send EVENT messages
        for url in &normalized_urls {
            let connection = self.ensure_connection(url).await?;

            // Add publish to connection tracking
            connection
                .add_publish(event_id.to_hex(), "".to_string())
                .await;

            // Start message processing for this connection if not already started
            self.ensure_message_processing(url.clone(), connection.clone())
                .await;

            // Send EVENT message
            let event_message = ClientMessage::event(event.clone());
            if let Err(e) = connection.send_message(event_message).await {
                tracing::error!(relay = %url, error = %e, "Failed to send EVENT message");
                connection.remove_publish(&event_id.to_hex()).await;

                // Send failure result
                let _ = self
                    .send_publish_result(PublishResult {
                        event_id,
                        relay_url: url.clone(),
                        status: PublishStatus::Failed,
                        message: e.to_string(),
                        accepted: false,
                        timestamp: instant::Instant::now(),
                    })
                    .await;
                continue;
            }
        }

        Ok(PublishHandle {
            event_id,
            relay_urls: normalized_urls,
            result_receiver,
            registry: Arc::new(self.clone()),
        })
    }

    /// Close a subscription
    pub async fn close_subscription(&self, subscription_id: &str) -> Result<(), RelayError> {
        // Get relay URLs for this subscription
        let relay_urls = {
            let mut active_subs = self.active_subscriptions.write().await;
            active_subs.remove(subscription_id)
        };

        if let Some(urls) = relay_urls {
            // Send CLOSE messages to all relays
            let close_message = ClientMessage::close(subscription_id.to_string());
            for url in &urls {
                if let Some(connection) = self.get_connection(url).await {
                    if let Err(e) = connection.send_message(close_message.clone()).await {
                        tracing::error!(relay = %url, error = %e, "Failed to send CLOSE message");
                    }
                    connection.remove_subscription(subscription_id).await;
                }
            }

            // Remove sender
            let mut senders = self.subscription_senders.write().await;
            senders.remove(subscription_id);
        }

        Ok(())
    }

    /// Cancel a publish operation
    pub async fn cancel_publish(&self, event_id: &EventId) -> Result<(), RelayError> {
        // Get relay URLs for this publish
        let relay_urls = {
            let mut active_pubs = self.active_publishes.write().await;
            active_pubs.remove(event_id)
        };

        if let Some(urls) = relay_urls {
            // Remove publish tracking from connections
            for url in &urls {
                if let Some(connection) = self.get_connection(url).await {
                    connection.remove_publish(&event_id.to_hex()).await;
                }
            }

            // Remove sender
            let mut senders = self.publish_result_senders.write().await;
            senders.remove(event_id);
        }

        Ok(())
    }

    /// Get or create a connection to a relay
    async fn ensure_connection(&self, url: &str) -> Result<Arc<RelayConnection>, RelayError> {
        // Check if connection already exists and is ready
        if let Some(connection) = self.get_connection(url).await {
            if connection.is_ready().await {
                return Ok(connection);
            }
            // If not ready, try to reconnect
            if let Err(e) = connection.reconnect().await {
                tracing::warn!(relay = %url, error = %e, "Failed to reconnect, creating new connection");
            } else {
                return Ok(connection);
            }
        }

        // Create new connection
        let connection = Arc::new(RelayConnection::new(url.to_string(), self.config.clone()));

        // Store connection
        {
            let mut connections = self.connections.write().await;
            connections.insert(url.to_string(), connection.clone());
        }

        // Connect
        connection.connect().await?;

        Ok(connection)
    }

    /// Get an existing connection
    async fn get_connection(&self, url: &str) -> Option<Arc<RelayConnection>> {
        let connections = self.connections.read().await;
        connections.get(url).cloned()
    }

    /// Ensure message processing is started for a connection
    async fn ensure_message_processing(&self, url: String, connection: Arc<RelayConnection>) {
        // Try to get the message receiver (can only be taken once)
        if let Some(mut receiver) = connection.take_message_receiver().await {
            let registry = Arc::new(self.clone());
            let url_clone = url.clone();

            spawn_local(async move {
                tracing::debug!(relay = %url_clone, "Starting message processing");

                while let Some(response) = receiver.recv().await {
                    if let Err(e) = registry.process_relay_message(response).await {
                        tracing::error!(relay = %url_clone, error = %e, "Failed to process relay message");
                    }
                }

                tracing::debug!(relay = %url_clone, "Message processing ended");
            });
        }
    }

    /// Process incoming relay message
    async fn process_relay_message(&self, response: RelayResponse) -> Result<(), RelayError> {
        match &response.message {
            RelayMessage::Event {
                subscription_id,
                event,
                ..
            } => {
                // Send event to subscription
                if let Err(e) = self
                    .send_event_to_subscription(subscription_id, event.clone())
                    .await
                {
                    tracing::warn!(
                        subscription_id = %subscription_id,
                        error = %e,
                        "Failed to send event to subscription"
                    );
                }
            }
            RelayMessage::Ok {
                event_id,
                accepted,
                message,
                ..
            } => {
                // Send publish result
                let event_id_obj = EventId::from_hex(event_id)
                    .map_err(|e| RelayError::ProtocolError(format!("Invalid event ID: {}", e)))?;

                let result = PublishResult {
                    event_id: event_id_obj,
                    relay_url: response.relay_url.clone(),
                    status: if *accepted {
                        PublishStatus::Accepted
                    } else {
                        PublishStatus::Rejected
                    },
                    message: message.clone(),
                    accepted: *accepted,
                    timestamp: response.timestamp,
                };

                if let Err(e) = self.send_publish_result(result).await {
                    tracing::warn!(
                        event_id = %event_id,
                        error = %e,
                        "Failed to send publish result"
                    );
                }

                // Remove publish tracking from connection
                if let Some(connection) = self.get_connection(&response.relay_url).await {
                    connection.remove_publish(event_id).await;
                }
            }
            RelayMessage::Eose {
                subscription_id, ..
            } => {
                tracing::debug!(
                    subscription_id = %subscription_id,
                    relay = %response.relay_url,
                    "Received EOSE"
                );
                // EOSE handling can be added here if needed
            }
            RelayMessage::Closed {
                subscription_id,
                message,
                ..
            } => {
                tracing::info!(
                    subscription_id = %subscription_id,
                    relay = %response.relay_url,
                    message = %message,
                    "Subscription closed by relay"
                );

                // Remove subscription tracking from connection
                if let Some(connection) = self.get_connection(&response.relay_url).await {
                    connection.remove_subscription(subscription_id).await;
                }
            }
            RelayMessage::Notice { message, .. } => {
                tracing::info!(
                    relay = %response.relay_url,
                    message = %message,
                    "Received notice from relay"
                );
            }
        }

        Ok(())
    }

    /// Send event to subscription
    async fn send_event_to_subscription(
        &self,
        subscription_id: &str,
        event: Event,
    ) -> Result<(), RelayError> {
        let senders = self.subscription_senders.read().await;
        if let Some(sender) = senders.get(subscription_id) {
            sender
                .send(event)
                .map_err(|_| RelayError::ConnectionClosed)?;
        }
        Ok(())
    }

    /// Send publish result
    async fn send_publish_result(&self, result: PublishResult) -> Result<(), RelayError> {
        let senders = self.publish_result_senders.read().await;
        if let Some(sender) = senders.get(&result.event_id) {
            sender
                .send(result)
                .map_err(|_| RelayError::ConnectionClosed)?;
        }
        Ok(())
    }

    /// Get connection status for a relay
    pub async fn connection_status(&self, url: &str) -> Option<ConnectionStatus> {
        let normalized_url = normalize_relay_url(url);
        if let Some(connection) = self.get_connection(&normalized_url).await {
            Some(connection.status().await)
        } else {
            None
        }
    }

    /// Get statistics for all connections
    pub async fn connection_stats(&self) -> HashMap<String, crate::relays::types::ConnectionStats> {
        let connections = self.connections.read().await;
        let mut stats = HashMap::new();

        for (url, connection) in connections.iter() {
            stats.insert(url.clone(), connection.stats().await);
        }

        stats
    }

    /// Get all active subscription IDs
    pub async fn active_subscription_ids(&self) -> Vec<String> {
        let active_subs = self.active_subscriptions.read().await;
        active_subs.keys().cloned().collect()
    }

    /// Get all active publish event IDs
    pub async fn active_publish_ids(&self) -> Vec<EventId> {
        let active_pubs = self.active_publishes.read().await;
        active_pubs.keys().cloned().collect()
    }

    /// Disconnect from a specific relay
    pub async fn disconnect(&self, url: &str) -> Result<(), RelayError> {
        let normalized_url = normalize_relay_url(url);

        // Remove connection from registry
        let connection = {
            let mut connections = self.connections.write().await;
            connections.remove(&normalized_url)
        };

        // Close connection if it exists
        if let Some(connection) = connection {
            connection.close().await?;
        }

        Ok(())
    }

    /// Disconnect from all relays
    pub async fn disconnect_all(&self) -> Result<(), RelayError> {
        // Get all connections
        let connections = {
            let mut connections_guard = self.connections.write().await;
            let connections: Vec<_> = connections_guard.drain().collect();
            connections
        };

        // Close all connections
        for (_, connection) in connections {
            if let Err(e) = connection.close().await {
                tracing::error!(error = %e, "Failed to close connection");
            }
        }

        // Clear all tracking
        {
            let mut active_subs = self.active_subscriptions.write().await;
            active_subs.clear();
        }
        {
            let mut active_pubs = self.active_publishes.write().await;
            active_pubs.clear();
        }
        {
            let mut senders = self.subscription_senders.write().await;
            senders.clear();
        }
        {
            let mut senders = self.publish_result_senders.write().await;
            senders.clear();
        }

        Ok(())
    }

    /// Clean up idle connections
    pub async fn cleanup(&self) -> Result<(), RelayError> {
        let mut idle_connections = Vec::new();

        {
            let connections = self.connections.read().await;
            for (url, connection) in connections.iter() {
                if connection.should_close_due_to_inactivity().await {
                    idle_connections.push(url.clone());
                }
            }
        }

        for url in idle_connections {
            tracing::debug!(relay = %url, "Closing idle connection");
            if let Err(e) = self.disconnect(&url).await {
                tracing::error!(relay = %url, error = %e, "Failed to disconnect idle connection");
            }
        }

        Ok(())
    }

    /// Get configuration
    pub fn config(&self) -> &RelayConfig {
        &self.config
    }
}

// Implement Clone for ConnectionRegistry (needed for Arc<ConnectionRegistry>)
impl Clone for ConnectionRegistry {
    fn clone(&self) -> Self {
        Self {
            connections: self.connections.clone(),
            config: self.config.clone(),
            active_subscriptions: self.active_subscriptions.clone(),
            active_publishes: self.active_publishes.clone(),
            subscription_senders: self.subscription_senders.clone(),
            publish_result_senders: self.publish_result_senders.clone(),
        }
    }
}

impl Default for ConnectionRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use nostr::{Filter, Kind};

    #[wasm_bindgen_test::wasm_bindgen_test]
    async fn test_connection_registry_creation() {
        let registry = ConnectionRegistry::new();

        assert_eq!(registry.active_subscription_ids().await.len(), 0);
        assert_eq!(registry.active_publish_ids().await.len(), 0);
        assert_eq!(registry.connection_stats().await.len(), 0);
    }

    #[wasm_bindgen_test::wasm_bindgen_test]
    async fn test_url_validation() {
        let registry = ConnectionRegistry::new();

        // Test invalid URLs
        let result = registry
            .subscribe(
                "test".to_string(),
                vec![Filter::new()],
                vec!["invalid-url".to_string()],
            )
            .await;
        assert!(result.is_err());

        let result = registry
            .subscribe(
                "test".to_string(),
                vec![Filter::new()],
                vec![], // Empty URLs
            )
            .await;
        assert!(result.is_err());
    }

    #[wasm_bindgen_test::wasm_bindgen_test]
    async fn test_duplicate_subscription() {
        let registry = ConnectionRegistry::new();

        // This will fail due to no actual relay, but should get to the duplicate check
        let _ = registry
            .subscribe(
                "test-sub".to_string(),
                vec![Filter::new()],
                vec!["wss://relay.example.com".to_string()],
            )
            .await;

        // Add to active subscriptions manually for testing
        {
            let mut active_subs = registry.active_subscriptions.write().await;
            active_subs.insert(
                "test-sub".to_string(),
                vec!["wss://relay.example.com".to_string()],
            );
        }

        // Second subscription with same ID should fail
        let result = registry
            .subscribe(
                "test-sub".to_string(),
                vec![Filter::new()],
                vec!["wss://relay.example.com".to_string()],
            )
            .await;
        assert!(result.is_err());
    }

    #[wasm_bindgen_test::wasm_bindgen_test]
    async fn test_cleanup() {
        let registry = ConnectionRegistry::new();

        // Cleanup should not fail even with no connections
        let result = registry.cleanup().await;
        assert!(result.is_ok());
    }

    #[wasm_bindgen_test::wasm_bindgen_test]
    async fn test_disconnect_all() {
        let registry = ConnectionRegistry::new();

        // Disconnect all should not fail even with no connections
        let result = registry.disconnect_all().await;
        assert!(result.is_ok());
    }
}
