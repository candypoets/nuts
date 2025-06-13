use instant::Duration;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::interfaces::{
    ConnectionRegistry, RegistryStats, RelayConnectionInterface, RelayConnectionStatus,
};
use super::relay_connection::RelayConnection;

/// ConnectionsRegistry manages the registry of relay connections
pub struct ConnectionsRegistry {
    connections: Arc<RwLock<HashMap<String, Arc<RelayConnection>>>>,
}

impl ConnectionsRegistry {
    /// Creates a new connections registry
    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

#[async_trait::async_trait]
impl ConnectionRegistry for ConnectionsRegistry {
    /// Returns an existing connection or creates a new one
    async fn get_or_create(&self, url: &str) -> Option<Arc<dyn RelayConnectionInterface>> {
        if url.is_empty() {
            tracing::error!("GetOrCreate called with empty URL");
            return None;
        }

        let mut connections = self.connections.write().await;

        if let Some(conn) = connections.get(url) {
            return Some(conn.clone() as Arc<dyn RelayConnectionInterface>);
        }

        let conn = Arc::new(RelayConnection::new(url.to_string()));
        connections.insert(url.to_string(), conn.clone());

        tracing::debug!(relay = %url, "Created new connection entry");
        Some(conn as Arc<dyn RelayConnectionInterface>)
    }

    /// Returns an existing connection if it exists
    async fn get(&self, url: &str) -> Option<Arc<dyn RelayConnectionInterface>> {
        let connections = self.connections.read().await;
        connections
            .get(url)
            .map(|conn| conn.clone() as Arc<dyn RelayConnectionInterface>)
    }

    /// Returns a snapshot of all connections
    async fn get_all(&self) -> HashMap<String, Arc<dyn RelayConnectionInterface>> {
        let connections = self.connections.read().await;
        connections
            .iter()
            .map(|(url, conn)| {
                (
                    url.clone(),
                    conn.clone() as Arc<dyn RelayConnectionInterface>,
                )
            })
            .collect()
    }

    /// Returns a slice of all connections for iteration
    async fn get_all_connections(&self) -> Vec<Arc<dyn RelayConnectionInterface>> {
        let connections = self.connections.read().await;
        connections
            .values()
            .map(|conn| conn.clone() as Arc<dyn RelayConnectionInterface>)
            .collect()
    }

    /// Removes a connection from the registry
    async fn remove(&self, url: &str) -> bool {
        let mut connections = self.connections.write().await;
        if connections.remove(url).is_some() {
            tracing::debug!(relay = %url, "Removed connection from registry");
            true
        } else {
            false
        }
    }

    /// Removes multiple connections from the registry
    async fn remove_batch(&self, urls: Vec<String>) -> usize {
        if urls.is_empty() {
            return 0;
        }

        let mut connections = self.connections.write().await;
        let mut removed_count = 0;

        for url in urls {
            if connections.remove(&url).is_some() {
                removed_count += 1;
            }
        }

        if removed_count > 0 {
            tracing::debug!(removed_count = %removed_count, "Removed connections from registry");
        }

        removed_count
    }

    /// Returns the total number of connections
    async fn count(&self) -> usize {
        let connections = self.connections.read().await;
        connections.len()
    }

    /// Returns counts of connections by status
    async fn count_by_status(&self) -> HashMap<RelayConnectionStatus, usize> {
        let connections = self.connections.read().await;
        let mut counts = HashMap::new();

        for conn in connections.values() {
            let status = conn.get_status();
            *counts.entry(status).or_insert(0) += 1;
        }

        counts
    }

    /// Returns all currently connected relays
    async fn get_connected_relays(&self) -> Vec<Arc<dyn RelayConnectionInterface>> {
        let connections = self.connections.read().await;
        let mut connected = Vec::new();

        for conn in connections.values() {
            if conn.get_status() == RelayConnectionStatus::Connected && conn.get_relay().is_some() {
                connected.push(conn.clone() as Arc<dyn RelayConnectionInterface>);
            }
        }

        connected
    }

    /// Identifies connections that can be cleaned up
    async fn cleanup_eligible_connections(
        &self,
        idle_timeout: Duration,
    ) -> (Vec<String>, Vec<Arc<dyn RelayConnectionInterface>>) {
        let connections = self.connections.read().await;
        let mut urls_to_delete = Vec::new();
        let mut connections_to_close = Vec::new();

        for (url, conn) in connections.iter() {
            if conn.can_cleanup(idle_timeout) {
                urls_to_delete.push(url.clone());
                connections_to_close.push(conn.clone() as Arc<dyn RelayConnectionInterface>);
            }
        }

        (urls_to_delete, connections_to_close)
    }

