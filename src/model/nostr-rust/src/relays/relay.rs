use anyhow::Error;
use anyhow::Result;
use futures::FutureExt;
use gloo_timers::future::TimeoutFuture;
use instant::Duration;
use serde_json;
use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::select;
use tokio::sync::RwLock;
use tokio::sync::{mpsc, oneshot};
use tokio_with_wasm::task;

use crate::types::{ParsedEvent, EOSE};
// Global subscription ID counter
static SUBSCRIPTION_ID_COUNTER: AtomicI64 = AtomicI64::new(0);

// Use nostr types
pub use nostr::{Event, EventId, Filter, Kind, PublicKey};

pub type Filters = Vec<Filter>;

pub struct Subscription {
    pub counter: i64,
    pub id: String,
    pub relay: Arc<Relay>,
    pub filters: Filters,
    pub events: mpsc::UnboundedReceiver<ParsedEvent>,
    pub end_of_stored_events: mpsc::Receiver<EOSE>,
    pub closed_reason: mpsc::Receiver<String>,
    pub context: tokio_util::sync::CancellationToken,
}

// Use the Connection from the connection module
use super::connection::Connection;

// Write request structure
#[derive(Debug)]
struct WriteRequest {
    msg: Vec<u8>,
    answer: oneshot::Sender<Result<()>>,
}

// Relay structure
pub struct Relay {
    close_mutex: Mutex<()>,
    pub url: String,
    request_header: Option<()>,
    connection: Arc<RwLock<Option<Connection>>>,
    subscriptions: Arc<RwLock<HashMap<i64, Arc<Subscription>>>>,
    connection_error: Arc<RwLock<Option<Error>>>,
    connection_context: tokio_util::sync::CancellationToken,
    challenge: Arc<RwLock<String>>,
    notice_handler: Option<Arc<dyn Fn(String) + Send + Sync>>,
    custom_handler: Option<Arc<dyn Fn(String) + Send + Sync>>,
    ok_callbacks: Arc<RwLock<HashMap<String, Box<dyn Fn(bool, String) + Send + Sync>>>>,
    write_queue: mpsc::UnboundedSender<WriteRequest>,
    write_queue_rx: Arc<Mutex<Option<mpsc::UnboundedReceiver<WriteRequest>>>>,
    assume_valid: bool,
}

impl std::fmt::Debug for Relay {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Relay")
            .field("url", &self.url)
            .field("assume_valid", &self.assume_valid)
            .field("has_notice_handler", &self.notice_handler.is_some())
            .field("has_custom_handler", &self.custom_handler.is_some())
            .finish()
    }
}

// Relay options trait and implementations
pub trait RelayOption: Send + Sync {
    fn apply_relay_option(self: Box<Self>, relay: &mut Relay);
}

pub struct WithNoticeHandler(pub Arc<dyn Fn(String) + Send + Sync>);

impl RelayOption for WithNoticeHandler {
    fn apply_relay_option(self: Box<Self>, relay: &mut Relay) {
        relay.notice_handler = Some(self.0);
    }
}

pub struct WithCustomHandler(pub Arc<dyn Fn(String) + Send + Sync>);

impl RelayOption for WithCustomHandler {
    fn apply_relay_option(self: Box<Self>, relay: &mut Relay) {
        relay.custom_handler = Some(self.0);
    }
}

pub struct WithRequestHeader(pub ());

impl RelayOption for WithRequestHeader {
    fn apply_relay_option(self: Box<Self>, relay: &mut Relay) {
        relay.request_header = Some(());
    }
}

impl Relay {
    // NewRelay equivalent
    pub fn new(url: String, opts: Vec<Box<dyn RelayOption>>) -> Self {
        let (write_tx, write_rx) = mpsc::unbounded_channel();

        let mut relay = Relay {
            close_mutex: Mutex::new(()),
            url: normalize_url(url),
            request_header: None,
            connection: Arc::new(RwLock::new(None)),
            subscriptions: Arc::new(RwLock::new(HashMap::new())),
            connection_error: Arc::new(RwLock::new(None)),
            connection_context: tokio_util::sync::CancellationToken::new(),
            challenge: Arc::new(RwLock::new(String::new())),
            notice_handler: None,
            custom_handler: None,
            ok_callbacks: Arc::new(RwLock::new(HashMap::new())),
            write_queue: write_tx,
            write_queue_rx: Arc::new(Mutex::new(Some(write_rx))),
            assume_valid: false,
        };

        for opt in opts {
            opt.apply_relay_option(&mut relay);
        }

        relay
    }

