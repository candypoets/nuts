use super::*;
use nostr::{EventBuilder, Keys, Kind, Tag};
use serde_json::json;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parser_initialization() {
        let default_relays = vec!["wss://relay1.com".to_string(), "wss://relay2.com".to_string()];
        let indexer_relays = vec!["wss://indexer.com".to_string()];
        
        let parser = Parser::new(default_relays.clone(), indexer_relays.clone());
        
        assert_eq!(parser.default_relays, default_relays);
        assert_eq!(parser.indexer_relays, indexer_relays);
        assert!(parser.relay_hints.is_empty());
    }

    #[test]
    fn test_get_relay_hint() {
        let mut parser = Parser::default();
        let keys = Keys::generate();
        
        let tags = vec![
            Tag::parse(vec!["r".to_string(), "wss://relay1.com".to_string()]).unwrap(),
            Tag::parse(vec!["r".to_string(), "wss://relay2.com".to_string()]).unwrap(),
        ];
        
        let event = EventBuilder::new(Kind::TextNote, "test", tags)
            .to_event(&keys)
            .unwrap();
        
        let hints = parser.get_relay_hint(&event);
        
        assert_eq!(hints.len(), 2);
        assert!(hints.contains(&"wss://relay1.com".to_string()));
        assert!(hints.contains(&"wss://relay2.com".to_string()));
        
        // Check that hints are stored
        assert!(parser.relay_hints.contains_key(&event.pubkey.to_hex()));
    }

    #[test]
    fn test_get_relays_kind_0() {
        let indexer_relays = vec!["wss://indexer.com".to_string()];
        let parser = Parser::new(vec![], indexer_relays);
        
        let relays = parser.get_relays(0, "test_pubkey", None);
        
        assert!(!relays.is_empty());
        assert!(relays.contains(&"wss://indexer.com".to_string()));
    }

    #[test]
    fn test_get_relays_kind_10002() {
        let indexer_relays = vec!["wss://indexer1.com".to_string(), "wss://indexer2.com".to_string()];
        let parser = Parser::new(vec![], indexer_relays);
        
        let relays = parser.get_relays(10002, "test_pubkey", None);
        
        assert!(!relays.is_empty());
        // Should pick one of the indexer relays
        assert!(relays.iter().any(|r| r.starts_with("wss://indexer")));
    }

    #[test]
    fn test_get_relays_other_kinds() {
        let default_relays = vec!["wss://default.com".to_string()];
        let parser = Parser::new(default_relays, vec![]);
        
        let relays = parser.get_relays(1, "test_pubkey", None);
        
        assert!(!relays.is_empty());
        assert!(relays.contains(&"wss://default.com".to_string()));
    }

    #[test]
    fn test_parse_kind_0() {
        let mut parser = Parser::default();
        let keys = Keys::generate();
        
        let content = json!({
            "name": "Alice",
            "about": "Bitcoin enthusiast",
            "picture": "https://example.com/alice.jpg",
            "nip05": "alice@example.com",
            "lud16": "alice@getalby.com"
        });
        
        let event = EventBuilder::new(Kind::Metadata, &content.to_string(), Vec::new())
            .to_event(&keys)
            .unwrap();
        
        let result = parser.parse(event);
        assert!(result.is_ok());
        
        let parsed_event = result.unwrap();
        assert!(parsed_event.parsed.is_some());
        
        let parsed_value = parsed_event.parsed.unwrap();
        assert_eq!(parsed_value["name"], "Alice");
        assert_eq!(parsed_value["about"], "Bitcoin enthusiast");
    }

    #[test]
    fn test_parse_kind_1() {
        let mut parser = Parser::default();
        let keys = Keys::generate();
        
        let content = "Hello, #nostr world! Check out https://example.com";
        
        let event = EventBuilder::new(Kind::TextNote, content, Vec::new())
            .to_event(&keys)
            .unwrap();
        
        let result = parser.parse(event);
        assert!(result.is_ok());
        
        let parsed_event = result.unwrap();
        assert!(parsed_event.parsed.is_some());
        assert!(parsed_event.requests.is_some());
        
        let requests = parsed_event.requests.unwrap();
        assert!(!requests.is_empty()); // Should have requests for author profile
    }

    #[test]
    fn test_parse_kind_3() {
        let mut parser = Parser::default();
        let keys = Keys::generate();
        let contact_key = Keys::generate();
        
        let tags = vec![
            Tag::parse(vec!["p".to_string(), contact_key.public_key().to_string(), "wss://relay.com".to_string(), "alice".to_string()]).unwrap(),
        ];
        
        let event = EventBuilder::new(Kind::ContactList, "", tags)
            .to_event(&keys)
            .unwrap();
        
        let result = parser.parse(event);
        assert!(result.is_ok());
        
        let parsed_event = result.unwrap();
        assert!(parsed_event.parsed.is_some());
        
        let parsed_value = parsed_event.parsed.unwrap();
        assert!(parsed_value.is_array());
        
        let contacts = parsed_value.as_array().unwrap();
        assert_eq!(contacts.len(), 1);
        assert_eq!(contacts[0]["pubkey"], contact_key.public_key().to_hex());
        assert_eq!(contacts[0]["petname"], "alice");
    }

    #[test]
    fn test_parse_kind_4() {
        let mut parser = Parser::default();
        let keys = Keys::generate();
        let recipient_keys = Keys::generate();
        
        let tags = vec![
            Tag::parse(vec!["p".to_string(), recipient_keys.public_key().to_string()]).unwrap(),
        ];
        
        let event = EventBuilder::new(Kind::EncryptedDirectMessage, "encrypted_content", tags)
            .to_event(&keys)
            .unwrap();
        
        let result = parser.parse(event);
        assert!(result.is_ok());
        
        let parsed_event = result.unwrap();
        assert!(parsed_event.parsed.is_some());
        assert!(parsed_event.requests.is_some());
        
        let parsed_value = parsed_event.parsed.unwrap();
        assert_eq!(parsed_value["recipient"], recipient_keys.public_key().to_hex());
        assert!(parsed_value["chatId"].as_str().unwrap().contains(&keys.public_key().to_hex()));
    }

    #[test]
    fn test_parse_kind_7() {
        let mut parser = Parser::default();
        let keys = Keys::generate();
        let target_event_id = "1234567890abcdef1234567890abcdef12345678";
        let target_pubkey = "abcdef1234567890abcdef1234567890abcdef12";
        
        let tags = vec![
            Tag::parse(vec!["e".to_string(), target_event_id.to_string()]).unwrap(),
            Tag::parse(vec!["p".to_string(), target_pubkey.to_string()]).unwrap(),
        ];
        
        let event = EventBuilder::new(Kind::Reaction, "+", tags)
            .to_event(&keys)
            .unwrap();
        
        let result = parser.parse(event);
        assert!(result.is_ok());
        
        let parsed_event = result.unwrap();
        assert!(parsed_event.parsed.is_some());
        
        let parsed_value = parsed_event.parsed.unwrap();
        assert_eq!(parsed_value["type"], "+");
        assert_eq!(parsed_value["eventId"], target_event_id);
        assert_eq!(parsed_value["pubkey"], target_pubkey);
    }

    #[test]
    fn test_parse_kind_10002() {
        let mut parser = Parser::default();
        let keys = Keys::generate();
        
        let tags = vec![
            Tag::parse(vec!["r".to_string(), "wss://relay1.com".to_string()]).unwrap(),
            Tag::parse(vec!["r".to_string(), "wss://relay2.com".to_string(), "read".to_string()]).unwrap(),
            Tag::parse(vec!["r".to_string(), "wss://relay3.com".to_string(), "write".to_string()]).unwrap(),
        ];
        
        let event = EventBuilder::new(Kind::RelayList, "", tags)
            .to_event(&keys)
            .unwrap();
        
        let result = parser.parse(event);
        assert!(result.is_ok());
        
        let parsed_event = result.unwrap();
        assert!(parsed_event.parsed.is_some());
        
        let parsed_value = parsed_event.parsed.unwrap();
        assert!(parsed_value.is_array());
        
        let relays = parsed_value.as_array().unwrap();
        assert_eq!(relays.len(), 3);
        
        // Check that relay with no marker has both read and write
        let relay1 = relays.iter().find(|r| r["url"] == "wss://relay1.com").unwrap();
        assert_eq!(relay1["read"], true);
        assert_eq!(relay1["write"], true);
        
        // Check read-only relay
        let relay2 = relays.iter().find(|r| r["url"] == "wss://relay2.com").unwrap();
        assert_eq!(relay2["read"], true);
        assert_eq!(relay2["write"], false);
        
        // Check write-only relay
        let relay3 = relays.iter().find(|r| r["url"] == "wss://relay3.com").unwrap();
        assert_eq!(relay3["read"], false);
        assert_eq!(relay3["write"], true);
    }

    #[test]
    fn test_parse_kind_10019() {
        let mut parser = Parser::default();
        let keys = Keys::generate();
        let mint_url = "https://mint.example.com";
        let pubkey = "npub1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        
        let tags = vec![
            Tag::parse(vec!["mint".to_string(), mint_url.to_string(), "sat".to_string(), "usd".to_string()]).unwrap(),
            Tag::parse(vec!["pubkey".to_string(), pubkey.to_string()]).unwrap(),
            Tag::parse(vec!["relay".to_string(), "wss://relay.example.com".to_string()]).unwrap(),
        ];
        
        let event = EventBuilder::new(Kind::Custom(10019), "", tags)
            .to_event(&keys)
            .unwrap();
        
        let result = parser.parse(event);
        assert!(result.is_ok());
        
        let parsed_event = result.unwrap();
        assert!(parsed_event.parsed.is_some());
        
        let parsed_value = parsed_event.parsed.unwrap();
        assert_eq!(parsed_value["trustedMints"][0]["url"], mint_url);
        assert_eq!(parsed_value["trustedMints"][0]["baseUnits"], json!(["sat", "usd"]));
        assert_eq!(parsed_value["p2pkPubkey"], pubkey);
        assert_eq!(parsed_value["readRelays"], json!(["wss://relay.example.com"]));
    }

    #[test]
    fn test_parse_kind_9321() {
        let mut parser = Parser::default();
        let keys = Keys::generate();
        let recipient_keys = Keys::generate();
        let mint_url = "https://mint.example.com";
        let proof_json = json!({
            "amount": 100,
            "secret": "test_secret",
            "C": "test_C",
            "id": "test_id"
        });
        
        let tags = vec![
            Tag::parse(vec!["proof".to_string(), proof_json.to_string()]).unwrap(),
            Tag::parse(vec!["u".to_string(), mint_url.to_string()]).unwrap(),
            Tag::parse(vec!["p".to_string(), recipient_keys.public_key().to_string()]).unwrap(),
        ];
        
        let event = EventBuilder::new(Kind::Custom(9321), "Test nutzap", tags)
            .to_event(&keys)
            .unwrap();
        
        let result = parser.parse(event);
        assert!(result.is_ok());
        
        let parsed_event = result.unwrap();
        assert!(parsed_event.parsed.is_some());
        assert!(parsed_event.requests.is_some());
        
        let parsed_value = parsed_event.parsed.unwrap();
        assert_eq!(parsed_value["amount"], 100);
        assert_eq!(parsed_value["recipient"], recipient_keys.public_key().to_hex());
        assert_eq!(parsed_value["mintUrl"], mint_url);
        assert_eq!(parsed_value["comment"], "Test nutzap");
        assert_eq!(parsed_value["redeemed"], false);
    }

    #[test]
    fn test_parse_kind_9735() {
        let mut parser = Parser::default();
        let keys = Keys::generate();
        let recipient_keys = Keys::generate();
        let bolt11 = "lnbc1000n1...";
        
        let zap_request = json!({
            "kind": 9734,
            "pubkey": keys.public_key().to_hex(),
            "content": "Great post!",
            "tags": [
                ["p", recipient_keys.public_key().to_hex()],
                ["amount", "1000000"]
            ],
            "signature": "mock_signature"
        });
        
        let tags = vec![
            Tag::parse(vec!["p".to_string(), recipient_keys.public_key().to_string()]).unwrap(),
            Tag::parse(vec!["bolt11".to_string(), bolt11.to_string()]).unwrap(),
            Tag::parse(vec!["description".to_string(), zap_request.to_string()]).unwrap(),
        ];
        
        let event = EventBuilder::new(Kind::ZapReceipt, "", tags)
            .to_event(&keys)
            .unwrap();
        
        let result = parser.parse(event);
        assert!(result.is_ok());
        
        let parsed_event = result.unwrap();
        assert!(parsed_event.parsed.is_some());
        
        let parsed_value = parsed_event.parsed.unwrap();
        assert_eq!(parsed_value["amount"], 1000); // 1000000 millisats = 1000 sats
        assert_eq!(parsed_value["recipient"], recipient_keys.public_key().to_hex());
        assert_eq!(parsed_value["bolt11"], bolt11);
        assert_eq!(parsed_value["content"], "Great post!");
        assert_eq!(parsed_value["valid"], true);
    }

    #[test]
    fn test_parse_unknown_kind() {
        let mut parser = Parser::default();
        let keys = Keys::generate();
        
        let event = EventBuilder::new(Kind::Custom(99999), "unknown", Vec::new())
            .to_event(&keys)
            .unwrap();
        
        let result = parser.parse(event);
        assert!(result.is_err());
    }

    #[test]
    fn test_find_tag_value() {
        let tags = vec![
            Tag::parse(vec!["p".to_string(), "pubkey123".to_string()]).unwrap(),
            Tag::parse(vec!["e".to_string(), "event456".to_string()]).unwrap(),
            Tag::parse(vec!["t".to_string(), "hashtag".to_string()]).unwrap(),
        ];
        
        assert_eq!(find_tag_value(&tags, "p"), Some("pubkey123".to_string()));
        assert_eq!(find_tag_value(&tags, "e"), Some("event456".to_string()));
        assert_eq!(find_tag_value(&tags, "t"), Some("hashtag".to_string()));
        assert_eq!(find_tag_value(&tags, "nonexistent"), None);
    }

    #[test]
    fn test_find_tag_values() {
        let tags = vec![
            Tag::parse(vec!["p".to_string(), "pubkey1".to_string()]).unwrap(),
            Tag::parse(vec!["p".to_string(), "pubkey2".to_string()]).unwrap(),
            Tag::parse(vec!["e".to_string(), "event1".to_string()]).unwrap(),
            Tag::parse(vec!["t".to_string(), "hashtag".to_string()]).unwrap(),
        ];
        
        let p_values = find_tag_values(&tags, "p");
        assert_eq!(p_values.len(), 2);
        assert!(p_values.contains(&"pubkey1".to_string()));
        assert!(p_values.contains(&"pubkey2".to_string()));
        
        let e_values = find_tag_values(&tags, "e");
        assert_eq!(e_values.len(), 1);
        assert_eq!(e_values[0], "event1");
        
        let nonexistent = find_tag_values(&tags, "nonexistent");
        assert!(nonexistent.is_empty());
    }

    #[test]
    fn test_find_last_tag() {
        let tags = vec![
            Tag::parse(vec!["p".to_string(), "first".to_string()]).unwrap(),
            Tag::parse(vec!["e".to_string(), "event1".to_string()]).unwrap(),
            Tag::parse(vec!["p".to_string(), "last".to_string()]).unwrap(),
        ];
        
        let last_p = find_last_tag(&tags, "p");
        assert!(last_p.is_some());
        let tag_vec = last_p.unwrap().as_vec();
        assert_eq!(tag_vec[1], "last");
        
        let e_tag = find_last_tag(&tags, "e");
        assert!(e_tag.is_some());
        let tag_vec = e_tag.unwrap().as_vec();
        assert_eq!(tag_vec[1], "event1");
        
        let nonexistent = find_last_tag(&tags, "nonexistent");
        assert!(nonexistent.is_none());
    }

    #[test]
    fn test_normalize_url() {
        // This function is private, but we can test it through clean_relays
        let parser = Parser::default();
        
        let relays = vec![
            "wss://relay.com".to_string(),
            "ws://insecure.com".to_string(),
            "//example.com".to_string(),
            "relay.com".to_string(),
            "".to_string(), // Should be filtered out
        ];
        
        let cleaned = parser.clean_relays(relays);
        
        assert!(cleaned.contains(&"wss://relay.com".to_string()));
        assert!(cleaned.contains(&"ws://insecure.com".to_string()));
        assert!(cleaned.contains(&"wss://example.com".to_string()));
        assert!(cleaned.contains(&"wss://relay.com".to_string()));
        assert!(!cleaned.iter().any(|r| r.is_empty()));
    }

    #[test]
    fn test_parse_with_relay_hints() {
        let mut parser = Parser::default();
        let keys = Keys::generate();
        
        let tags = vec![
            Tag::parse(vec!["r".to_string(), "wss://hint1.com".to_string()]).unwrap(),
            Tag::parse(vec!["r".to_string(), "wss://hint2.com".to_string()]).unwrap(),
        ];
        
        let event = EventBuilder::new(Kind::TextNote, "test", tags)
            .to_event(&keys)
            .unwrap();
        
        // Parse the event, which should extract relay hints
        let result = parser.parse(event.clone());
        assert!(result.is_ok());
        
        // Check that relay hints were stored
        assert!(parser.relay_hints.contains_key(&event.pubkey.to_hex()));
        let hints = &parser.relay_hints[&event.pubkey.to_hex()];
        assert!(hints.contains(&"wss://hint1.com".to_string()));
        assert!(hints.contains(&"wss://hint2.com".to_string()));
    }

    #[test]
    fn test_content_parsing_integration() {
        let mut parser = Parser::default();
        let keys = Keys::generate();
        
        let content = "Hello #nostr! Check out https://example.com and this image https://example.com/pic.jpg";
        
        let event = EventBuilder::new(Kind::TextNote, content, Vec::new())
            .to_event(&keys)
            .unwrap();
        
        let result = parser.parse(event);
        assert!(result.is_ok());
        
        let parsed_event = result.unwrap();
        assert!(parsed_event.parsed.is_some());
        
        let parsed_value = parsed_event.parsed.unwrap();
        let parsed_content = &parsed_value["parsedContent"];
        
        assert!(parsed_content.is_array());
        let blocks = parsed_content.as_array().unwrap();
        
        // Should have multiple blocks: text, hashtag, text, link, text, image
        assert!(blocks.len() > 3);
        
        // Check for hashtag block
        let has_hashtag = blocks.iter().any(|block| {
            block["type"] == "hashtag" && block["data"]["tag"] == "nostr"
        });
        assert!(has_hashtag);
        
        // Check for link block
        let has_link = blocks.iter().any(|block| {
            block["type"] == "link" && block["text"] == "https://example.com"
        });
        assert!(has_link);
        
        // Check for image block
        let has_image = blocks.iter().any(|block| {
            block["type"] == "image" && block["text"] == "https://example.com/pic.jpg"
        });
        assert!(has_image);
    }
}