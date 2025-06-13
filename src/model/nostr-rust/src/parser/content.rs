use anyhow::Result;
use nostr::nips::nip19::{self, Nip19};
use regex::Regex;
use serde::{Deserialize, Serialize};


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentBlock {
    #[serde(rename = "type")]
    pub block_type: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl ContentBlock {
    pub fn new(block_type: String, text: String) -> Self {
        Self {
            block_type,
            text,
            data: None,
        }
    }

    pub fn with_data(mut self, data: serde_json::Value) -> Self {
        self.data = Some(data);
        self
    }
}

pub struct ContentParser {
    patterns: Vec<Pattern>,
}

struct Pattern {
    name: String,
    regex: Regex,
    processor: fn(&str, &regex::Captures) -> Result<ContentBlock>,
}

impl ContentParser {
    pub fn new() -> Self {
        let patterns = vec![
            Pattern {
                name: "code".to_string(),
                regex: Regex::new(r"```([\s\S]*?)```").unwrap(),
                processor: process_code,
            },
            Pattern {
                name: "cashu".to_string(),
                regex: Regex::new(r"(cashuA[A-Za-z0-9_-]+)").unwrap(),
                processor: process_cashu,
            },
            Pattern {
                name: "hashtag".to_string(),
                regex: Regex::new(r"(?<![^\s\x22\x27(])(#[a-zA-Z0-9_]+)(?![a-zA-Z0-9_])").unwrap(),
                processor: process_hashtag,
            },
            Pattern {
                name: "image".to_string(),
                regex: Regex::new(r"(?i)(https?://\S+\.(jpg|jpeg|png|gif|webp|svg|ico)(\?\S*)?)").unwrap(),
                processor: process_image,
            },
            Pattern {
                name: "video".to_string(),
                regex: Regex::new(r"(?i)(https?://\S+\.(mp4|mov|avi|mkv|webm|m4v)(\?\S*)?)").unwrap(),
                processor: process_video,
            },
            Pattern {
                name: "nostr".to_string(),
                regex: Regex::new(r"(?i)(nostr:([a-z0-9]+)|n(event|prof|pub|addr|note)1[a-z0-9]+)").unwrap(),
                processor: process_nostr,
            },
            Pattern {
                name: "link".to_string(),
                regex: Regex::new(r"(?i)(https?://\S+)(?![\]\)])").unwrap(),
                processor: process_link,
            },
        ];

        Self { patterns }
    }

    pub fn parse_content(&self, content: &str) -> Result<Vec<ContentBlock>> {
        let mut blocks = vec![ContentBlock::new("text".to_string(), content.to_string())];

        // Process one pattern at a time to prioritize patterns
        for pattern in &self.patterns {
            let mut new_blocks = Vec::new();

            for block in blocks {
                // Only process text blocks
                if block.block_type != "text" {
                    new_blocks.push(block);
                    continue;
                }

                // Skip empty text blocks
                if block.text.is_empty() {
                    continue;
                }

                // Find matches in this text block
                let matches: Vec<_> = pattern.regex.find_iter(&block.text).collect();
                if matches.is_empty() {
                    // No matches, keep block as is
                    new_blocks.push(block);
                    continue;
                }

                // Process matches and split the text
                let mut last_end = 0;

                for m in matches {
                    // Add text before the match if any
                    if m.start() > last_end {
                        let text_before = block.text[last_end..m.start()].to_string();
                        if !text_before.is_empty() {
                            new_blocks.push(ContentBlock::new("text".to_string(), text_before));
                        }
                    }

                    // Process and add the match
                    if let Some(caps) = pattern.regex.captures(&block.text[m.start()..m.end()]) {
                        match (pattern.processor)(m.as_str(), &caps) {
                            Ok(match_block) => new_blocks.push(match_block),
                            Err(_) => {
                                // If we can't process the match, treat it as text
                                new_blocks.push(ContentBlock::new("text".to_string(), m.as_str().to_string()));
                            }
                        }
                    } else {
                        // Fallback to text if regex capture fails
                        new_blocks.push(ContentBlock::new("text".to_string(), m.as_str().to_string()));
                    }

                    last_end = m.end();
                }

                // Add remaining text after last match
                if last_end < block.text.len() {
                    let remaining_text = block.text[last_end..].to_string();
                    if !remaining_text.is_empty() {
                        new_blocks.push(ContentBlock::new("text".to_string(), remaining_text));
                    }
                }
            }

            blocks = new_blocks;
        }

        // Combine adjacent text blocks
        let mut combined_blocks: Vec<ContentBlock> = Vec::new();
        for block in blocks {
            if let Some(last_block) = combined_blocks.last_mut() {
                if block.block_type == "text" && last_block.block_type == "text" {
                    // Combine with previous text block
                    last_block.text.push_str(&block.text);
                    continue;
                }
            }
            combined_blocks.push(block);
        }

        // Post-processing: group consecutive media into grids
        let processed_blocks = self.group_media(combined_blocks);

        // Remove empty text blocks
        let final_blocks: Vec<_> = processed_blocks
            .into_iter()
            .filter(|block| block.block_type != "text" || !block.text.is_empty())
            .collect();

        Ok(final_blocks)
    }

    fn group_media(&self, blocks: Vec<ContentBlock>) -> Vec<ContentBlock> {
        let mut processed_blocks = Vec::new();
        let mut media_group = Vec::new();

        for (i, block) in blocks.iter().enumerate() {
            // If this is an image or video
            if block.block_type == "image" || block.block_type == "video" {
                media_group.push(block.clone());
                continue;
            }

            // If this is whitespace or newlines between media, check what follows
            if block.block_type == "text" {
                let is_whitespace = block.text.chars().all(|c| c.is_whitespace());

                if is_whitespace && !media_group.is_empty() && i + 1 < blocks.len() {
                    let next_block = &blocks[i + 1];
                    if next_block.block_type == "image" || next_block.block_type == "video" {
                        continue;
                    }
                }
            }

            // If we have collected media and the current block breaks the sequence
            if !media_group.is_empty() {
                // Add media group if it contains more than one item
                if media_group.len() > 1 {
                    let media_texts: Vec<_> = media_group.iter().map(|m| m.text.clone()).collect();
                    let media_items: Vec<_> = media_group
                        .iter()
                        .map(|media| {
                            serde_json::json!({
                                "type": media.block_type,
                                "src": media.data.as_ref()
                                    .and_then(|d| d.get("src"))
                                    .and_then(|s| s.as_str())
                                    .unwrap_or(&media.text)
                            })
                        })
                        .collect();

                    processed_blocks.push(
                        ContentBlock::new("mediaGrid".to_string(), media_texts.join("\n"))
                            .with_data(serde_json::json!({ "items": media_items })),
                    );
                } else {
                    // Just add the single media item
                    processed_blocks.push(media_group[0].clone());
                }
                media_group.clear();
            }

            // Add the current non-media block
            processed_blocks.push(block.clone());
        }

        // Don't forget any remaining media
        if !media_group.is_empty() {
            if media_group.len() > 1 {
                let media_texts: Vec<_> = media_group.iter().map(|m| m.text.clone()).collect();
                let media_items: Vec<_> = media_group
                    .iter()
                    .map(|media| {
                        serde_json::json!({
                            "type": media.block_type,
                            "src": media.data.as_ref()
                                .and_then(|d| d.get("src"))
                                .and_then(|s| s.as_str())
                                .unwrap_or(&media.text)
                        })
                    })
                    .collect();

                processed_blocks.push(
                    ContentBlock::new("mediaGrid".to_string(), media_texts.join("\n"))
                        .with_data(serde_json::json!({ "items": media_items })),
                );
            } else {
                processed_blocks.push(media_group[0].clone());
            }
        }

        processed_blocks
    }
}

impl Default for ContentParser {
    fn default() -> Self {
        Self::new()
    }
}

// Pattern processors

fn process_code(text: &str, caps: &regex::Captures) -> Result<ContentBlock> {
    let code = caps.get(1).map_or("", |m| m.as_str());
    Ok(ContentBlock::new("code".to_string(), text.to_string())
        .with_data(serde_json::json!({ "code": code })))
}

fn process_cashu(text: &str, _caps: &regex::Captures) -> Result<ContentBlock> {
    Ok(ContentBlock::new("cashu".to_string(), text.to_string())
        .with_data(serde_json::json!({ "token": text })))
}

fn process_hashtag(text: &str, caps: &regex::Captures) -> Result<ContentBlock> {
    let hashtag = caps.get(1).map_or("", |m| m.as_str());
    let tag = if hashtag.starts_with('#') {
        &hashtag[1..]
    } else {
        hashtag
    };
    Ok(ContentBlock::new("hashtag".to_string(), text.to_string())
        .with_data(serde_json::json!({ "tag": tag })))
}

fn process_image(text: &str, _caps: &regex::Captures) -> Result<ContentBlock> {
    Ok(ContentBlock::new("image".to_string(), text.to_string())
        .with_data(serde_json::json!({ "src": text })))
}

fn process_video(text: &str, _caps: &regex::Captures) -> Result<ContentBlock> {
    Ok(ContentBlock::new("video".to_string(), text.to_string())
        .with_data(serde_json::json!({ "src": text })))
}

fn process_nostr(text: &str, _caps: &regex::Captures) -> Result<ContentBlock> {
    let entity = if text.to_lowercase().starts_with("nostr:") {
        // Extract the identifier after nostr:
        &text[6..]
    } else {
        text
    };

    // Try to decode the identifier
    match nip19::FromBech32::from_bech32(entity) {
        Ok(decoded) => {
            let (prefix, data) = match decoded {
                Nip19::Pubkey(pk) => ("npub", serde_json::json!({ "pubkey": pk.to_string() })),
                Nip19::Secret(sk) => ("nsec", serde_json::json!({ "secret": sk.to_string() })),
                Nip19::EncryptedSecret(enc_sk) => ("ncryptsec", serde_json::json!({ "encrypted_secret": format!("{:?}", enc_sk) })),
                Nip19::EventId(note) => ("note", serde_json::json!({ "id": note.to_string() })),
                Nip19::Profile(profile) => ("nprofile", serde_json::json!({
                    "pubkey": profile.public_key.to_string(),
                    "relays": profile.relays
                })),
                Nip19::Event(event) => ("nevent", serde_json::json!({
                    "id": event.event_id.to_string(),
                    "author": event.author.map(|pk| pk.to_string()),
                    "relays": event.relays
                })),
                Nip19::Coordinate(coord) => ("naddr", serde_json::json!({
                    "kind": coord.kind.as_u64(),
                    "pubkey": coord.public_key.to_string(),
                    "identifier": coord.identifier,
                    "relays": coord.relays
                })),
            };

            Ok(ContentBlock::new(prefix.to_string(), text.to_string()).with_data(serde_json::json!({
                "decoded": data,
                "bech32": entity
            })))
        }
        Err(_) => {
            // If we can't decode, treat as text
            Ok(ContentBlock::new("text".to_string(), text.to_string()))
        }
    }
}

fn process_link(text: &str, _caps: &regex::Captures) -> Result<ContentBlock> {
    let url = if text.to_lowercase().starts_with("http") {
        text.to_string()
    } else {
        format!("https://{}", text)
    };

    // Create a placeholder preview
    let preview = get_link_preview(&url);

    Ok(ContentBlock::new("link".to_string(), text.to_string()).with_data(serde_json::json!({
        "href": text,
        "preview": preview
    })))
}

fn get_link_preview(url: &str) -> serde_json::Value {
    // Placeholder for link preview functionality
    serde_json::json!({
        "url": format!("https://proxy.nuts.cash/?url={}", url),
        "title": "Link Preview",
        "description": "Link preview not implemented"
    })
}

// Public function to parse content
pub fn parse_content(content: &str) -> Result<Vec<ContentBlock>> {
    let parser = ContentParser::new();
    parser.parse_content(content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_plain_text() {
        let content = "This is just plain text";
        let result = parse_content(content).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].block_type, "text");
        assert_eq!(result[0].text, content);
    }

    #[test]
    fn test_parse_code_block() {
        let content = "Here is some code: ```var x = 10;``` and more text";
        let result = parse_content(content).unwrap();
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].block_type, "text");
        assert_eq!(result[1].block_type, "code");
        assert_eq!(result[2].block_type, "text");
    }

    #[test]
    fn test_parse_hashtag() {
        let content = "I love #bitcoin and #lightning";
        let result = parse_content(content).unwrap();
        assert_eq!(result.len(), 4);
        assert_eq!(result[1].block_type, "hashtag");
        assert_eq!(result[3].block_type, "hashtag");
    }

    #[test]
    fn test_parse_image() {
        let content = "Check this image: https://example.com/image.jpg";
        let result = parse_content(content).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[1].block_type, "image");
    }

    #[test]
    fn test_parse_mixed_content() {
        let content = "Hello #world!\nCheck out https://example.com";
        let result = parse_content(content).unwrap();
        assert!(result.len() >= 3);
        
        let has_hashtag = result.iter().any(|b| b.block_type == "hashtag");
        let has_link = result.iter().any(|b| b.block_type == "link");
        
        assert!(has_hashtag);
        assert!(has_link);
    }
}