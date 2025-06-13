use crate::network::subscriptions::interfaces::SubscriptionTrait;
use crate::types::*;
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{oneshot, RwLock};

pub struct Subscription {
    id: String,
    sent_events: Arc<RwLock<HashMap<String, Vec<ParsedEvent>>>>,
    fetched_batch: Arc<RwLock<Vec<Vec<ParsedEvent>>>>,
    batching_mode: Arc<RwLock<bool>>,
    cancelled: Arc<RwLock<bool>>,
    cancel_tx: Arc<RwLock<Option<oneshot::Sender<()>>>>,
}

impl Subscription {
    pub fn new(id: String) -> Self {
        Self {
            id,
            sent_events: Arc::new(RwLock::new(HashMap::new())),
            fetched_batch: Arc::new(RwLock::new(Vec::new())),
            batching_mode: Arc::new(RwLock::new(false)),
            cancelled: Arc::new(RwLock::new(false)),
            cancel_tx: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn with_cancel_channel(self, cancel_tx: oneshot::Sender<()>) -> Self {
        {
            let mut tx = self.cancel_tx.write().await;
            *tx = Some(cancel_tx);
        }
        self
    }
}

#[async_trait]
impl SubscriptionTrait for Subscription {
    fn id(&self) -> &str {
        &self.id
    }

    async fn is_cancelled(&self) -> bool {
        *self.cancelled.read().await
    }

    async fn cancel(&self) {
        let mut cancelled = self.cancelled.write().await;
        *cancelled = true;

        let mut tx_guard = self.cancel_tx.write().await;
        if let Some(tx) = tx_guard.take() {
            let _ = tx.send(());
        }
    }

    async fn get_sent_events(&self) -> HashMap<String, Vec<ParsedEvent>> {
        self.sent_events.read().await.clone()
    }

    async fn mark_event_as_sent(&self, event_id: &str, events: Vec<ParsedEvent>) {
        let mut sent_events = self.sent_events.write().await;
        sent_events.insert(event_id.to_string(), events);
    }

    async fn has_event_been_sent(&self, event_id: &str) -> bool {
        let sent_events = self.sent_events.read().await;
        sent_events.contains_key(event_id)
    }

    async fn add_to_fetched_batch(&self, events: Vec<ParsedEvent>) {
        let mut batch = self.fetched_batch.write().await;
        batch.push(events);
    }

    async fn get_fetched_batch(&self) -> Vec<Vec<ParsedEvent>> {
        self.fetched_batch.read().await.clone()
    }

    async fn clear_fetched_batch(&self) {
        let mut batch = self.fetched_batch.write().await;
        batch.clear();
    }

    async fn is_in_batching_mode(&self) -> bool {
        *self.batching_mode.read().await
    }

    async fn set_batching_mode(&self, batching: bool) {
        let mut mode = self.batching_mode.write().await;
        *mode = batching;
    }
}
