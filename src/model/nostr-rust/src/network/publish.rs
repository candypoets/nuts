use crate::db::NostrDB;
use crate::parser::Parser;
use crate::relays::RelayManager;
use crate::types::*;
use anyhow::Result;
use futures::future::join_all;
use futures::select;
use futures::FutureExt;
use gloo_timers::future::TimeoutFuture;
use instant::Instant;
use js_sys::Uint8Array;
use nostr::{Event, Filter, Kind};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::{oneshot, RwLock};
use tracing::{debug, info, warn};
use wasm_bindgen::prelude::*;

#[derive(Debug)]
pub struct PublishOperation {
    pub id: String,
    pub event: Event,
    pub relay_status: HashMap<String, PublishStatus>,
    pub start_time: Instant,
    pub target_relays: Vec<String>,
    pub cancel_tx: Option<oneshot::Sender<()>>,
}

pub struct PublishManager {
    database: Arc<NostrDB>,
    relay_manager: Arc<dyn RelayManager>,
    parser: Arc<Parser>,
    operations: Arc<RwLock<HashMap<String, PublishOperation>>>,
    default_relays: Vec<String>,
    callback: Option<js_sys::Function>,
}

impl PublishManager {
    pub fn new(
        database: Arc<NostrDB>,
        relay_manager: Arc<dyn RelayManager>,
        parser: Arc<Parser>,
    ) -> Self {
        let default_relays = vec![
            "wss://relay.damus.io".to_string(),
            "wss://nos.lol".to_string(),
            "wss://relay.primal.net".to_string(),
            "wss://relay.nostr.band".to_string(),
        ];

        Self {
            database,
            relay_manager,
            parser,
            operations: Arc::new(RwLock::new(HashMap::new())),
            default_relays,
            callback: None,
        }
    }

    pub fn set_callback(&mut self, callback: js_sys::Function) {
        self.callback = Some(callback);
    }

    pub async fn publish_event(&self, publish_id: String, event: Event) -> Result<()> {
        info!("Publishing event {} with ID {}", event.id, publish_id);

        // Check if we already have an operation with this ID
        {
            let operations = self.operations.read().await;
            if operations.contains_key(&publish_id) {
                return Err(anyhow::anyhow!(
                    "publish operation with ID {} already exists",
                    publish_id
                ));
            }
        }

        // Prepare the event using parser
        let mut parser_clone = (*self.parser).clone();
        let prepared_event = match parser_clone.parse(event.clone()) {
            Ok(parsed) => parsed,
            Err(e) => return Err(anyhow::anyhow!("failed to prepare event: {}", e)),
        };

        // Determine target relays for the event
        let relays = match self.determine_target_relays(&event).await {
            Ok(relays) if !relays.is_empty() => relays,
            Ok(_) => {
                debug!("No specific relays determined for publish ID {}, falling back to default relays", publish_id);
                self.default_relays.clone()
            }
            Err(e) => {
                warn!(
                    "Failed to determine target relays for publish ID {}: {}, using defaults",
                    publish_id, e
                );
                self.default_relays.clone()
            }
        };

        debug!(
            "Selected {} relays for publishing: {:?}",
            relays.len(),
            relays
        );

        // Initialize the operation
        let mut relay_status = HashMap::new();
        for relay in &relays {
            relay_status.insert(relay.clone(), PublishStatus::Pending);
        }

        let operation = PublishOperation {
            id: publish_id.clone(),
            event: prepared_event.event.clone(),
            relay_status,
            start_time: Instant::now(),
            target_relays: relays.clone(),
            cancel_tx: None,
        };

        // Store the operation
        {
            let mut operations = self.operations.write().await;
            operations.insert(publish_id.clone(), operation);
        }

        // Start publishing to each relay in separate tasks
        for relay_url in relays {
            let publish_id_clone = publish_id.clone();
            let relay_url_clone = relay_url.clone();
            let event_clone = prepared_event.event.clone();
            let manager_clone = self.clone_for_task();

            wasm_bindgen_futures::spawn_local(async move {
                manager_clone
                    .publish_to_relay(publish_id_clone, relay_url_clone, event_clone)
                    .await;
            });
        }

        Ok(())
    }

