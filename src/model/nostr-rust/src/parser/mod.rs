use crate::signer::{create_shared_signer_manager, SharedSignerManager};
use crate::types::*;
use anyhow::{anyhow, Result};
use nostr::{Event, Tag};
use tracing::info;

use std::collections::HashMap;

// Declare all parser modules
pub mod content;
pub mod kind0;
pub mod kind1;
pub mod kind10002;
pub mod kind10019;
pub mod kind17;
pub mod kind17375;
pub mod kind3;
pub mod kind39089;
pub mod kind4;
pub mod kind6;
pub mod kind7;
pub mod kind7374;
pub mod kind7375;
pub mod kind7376;
pub mod kind9321;
pub mod kind9735;

#[cfg(test)]
pub mod tests;

// Re-export commonly used types
pub use content::{parse_content, ContentBlock, ContentParser};
pub use kind0::{Kind0Parsed, Nip05Response, ProfilePointer};
pub use kind1::{EventPointer, Kind1Parsed, ProfilePointer as Kind1ProfilePointer};
pub use kind10002::{Kind10002Parsed, RelayInfo};
pub use kind10019::{Kind10019Parsed, MintInfo};
pub use kind17::Kind17Parsed;
pub use kind17375::Kind17375Parsed;
pub use kind3::{Contact, Kind3Parsed};
pub use kind39089::Kind30000Parsed;
pub use kind4::Kind4Parsed;
pub use kind6::Kind6Parsed;
pub use kind7::{Emoji, Kind7Parsed, ReactionType};
pub use kind7374::Kind7374Parsed;
pub use kind7375::Kind7375Parsed;
pub use kind7376::{HistoryTag, Kind7376Parsed};
pub use kind9321::Kind9321Parsed;
pub use kind9735::{Kind9735Parsed, ZapRequest};

pub struct Parser {
    pub default_relays: Vec<String>,
    pub indexer_relays: Vec<String>,
    pub relay_hints: HashMap<String, Vec<String>>,
    pub signer_manager: SharedSignerManager,
}

impl Parser {
    pub fn new(default_relays: Vec<String>, indexer_relays: Vec<String>) -> Self {
        info!("Creating new parser");
        Self {
            default_relays,
            indexer_relays,
            relay_hints: HashMap::new(),
            signer_manager: create_shared_signer_manager(),
        }
    }

    pub fn new_with_signer(
        default_relays: Vec<String>,
        indexer_relays: Vec<String>,
        signer_manager: SharedSignerManager,
    ) -> Self {
        Self {
            default_relays,
            indexer_relays,
            relay_hints: HashMap::new(),
            signer_manager,
        }
    }

    pub fn get_relay_hint(&mut self, event: &Event) -> Vec<String> {
        let mut relay_hints = Vec::new();

        for tag in &event.tags {
            let tag_vec = tag.as_vec();
            if tag_vec.len() >= 2 && tag_vec[0] == "r" {
                relay_hints.push(tag_vec[1].clone());
            }
        }

        if !relay_hints.is_empty() {
            // Get existing hints for this pubkey
            let existing = self
                .relay_hints
                .get(&event.pubkey.to_hex())
                .cloned()
                .unwrap_or_default();

            // Create a set to keep track of unique relays
            let mut unique_relays = std::collections::HashSet::new();

            // Add existing relays
            for relay in existing {
                unique_relays.insert(relay);
            }

            // Add new relays
            for relay in &relay_hints {
                unique_relays.insert(relay.clone());
            }

            // Convert back to vec and update
            let updated_relays: Vec<String> = unique_relays.into_iter().collect();
            self.relay_hints
                .insert(event.pubkey.to_hex(), updated_relays);
        }

        self.clean_relays(relay_hints)
    }

    pub fn get_relays(&self, kind: u64, pubkey: &str, write: &bool) -> Vec<String> {
        let mut relays_found = Vec::new();

        // Check if there are any relay hints for this pubkey
        if let Some(hints) = self.relay_hints.get(pubkey) {
            if !hints.is_empty() {
                relays_found.extend_from_slice(hints);
            }
        }

        match kind {
            10002 | 0 | 10019 => {
                if !self.indexer_relays.is_empty() {
                    let now = instant::now() as usize;
                    let index = if self.indexer_relays.len() > 1 {
                        now % self.indexer_relays.len()
                    } else {
                        0
                    };
                    relays_found.push(self.indexer_relays[index].clone());
                }
            }
            _ => {
                // TODO: Query NIP-65 relay list from database
                // For now, use default relays
                if !self.default_relays.is_empty() {
                    let now = instant::now() as usize;
                    let index = if self.default_relays.len() > 1 {
                        now % self.default_relays.len()
                    } else {
                        0
                    };
                    relays_found.push(self.default_relays[index].clone());
                }
            }
        }

        relays_found = self.clean_relays(relays_found);

        // Ensure we have at least 3 relays
        if relays_found.len() < 3 {
            // Add a random relay from defaults
            if !self.default_relays.is_empty() {
                let now = instant::now() as usize;
                let index = now % self.default_relays.len();
                let random_relay = &self.default_relays[index];
                if !relays_found.contains(random_relay) {
                    relays_found.push(random_relay.clone());
                }
            }
        }

        relays_found
    }

