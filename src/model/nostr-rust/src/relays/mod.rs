pub mod clean_relays;
pub mod connection;
pub mod connections_registry;
pub mod interfaces;
pub mod relay;
pub mod relay_connection;
pub mod relay_manager;

#[cfg(test)]
pub mod clean_relays_test;

// Examples module removed

// Re-export the main public API
pub use clean_relays::clean_relays;
pub use connection::Connection;
pub use connections_registry::ConnectionsRegistry;
pub use interfaces::{
    RelayManager, NetworkProcessor, EventParser, SubscriptionOptimizer,
    ConnectionRegistry, RelayConnectionInterface, BrowserDetector,
    RelayConnectionStatus, ConnectionResult, BrowserInfo, Config,
    RelayManagerStats, RegistryStats, ConnectionStats, ValidationError,
    Factory, RelayError, normalize_url, validate_relay_url,
    // Re-export nostr types
    Event, Filter,
};
pub use relay::{
    Relay, Subscription, SubscriptionOption, Filters,
    WithNoticeHandler, WithCustomHandler, WithRequestHeader, RelayOption,
};
pub use relay_connection::RelayConnection;
pub use relay_manager::RelayConnectionManager;