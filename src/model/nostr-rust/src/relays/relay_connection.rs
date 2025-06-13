use anyhow::Result;
use instant::{Duration, Instant};
use std::sync::Arc;
use tokio::sync::RwLock;

// Use tokio_with_wasm for WASM compatibility
use tokio_with_wasm::alias as tokiowasm;

use super::interfaces::{RelayConnectionInterface, RelayConnectionStatus};
use super::relay::Relay;

/// RelayConnection represents a connection to a relay with channel-based coordination
pub struct RelayConnection {
    inner_arc: Arc<RwLock<RelayConnectionInner>>,
}

struct RelayConnectionInner {
    relay: Option<Arc<Relay>>,
    url: String,
    status: RelayConnectionStatus,
    last_used: Instant,
    error_count: usize,
    subscribers: usize,
    last_error: Option<anyhow::Error>,
    closed: bool,
}

impl RelayConnection {
    /// Creates a new relay connection with channel-based coordination
    pub fn new(url: String) -> Self {
        let inner = RelayConnectionInner {
            relay: None,
            url,
            status: RelayConnectionStatus::Disconnected,
            last_used: Instant::now(),
            error_count: 0,
            subscribers: 0,
            last_error: None,
            closed: false,
        };

        Self {
            inner_arc: Arc::new(RwLock::new(inner)),
        }
    }
}

#[async_trait::async_trait]
impl RelayConnectionInterface for RelayConnection {
    /// Returns the current connection status (thread-safe)
    fn get_status(&self) -> RelayConnectionStatus {
        // Use try_read to avoid blocking in sync context
        if let Ok(inner) = self.inner_arc.try_read() {
            inner.status
        } else {
            RelayConnectionStatus::Disconnected
        }
    }

    /// Returns the relay connection (thread-safe)
    fn get_relay(&self) -> Option<Arc<Relay>> {
        if let Ok(inner) = self.inner_arc.try_read() {
            inner.relay.clone()
        } else {
            None
        }
    }

    /// Returns the relay URL
    fn get_url(&self) -> String {
        if let Ok(inner) = self.inner_arc.try_read() {
            inner.url.clone()
        } else {
            String::new()
        }
    }

    /// Returns the number of subscribers (thread-safe)
    fn get_subscribers(&self) -> usize {
        if let Ok(inner) = self.inner_arc.try_read() {
            inner.subscribers
        } else {
            0
        }
    }

    /// Returns the last used time (thread-safe)
    fn get_last_used(&self) -> Instant {
        if let Ok(inner) = self.inner_arc.try_read() {
            inner.last_used
        } else {
            Instant::now()
        }
    }

    /// Returns the last error (thread-safe)
    fn get_error(&self) -> Option<anyhow::Error> {
        if let Ok(inner) = self.inner_arc.try_read() {
            inner.last_error.as_ref().map(|e| anyhow::anyhow!("{}", e))
        } else {
            None
        }
    }

    /// Returns the error count (thread-safe)
    fn get_error_count(&self) -> usize {
        if let Ok(inner) = self.inner_arc.try_read() {
            inner.error_count
        } else {
            0
        }
    }

    /// Attempts to acquire a connection or waits for an ongoing connection
    async fn try_connect(&self, _connect_timeout: Duration) -> Result<Arc<Relay>> {
        // Case 1: Check if already connected
        {
            let inner = self.inner_arc.read().await;
            if inner.status == RelayConnectionStatus::Connected {
                if let Some(ref relay) = inner.relay {
                    let relay_clone: Arc<Relay> = relay.clone();
                    drop(inner);

                    // Update state after releasing read lock
                    let mut inner_mut = self.inner_arc.write().await;
                    inner_mut.last_used = Instant::now();
                    inner_mut.subscribers += 1;
                    return Ok(relay_clone);
                }
            }
        }

        // Case 2: Handle connecting state - return error to avoid complex coordination
        {
            let inner = self.inner_arc.read().await;
            if inner.status == RelayConnectionStatus::Connecting {
                return Err(anyhow::anyhow!("Connection already in progress"));
            }
        }

        // Case 3: For WASM, we'll return an error since actual connection requires Send
        // In a real implementation, this would need to be handled differently
        // For now, we'll simulate a failed connection attempt
        {
            let mut inner = self.inner_arc.write().await;
            inner.status = RelayConnectionStatus::Failed;
            inner.error_count += 1;
            inner.last_error = Some(anyhow::anyhow!("WASM connection not implemented"));
            inner.last_used = Instant::now();
        }

        Err(anyhow::anyhow!(
            "Connection not supported in WASM environment"
        ))
    }

    /// Marks the connection as closed and updates state
    fn mark_as_closed(&self, reason: Option<anyhow::Error>) {
        if let Ok(mut inner) = self.inner_arc.try_write() {
            if inner.status == RelayConnectionStatus::Failed
                || inner.status == RelayConnectionStatus::Disconnected
            {
                if let Some(reason) = reason {
                    inner.last_error = Some(reason);
                }
                return;
            }

            // Close the relay if we have one
            if let Some(relay) = inner.relay.take() {
                // We can't call relay.close() here synchronously, so we'll spawn a task
                tokiowasm::spawn(async move {
                    // In a real implementation, you'd call relay.close() here
                    // For now, we just drop it
                    drop(relay);
                });
            }

            inner.status = RelayConnectionStatus::Disconnected;
            inner.error_count += 1;
            inner.last_error = reason.or_else(|| Some(anyhow::anyhow!("Relay closed externally")));
            inner.last_used = Instant::now();
        }
    }

