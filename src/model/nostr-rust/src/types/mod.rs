//! Types module for Nutscash Nostr
//! 
//! This module contains all the type definitions used throughout the Nostr implementation,
//! including event types, request types, proof types, and communication types.

pub mod eose;
pub mod proof;

// Re-export module types
pub use eose::EOSE;
pub use proof::{ProofUnion, ProofData};

// Re-export nostr types for convenience
pub use nostr::{Event, EventId, Filter, Timestamp, Tag, PublicKey, Kind};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

/// Request represents a subscription request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub ids: Vec<String>,
    
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub authors: Vec<String>,
    
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub kinds: Vec<i32>,
    
    #[serde(skip_serializing_if = "HashMap::is_empty", default)]
    pub tags: HashMap<String, Vec<String>>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub since: Option<i64>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub until: Option<i64>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<i32>,
    
    #[serde(skip_serializing_if = "String::is_empty", default)]
    pub search: String,
    
    pub relays: Vec<String>,
    
    #[serde(rename = "closeOnEOSE", default)]
    pub close_on_eose: bool,
    
    #[serde(rename = "cacheFirst", default)]
    pub cache_first: bool,
    
    #[serde(rename = "noOptimize", default)]
    pub no_optimize: bool,
    
    #[serde(default)]
    pub count: bool,
    
    #[serde(rename = "noContext", default)]
    pub no_context: bool,
}

impl Request {
    pub fn new(relays: Vec<String>, filter: Filter) -> Self {
        Self {
            ids: filter.ids.map(|ids| ids.into_iter().map(|id| id.to_hex()).collect()).unwrap_or_default(),
            authors: filter.authors.map(|authors| authors.into_iter().map(|pk| pk.to_hex()).collect()).unwrap_or_default(),
            kinds: filter.kinds.map(|kinds| kinds.into_iter().map(|k| k.as_u64() as i32).collect()).unwrap_or_default(),
            tags: HashMap::new(), // TODO: Convert filter tags properly
            since: filter.since.map(|ts| ts.as_u64() as i64),
            until: filter.until.map(|ts| ts.as_u64() as i64),
            limit: filter.limit.map(|l| l as i32),
            search: filter.search.unwrap_or_default(),
            relays,
            close_on_eose: false,
            cache_first: false,
            no_optimize: false,
            count: false,
            no_context: false,
        }
    }

    pub fn to_filter(&self) -> Result<Filter, anyhow::Error> {
        let mut filter = Filter::new();
        
        if !self.ids.is_empty() {
            let ids: Result<Vec<EventId>, _> = self.ids.iter()
                .map(|id| EventId::from_hex(id))
                .collect();
            filter = filter.ids(ids?);
        }
        
        if !self.authors.is_empty() {
            let authors: Result<Vec<PublicKey>, _> = self.authors.iter()
                .map(|pk| PublicKey::from_hex(pk))
                .collect();
            filter = filter.authors(authors?);
        }
        
        if !self.kinds.is_empty() {
            let kinds: Vec<Kind> = self.kinds.iter()
                .map(|k| Kind::from(*k as u64))
                .collect();
            filter = filter.kinds(kinds);
        }
        
        if let Some(since) = self.since {
            filter = filter.since(Timestamp::from(since as u64));
        }
        
        if let Some(until) = self.until {
            filter = filter.until(Timestamp::from(until as u64));
        }
        
        if let Some(limit) = self.limit {
            filter = filter.limit(limit as usize);
        }
        
        if !self.search.is_empty() {
            filter = filter.search(&self.search);
        }
        
        Ok(filter)
    }
}

/// ParsedEvent represents a Nostr event with additional parsed data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedEvent {
    #[serde(flatten)]
    pub event: Event,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parsed: Option<serde_json::Value>,
    
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requests: Option<Vec<Request>>,
    
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub relays: Vec<String>,
}

impl ParsedEvent {
    pub fn new(event: Event) -> Self {
        Self {
            event,
            parsed: None,
            requests: None,
            relays: Vec::new(),
        }
    }
    
    pub fn with_parsed(mut self, parsed: serde_json::Value) -> Self {
        self.parsed = Some(parsed);
        self
    }
    
    pub fn with_relays(mut self, relays: Vec<String>) -> Self {
        self.relays = relays;
        self
    }
    
    pub fn with_requests(mut self, requests: Vec<Request>) -> Self {
        self.requests = Some(requests);
        self
    }
}

/// Signer types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SignerType {
    #[serde(rename = "privkey")]
    PrivKey,
}

impl std::fmt::Display for SignerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SignerType::PrivKey => write!(f, "privkey"),
        }
    }
}

impl std::str::FromStr for SignerType {
    type Err = anyhow::Error;
    
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "privkey" => Ok(SignerType::PrivKey),
            _ => Err(anyhow::anyhow!("Unknown signer type: {}", s)),
        }
    }
}