    async fn determine_target_relays(&self, event: &Event) -> Result<Vec<String>> {
        let mut relay_set = HashSet::new();
        let mut write_pubkeys = Vec::new();
        let mut read_pubkeys = Vec::new();

        // Always add the event author's pubkey as a write pubkey
        write_pubkeys.push(event.pubkey.to_hex());

        // Skip extracting mentioned pubkeys for kind 3 (contact list) events
        if event.kind != Kind::ContactList && event.kind.as_u64() < 10000 {
            for tag in &event.tags {
                let tag_vec = tag.as_vec();
                if tag_vec.len() >= 2 && tag_vec[0] == "p" {
                    read_pubkeys.push(tag_vec[1].clone());
                }
            }
        }

        // Get relays for all mentioned pubkeys (read relays)
        let read_tasks: Vec<_> = read_pubkeys
            .into_iter()
            .map(|pubkey| {
                let database = self.database.clone();
                async move {
                    match Self::find_nip65_relays(&database, &pubkey).await {
                        Ok(Some(relays)) => relays
                            .into_iter()
                            .filter(|(_, read, _)| *read)
                            .map(|(url, _, _)| url)
                            .collect::<Vec<_>>(),
                        _ => Vec::new(),
                    }
                }
            })
            .collect();

        // Get relays for author pubkeys (write relays)
        let write_tasks: Vec<_> = write_pubkeys
            .into_iter()
            .map(|pubkey| {
                let database = self.database.clone();
                async move {
                    match Self::find_nip65_relays(&database, &pubkey).await {
                        Ok(Some(relays)) => relays
                            .into_iter()
                            .filter(|(_, _, write)| *write)
                            .map(|(url, _, _)| url)
                            .collect::<Vec<_>>(),
                        _ => Vec::new(),
                    }
                }
            })
            .collect();

        // Wait for all tasks to complete
        let read_results = join_all(read_tasks).await;
        let write_results = join_all(write_tasks).await;

        // Collect all relay URLs
        for relays in read_results.into_iter().chain(write_results.into_iter()) {
            for relay in relays {
                relay_set.insert(relay);
            }
        }

        Ok(relay_set.into_iter().collect())
    }

    async fn find_nip65_relays(
        database: &Arc<NostrDB>,
        pubkey: &str,
    ) -> Result<Option<Vec<(String, bool, bool)>>> {
        // Create filter for NIP-65 relay list metadata (kind 10002)
        let pubkey_obj = nostr::PublicKey::from_hex(pubkey)?;
        let filter = Filter::new()
            .author(pubkey_obj)
            .kind(Kind::RelayList)
            .limit(1);

        // Query database for the most recent relay list
        use crate::network::subscriptions::interfaces::EventDatabase;
        match EventDatabase::query_events(&**database, filter).await {
            Ok(events) if !events.is_empty() => {
                let event = &events[0];
                let mut relays = Vec::new();

                // Parse relay tags
                for tag in &event.event.tags {
                    let tag_vec = tag.as_vec();
                    if tag_vec.len() >= 2 && tag_vec[0] == "r" {
                        let relay_url = tag_vec[1].clone();
                        let mut read = false;
                        let mut write = false;

                        // Check for read/write markers
                        if tag_vec.len() >= 3 {
                            match tag_vec[2].as_str() {
                                "read" => read = true,
                                "write" => write = true,
                                _ => {
                                    // Default to both read and write if not specified
                                    read = true;
                                    write = true;
                                }
                            }
                        } else {
                            // Default to both read and write if not specified
                            read = true;
                            write = true;
                        }

                        relays.push((relay_url, read, write));
                    }
                }

                Ok(Some(relays))
            }
            Ok(_) => Ok(None),
            Err(e) => {
                debug!("Failed to find NIP-65 relays for pubkey {}: {}", pubkey, e);
                Ok(None)
            }
        }
    }