    // RelayConnect equivalent
    pub async fn connect(url: String, opts: Vec<Box<dyn RelayOption>>) -> Result<Self> {
        let relay = Self::new(url, opts);
        relay.connect_internal().await?;
        Ok(relay)
    }

    // String method equivalent
    pub fn to_string(&self) -> String {
        self.url.clone()
    }

    // Context method equivalent
    pub fn context(&self) -> &tokio_util::sync::CancellationToken {
        &self.connection_context
    }

    // IsConnected equivalent
    pub fn is_connected(&self) -> bool {
        !self.connection_context.is_cancelled()
    }

    // Connect method equivalent
    pub async fn connect_internal(&self) -> Result<()> {
        self.connect_with_tls(None).await
    }

    // ConnectWithTLS equivalent
    pub async fn connect_with_tls(&self, _tls_config: Option<()>) -> Result<()> {
        if self.url.is_empty() {
            return Err(anyhow::anyhow!("invalid relay URL '{}'", self.url));
        }

        let conn = Connection::new(&self.url, None, None).await?;
        *self.connection.write().await = Some(conn);

        // Start write queue handler
        let write_queue_rx = self
            .write_queue_rx
            .lock()
            .unwrap()
            .take()
            .ok_or_else(|| anyhow::anyhow!("write queue already started"))?;

        let connection_clone = self.connection.clone();
        let connection_context_clone = self.connection_context.clone();
        let url_clone = self.url.clone();

        task::spawn(async move {
            Self::handle_write_queue(
                write_queue_rx,
                connection_clone,
                connection_context_clone,
                url_clone,
            )
            .await;
        });

        // Start message reader
        let connection_clone = self.connection.clone();
        let connection_context_clone = self.connection_context.clone();
        let subscriptions_clone = self.subscriptions.clone();
        let notice_handler_clone = self.notice_handler.clone();
        let custom_handler_clone = self.custom_handler.clone();
        let ok_callbacks_clone = self.ok_callbacks.clone();
        let url_clone = self.url.clone();
        let assume_valid = self.assume_valid;

        task::spawn(async move {
            Self::handle_messages(
                connection_clone,
                connection_context_clone,
                subscriptions_clone,
                notice_handler_clone,
                custom_handler_clone,
                ok_callbacks_clone,
                url_clone,
                assume_valid,
            )
            .await;
        });

        Ok(())
    }

    // Write method equivalent
    pub async fn write(&self, msg: Vec<u8>) -> Result<()> {
        let (tx, rx) = oneshot::channel();
        let write_req = WriteRequest { msg, answer: tx };

        self.write_queue
            .send(write_req)
            .map_err(|_| anyhow::anyhow!("connection closed"))?;

        rx.await
            .map_err(|_| anyhow::anyhow!("write request cancelled"))?
    }

    // Publish method equivalent
    pub async fn publish(&self, event: Event) -> Result<()> {
        self.publish_internal(event.id.to_string(), serde_json::to_vec(&event)?)
            .await
    }

    // Auth method equivalent
    pub async fn auth<F>(&self, sign: F) -> Result<()>
    where
        F: FnOnce(&mut Event) -> Result<()>,
    {
        use nostr::{EventBuilder, Keys, Tag, TagKind};

        // Create a dummy keys instance for the event structure
        let keys = Keys::generate();
        let challenge = self.challenge.read().await.clone();

        let mut auth_event = EventBuilder::new(
            Kind::from(22242), // KindClientAuthentication
            "",
            vec![
                Tag::Generic(TagKind::Custom("relay".to_string()), vec![self.url.clone()]),
                Tag::Generic(TagKind::Custom("challenge".to_string()), vec![challenge]),
            ],
        )
        .to_event(&keys)?;

        sign(&mut auth_event)?;

        self.publish_internal(auth_event.id.to_hex(), serde_json::to_vec(&auth_event)?)
            .await
    }

    // Internal publish method
    async fn publish_internal(&self, id: String, data: Vec<u8>) -> Result<()> {
        let (tx, mut rx) = oneshot::channel();
        let tx = Arc::new(Mutex::new(Some(tx)));

        // Store OK callback
        self.ok_callbacks.write().await.insert(
            id.clone(),
            Box::new(move |ok, reason| {
                let result = if ok {
                    Ok(())
                } else {
                    Err(anyhow::anyhow!("msg: {}", reason))
                };
                if let Some(sender) = tx.lock().unwrap().take() {
                    let _ = sender.send(result);
                }
            }),
        );

        // Send the event
        self.write(data).await?;

        // Wait for OK response with timeout

        let timeout_future = TimeoutFuture::new(7_000); // 7 seconds in milliseconds

        let result_future = async {
            select! {
                result = &mut rx => {
                    result.map_err(|_| anyhow::anyhow!("OK callback cancelled"))?
                }
                _ = self.connection_context.cancelled() => {
                    Err(anyhow::anyhow!("connection closed"))
                }
            }
        };

        let timeout = futures::select! {
            result = result_future.fuse() => Ok(result),
            _ = timeout_future.fuse() => Err(()),
        };

        match timeout {
            Ok(result) => result,
            Err(_) => {
                self.ok_callbacks.write().await.remove(&id);
                Err(anyhow::anyhow!("timeout waiting for OK"))
            }
        }
    }

