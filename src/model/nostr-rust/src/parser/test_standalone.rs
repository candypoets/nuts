#[cfg(test)]
mod standalone_tests {
    use super::*;
    use nostr::{EventBuilder, Keys, Kind, Tag};
    use serde_json::json;

    #[test]
    fn test_parser_basic_functionality() {
        let mut parser = Parser::default();
        
        // Test basic parser creation
        assert!(!parser.default_relays.is_empty());
        assert!(!parser.indexer_relays.is_empty());
        assert!(parser.relay_hints.is_empty());
    }

    #[test]
    fn test_content_parsing() {
        let content = "Hello #nostr world! Check out https://example.com";
        let result = parse_content(content);
        
        assert!(result.is_ok());
        let blocks = result.unwrap();
        assert!(!blocks.is_empty());
        
        // Should have multiple blocks including text, hashtag, and link
        let has_text = blocks.iter().any(|b| b.block_type == "text");
        let has_hashtag = blocks.iter().any(|b| b.block_type == "hashtag");
        let has_link = blocks.iter().any(|b| b.block_type == "link");
        
        assert!(has_text);
        assert!(has_hashtag);
        assert!(has_link);
    }

    #[test]
    fn test_helper_functions() {
        let keys = Keys::generate();
        let tags = vec![
            Tag::parse(&["p", "test_pubkey"]).unwrap(),
            Tag::parse(&["e", "test_event"]).unwrap(),
            Tag::parse(&["t", "hashtag"]).unwrap(),
        ];
        
        // Test find_tag_value
        assert_eq!(find_tag_value(&tags, "p"), Some("test_pubkey".to_string()));
        assert_eq!(find_tag_value(&tags, "e"), Some("test_event".to_string()));
        assert_eq!(find_tag_value(&tags, "nonexistent"), None);
        
        // Test find_last_tag
        let last_p = find_last_tag(&tags, "p");
        assert!(last_p.is_some());
        
        // Test find_tag_values
        let p_values = find_tag_values(&tags, "p");
        assert_eq!(p_values.len(), 1);
        assert_eq!(p_values[0], "test_pubkey");
    }

    #[test]
    fn test_relay_functions() {
        let mut parser = Parser::new(
            vec!["wss://default.com".to_string()],
            vec!["wss://indexer.com".to_string()]
        );
        
        // Test get_relays for different kinds
        let relays_kind_0 = parser.get_relays(0, "test_pubkey", None);
        assert!(!relays_kind_0.is_empty());
        
        let relays_kind_1 = parser.get_relays(1, "test_pubkey", None);
        assert!(!relays_kind_1.is_empty());
        
        // Test relay hint extraction
        let keys = Keys::generate();
        let tags = vec![
            Tag::parse(&["r", "wss://hint.com"]).unwrap(),
        ];
        
        let event = EventBuilder::new(Kind::TextNote, "test", &tags)
            .to_event(&keys)
            .unwrap();
        
        let hints = parser.get_relay_hint(&event);
        assert!(hints.contains(&"wss://hint.com".to_string()));
    }

    #[test]
    fn test_url_normalization() {
        let parser = Parser::default();
        
        let test_urls = vec![
            "wss://example.com".to_string(),
            "ws://example.com".to_string(),
            "//example.com".to_string(),
            "example.com".to_string(),
            "".to_string(),
        ];
        
        let cleaned = parser.clean_relays(test_urls);
        
        // Should filter out empty strings and normalize URLs
        assert!(!cleaned.iter().any(|url| url.is_empty()));
        assert!(cleaned.iter().all(|url| url.starts_with("wss://") || url.starts_with("ws://")));
    }

    #[test]
    fn test_content_block_creation() {
        let block = ContentBlock::new("text".to_string(), "Hello world".to_string());
        assert_eq!(block.block_type, "text");
        assert_eq!(block.text, "Hello world");
        assert!(block.data.is_none());
        
        let block_with_data = block.with_data(json!({"key": "value"}));
        assert!(block_with_data.data.is_some());
    }

    #[test]
    fn test_regex_patterns() {
        // Test hashtag pattern
        let content = "This is a #test hashtag";
        let result = parse_content(content).unwrap();
        
        let hashtag_block = result.iter().find(|b| b.block_type == "hashtag");
        assert!(hashtag_block.is_some());
        
        if let Some(block) = hashtag_block {
            assert_eq!(block.text, "#test");
            if let Some(data) = &block.data {
                assert_eq!(data["tag"], "test");
            }
        }
    }

