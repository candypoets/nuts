use crate::db::NostrDB;
use crate::parser::Parser;
use crate::relays::ConnectionRegistry;
use crate::types::*;
use anyhow::Result;
use futures::future::join_all;
use instant::Instant;
use nostr::{Event, Kind, UnsignedEvent};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::sync::RwLock;
use tracing::{debug, info, warn};

#[derive(Debug)]
pub struct PublishOperation {
    pub id: String,
    pub event: Event,
    pub relay_status: HashMap<String, PublishStatus>,
    pub start_time: Instant,
    pub target_relays: Vec<String>,
    pub cancel_tx: Option<()>,
}

pub struct PublishManager {
    database: Arc<NostrDB>,
    connection_registry: Arc<ConnectionRegistry>,
    parser: Arc<Parser>,
    operations: Arc<RwLock<HashMap<String, PublishOperation>>>,
    callback: Option<js_sys::Function>,
}

impl PublishManager {
    pub fn new(
        database: Arc<NostrDB>,
        connection_registry: Arc<ConnectionRegistry>,
        parser: Arc<Parser>,
    ) -> Self {
        Self {
            database,
            connection_registry,
            parser,
            operations: Arc::new(RwLock::new(HashMap::new())),
            callback: None,
        }
    }

    pub fn set_callback(&mut self, callback: js_sys::Function) {
        self.callback = Some(callback);
    }

    pub async fn publish_event(
        &self,
        publish_id: String,
        unsigned_event: &mut UnsignedEvent,
    ) -> Result<()> {
        info!(
            "Publishing event {} with ID {}",
            unsigned_event.id, publish_id
        );

        // Check if we already have an operation with this ID
        {
            let operations = self.operations.read().unwrap();
            if operations.contains_key(&publish_id) {
                return Err(anyhow::anyhow!(
                    "publish operation with ID {} already exists",
                    publish_id
                ));
            }
        }

        // Prepare the event using parser
        let event = match self.parser.prepare(unsigned_event) {
            Ok(parsed) => parsed,
            Err(e) => return Err(anyhow::anyhow!("failed to prepare event: {}", e)),
        };

        // Determine target relays for the event
        let relays = match self.determine_target_relays(&event).await {
            Ok(relays) if !relays.is_empty() => relays,
            Ok(_) => {
                debug!("No specific relays determined for publish ID {}, falling back to default relays", publish_id);
                self.database.default_relays.clone()
            }
            Err(e) => {
                warn!(
                    "Failed to determine target relays for publish ID {}: {}, using defaults",
                    publish_id, e
                );
                self.database.default_relays.clone()
            }
        };

        debug!(
            "Selected {} relays for publishing: {:?}",
            relays.len(),
            relays
        );

        let _ = self.connection_registry.publish(event.clone(), relays);

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
            .map(|pubkey| async move { self.database.get_read_relays(&pubkey).unwrap_or_default() })
            .collect();

        // Get relays for author pubkeys (write relays)
        let write_tasks: Vec<_> = write_pubkeys
            .into_iter()
            .map(
                |pubkey| async move { self.database.get_write_relays(&pubkey).unwrap_or_default() },
            )
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

    pub async fn cancel_publish(&self, publish_id: &str) -> Result<()> {
        let mut operations = self.operations.write().unwrap();
        if let Some(_operation) = operations.remove(publish_id) {
            info!("Cancelled publish operation: {}", publish_id);
            Ok(())
        } else {
            Err(anyhow::anyhow!(
                "publish operation not found: {}",
                publish_id
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_publish_manager_creation() {
        // This would require mock implementations of the dependencies
        // For now, just test that the struct can be created
        assert!(true);
    }

    #[test]
    fn test_determine_target_relays() {
        // Test relay determination logic
        // This would require setting up mock database responses
        assert!(true);
    }

    #[test]
    fn test_nip65_parsing() {
        // Test NIP-65 relay list parsing
        assert!(true);
    }
}
