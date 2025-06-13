use anyhow::Result;

// Use tokio_with_wasm for WASM compatibility
use tokio_with_wasm::alias as tokiowasm;
use tracing::info;

use super::relay::Relay;
use futures::StreamExt;
use gloo_timers::future::IntervalStream;
use instant::{Duration, Instant};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

use super::connections_registry::ConnectionsRegistry;
use super::interfaces::{
    normalize_url, ConnectionRegistry, RelayError, RelayManager, RelayManagerStats,
};

/// RelayConnectionManager manages connections to Nostr relays with Safari-optimized coordination
pub struct RelayConnectionManager {
    registry: Arc<ConnectionsRegistry>,
    connect_timeout: Duration,
    max_retries: usize,

    // Cleanup management
    cleanup_interval: Duration,
    cleanup_task: Arc<Mutex<Option<tokiowasm::task::JoinHandle<()>>>>,
    closed: Arc<RwLock<bool>>,

    // Statistics
    stats: Arc<RwLock<InternalStats>>,
}

#[derive(Debug, Default)]
struct InternalStats {
    total_requests: u64,
    successful_conns: u64,
    failed_conns: u64,
    start_time: Option<Instant>,
    last_cleanup: Option<Instant>,
}

impl RelayConnectionManager {
    /// Creates a new relay connection manager with Safari optimizations
    pub fn new(connect_timeout: Duration, max_retries: usize) -> Self {
        info!("Creating new RelayManager");
        let manager = Self {
            registry: Arc::new(ConnectionsRegistry::new()),
            connect_timeout,
            max_retries,
            cleanup_interval: Duration::from_secs(10),
            cleanup_task: Arc::new(Mutex::new(None)),
            closed: Arc::new(RwLock::new(false)),
            stats: Arc::new(RwLock::new(InternalStats {
                start_time: Some(Instant::now()),
                ..Default::default()
            })),
        };

        // Start cleanup routine
        // let cleanup_handle = manager.start_cleanup_routine();pet
        // let cleanup_task_clone = manager.cleanup_task.clone();
        // tokiowasm::spawn(async move {
        //     let mut cleanup_task = cleanup_task_clone.lock().await;
        //     *cleanup_task = Some(cleanup_handle);
        // });

        manager
    }

    /// Start the cleanup routine
    fn start_cleanup_routine(&self) -> tokiowasm::task::JoinHandle<()> {
        let registry = self.registry.clone();
        let connect_timeout = self.connect_timeout;
        let cleanup_interval = self.cleanup_interval;
        let closed = self.closed.clone();
        let stats = self.stats.clone();

        tokiowasm::spawn(async move {
            tracing::debug!("Starting relay cleanup routine");

            let mut interval_stream = IntervalStream::new(cleanup_interval.as_millis() as u32);

            tracing::debug!("Starting relay cleanup routine");

            while let Some(_) = interval_stream.next().await {
                // Check if manager is closed
                {
                    let is_closed = closed.read().await;
                    if *is_closed {
                        tracing::debug!("Cleanup routine stopped - manager closed");
                        return;
                    }
                }

                Self::perform_cleanup(&registry, connect_timeout, &stats).await;
            }
        })
    }

    /// Performs the actual cleanup of idle and stuck connections
    async fn perform_cleanup(
        registry: &ConnectionsRegistry,
        connect_timeout: Duration,
        stats: &Arc<RwLock<InternalStats>>,
    ) {
        tracing::debug!("Running connection cleanup");

        // Clean up idle connections
        let (urls_to_delete, connections_to_close) = registry
            .cleanup_eligible_connections(connect_timeout * 2)
            .await;

        // Close connections outside any locks to prevent deadlocks
        for conn in connections_to_close {
            conn.close().await;
        }

        // Remove from registry
        let urls_deleted_count = urls_to_delete.len();
        if !urls_to_delete.is_empty() {
            let removed_count = registry.remove_batch(urls_to_delete).await;
            tracing::debug!(removed_count = %removed_count, "Cleaned up idle connections");
        }

        // Handle stuck connections
        let stuck_connections = registry.get_stuck_connections(connect_timeout * 3).await;
        let stuck_count = stuck_connections.len();
        for conn in stuck_connections {
            conn.mark_as_stuck();
            tracing::warn!(relay = %conn.get_url(), "Marked stuck connection as failed");
        }

        // Update stats
        {
            let mut stats_guard = stats.write().await;
            stats_guard.last_cleanup = Some(Instant::now());
        }

        if urls_deleted_count > 0 || stuck_count > 0 {
            let registry_stats = registry.get_stats().await;
            tracing::debug!(
                total = %registry_stats.total_connections,
                connected = %registry_stats.connected_count,
                connecting = %registry_stats.connecting_count,
                failed = %registry_stats.failed_count,
                "Cleanup completed"
            );
        }
    }
}