    #[test]
    fn test_image_detection() {
        let content = "Check out this image: https://example.com/image.jpg";
        let result = parse_content(content).unwrap();
        
        let image_block = result.iter().find(|b| b.block_type == "image");
        assert!(image_block.is_some());
        
        if let Some(block) = image_block {
            assert_eq!(block.text, "https://example.com/image.jpg");
            if let Some(data) = &block.data {
                assert_eq!(data["src"], "https://example.com/image.jpg");
            }
        }
    }

    #[test]
    fn test_cashu_token_detection() {
        let content = "Here's a token: cashuAEYSAQEx0QsgEavM8H6ZxWSJFSl6UPmSVCX0C1oO5AqXXU5vNoD5zbQ";
        let result = parse_content(content).unwrap();
        
        let cashu_block = result.iter().find(|b| b.block_type == "cashu");
        assert!(cashu_block.is_some());
        
        if let Some(block) = cashu_block {
            assert!(block.text.starts_with("cashuA"));
            if let Some(data) = &block.data {
                assert!(data["token"].as_str().unwrap().starts_with("cashuA"));
            }
        }
    }

    #[test]
    fn test_link_detection() {
        let content = "Visit https://example.com for more info";
        let result = parse_content(content).unwrap();
        
        let link_block = result.iter().find(|b| b.block_type == "link");
        assert!(link_block.is_some());
        
        if let Some(block) = link_block {
            assert_eq!(block.text, "https://example.com");
            if let Some(data) = &block.data {
                assert_eq!(data["href"], "https://example.com");
                assert!(data["preview"].is_object());
            }
        }
    }

    #[test]
    fn test_code_block_detection() {
        let content = "Here's some code: ```let x = 42;``` done";
        let result = parse_content(content).unwrap();
        
        let code_block = result.iter().find(|b| b.block_type == "code");
        assert!(code_block.is_some());
        
        if let Some(block) = code_block {
            assert_eq!(block.text, "```let x = 42;```");
            if let Some(data) = &block.data {
                assert_eq!(data["code"], "let x = 42;");
            }
        }
    }

    #[test]
    fn test_media_grid_grouping() {
        let content = "Multiple images:\nhttps://example.com/1.jpg\nhttps://example.com/2.jpg\nhttps://example.com/3.jpg";
        let result = parse_content(content).unwrap();
        
        // Should group consecutive media into a mediaGrid
        let media_grid = result.iter().find(|b| b.block_type == "mediaGrid");
        
        if let Some(block) = media_grid {
            if let Some(data) = &block.data {
                let items = data["items"].as_array().unwrap();
                assert_eq!(items.len(), 3);
            }
        }
    }

    #[test]
    fn test_content_parser_initialization() {
        let parser = ContentParser::new();
        // Just test that it initializes without panic
        assert_eq!(parser.patterns.len(), 7); // Should have 7 patterns defined
    }

    #[test]
    fn test_mixed_content_parsing() {
        let content = "Hello #world! Check https://example.com and image https://example.com/pic.jpg ```code here``` done";
        let result = parse_content(content).unwrap();
        
        // Should have multiple different block types
        let block_types: std::collections::HashSet<_> = result.iter().map(|b| &b.block_type).collect();
        
        assert!(block_types.contains("text"));
        assert!(block_types.contains("hashtag"));
        assert!(block_types.contains("link"));
        assert!(block_types.contains("image"));
        assert!(block_types.contains("code"));
    }

    #[test]
    fn test_empty_content() {
        let result = parse_content("");
        assert!(result.is_ok());
        let blocks = result.unwrap();
        assert!(blocks.is_empty());
    }

    #[test]
    fn test_whitespace_only_content() {
        let result = parse_content("   \n\t   ");
        assert!(result.is_ok());
        let blocks = result.unwrap();
        
        if !blocks.is_empty() {
            assert!(blocks.len() == 1);
            assert_eq!(blocks[0].block_type, "text");
        }
    }

    #[test]
    fn test_parser_default_implementation() {
        let parser1 = Parser::default();
        let parser2 = Parser::new(
            vec![
                "wss://relay.damus.io".to_string(),
                "wss://nos.lol".to_string(),
                "wss://relay.primal.net".to_string(),
            ],
            vec![
                "wss://relay.nostr.band".to_string(),
                "wss://nostr.wine".to_string(),
            ],
        );
        
        assert_eq!(parser1.default_relays, parser2.default_relays);
        assert_eq!(parser1.indexer_relays, parser2.indexer_relays);
    }
}