use anyhow::Result;
use instant::{Duration, Instant};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::mpsc;

use crate::types::{NetworkEvent, ParsedEvent, Request};

// Re-export nostr types that we use
pub use nostr::{Event, Filter};
// Use internal Relay implementation
use super::relay::Relay;

/// RelayConnectionStatus represents the status of a relay connection
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum RelayConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Failed,
}

impl RelayConnectionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            RelayConnectionStatus::Disconnected => "Disconnected",
            RelayConnectionStatus::Connecting => "Connecting",
            RelayConnectionStatus::Connected => "Connected",
            RelayConnectionStatus::Failed => "Failed",
        }
    }
}

impl std::fmt::Display for RelayConnectionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// RelayManager defines the interface for managing relay connections
/// Using async_trait to make it object-safe
#[async_trait::async_trait]
pub trait RelayManager: Send + Sync {
    async fn get_relay(&self, url: &str) -> Result<Arc<Relay>>;
    async fn get_relay_async(&self, url: &str, timeout: Duration) -> Result<Arc<Relay>>;
    fn release_relay(&self, url: &str);
    fn mark_relay_as_closed(&self, url: &str, reason: Option<anyhow::Error>);
    async fn pick_random_relay(&self) -> Option<Arc<Relay>>;
    async fn get_connection_count(&self) -> usize;
    async fn get_stats(&self) -> RelayManagerStats;
    async fn close(&self);
}

/// NetworkProcessor defines the interface for processing network requests
#[async_trait::async_trait]
pub trait NetworkProcessor: Send + Sync {
    async fn process_network_requests(
        &self,
        requests: Vec<Request>,
    ) -> mpsc::UnboundedReceiver<NetworkEvent>;
    fn get_connection_stats(&self) -> ConnectionStats;
    fn validate_filters(&self, filters: &[Filter]) -> Result<()>;
}

/// EventParser defines the interface for parsing Nostr events
pub trait EventParser: Send + Sync {
    fn parse(&self, event: Event) -> Result<ParsedEvent>;
    fn get_relay_hint(&self, event: &Event) -> Option<String>;
}

/// SubscriptionOptimizer defines the interface for optimizing subscriptions
pub trait SubscriptionOptimizer: Send + Sync {
    fn optimize_subscriptions(&self, requests: Vec<Request>) -> Vec<Request>;
}

/// ConnectionRegistry defines the interface for managing connection registry
#[async_trait::async_trait]
pub trait ConnectionRegistry: Send + Sync {
    async fn get_or_create(&self, url: &str) -> Option<Arc<dyn RelayConnectionInterface>>;
    async fn get(&self, url: &str) -> Option<Arc<dyn RelayConnectionInterface>>;
    async fn get_all(&self) -> HashMap<String, Arc<dyn RelayConnectionInterface>>;
    async fn get_all_connections(&self) -> Vec<Arc<dyn RelayConnectionInterface>>;
    async fn remove(&self, url: &str) -> bool;
    async fn remove_batch(&self, urls: Vec<String>) -> usize;
    async fn count(&self) -> usize;
    async fn count_by_status(&self) -> HashMap<RelayConnectionStatus, usize>;
    async fn get_connected_relays(&self) -> Vec<Arc<dyn RelayConnectionInterface>>;
    async fn cleanup_eligible_connections(
        &self,
        idle_timeout: Duration,
    ) -> (Vec<String>, Vec<Arc<dyn RelayConnectionInterface>>);
    async fn get_stuck_connections(
        &self,
        timeout: Duration,
    ) -> Vec<Arc<dyn RelayConnectionInterface>>;
    async fn exists(&self, url: &str) -> bool;
    async fn get_stats(&self) -> RegistryStats;
}

/// RelayConnectionInterface defines the interface for individual relay connections
#[async_trait::async_trait]
pub trait RelayConnectionInterface: Send + Sync {
    fn get_status(&self) -> RelayConnectionStatus;
    fn get_relay(&self) -> Option<Arc<Relay>>;
    fn get_url(&self) -> String;
    fn get_subscribers(&self) -> usize;
    fn get_last_used(&self) -> Instant;
    fn get_error(&self) -> Option<anyhow::Error>;
    fn get_error_count(&self) -> usize;
    async fn try_connect(&self, connect_timeout: Duration) -> Result<Arc<Relay>>;
    fn mark_as_closed(&self, reason: Option<anyhow::Error>);
    fn release(&self);
    fn can_cleanup(&self, idle_timeout: Duration) -> bool;
    fn is_stuck(&self, timeout: Duration) -> bool;
    fn mark_as_stuck(&self);
    async fn close(&self);
}

/// BrowserDetector provides methods to detect browser type
pub trait BrowserDetector: Send + Sync {
    fn is_safari(&self) -> bool;
    fn is_chrome(&self) -> bool;
    fn get_browser_info(&self) -> BrowserInfo;
}

/// ConnectionResult represents the result of a connection attempt
#[derive(Debug)]
pub struct ConnectionResult {
    pub relay: Option<Arc<Relay>>,
    pub error: Option<anyhow::Error>,
}

