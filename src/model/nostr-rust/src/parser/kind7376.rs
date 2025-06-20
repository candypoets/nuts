use crate::parser::Parser;
use crate::types::Request;
use anyhow::{anyhow, Result};
use nostr::Event;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryTag {
    pub name: String,
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relay: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub marker: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Kind7376Parsed {
    pub direction: String, // "in" or "out"
    pub amount: i32,       // Amount in sats
    #[serde(skip_serializing_if = "Vec::is_empty")]
    #[serde(rename = "createdEvents")]
    pub created_events: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    #[serde(rename = "destroyedEvents")]
    pub destroyed_events: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    #[serde(rename = "redeemedEvents")]
    pub redeemed_events: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<HistoryTag>,
    pub decrypted: bool,
}

impl Parser {
    pub fn parse_kind_7376(&self, event: &Event) -> Result<(Kind7376Parsed, Option<Vec<Request>>)> {
        if event.kind.as_u64() != 7376 {
            return Err(anyhow!("event is not kind 7376"));
        }

        let mut requests = Vec::new();
        let mut parsed = Kind7376Parsed {
            direction: String::new(),
            amount: 0,
            created_events: Vec::new(),
            destroyed_events: Vec::new(),
            redeemed_events: Vec::new(),
            tags: Vec::new(),
            decrypted: false,
        };

        // Process unencrypted e tags with "redeemed" marker
        for tag in &event.tags {
            let tag_vec = tag.as_vec();
            if tag_vec.len() >= 4 && tag_vec[0] == "e" && tag_vec[3] == "redeemed" {
                parsed.redeemed_events.push(tag_vec[1].clone());
                // Add request for this event
                requests.push(Request {
                    ids: vec![tag_vec[1].clone()],
                    kinds: vec![7375],
                    relays: self.database.find_relay_candidates(
                        7375,
                        &event.pubkey.to_hex(),
                        &false,
                    ),
                    cache_first: true,
                    ..Default::default()
                });
            }
        }

        // Note: Decryption would require signer implementation
        // For now, we'll leave decrypted as false
        // In a full implementation:
        // if let Some(signer) = &self.signer {
        //     let pubkey = signer.get_public_key()?;
        //     if let Ok(decrypted) = signer.nip44_decrypt(&pubkey, &event.content) {
        //         if !decrypted.is_empty() {
        //             if let Ok(tags) = serde_json::from_str::<Vec<Vec<String>>>(&decrypted) {
        //                 parsed.decrypted = true;
        //                 parsed.tags = Vec::new();
        //
        //                 // Process decrypted tags
        //                 for tag in tags {
        //                     if tag.len() >= 2 {
        //                         let history_tag = HistoryTag {
        //                             name: tag[0].clone(),
        //                             value: tag[1].clone(),
        //                             relay: tag.get(2).cloned(),
        //                             marker: tag.get(3).cloned(),
        //                         };
        //                         parsed.tags.push(history_tag);
        //
        //                         // Extract specific tag values
        //                         match tag[0].as_str() {
        //                             "direction" => parsed.direction = tag[1].clone(),
        //                             "amount" => {
        //                                 if let Ok(amt) = tag[1].parse::<i32>() {
        //                                     parsed.amount = amt;
        //                                 }
        //                             }
        //                             "e" => {
        //                                 if tag.len() >= 4 {
        //                                     match tag[3].as_str() {
        //                                         "created" => parsed.created_events.push(tag[1].clone()),
        //                                         "destroyed" => parsed.destroyed_events.push(tag[1].clone()),
        //                                         "redeemed" => parsed.redeemed_events.push(tag[1].clone()),
        //                                         _ => {}
        //                                     }
        //                                 }
        //                             }
        //                             _ => {}
        //                         }
        //                     }
        //                 }
        //             }
        //         }
        //     }
        // }

        Ok((parsed, Some(requests)))
    }

    pub fn prepare_kind_7376(&self, event: &mut Event) -> Result<()> {
        if event.kind.as_u64() != 7376 {
            return Err(anyhow!("event is not kind 7376"));
        }

        // For spending history events, the content is an array of tags
        let tags: Vec<Vec<String>> = serde_json::from_str(&event.content)
            .map_err(|e| anyhow!("invalid spending history content: {}", e))?;

        // Check for required direction and amount tags
        let mut has_direction = false;
        let mut has_amount = false;

        for tag in &tags {
            if tag.len() >= 2 {
                match tag[0].as_str() {
                    "direction" => {
                        has_direction = true;
                        if tag[1] != "in" && tag[1] != "out" {
                            return Err(anyhow!("direction must be 'in' or 'out'"));
                        }
                    }
                    "amount" => has_amount = true,
                    _ => {}
                }
            }
        }

        if !has_direction || !has_amount {
            return Err(anyhow!(
                "spending history must include direction and amount"
            ));
        }

        // Note: Encryption and signing would require signer implementation
        // For now, return error indicating encryption is needed
        Err(anyhow!(
            "encryption and signing not implemented - requires signer"
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use nostr::{EventBuilder, Keys, Kind, Tag};

    #[test]
    fn test_parse_kind_7376_basic() {
        let keys = Keys::generate();

        let event = EventBuilder::new(Kind::Custom(7376), "encrypted_content", Vec::new())
            .to_event(&keys)
            .unwrap();

        let parser = Parser::default();
        let (parsed, _) = parser.parse_kind_7376(&event).unwrap();

        assert!(!parsed.decrypted); // No decryption without signer
        assert!(parsed.direction.is_empty());
        assert_eq!(parsed.amount, 0);
    }

    #[test]
    fn test_parse_kind_7376_with_redeemed_tag() {
        let keys = Keys::generate();
        let redeemed_event_id = "1234567890abcdef1234567890abcdef12345678";

        let tags = vec![Tag::parse(vec![
            "e".to_string(),
            redeemed_event_id.to_string(),
            "".to_string(),
            "redeemed".to_string(),
        ])
        .unwrap()];

        let event = EventBuilder::new(Kind::Custom(7376), "encrypted_content", tags)
            .to_event(&keys)
            .unwrap();

        let parser = Parser::default();
        let (parsed, requests) = parser.parse_kind_7376(&event).unwrap();

        assert_eq!(parsed.redeemed_events, vec![redeemed_event_id]);
        assert!(requests.is_some());
        assert!(!requests.unwrap().is_empty());
    }

    #[test]
    fn test_prepare_kind_7376_invalid_content() {
        let keys = Keys::generate();

        let mut event = EventBuilder::new(Kind::Custom(7376), "invalid json", Vec::new())
            .to_event(&keys)
            .unwrap();

        let parser = Parser::default();
        let result = parser.prepare_kind_7376(&mut event);

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("invalid spending history content"));
    }

    #[test]
    fn test_prepare_kind_7376_missing_required_fields() {
        let keys = Keys::generate();
        let content = r#"[["amount", "100"]]"#; // Missing direction

        let mut event = EventBuilder::new(Kind::Custom(7376), content, Vec::new())
            .to_event(&keys)
            .unwrap();

        let parser = Parser::default();
        let result = parser.prepare_kind_7376(&mut event);

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("must include direction and amount"));
    }

    #[test]
    fn test_parse_wrong_kind() {
        let keys = Keys::generate();

        let event = EventBuilder::new(Kind::TextNote, "test", Vec::new())
            .to_event(&keys)
            .unwrap();

        let parser = Parser::default();
        let result = parser.parse_kind_7376(&event);

        assert!(result.is_err());
    }
}
