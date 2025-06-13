use crate::network::subscriptions::interfaces::{
    SubscriptionRegistry as SubscriptionRegistryTrait, SubscriptionTrait,
};
use crate::network::subscriptions::subscription::Subscription;
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct SubscriptionRegistryImpl {
    subscriptions: Arc<RwLock<HashMap<String, Arc<dyn SubscriptionTrait>>>>,
}

impl SubscriptionRegistryImpl {
    pub fn new() -> Self {
        Self {
            subscriptions: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

#[async_trait]
impl SubscriptionRegistryTrait for SubscriptionRegistryImpl {
    async fn create(&self, id: String) -> Arc<dyn SubscriptionTrait> {
        let subscription = Arc::new(Subscription::new(id.clone()));
        let mut subs = self.subscriptions.write().await;
        subs.insert(id, subscription.clone() as Arc<dyn SubscriptionTrait>);
        subscription
    }

    async fn get(&self, id: &str) -> Option<Arc<dyn SubscriptionTrait>> {
        let subs = self.subscriptions.read().await;
        subs.get(id).cloned()
    }

    async fn remove(&self, id: &str) {
        let mut subs = self.subscriptions.write().await;
        subs.remove(id);
    }

    async fn count(&self) -> usize {
        let subs = self.subscriptions.read().await;
        subs.len()
    }

    async fn list(&self) -> Vec<String> {
        let subs = self.subscriptions.read().await;
        subs.keys().cloned().collect()
    }

    async fn cleanup(&self) {
        let mut subs = self.subscriptions.write().await;
        let mut to_remove = Vec::new();

        for (id, subscription) in subs.iter() {
            if subscription.is_cancelled().await {
                to_remove.push(id.clone());
            }
        }

        for id in to_remove {
            subs.remove(&id);
        }
    }
}

pub type SubscriptionRegistry = SubscriptionRegistryImpl;