/// BrowserInfo contains information about the browser
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserInfo {
    pub name: String,
    pub version: String,
    pub is_safari: bool,
    pub is_chrome: bool,
    pub user_agent: String,
}

/// Config holds configuration for relay management
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub connect_timeout: Duration,
    pub max_retries: usize,
    pub cleanup_interval: Duration,
    pub max_concurrent_conns: usize,
    pub safari_optimized: bool,
    pub debug: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            connect_timeout: Duration::from_secs(10),
            max_retries: 3,
            cleanup_interval: Duration::from_secs(30),
            max_concurrent_conns: 20,
            safari_optimized: false,
            debug: false,
        }
    }
}

/// RelayManagerStats represents comprehensive relay manager statistics
#[derive(Debug, Clone)]
pub struct RelayManagerStats {
    pub registry: RegistryStats,
    pub active_connections: usize,
    pub last_cleanup: Option<Instant>,
    pub total_requests: u64,
    pub successful_conns: u64,
    pub failed_conns: u64,
    pub uptime: Duration,
}

/// RegistryStats represents statistics about the connections registry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryStats {
    pub total_connections: usize,
    pub connected_count: usize,
    pub connecting_count: usize,
    pub disconnected_count: usize,
    pub failed_count: usize,
}

/// ConnectionStats represents connection statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStats {
    pub total_connections: usize,
    pub active_connections: usize,
    pub failed_connections: usize,
    pub connection_attempts: u64,
    pub successful_connections: u64,
}

/// ValidationError represents a filter validation error
#[derive(Debug, thiserror::Error)]
#[error("Validation error in field '{field}' at index {index}: {message}")]
pub struct ValidationError {
    pub field: String,
    pub index: usize,
    pub message: String,
}

/// Factory provides methods to create relay management components
pub struct Factory {
    logger: Option<tracing::Span>,
}

impl Factory {
    /// Creates a new factory for relay management components
    pub fn new(logger: Option<tracing::Span>) -> Self {
        Self { logger }
    }

    /// Creates a new relay manager
    pub fn create_relay_manager(
        &self,
        connect_timeout: Duration,
        max_retries: usize,
    ) -> Arc<dyn RelayManager> {
        // This would return the actual implementation
        todo!("Create relay manager implementation")
    }
}

// Common errors used across the relay management system
#[derive(Debug, thiserror::Error)]
pub enum RelayError {
    #[error("Relay connection failed")]
    ConnectionFailed,

    #[error("Relay connection timed out")]
    ConnectionTimeout,

    #[error("Relay connection closed externally")]
    RelayClosedExternally,

    #[error("Relay manager is closed")]
    ManagerClosed,

    #[error("Invalid relay URL: {url}")]
    InvalidURL { url: String },

    #[error("Subscription failed")]
    SubscriptionFailed,

    #[error("Context was cancelled")]
    ContextCancelled,

    #[error("Too many concurrent connections")]
    TooManyConnections,

    #[error("Relay connection is nil")]
    NilRelay,

    #[error("Connection registry error: {message}")]
    RegistryError { message: String },

    #[error("Network error: {source}")]
    NetworkError { source: anyhow::Error },
}

/// Helper function to normalize relay URLs
pub fn normalize_url(url: String) -> String {
    let mut normalized = url.trim().to_lowercase();

    // Add wss:// if no protocol specified
    if !normalized.starts_with("wss://") && !normalized.starts_with("ws://") {
        normalized = format!("wss://{}", normalized);
    }

    // Remove trailing slash
    if normalized.ends_with('/') && normalized.len() > 1 {
        normalized.pop();
    }

    normalized
}

/// Helper function to validate relay URL
pub fn validate_relay_url(url: &str) -> Result<(), RelayError> {
    if url.is_empty() {
        return Err(RelayError::InvalidURL {
            url: url.to_string(),
        });
    }

    let normalized = normalize_url(url.to_string());

    if !normalized.starts_with("wss://") && !normalized.starts_with("ws://") {
        return Err(RelayError::InvalidURL {
            url: url.to_string(),
        });
    }

    // Additional validation can be added here

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_url() {
        assert_eq!(
            normalize_url("relay.example.com".to_string()),
            "wss://relay.example.com"
        );
        assert_eq!(
            normalize_url("wss://relay.example.com/".to_string()),
            "wss://relay.example.com"
        );
        assert_eq!(
            normalize_url("WSS://RELAY.EXAMPLE.COM".to_string()),
            "wss://relay.example.com"
        );
    }

    #[test]
    fn test_validate_relay_url() {
        assert!(validate_relay_url("wss://relay.example.com").is_ok());
        assert!(validate_relay_url("ws://relay.example.com").is_ok());
        assert!(validate_relay_url("relay.example.com").is_ok());
        assert!(validate_relay_url("").is_err());
    }

    #[test]
    fn test_relay_connection_status_display() {
        assert_eq!(RelayConnectionStatus::Connected.to_string(), "Connected");
        assert_eq!(
            RelayConnectionStatus::Disconnected.to_string(),
            "Disconnected"
        );
        assert_eq!(RelayConnectionStatus::Connecting.to_string(), "Connecting");
        assert_eq!(RelayConnectionStatus::Failed.to_string(), "Failed");
    }
}
