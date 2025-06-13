pub mod manager;
pub mod interfaces;
pub mod cache_processor;
pub mod network_processor;
pub mod optimizer;
pub mod subscription;
pub mod registry;

pub use manager::SubscriptionManager;
pub use interfaces::*;
pub use cache_processor::CacheProcessor;
pub use network_processor::NetworkProcessor;
pub use optimizer::SubscriptionOptimizer;
pub use subscription::Subscription;
pub use registry::SubscriptionRegistry;

use crate::config::SubscriptionConfig;
use std::sync::Arc;

pub struct SubscriptionContext {
    pub database: Arc<crate::db::NostrDB>,
    pub relay_manager: Arc<dyn crate::relays::RelayManager>,
    pub parser: Arc<crate::parser::Parser>,
    pub config: SubscriptionConfig,
}

impl SubscriptionContext {
    pub fn new(
        database: Arc<crate::db::NostrDB>,
        relay_manager: Arc<dyn crate::relays::RelayManager>,
        parser: Arc<crate::parser::Parser>,
    ) -> Self {
        Self {
            database,
            relay_manager,
            parser,
            config: SubscriptionConfig::default(),
        }
    }
}