    /// Returns connections that are stuck in connecting state
    async fn get_stuck_connections(
        &self,
        timeout: Duration,
    ) -> Vec<Arc<dyn RelayConnectionInterface>> {
        let connections = self.connections.read().await;
        let mut stuck = Vec::new();

        for conn in connections.values() {
            if conn.is_stuck(timeout) {
                stuck.push(conn.clone() as Arc<dyn RelayConnectionInterface>);
            }
        }

        stuck
    }

    /// Checks if a connection exists for the given URL
    async fn exists(&self, url: &str) -> bool {
        let connections = self.connections.read().await;
        connections.contains_key(url)
    }

    /// Returns statistics about the connections registry
    async fn get_stats(&self) -> RegistryStats {
        let counts = self.count_by_status().await;
        let total = self.count().await;

        RegistryStats {
            total_connections: total,
            connected_count: counts
                .get(&RelayConnectionStatus::Connected)
                .copied()
                .unwrap_or(0),
            connecting_count: counts
                .get(&RelayConnectionStatus::Connecting)
                .copied()
                .unwrap_or(0),
            disconnected_count: counts
                .get(&RelayConnectionStatus::Disconnected)
                .copied()
                .unwrap_or(0),
            failed_count: counts
                .get(&RelayConnectionStatus::Failed)
                .copied()
                .unwrap_or(0),
        }
    }
}

impl Default for ConnectionsRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::*;

    #[wasm_bindgen_test]
    async fn test_get_or_create() {
        let registry = ConnectionsRegistry::new();
        let url = "wss://relay.example.com";

        // First call should create a new connection
        let conn1 = registry.get_or_create(url).await;
        assert!(conn1.is_some());

        // Second call should return the same connection
        let conn2 = registry.get_or_create(url).await;
        assert!(conn2.is_some());

        // Verify it's the same connection by comparing URLs
        assert_eq!(conn1.unwrap().get_url(), conn2.unwrap().get_url());
    }

    #[wasm_bindgen_test]
    async fn test_get_nonexistent() {
        let registry = ConnectionsRegistry::new();
        let url = "wss://nonexistent.relay.com";

        let conn = registry.get(url).await;
        assert!(conn.is_none());
    }

    #[wasm_bindgen_test]
    async fn test_remove() {
        let registry = ConnectionsRegistry::new();
        let url = "wss://relay.example.com";

        // Create a connection
        let _conn = registry.get_or_create(url).await;
        assert!(registry.exists(url).await);

        // Remove it
        let removed = registry.remove(url).await;
        assert!(removed);
        assert!(!registry.exists(url).await);

        // Try to remove again
        let removed_again = registry.remove(url).await;
        assert!(!removed_again);
    }

    #[wasm_bindgen_test]
    async fn test_remove_batch() {
        let registry = ConnectionsRegistry::new();
        let urls = vec![
            "wss://relay1.example.com".to_string(),
            "wss://relay2.example.com".to_string(),
            "wss://relay3.example.com".to_string(),
        ];

        // Create connections
        for url in &urls {
            let _conn = registry.get_or_create(url).await;
        }

        assert_eq!(registry.count().await, 3);

        // Remove batch
        let removed_count = registry.remove_batch(urls.clone()).await;
        assert_eq!(removed_count, 3);
        assert_eq!(registry.count().await, 0);

        // Try to remove batch again
        let removed_again = registry.remove_batch(urls).await;
        assert_eq!(removed_again, 0);
    }

    #[wasm_bindgen_test]
    async fn test_count_and_stats() {
        let registry = ConnectionsRegistry::new();

        // Initially empty
        assert_eq!(registry.count().await, 0);

        // Add some connections
        let _conn1 = registry.get_or_create("wss://relay1.example.com").await;
        let _conn2 = registry.get_or_create("wss://relay2.example.com").await;

        assert_eq!(registry.count().await, 2);

        let stats = registry.get_stats().await;
        assert_eq!(stats.total_connections, 2);
        // New connections start as disconnected
        assert_eq!(stats.disconnected_count, 2);
    }

    #[wasm_bindgen_test]
    async fn test_empty_url() {
        let registry = ConnectionsRegistry::new();
        let conn = registry.get_or_create("").await;
        assert!(conn.is_none());
    }

    #[wasm_bindgen_test]
    async fn test_get_all_connections() {
        let registry = ConnectionsRegistry::new();
        let urls = vec![
            "wss://relay1.example.com",
            "wss://relay2.example.com",
            "wss://relay3.example.com",
        ];

        // Create connections
        for url in &urls {
            let _conn = registry.get_or_create(url).await;
        }

        let all_connections = registry.get_all_connections().await;
        assert_eq!(all_connections.len(), 3);

        let all_map = registry.get_all().await;
        assert_eq!(all_map.len(), 3);

        for url in &urls {
            assert!(all_map.contains_key(*url));
        }
    }
}
