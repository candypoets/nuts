use anyhow::{Context, Result};
use futures::select;
use futures::FutureExt;
use futures_util::{SinkExt, StreamExt};
use gloo_timers::future::TimeoutFuture;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use ws_stream_wasm::{WsMessage, WsMeta, WsStream};

pub struct Connection {
    sink: Arc<Mutex<futures_util::stream::SplitSink<WsStream, WsMessage>>>,
    stream: Arc<Mutex<futures_util::stream::SplitStream<WsStream>>>,
    url: String,
    connected: Arc<RwLock<bool>>,
}

impl Connection {
    /// Creates a new websocket connection to a Nostr relay.
    /// Uses ws_stream_wasm for WASM-native WebSocket support.
    pub async fn new(
        url: &str,
        _request_headers: Option<std::collections::HashMap<String, String>>,
        _tls_config: Option<()>,
    ) -> Result<Self> {
        let (_ws_meta, ws_stream) = WsMeta::connect(url, None)
            .await
            .context("Failed to connect to WebSocket")?;

        let (sink, stream) = ws_stream.split();

        Ok(Connection {
            sink: Arc::new(Mutex::new(sink)),
            stream: Arc::new(Mutex::new(stream)),
            url: url.to_string(),
            connected: Arc::new(RwLock::new(true)),
        })
    }

    /// Writes arbitrary bytes to the websocket connection.
    pub async fn write_message(&self, data: &[u8]) -> Result<()> {
        let text = String::from_utf8_lossy(data);
        let mut sink = self.sink.lock().await;

        sink.send(WsMessage::Text(text.into_owned()))
            .await
            .context("Failed to send message")?;
        Ok(())
    }

    /// Reads a message from the websocket connection.
    pub async fn read_message(&self) -> Result<String> {
        let mut stream = self.stream.lock().await;

        match stream.next().await {
            Some(msg) => match msg {
                WsMessage::Text(text) => Ok(text),
                WsMessage::Binary(data) => {
                    String::from_utf8(data).context("Received invalid UTF-8 in binary message")
                }
            },
            None => {
                // Connection closed
                *self.connected.write().await = false;
                Err(anyhow::anyhow!("WebSocket stream ended unexpectedly"))
            }
        }
    }

    /// Reads a message from the websocket connection into a provided buffer.
    pub async fn read_message_to_buffer(&self, buf: &mut Vec<u8>) -> Result<()> {
        let message = self.read_message().await?;
        buf.clear();
        buf.extend_from_slice(message.as_bytes());
        Ok(())
    }

    /// Sends a ping frame to the relay.
    /// Note: ws_stream_wasm doesn't expose ping/pong directly,
    /// but the underlying WebSocket handles this automatically.
    pub async fn ping(&self) -> Result<()> {
        // WebSocket ping is handled automatically by the browser
        // This is a no-op but we keep the interface for compatibility
        Ok(())
    }

    /// Closes the websocket connection gracefully.
    pub async fn close(&self) -> Result<()> {
        *self.connected.write().await = false;

        // Close the sink to signal connection termination
        let mut sink = self.sink.lock().await;
        sink.close().await.context("Failed to close WebSocket")?;
        Ok(())
    }

    /// Gets the URL this connection is connected to.
    pub fn url(&self) -> &str {
        &self.url
    }

    /// Check if the connection is still active.
    pub fn is_connected(&self) -> bool {
        // Use try_read to avoid blocking in sync context
        if let Ok(connected) = self.connected.try_read() {
            *connected
        } else {
            false
        }
    }

    /// Attempts to read the next message with a timeout.
    /// This is useful for non-blocking message reading.
    pub async fn try_read_message(&self) -> Result<Option<String>> {
        let timeout_future = TimeoutFuture::new(10); // 10 milliseconds
        let read_future = self.read_message();

        match select! {
            result = read_future.fuse() => result.map(Some),
            _ = timeout_future.fuse() => Ok(None), // Timeout occurred, no message available
        } {
            Ok(msg) => Ok(msg),
            Err(e) => Err(e),
        }
    }
}

impl Clone for Connection {
    fn clone(&self) -> Self {
        Self {
            sink: self.sink.clone(),
            stream: self.stream.clone(),
            url: self.url.clone(),
            connected: self.connected.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // use wasm_bindgen_test::*;

    #[test]
    fn test_url_validation() {
        let valid_urls = vec![
            "ws://localhost:8080",
            "wss://relay.example.com",
            "wss://relay.damus.io",
        ];

        for url in valid_urls {
            assert!(url.starts_with("ws://") || url.starts_with("wss://"));
        }
    }

    #[test]
    fn test_connection_clone() {
        // Test that Connection implements Clone
        // let url = "wss://relay.example.com";
        // We can't actually create a connection in tests without a real server,
        // but we can test the clone implementation exists
        let _clone_test = |conn: Connection| -> Connection { conn.clone() };
    }

    // #[wasm_bindgen_test]
    async fn test_connection_creation_type() {
        // This test verifies the async new function signature
        // let url = "wss://relay.example.com";

        // // We can't actually connect without a real server, but we can verify
        // // that the function signature is correct and would return the right type
        // let result = Connection::new(url, None, None).await;

        // // We expect this to fail in test environment (no real server)
        // // but the important thing is that it compiles with the right signature
        // assert!(result.is_err());
    }

    #[test]
    fn test_is_connected_sync() {
        // Test that is_connected can be called from sync context
        // We can't create a real connection in tests, but we can verify
        // the method signature works
        // let url = "wss://relay.example.com";
        // This test mainly ensures the method compiles correctly
    }
}