#[async_trait::async_trait]
impl RelayManager for RelayConnectionManager {
    /// Returns an existing connection or initiates a new one (blocking)
    async fn get_relay(&self, url: &str) -> Result<Arc<Relay>> {
        self.get_relay_async(url, self.connect_timeout).await
    }

    /// Returns an existing connection or initiates a new one (with timeout)
    async fn get_relay_async(&self, url: &str, timeout: Duration) -> Result<Arc<Relay>> {
        // Check if manager is closed
        {
            let is_closed = self.closed.read().await;
            if *is_closed {
                return Err(RelayError::ManagerClosed.into());
            }
        }

        let normalized_url = normalize_url(url.to_string());
        tracing::debug!(relay = %normalized_url, "GetRelayAsync called");

        // Update stats
        {
            let mut stats = self.stats.write().await;
            stats.total_requests += 1;
        }

        // Get or create connection from registry
        let conn = match self.registry.get_or_create(&normalized_url).await {
            Some(conn) => conn,
            None => {
                tracing::error!(relay = %normalized_url, "Registry returned nil connection");
                let mut stats = self.stats.write().await;
                stats.failed_conns += 1;
                return Err(RelayError::NilRelay.into());
            }
        };

        // Try to connect using channel-based coordination
        match conn.try_connect(timeout).await {
            Ok(relay) => {
                tracing::debug!(relay = %normalized_url, "Successfully got relay connection");
                let mut stats = self.stats.write().await;
                stats.successful_conns += 1;
                Ok(relay)
            }
            Err(err) => {
                tracing::error!(relay = %normalized_url, error = %err, "Failed to connect to relay");
                let mut stats = self.stats.write().await;
                stats.failed_conns += 1;
                Err(err)
            }
        }
    }

    /// Decrements the subscriber count for a relay
    fn release_relay(&self, url: &str) {
        let normalized_url = normalize_url(url.to_string());

        tokiowasm::spawn({
            let registry = self.registry.clone();
            async move {
                if let Some(conn) = registry.get(&normalized_url).await {
                    conn.release();
                    tracing::debug!(
                        relay = %normalized_url,
                        subscribers = %conn.get_subscribers(),
                        "Released relay"
                    );
                }
            }
        });
    }

    /// Marks a relay as disconnected due to external events
    fn mark_relay_as_closed(&self, url: &str, reason: Option<anyhow::Error>) {
        let normalized_url = normalize_url(url.to_string());
        tracing::debug!(relay = %normalized_url, error = ?reason, "MarkRelayAsClosed called");

        tokiowasm::spawn({
            let registry = self.registry.clone();
            async move {
                if let Some(conn) = registry.get(&normalized_url).await {
                    let reason_msg = reason.as_ref().map(|e| e.to_string());
                    conn.mark_as_closed(reason_msg.map(|msg| anyhow::anyhow!(msg)));
                    tracing::info!(relay = %normalized_url, error = ?reason, "Marked relay as closed");
                } else {
                    tracing::warn!(relay = %normalized_url, "Attempted to mark non-existent relay as closed");
                }
            }
        });
    }

    /// Randomly selects a relay from the connected relays
    async fn pick_random_relay(&self) -> Option<Arc<Relay>> {
        let connected_relays = self.registry.get_connected_relays().await;

        if connected_relays.is_empty() {
            return None;
        }

        // Use current time as simple random seed
        let random_index =
            (Instant::now().elapsed().as_nanos() % connected_relays.len() as u128) as usize;
        let selected_conn = &connected_relays[random_index];

        match selected_conn.get_relay() {
            Some(relay) => Some(relay),
            None => {
                tracing::warn!(relay = %selected_conn.get_url(), "Connected relay returned nil");
                // Try to mark it as closed since it's not actually connected
                selected_conn.mark_as_closed(Some(RelayError::NilRelay.into()));
                None
            }
        }
    }

    /// Returns the number of active connections
    async fn get_connection_count(&self) -> usize {
        self.registry.get_connected_relays().await.len()
    }

    /// Returns comprehensive statistics about the relay manager
    async fn get_stats(&self) -> RelayManagerStats {
        let registry_stats = self.registry.get_stats().await;
        let internal_stats = self.stats.read().await;
        let active_connections = self.registry.get_connected_relays().await.len();

        let uptime = internal_stats
            .start_time
            .map(|start| start.elapsed())
            .unwrap_or(Duration::ZERO);

        RelayManagerStats {
            registry: registry_stats,
            active_connections,
            last_cleanup: internal_stats.last_cleanup,
            total_requests: internal_stats.total_requests,
            successful_conns: internal_stats.successful_conns,
            failed_conns: internal_stats.failed_conns,
            uptime,
        }
    }