    pub fn parse(&self, event: Event) -> Result<ParsedEvent> {
        let kind = event.kind.as_u64();

        let (parsed, requests) = match kind {
            0 => {
                let (parsed, requests) = self.parse_kind_0(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            1 => {
                let (parsed, requests) = self.parse_kind_1(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            3 => {
                let (parsed, requests) = self.parse_kind_3(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            4 => {
                let (parsed, requests) = self.parse_kind_4(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            6 => {
                let (parsed, requests) = self.parse_kind_6(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            7 => {
                let (parsed, requests) = self.parse_kind_7(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            17 => {
                let (parsed, requests) = self.parse_kind_17(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            7374 => {
                let (parsed, requests) = self.parse_kind_7374(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            7375 => {
                let (parsed, requests) = self.parse_kind_7375(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            7376 => {
                let (parsed, requests) = self.parse_kind_7376(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            9321 => {
                let (parsed, requests) = self.parse_kind_9321(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            9735 => {
                let (parsed, requests) = self.parse_kind_9735(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            10002 => {
                let (parsed, requests) = self.parse_kind_10002(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            10019 => {
                let (parsed, requests) = self.parse_kind_10019(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            17375 => {
                let (parsed, requests) = self.parse_kind_17375(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            39089 => {
                let (parsed, requests) = self.parse_kind_30000(&event)?;
                (Some(serde_json::to_value(parsed)?), requests)
            }
            _ => {
                return Err(anyhow!("no parser available for kind {}", kind));
            }
        };

        Ok(ParsedEvent {
            event,
            parsed,
            requests,
            relays: Vec::new(),
        })
    }

    pub fn prepare(&self, event: &mut Event) -> Result<()> {
        let kind = event.kind.as_u64();

        match kind {
            4 => self.prepare_kind_4(event),
            7374 => self.prepare_kind_7374(event),
            7375 => self.prepare_kind_7375(event),
            7376 => self.prepare_kind_7376(event),
            9321 => self.prepare_kind_9321(event),
            10019 => self.prepare_kind_10019(event),
            17375 => self.prepare_kind_17375(event),
            _ => {
                // Event is already signed - no additional preparation needed
                Ok(())
            }
        }
    }

    fn clean_relays(&self, relays: Vec<String>) -> Vec<String> {
        relays
            .into_iter()
            .filter_map(|relay| {
                let normalized = normalize_url(&relay);
                if normalized.is_empty() {
                    None
                } else {
                    Some(normalized)
                }
            })
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect()
    }
}

fn normalize_url(url: &str) -> String {
    let url = url.trim();
    if url.is_empty() {
        return String::new();
    }

    // Basic URL normalization
    if url.starts_with("wss://") || url.starts_with("ws://") {
        url.to_string()
    } else if url.starts_with("//") {
        format!("wss:{}", url)
    } else {
        format!("wss://{}", url)
    }
}

// Helper function to find tag values
pub fn find_tag_value(tags: &[Tag], tag_name: &str) -> Option<String> {
    tags.iter().find_map(|tag| {
        let tag_vec = tag.as_vec();
        if tag_vec.len() >= 2 && tag_vec[0] == tag_name {
            Some(tag_vec[1].clone())
        } else {
            None
        }
    })
}

// Helper function to find all tag values
pub fn find_tag_values(tags: &[Tag], tag_name: &str) -> Vec<String> {
    tags.iter()
        .filter_map(|tag| {
            let tag_vec = tag.as_vec();
            if tag_vec.len() >= 2 && tag_vec[0] == tag_name {
                Some(tag_vec[1].clone())
            } else {
                None
            }
        })
        .collect()
}

// Helper function to find the last tag with a specific name
pub fn find_last_tag<'a>(tags: &'a [Tag], tag_name: &str) -> Option<&'a Tag> {
    tags.iter().rev().find(|tag| {
        let tag_vec = tag.as_vec();
        !tag_vec.is_empty() && tag_vec[0] == tag_name
    })
}

impl Clone for Parser {
    fn clone(&self) -> Self {
        Self {
            default_relays: self.default_relays.clone(),
            indexer_relays: self.indexer_relays.clone(),
            relay_hints: self.relay_hints.clone(),
            signer_manager: self.signer_manager.clone(),
        }
    }
}

impl Default for Parser {
    fn default() -> Self {
        Self::new(
            vec![
                "wss://relay.damus.io".to_string(),
                "wss://nos.lol".to_string(),
                "wss://relay.primal.net".to_string(),
            ],
            vec![
                "wss://relay.nostr.band".to_string(),
                "wss://nostr.wine".to_string(),
            ],
        )
    }
}