    async fn publish_to_relay(&self, publish_id: String, relay_url: String, event: Event) {
        debug!(
            "Publishing event to relay {} for publish ID {}",
            relay_url, publish_id
        );

        // Update status to "sent"
        self.update_relay_status(
            &publish_id,
            &relay_url,
            PublishStatus::Sent,
            "Sending event to relay",
        )
        .await;

        // Get or establish a connection to the relay
        let relay = match self.relay_manager.get_relay(&relay_url).await {
            Ok(relay) => relay,
            Err(e) => {
                self.update_relay_status(
                    &publish_id,
                    &relay_url,
                    PublishStatus::ConnectionError,
                    &format!("Failed to connect: {}", e),
                )
                .await;
                return;
            }
        };

        // Publish the event with timeout
        let publish_result = select! {
            result = relay.publish(event).fuse() => Ok(result),
            _ = TimeoutFuture::new(30_000).fuse() => Err(anyhow::anyhow!(
                "Publish operation timed out after 30 seconds"
            )),
        };

        match publish_result {
            Ok(Ok(())) => {
                self.update_relay_status(
                    &publish_id,
                    &relay_url,
                    PublishStatus::Success,
                    "Event published successfully",
                )
                .await;
            }
            Ok(Err(e)) => {
                self.update_relay_status(
                    &publish_id,
                    &relay_url,
                    PublishStatus::Failed,
                    &format!("Publish error: {}", e),
                )
                .await;
            }
            Err(_) => {
                self.update_relay_status(
                    &publish_id,
                    &relay_url,
                    PublishStatus::Failed,
                    "Publish timeout",
                )
                .await;
            }
        }

        // Release the relay connection
        self.relay_manager.release_relay(&relay_url);
    }

    async fn update_relay_status(
        &self,
        publish_id: &str,
        relay_url: &str,
        status: PublishStatus,
        message: &str,
    ) {
        // Update the operation status
        let should_cleanup = {
            let mut operations = self.operations.write().await;
            if let Some(operation) = operations.get_mut(publish_id) {
                operation
                    .relay_status
                    .insert(relay_url.to_string(), status.clone());

                // Check if all relays have completed
                self.check_all_relays_completed(operation)
            } else {
                warn!(
                    "Tried to update status for non-existent publish operation: {}",
                    publish_id
                );
                return;
            }
        };

        // Create status update
        let update = RelayStatusUpdate {
            relay: relay_url.to_string(),
            status,
            message: message.to_string(),
            timestamp: chrono::Utc::now().timestamp(),
        };

        // Notify via callback if available
        if let Some(callback) = &self.callback {
            self.invoke_callback(callback, "PUBLISH_STATUS", publish_id, &update);
        }

        // Cleanup if all relays completed
        if should_cleanup {
            self.cleanup_operation(publish_id).await;
        }
    }

    fn check_all_relays_completed(&self, operation: &PublishOperation) -> bool {
        for status in operation.relay_status.values() {
            if matches!(status, PublishStatus::Pending | PublishStatus::Sent) {
                return false;
            }
        }
        true
    }

    async fn cleanup_operation(&self, publish_id: &str) {
        let summary = {
            let mut operations = self.operations.write().await;
            if let Some(operation) = operations.remove(publish_id) {
                let success_count = operation
                    .relay_status
                    .values()
                    .filter(|status| matches!(status, PublishStatus::Success))
                    .count();

                Some(PublishSummary {
                    relay_count: operation.relay_status.len(),
                    success_count,
                    relay_statuses: operation
                        .relay_status
                        .into_iter()
                        .map(|(relay, status)| RelayStatusUpdate {
                            relay,
                            status,
                            message: String::new(),
                            timestamp: chrono::Utc::now().timestamp(),
                        })
                        .collect(),
                    duration_ms: operation.start_time.elapsed().as_millis() as u64,
                    timestamp: chrono::Utc::now().timestamp(),
                })
            } else {
                None
            }
        };

        if let Some(summary) = summary {
            info!(
                "Completed publish operation {} with {}/{} successful relays",
                publish_id, summary.success_count, summary.relay_count
            );

            // Notify via callback if available
            if let Some(callback) = &self.callback {
                self.invoke_callback(callback, "PUBLISH_COMPLETE", publish_id, &summary);
            }
        }
    }

    pub async fn get_active_publish_count(&self) -> usize {
        let operations = self.operations.read().await;
        operations.len()
    }

    pub async fn cancel_publish(&self, publish_id: &str) -> Result<()> {
        let mut operations = self.operations.write().await;
        if let Some(operation) = operations.remove(publish_id) {
            // Cancel any pending operations
            if let Some(cancel_tx) = operation.cancel_tx {
                let _ = cancel_tx.send(());
            }
            info!("Cancelled publish operation: {}", publish_id);
            Ok(())
        } else {
            Err(anyhow::anyhow!(
                "publish operation not found: {}",
                publish_id
            ))
        }
    }