    /// Gracefully shuts down the relay manager
    async fn close(&self) {
        let mut is_closed = self.closed.write().await;
        if *is_closed {
            return;
        }

        tracing::info!("Closing relay connection manager");
        *is_closed = true;
        drop(is_closed); // Release the lock

        // Stop cleanup routine
        {
            let mut cleanup_task = self.cleanup_task.lock().await;
            if let Some(handle) = cleanup_task.take() {
                handle.abort();
            }
        }

        // Close all connections
        let connections = self.registry.get_all_connections().await;
        let close_tasks: Vec<_> = connections
            .into_iter()
            .map(|conn| {
                tokiowasm::spawn(async move {
                    conn.close().await;
                })
            })
            .collect();

        // Wait for all connections to close
        for task in close_tasks {
            let _ = task.await;
        }

        tracing::info!("Relay connection manager closed");
    }
}

impl Default for RelayConnectionManager {
    fn default() -> Self {
        Self::new(Duration::from_secs(10), 3)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use instant::Duration;
    use wasm_bindgen_test::*;

    #[wasm_bindgen_test]
    async fn test_new_relay_manager() {
        let manager = RelayConnectionManager::new(Duration::from_secs(5), 3);

        assert_eq!(manager.get_connection_count().await, 0);

        let stats = manager.get_stats().await;
        assert_eq!(stats.active_connections, 0);
        assert_eq!(stats.total_requests, 0);
        assert_eq!(stats.successful_conns, 0);
        assert_eq!(stats.failed_conns, 0);
    }

    #[wasm_bindgen_test]
    async fn test_relay_manager_close() {
        let manager = RelayConnectionManager::new(Duration::from_secs(5), 3);

        // Close the manager
        manager.close().await;

        // Verify it's closed by trying to get a relay
        let result = manager.get_relay("wss://relay.example.com").await;
        assert!(result.is_err());

        // Should be a ManagerClosed error
        if let Err(err) = result {
            assert!(
                err.to_string().contains("manager is closed")
                    || err.to_string().contains("ManagerClosed")
            );
        }
    }

    #[wasm_bindgen_test]
    async fn test_normalize_url_in_manager() {
        let _manager = RelayConnectionManager::new(Duration::from_secs(5), 3);

        // Test that URLs are properly normalized
        let url1 = "relay.example.com";
        let url2 = "wss://relay.example.com";
        let url3 = "wss://relay.example.com/";

        // All should normalize to the same URL
        let normalized1 = normalize_url(url1.to_string());
        let normalized2 = normalize_url(url2.to_string());
        let normalized3 = normalize_url(url3.to_string());

        assert_eq!(normalized1, "wss://relay.example.com");
        assert_eq!(normalized2, "wss://relay.example.com");
        assert_eq!(normalized3, "wss://relay.example.com");
    }

    #[wasm_bindgen_test]
    async fn test_release_relay() {
        let manager = RelayConnectionManager::new(Duration::from_secs(5), 3);
        let url = "wss://relay.example.com";

        // Release a relay that doesn't exist (should not panic)
        manager.release_relay(url);

        // Give some time for the async operation
        // sleep(Duration::from_millis(10)).await;

        // Should still have 0 connections
        assert_eq!(manager.get_connection_count().await, 0);
    }

    #[wasm_bindgen_test]
    async fn test_mark_relay_as_closed() {
        let manager = RelayConnectionManager::new(Duration::from_secs(5), 3);
        let url = "wss://relay.example.com";
        let error = anyhow::anyhow!("Test error");

        // Mark a relay as closed that doesn't exist (should not panic)
        manager.mark_relay_as_closed(url, Some(error));

        // Give some time for the async operation
        // sleep(Duration::from_millis(10)).await;

        // Should still have 0 connections
        assert_eq!(manager.get_connection_count().await, 0);
    }

    #[wasm_bindgen_test]
    async fn test_pick_random_relay_empty() {
        let manager = RelayConnectionManager::new(Duration::from_secs(5), 3);

        // Should return None when no relays are connected
        let relay = manager.pick_random_relay().await;
        assert!(relay.is_none());
    }

    #[wasm_bindgen_test]
    async fn test_stats_updates() {
        let manager = RelayConnectionManager::new(Duration::from_secs(5), 3);

        // Initial stats
        let initial_stats = manager.get_stats().await;
        assert_eq!(initial_stats.total_requests, 0);

        // Try to get a relay (this will fail but should update stats)
        let _result = manager.get_relay("wss://nonexistent.relay.com").await;

        // Stats should be updated
        let updated_stats = manager.get_stats().await;
        assert_eq!(updated_stats.total_requests, 1);
        assert_eq!(updated_stats.failed_conns, 1);
    }

    #[wasm_bindgen_test]
    async fn test_cleanup_routine_starts() {
        let manager = RelayConnectionManager::new(Duration::from_secs(5), 3);

        // Give some time for the cleanup routine to start
        // sleep(Duration::from_millis(50)).await;

        // Check that cleanup task is running
        {
            let cleanup_task = manager.cleanup_task.lock().await;
            assert!(cleanup_task.is_some());
        }

        // Close manager
        manager.close().await;
    }
}