    /// Decrements the subscriber count
    fn release(&self) {
        if let Ok(mut inner) = self.inner_arc.try_write() {
            if inner.status != RelayConnectionStatus::Connected {
                return;
            }

            if inner.subscribers > 0 {
                inner.subscribers -= 1;
            }
        }
    }

    /// Returns true if the connection can be cleaned up
    fn can_cleanup(&self, idle_timeout: Duration) -> bool {
        if let Ok(inner) = self.inner_arc.try_read() {
            inner.subscribers <= 0
                && (inner.status == RelayConnectionStatus::Connected
                    || inner.status == RelayConnectionStatus::Failed)
                && inner.last_used.elapsed() > idle_timeout
        } else {
            false
        }
    }

    /// Returns true if the connection is stuck in connecting state
    fn is_stuck(&self, timeout: Duration) -> bool {
        if let Ok(inner) = self.inner_arc.try_read() {
            inner.status == RelayConnectionStatus::Connecting && inner.last_used.elapsed() > timeout
        } else {
            false
        }
    }

    /// Marks a stuck connection as failed
    fn mark_as_stuck(&self) {
        if let Ok(mut inner) = self.inner_arc.try_write() {
            if inner.status == RelayConnectionStatus::Connecting
                && inner.last_used.elapsed() > Duration::from_secs(120)
            {
                inner.status = RelayConnectionStatus::Failed;
                inner.last_error = Some(anyhow::anyhow!("Connection timeout"));
                inner.error_count += 1;
            }
        }
    }

    /// Safely closes the connection and cleans up resources
    async fn close(&self) {
        let mut inner = self.inner_arc.write().await;

        if inner.closed {
            return;
        }

        inner.closed = true;

        if let Some(relay) = inner.relay.take() {
            // Spawn a task to close the relay to avoid blocking
            tokiowasm::spawn(async move {
                // In a real implementation, you'd call relay.close() here
                drop(relay);
            });
        }

        inner.status = RelayConnectionStatus::Disconnected;
    }
}

impl RelayConnection {
    // Connection logic removed for WASM compatibility
    // In a production implementation, this would need a different approach
    // that doesn't rely on Send trait bounds
}

impl Clone for RelayConnection {
    fn clone(&self) -> Self {
        Self {
            inner_arc: self.inner_arc.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use instant::Duration;
    use wasm_bindgen_test::*;

    #[wasm_bindgen_test]
    async fn test_new_connection() {
        let url = "wss://relay.example.com".to_string();
        let conn = RelayConnection::new(url.clone());

        assert_eq!(conn.get_url(), url);
        assert_eq!(conn.get_status(), RelayConnectionStatus::Disconnected);
        assert_eq!(conn.get_subscribers(), 0);
        assert_eq!(conn.get_error_count(), 0);
        assert!(conn.get_relay().is_none());
    }

    #[wasm_bindgen_test]
    async fn test_mark_as_closed() {
        let conn = RelayConnection::new("wss://relay.example.com".to_string());
        let error = anyhow::anyhow!("Test error");

        conn.mark_as_closed(Some(error));

        assert_eq!(conn.get_status(), RelayConnectionStatus::Disconnected);
        assert_eq!(conn.get_error_count(), 1);
        assert!(conn.get_error().is_some());
    }

    #[wasm_bindgen_test]
    async fn test_can_cleanup() {
        let conn = RelayConnection::new("wss://relay.example.com".to_string());
        let idle_timeout = Duration::from_millis(10);

        // Should not be able to cleanup immediately
        assert!(!conn.can_cleanup(idle_timeout));

        // Manually set the last_used time to simulate elapsed time
        {
            let mut inner = conn.inner_arc.write().await;
            inner.last_used = Instant::now() - idle_timeout - Duration::from_millis(1);
            inner.status = RelayConnectionStatus::Failed;
        }

        // Now should be able to cleanup
        assert!(conn.can_cleanup(idle_timeout));
    }

    #[wasm_bindgen_test]
    async fn test_is_stuck() {
        let conn = RelayConnection::new("wss://relay.example.com".to_string());
        let timeout = Duration::from_millis(10);

        // Initially not stuck
        assert!(!conn.is_stuck(timeout));

        // Manually set to connecting state
        {
            let mut inner = conn.inner_arc.write().await;
            inner.status = RelayConnectionStatus::Connecting;
            inner.last_used = Instant::now() - timeout - Duration::from_millis(1);
        }

        // Now should be stuck
        assert!(conn.is_stuck(timeout));
    }

    #[wasm_bindgen_test]
    async fn test_mark_as_stuck() {
        let conn = RelayConnection::new("wss://relay.example.com".to_string());

        // Set to connecting state with old timestamp
        {
            let mut inner = conn.inner_arc.write().await;
            inner.status = RelayConnectionStatus::Connecting;
            inner.last_used = Instant::now() - Duration::from_secs(150); // More than 2 minutes
        }

        conn.mark_as_stuck();

        assert_eq!(conn.get_status(), RelayConnectionStatus::Failed);
        assert!(conn.get_error().is_some());
    }

    #[wasm_bindgen_test]
    async fn test_release_subscribers() {
        let conn = RelayConnection::new("wss://relay.example.com".to_string());

        // Set to connecting state with subscribers
        {
            let mut inner = conn.inner_arc.write().await;
            inner.status = RelayConnectionStatus::Connected;
            inner.subscribers = 2;
        }

        assert_eq!(conn.get_subscribers(), 2);

        conn.release();
        assert_eq!(conn.get_subscribers(), 1);

        conn.release();
        assert_eq!(conn.get_subscribers(), 0);

        // Should not go below 0
        conn.release();
        assert_eq!(conn.get_subscribers(), 0);
    }
}
