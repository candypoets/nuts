/// CleanRelays processes an array of relay URLs from a request, removing any that are:
/// - Empty strings
/// - Media file URLs (with extensions like .png, .jpg, etc.)
/// - Local network addresses (localhost, 127.0.0.1, private IP ranges)
/// It returns an array of cleaned, valid relay URLs.
pub fn clean_relays(relays: Vec<String>) -> Vec<String> {
    let mut clean_relays = Vec::new();
    
    for relay in relays {
        // Skip empty relays
        if relay.is_empty() {
            continue;
        }

        // Skip if the URL starts with http:// or https://
        let relay_lower = relay.to_lowercase();
        if relay_lower.starts_with("http://") || relay_lower.starts_with("https://") {
            continue;
        }

        let original_relay = relay.clone();
        let mut cleaned_relay = relay.clone();
        
        // Remove protocol prefixes
        cleaned_relay = cleaned_relay.strip_prefix("wss://").unwrap_or(&cleaned_relay).to_string();
        cleaned_relay = cleaned_relay.strip_prefix("ws://").unwrap_or(&cleaned_relay).to_string();
        cleaned_relay = cleaned_relay.trim_end_matches('/').to_string();

        // Check for media file extensions and other non-relay URLs
        let media_extensions = [
            ".png", ".jpg", ".jpeg", ".gif", ".webp", 
            ".mov", ".mp4", ".avi", ".webm", 
            ".mp3", ".wav", ".ogg"
        ];
        
        let is_media_url = media_extensions.iter().any(|ext| {
            cleaned_relay.to_lowercase().ends_with(ext)
        });

        if is_media_url {
            continue;
        }

        // Extract hostname part without path, query params, etc.
        let hostname = cleaned_relay
            .split('/')
            .next()
            .unwrap_or(&cleaned_relay)
            .split(':')
            .next()
            .unwrap_or(&cleaned_relay);

        let is_local = hostname == "localhost" 
            || hostname == "127.0.0.1"
            || hostname.starts_with("192.168.")
            || hostname.starts_with("10.")
            || (hostname.starts_with("172.") && is_private_172_range(hostname));

        // Only add valid, non-local, non-media relays
        if !is_local {
            clean_relays.push(original_relay);
        }
    }
    
    clean_relays
}

/// Check if hostname is in the 172.16.0.0/12 private range (172.16.0.0 to 172.31.255.255)
fn is_private_172_range(hostname: &str) -> bool {
    if let Some(second_octet_str) = hostname.strip_prefix("172.") {
        if let Some(second_octet_end) = second_octet_str.find('.') {
            if let Ok(second_octet) = second_octet_str[..second_octet_end].parse::<u8>() {
                return (16..=31).contains(&second_octet);
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_input() {
        let input = vec![];
        let expected: Vec<String> = vec![];
        assert_eq!(clean_relays(input), expected);
    }

    #[test]
    fn test_empty_string_in_array() {
        let input = vec![
            "wss://relay.example.com".to_string(),
            "".to_string(),
            "wss://another.relay.com".to_string()
        ];
        let expected = vec![
            "wss://relay.example.com".to_string(),
            "wss://another.relay.com".to_string()
        ];
        assert_eq!(clean_relays(input), expected);
    }

    #[test]
    fn test_media_file_urls() {
        let input = vec![
            "wss://relay.example.com/image.png".to_string(),
            "wss://relay.example.com/video.mp4/".to_string(),
            "wss://valid.relay.com".to_string(),
            "wss://i.nostr.build/5JIRtxJpaHXrYvzK.jpg".to_string(),
            "wss://relay.example.com/audio.wav".to_string(),
            "wss://media1.tenor.com/m/A90xKAZllcgAAAAC/hot-hotdogs.gif".to_string(),
        ];
        let expected = vec!["wss://valid.relay.com".to_string()];
        assert_eq!(clean_relays(input), expected);
    }

    #[test]
    fn test_local_network_addresses() {
        let input = vec![
            "wss://localhost".to_string(),
            "wss://127.0.0.1".to_string(),
            "wss://192.168.1.1".to_string(),
            "wss://10.0.0.1".to_string(),
            "wss://172.16.0.1".to_string(),
            "wss://valid.relay.com".to_string(),
        ];
        let expected = vec!["wss://valid.relay.com".to_string()];
        assert_eq!(clean_relays(input), expected);
    }

    #[test]
    fn test_protocol_variants() {
        let input = vec![
            "wss://relay1.com".to_string(),
            "ws://relay2.com".to_string(),
            "relay3.com".to_string(),
        ];
        let expected = vec![
            "wss://relay1.com".to_string(),
            "ws://relay2.com".to_string(),
            "relay3.com".to_string(),
        ];
        assert_eq!(clean_relays(input), expected);
    }

    #[test]
    fn test_trailing_slashes() {
        let input = vec![
            "wss://relay1.com/".to_string(),
            "wss://relay2.com///".to_string(),
            "wss://relay3.com".to_string(),
        ];
        let expected = vec![
            "wss://relay1.com/".to_string(),
            "wss://relay2.com///".to_string(),
            "wss://relay3.com".to_string(),
        ];
        assert_eq!(clean_relays(input), expected);
    }

    #[test]
    fn test_mixed_valid_and_invalid() {
        let input = vec![
            "wss://relay1.com".to_string(),
            "wss://localhost".to_string(),
            "wss://relay2.com/image.jpg/".to_string(),
            "wss://relay3.com".to_string(),
            "".to_string(),
            "wss://192.168.1.1".to_string(),
        ];
        let expected = vec![
            "wss://relay1.com".to_string(),
            "wss://relay3.com".to_string(),
        ];
        assert_eq!(clean_relays(input), expected);
    }

    #[test]
    fn test_http_urls_filtered() {
        let input = vec![
            "http://relay1.com".to_string(),
            "https://relay2.com".to_string(),
            "wss://relay3.com".to_string(),
        ];
        let expected = vec!["wss://relay3.com".to_string()];
        assert_eq!(clean_relays(input), expected);
    }

    #[test]
    fn test_172_private_range() {
        let input = vec![
            "wss://172.15.0.1".to_string(), // Not in private range
            "wss://172.16.0.1".to_string(), // In private range
            "wss://172.31.255.255".to_string(), // In private range
            "wss://172.32.0.1".to_string(), // Not in private range
            "wss://valid.relay.com".to_string(),
        ];
        let expected = vec![
            "wss://172.15.0.1".to_string(),
            "wss://172.32.0.1".to_string(),
            "wss://valid.relay.com".to_string(),
        ];
        assert_eq!(clean_relays(input), expected);
    }
}