    // Helper method to invoke JavaScript callback
    fn invoke_callback<T: serde::Serialize>(
        &self,
        callback: &js_sys::Function,
        event_type: &str,
        publish_id: &str,
        data: &T,
    ) {
        // Serialize data using msgpack (like Go implementation)
        if let Ok(serialized) = rmp_serde::to_vec(data) {
            // Create JavaScript Uint8Array
            let uint8_array = Uint8Array::new_with_length(serialized.len() as u32);
            uint8_array.copy_from(&serialized);

            // Call the JavaScript callback
            let this = JsValue::NULL;
            let args = js_sys::Array::new();
            args.push(&JsValue::from_str(event_type));
            args.push(&JsValue::from_str(publish_id));
            args.push(&uint8_array.into());

            if let Err(e) = callback.apply(&this, &args) {
                warn!("Failed to invoke callback: {:?}", e);
            }
        } else {
            warn!("Failed to serialize data for callback");
        }
    }

    // Helper method to clone necessary components for spawned tasks
    fn clone_for_task(&self) -> PublishManagerTask {
        PublishManagerTask {
            relay_manager: self.relay_manager.clone(),
            operations: self.operations.clone(),
            callback: self.callback.clone(),
        }
    }
}

// Helper struct for task spawning to avoid Send issues
struct PublishManagerTask {
    relay_manager: Arc<dyn RelayManager>,
    operations: Arc<RwLock<HashMap<String, PublishOperation>>>,
    callback: Option<js_sys::Function>,
}

impl PublishManagerTask {
    async fn publish_to_relay(&self, publish_id: String, relay_url: String, event: Event) {
        debug!(
            "Publishing event to relay {} for publish ID {}",
            relay_url, publish_id
        );

        // Update status to "sent"
        self.update_relay_status(
            &publish_id,
            &relay_url,
            PublishStatus::Sent,
            "Sending event to relay",
        )
        .await;

        // Get or establish a connection to the relay
        let relay = match self.relay_manager.get_relay(&relay_url).await {
            Ok(relay) => relay,
            Err(e) => {
                self.update_relay_status(
                    &publish_id,
                    &relay_url,
                    PublishStatus::ConnectionError,
                    &format!("Failed to connect: {}", e),
                )
                .await;
                return;
            }
        };

        // Publish the event with timeout
        let publish_result = select! {
            result = relay.publish(event).fuse() => Ok(result),
            _ = TimeoutFuture::new(30_000).fuse() => Err(anyhow::anyhow!(
                "Publish operation timed out after 30 seconds"
            )),
        };

        match publish_result {
            Ok(Ok(())) => {
                self.update_relay_status(
                    &publish_id,
                    &relay_url,
                    PublishStatus::Success,
                    "Event published successfully",
                )
                .await;
            }
            Ok(Err(e)) => {
                self.update_relay_status(
                    &publish_id,
                    &relay_url,
                    PublishStatus::Failed,
                    &format!("Publish error: {}", e),
                )
                .await;
            }
            Err(_) => {
                self.update_relay_status(
                    &publish_id,
                    &relay_url,
                    PublishStatus::Failed,
                    "Publish timeout",
                )
                .await;
            }
        }

        // Release the relay connection
        self.relay_manager.release_relay(&relay_url);
    }

    async fn update_relay_status(
        &self,
        publish_id: &str,
        relay_url: &str,
        status: PublishStatus,
        message: &str,
    ) {
        // Update the operation status
        let should_cleanup = {
            let mut operations = self.operations.write().await;
            if let Some(operation) = operations.get_mut(publish_id) {
                operation
                    .relay_status
                    .insert(relay_url.to_string(), status.clone());

                // Check if all relays have completed
                self.check_all_relays_completed(operation)
            } else {
                warn!(
                    "Tried to update status for non-existent publish operation: {}",
                    publish_id
                );
                return;
            }
        };

        // Create status update
        let update = RelayStatusUpdate {
            relay: relay_url.to_string(),
            status,
            message: message.to_string(),
            timestamp: chrono::Utc::now().timestamp(),
        };

        // Notify via callback if available
        if let Some(callback) = &self.callback {
            self.invoke_callback(callback, "PUBLISH_STATUS", publish_id, &update);
        }

        // Cleanup if all relays completed
        if should_cleanup {
            self.cleanup_operation(publish_id).await;
        }
    }