/// Message types for WebAssembly communication
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SignerMessage {
    #[serde(rename = "SIGNED")]
    Signed { payload: Vec<u8> },
    
    #[serde(rename = "PUBKEY")]
    PubKey { payload: String },
    
    #[serde(rename = "NIP04_ENCRYPTED")]
    Nip04Encrypted { payload: String },
    
    #[serde(rename = "NIP04_DECRYPTED")]
    Nip04Decrypted { payload: String },
    
    #[serde(rename = "NIP44_ENCRYPTED")]
    Nip44Encrypted { payload: String },
    
    #[serde(rename = "NIP44_DECRYPTED")]
    Nip44Decrypted { payload: String },
    
    #[serde(rename = "ERROR")]
    Error { message: String },
}

/// Network event types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NetworkEventType {
    Event,
    EOSE,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkEvent {
    pub event_type: NetworkEventType,
    pub event: Option<ParsedEvent>,
    pub error: Option<String>,
    pub relay: String,
    pub eose: Option<EOSE>,
}

/// Publish status types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PublishStatus {
    Pending,
    Sent,
    Success,
    Failed,
    Rejected,
    ConnectionError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayStatusUpdate {
    pub relay: String,
    pub status: PublishStatus,
    pub message: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishSummary {
    pub relay_count: usize,
    pub success_count: usize,
    pub relay_statuses: Vec<RelayStatusUpdate>,
    pub duration_ms: u64,
    pub timestamp: i64,
}

/// Re-export common types that might be used across modules
pub type EventKind = i32;
pub type RelayUrl = String;
pub type EventJson = String;
pub type PubkeyHex = String;
pub type EventIdHex = String;

/// Common result type for this module
pub type TypesResult<T> = Result<T, TypesError>;

/// Error types for the types module
#[derive(Debug, thiserror::Error)]
pub enum TypesError {
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("Invalid format: {0}")]
    InvalidFormat(String),
    
    #[error("Missing field: {0}")]
    MissingField(String),
    
    #[error("Invalid version: {0}")]
    InvalidVersion(i32),
}

impl From<TypesError> for JsValue {
    fn from(err: TypesError) -> Self {
        JsValue::from_str(&err.to_string())
    }
}

/// Utility functions for type conversions
pub mod utils {
    use super::*;
    
    /// Convert a timestamp to JavaScript Date
    pub fn timestamp_to_js_date(timestamp: i64) -> js_sys::Date {
        js_sys::Date::new(&JsValue::from_f64(timestamp as f64 * 1000.0))
    }
    
    /// Convert JavaScript Date to timestamp
    pub fn js_date_to_timestamp(date: &js_sys::Date) -> i64 {
        (date.get_time() / 1000.0) as i64
    }
    
    /// Validate a hexadecimal string
    pub fn validate_hex_string(hex: &str, expected_length: Option<usize>) -> Result<(), TypesError> {
        if let Some(len) = expected_length {
            if hex.len() != len {
                return Err(TypesError::InvalidFormat(
                    format!("Expected length {}, got {}", len, hex.len())
                ));
            }
        }
        
        if !hex.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(TypesError::InvalidFormat("Invalid hex characters".to_string()));
        }
        
        Ok(())
    }
    
    /// Validate a public key hex string
    pub fn validate_pubkey_hex(pubkey: &str) -> Result<(), TypesError> {
        validate_hex_string(pubkey, Some(64))
    }
    
    /// Validate an event ID hex string
    pub fn validate_event_id_hex(event_id: &str) -> Result<(), TypesError> {
        validate_hex_string(event_id, Some(64))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::utils::*;
    
    #[test]
    fn test_request_creation() {
        let relays = vec!["wss://relay.example.com".to_string()];
        let filter = Filter::new().limit(10);
        let request = Request::new(relays.clone(), filter);
        
        assert_eq!(request.relays, relays);
        assert_eq!(request.limit, Some(10));
    }
    
    #[test]
    fn test_hex_validation() {
        assert!(validate_hex_string("deadbeef", Some(8)).is_ok());
        assert!(validate_hex_string("DEADBEEF", Some(8)).is_ok());
        assert!(validate_hex_string("123456789abcdef0", Some(16)).is_ok());
        
        assert!(validate_hex_string("xyz", Some(3)).is_err());
        assert!(validate_hex_string("deadbeef", Some(6)).is_err());
    }
    
    #[test]
    fn test_pubkey_validation() {
        let valid_pubkey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        assert!(validate_pubkey_hex(valid_pubkey).is_ok());
        
        let invalid_pubkey = "short";
        assert!(validate_pubkey_hex(invalid_pubkey).is_err());
    }
    
    #[test]
    fn test_signer_type_parsing() {
        let signer_type: SignerType = "privkey".parse().unwrap();
        assert!(matches!(signer_type, SignerType::PrivKey));
        assert_eq!(signer_type.to_string(), "privkey");
    }
}