    // Subscribe method equivalent
    pub async fn subscribe(
        &self,
        filters: Filters,
        opts: Vec<Box<dyn SubscriptionOption>>,
    ) -> Result<Arc<Subscription>> {
        let sub = self.prepare_subscription(filters, opts).await?;
        sub.fire().await?;
        Ok(sub)
    }

    // PrepareSubscription method equivalent
    async fn prepare_subscription(
        &self,
        filters: Filters,
        _opts: Vec<Box<dyn SubscriptionOption>>,
    ) -> Result<Arc<Subscription>> {
        let current = SUBSCRIPTION_ID_COUNTER.fetch_add(1, Ordering::SeqCst);
        let id = current.to_string();

        let (_events_tx, events_rx) = mpsc::unbounded_channel();
        let (_eose_tx, eose_rx) = mpsc::channel(1);
        let (_closed_tx, closed_rx) = mpsc::channel(1);
        let context = tokio_util::sync::CancellationToken::new();

        // Create a weak reference to avoid circular dependencies
        let subscription = Arc::new(Subscription {
            counter: current,
            id: id.clone(),
            relay: Arc::new(Self::new(self.url.clone(), vec![])), // Create a new instance to avoid circular refs
            filters,
            events: events_rx,
            end_of_stored_events: eose_rx,
            closed_reason: closed_rx,
            context,
        });

        self.subscriptions
            .write()
            .await
            .insert(current, subscription.clone());

        Ok(subscription)
    }

    // QueryEvents method equivalent
    pub async fn query_events(
        &self,
        filter: Filter,
    ) -> Result<mpsc::UnboundedReceiver<ParsedEvent>> {
        let sub = self.subscribe(vec![filter], vec![]).await?;
        // Return the events receiver
        // Note: This is simplified - the Go version has more complex lifecycle management
        match Arc::try_unwrap(sub) {
            Ok(subscription) => Ok(subscription.events),
            Err(_) => Err(anyhow::anyhow!(
                "Failed to unwrap subscription - still has references"
            )),
        }
    }

    // QuerySync method equivalent
    pub async fn query_sync(&self, filter: Filter) -> Result<Vec<ParsedEvent>> {
        let mut events = Vec::new();
        let mut receiver = self.query_events(filter).await?;

        let timeout_future = TimeoutFuture::new(7000); // 7 seconds in milliseconds

        futures::pin_mut!(timeout_future);

        select! {
            _ = timeout_future => {
                return Err(anyhow::anyhow!("QuerySync took too long"));
            }
            _ = async {
                while let Some(event) = receiver.recv().await {
                    events.push(event);
                }
            } => {
                // Data collection completed
            }
        }

        Ok(events)
    }

    // Count method equivalent
    pub async fn count(
        &self,
        _filters: Filters,
        _opts: Vec<Box<dyn SubscriptionOption>>,
    ) -> Result<(i64, Vec<u8>)> {
        // Mock implementation
        Ok((0, vec![]))
    }

    // Close method equivalent
    pub async fn close(&self) -> Result<()> {
        let _guard = self.close_mutex.lock().unwrap();

        self.connection_context.cancel();

        if let Some(conn) = self.connection.write().await.take() {
            conn.close().await?;
        }

        Ok(())
    }

    // Private helper methods
    async fn handle_write_queue(
        mut rx: mpsc::UnboundedReceiver<WriteRequest>,
        connection: Arc<RwLock<Option<Connection>>>,
        context: tokio_util::sync::CancellationToken,
        url: String,
    ) {
        loop {
            select! {
                write_req = rx.recv() => {
                    if let Some(req) = write_req {
                        println!("{{{}}} sending {:?}", url, String::from_utf8_lossy(&req.msg));

                        let result = {
                            let conn_guard = connection.read().await;
                            if let Some(conn) = conn_guard.as_ref() {
                                conn.write_message(&req.msg).await
                            } else {
                                Err(anyhow::anyhow!("no connection"))
                            }
                        };

                        let _ = req.answer.send(result);
                    }
                }
                _ = context.cancelled() => {
                    return;
                }
            }
        }
    }