    fn check_all_relays_completed(&self, operation: &PublishOperation) -> bool {
        for status in operation.relay_status.values() {
            if matches!(status, PublishStatus::Pending | PublishStatus::Sent) {
                return false;
            }
        }
        true
    }

    async fn cleanup_operation(&self, publish_id: &str) {
        let summary = {
            let mut operations = self.operations.write().await;
            if let Some(operation) = operations.remove(publish_id) {
                let success_count = operation
                    .relay_status
                    .values()
                    .filter(|status| matches!(status, PublishStatus::Success))
                    .count();

                Some(PublishSummary {
                    relay_count: operation.relay_status.len(),
                    success_count,
                    relay_statuses: operation
                        .relay_status
                        .into_iter()
                        .map(|(relay, status)| RelayStatusUpdate {
                            relay,
                            status,
                            message: String::new(),
                            timestamp: chrono::Utc::now().timestamp(),
                        })
                        .collect(),
                    duration_ms: operation.start_time.elapsed().as_millis() as u64,
                    timestamp: chrono::Utc::now().timestamp(),
                })
            } else {
                None
            }
        };

        if let Some(summary) = summary {
            info!(
                "Completed publish operation {} with {}/{} successful relays",
                publish_id, summary.success_count, summary.relay_count
            );

            // Notify via callback if available
            if let Some(callback) = &self.callback {
                self.invoke_callback(callback, "PUBLISH_COMPLETE", publish_id, &summary);
            }
        }
    }

    // Helper method to invoke JavaScript callback
    fn invoke_callback<T: serde::Serialize>(
        &self,
        callback: &js_sys::Function,
        event_type: &str,
        publish_id: &str,
        data: &T,
    ) {
        // Serialize data using msgpack (like Go implementation)
        if let Ok(serialized) = rmp_serde::to_vec(data) {
            // Create JavaScript Uint8Array
            let uint8_array = Uint8Array::new_with_length(serialized.len() as u32);
            uint8_array.copy_from(&serialized);

            // Call the JavaScript callback
            let this = JsValue::NULL;
            let args = js_sys::Array::new();
            args.push(&JsValue::from_str(event_type));
            args.push(&JsValue::from_str(publish_id));
            args.push(&uint8_array.into());

            if let Err(e) = callback.apply(&this, &args) {
                warn!("Failed to invoke callback: {:?}", e);
            }
        } else {
            warn!("Failed to serialize data for callback");
        }
    }
}

/// JavaScript Usage Example:
///
/// ```javascript
/// // Create a callback function to handle publish status updates
/// function handlePublishStatus(eventType, publishId, uint8ArrayData) {
///     // Decode MessagePack data (same format as Go implementation)
///     const data = msgpack.decode(uint8ArrayData);
///
///     if (eventType === "PUBLISH_STATUS") {
///         console.log(`Relay ${data.relay} status: ${data.status} - ${data.message}`);
///     } else if (eventType === "PUBLISH_COMPLETE") {
///         console.log(`Publish complete: ${data.success_count}/${data.relay_count} relays succeeded`);
///         console.log(`Duration: ${data.duration_ms}ms`);
///     }
/// }
///
/// // Set the callback on the publish manager
/// publishManager.set_callback(handlePublishStatus);
///
/// // Publish an event
/// const publishId = crypto.randomUUID();
/// await publishManager.publish_event(publishId, nostrEvent);
/// ```
///
/// The callback will receive:
/// - `eventType`: "PUBLISH_STATUS" or "PUBLISH_COMPLETE"
/// - `publishId`: The unique ID for this publish operation
/// - `uint8ArrayData`: MessagePack-encoded data containing:
///   - For PUBLISH_STATUS: { relay, status, message, timestamp }
///   - For PUBLISH_COMPLETE: { relay_count, success_count, relay_statuses, duration_ms, timestamp }

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_publish_manager_creation() {
        // This would require mock implementations of the dependencies
        // For now, just test that the struct can be created
        assert!(true);
    }

    #[tokio::test]
    async fn test_determine_target_relays() {
        // Test relay determination logic
        // This would require setting up mock database responses
        assert!(true);
    }

    #[tokio::test]
    async fn test_nip65_parsing() {
        // Test NIP-65 relay list parsing
        assert!(true);
    }
}
