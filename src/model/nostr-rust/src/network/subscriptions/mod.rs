pub mod cache_processor;
pub mod interfaces;
pub mod manager;
pub mod network_processor;
pub mod optimizer;
pub mod registry;
pub mod subscription;

pub use cache_processor::CacheProcessor;
pub use interfaces::*;
pub use manager::SubscriptionManager;
pub use network_processor::NetworkProcessor;
pub use optimizer::SubscriptionOptimizer;
pub use registry::SubscriptionRegistry;
pub use subscription::Subscription;

use crate::{config::SubscriptionConfig, relays::ConnectionRegistry};
use std::sync::Arc;

pub struct SubscriptionContext {
    pub database: Arc<crate::db::NostrDB>,
    pub connection_registry: Arc<ConnectionRegistry>,
    pub parser: Arc<crate::parser::Parser>,
    pub config: SubscriptionConfig,
}

impl SubscriptionContext {
    pub fn new(
        database: Arc<crate::db::NostrDB>,
        connection_registry: Arc<ConnectionRegistry>,
        parser: Arc<crate::parser::Parser>,
    ) -> Self {
        Self {
            database,
            connection_registry,
            parser,
            config: SubscriptionConfig::default(),
        }
    }
}