    async fn handle_messages(
        connection: Arc<RwLock<Option<Connection>>>,
        connection_context: tokio_util::sync::CancellationToken,
        subscriptions: Arc<RwLock<HashMap<i64, Arc<Subscription>>>>,
        _notice_handler: Option<Arc<dyn Fn(String) + Send + Sync>>,
        _custom_handler: Option<Arc<dyn Fn(String) + Send + Sync>>,
        ok_callbacks: Arc<RwLock<HashMap<String, Box<dyn Fn(bool, String) + Send + Sync>>>>,
        url: String,
        _assume_valid: bool,
    ) {
        loop {
            select! {
                _ = connection_context.cancelled() => {
                    return;
                }
                _ = async {
                    let message_result = {
                        let conn_guard = connection.read().await;
                        if let Some(conn) = conn_guard.as_ref() {
                            conn.read_message().await
                        } else {
                            Err(anyhow::anyhow!("no connection"))
                        }
                    };

                    match message_result {
                        Ok(message) => {
                                tracing::debug!(relay = %url, message = %message, "Received message");

                                // Parse the JSON message and handle different types
                                if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&message) {
                                    if let Some(array) = json_value.as_array() {
                                        if let Some(msg_type) = array.get(0).and_then(|v| v.as_str()) {
                                            match msg_type {
                                                "EVENT" => {
                                                    // Handle EVENT message
                                                    Self::handle_event_message(array, &subscriptions).await;
                                                }
                                                "EOSE" => {
                                                    // Handle End of Stored Events
                                                    Self::handle_eose_message(array, &subscriptions).await;
                                                }
                                                "OK" => {
                                                    // Handle OK response
                                                    Self::handle_ok_message(array, &ok_callbacks).await;
                                                }
                                                "NOTICE" => {
                                                    // Handle NOTICE message
                                                    if let Some(notice) = array.get(1).and_then(|v| v.as_str()) {
                                                        tracing::warn!(relay = %url, notice = %notice, "Received notice");
                                                    }
                                                }
                                                _ => {
                                                    tracing::debug!(relay = %url, msg_type = %msg_type, "Unknown message type");
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        Err(e) => {
                            tracing::error!(relay = %url, error = %e, "Error reading message");
                            connection_context.cancel();
                        }
                    }
                } => {}
            }
        }
    }

    async fn handle_event_message(
        array: &[serde_json::Value],
        _subscriptions: &Arc<RwLock<HashMap<i64, Arc<Subscription>>>>,
    ) {
        if array.len() >= 3 {
            if let (Some(_sub_id), Some(event_json)) =
                (array.get(1).and_then(|v| v.as_str()), array.get(2))
            {
                if let Ok(event) = serde_json::from_value::<Event>(event_json.clone()) {
                    let parsed_event = ParsedEvent::new(event);
                    // TODO: Route to appropriate subscription
                    tracing::debug!("Parsed event: {:?}", parsed_event.event.id);
                }
            }
        }
    }

    async fn handle_eose_message(
        array: &[serde_json::Value],
        _subscriptions: &Arc<RwLock<HashMap<i64, Arc<Subscription>>>>,
    ) {
        if let Some(sub_id) = array.get(1).and_then(|v| v.as_str()) {
            let _eose = EOSE {
                total_connections: 1,
                remaining_connections: 0,
            };
            // TODO: Route to appropriate subscription
            tracing::debug!("Received EOSE for subscription: {}", sub_id);
        }
    }

    async fn handle_ok_message(
        array: &[serde_json::Value],
        ok_callbacks: &Arc<RwLock<HashMap<String, Box<dyn Fn(bool, String) + Send + Sync>>>>,
    ) {
        if array.len() >= 4 {
            if let (Some(event_id), Some(success), Some(reason)) = (
                array.get(1).and_then(|v| v.as_str()),
                array.get(2).and_then(|v| v.as_bool()),
                array.get(3).and_then(|v| v.as_str()),
            ) {
                let callbacks = ok_callbacks.read().await;
                if let Some(callback) = callbacks.get(event_id) {
                    callback(success, reason.to_string());
                }
            }
        }
    }
}

// Subscription option trait (placeholder)
pub trait SubscriptionOption: Send + Sync {}

impl Subscription {
    pub async fn fire(&self) -> Result<()> {
        // Mock implementation - would send REQ command
        Ok(())
    }
}

// Helper functions
fn normalize_url(url: String) -> String {
    // Mock implementation - would normalize the URL
    url
}

// Additional helper functions and implementations would go here...
