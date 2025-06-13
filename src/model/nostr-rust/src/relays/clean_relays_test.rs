#[cfg(test)]
mod tests {
    use super::super::clean_relays::clean_relays;

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

    #[test]
    fn test_edge_cases() {
        let input = vec![
            "wss://".to_string(), // Just protocol
            "://relay.com".to_string(), // Missing protocol start
            "wss://relay.com:8080".to_string(), // With port
            "wss://relay.com/path?query=1".to_string(), // With path and query
        ];
        let expected = vec![
            "wss://relay.com:8080".to_string(),
            "wss://relay.com/path?query=1".to_string(),
        ];
        assert_eq!(clean_relays(input), expected);
    }

    #[test]
    fn test_case_sensitivity() {
        let input = vec![
            "WSS://RELAY.EXAMPLE.COM".to_string(),
            "wss://relay.example.com/IMAGE.PNG".to_string(),
            "wss://LOCALHOST".to_string(),
        ];
        let expected = vec!["WSS://RELAY.EXAMPLE.COM".to_string()];
        assert_eq!(clean_relays(input), expected);
    }

    #[test]
    fn test_unicode_domains() {
        let input = vec![
            "wss://café.example.com".to_string(),
            "wss://測試.example.com".to_string(),
            "wss://localhost".to_string(),
        ];
        let expected = vec![
            "wss://café.example.com".to_string(),
            "wss://測試.example.com".to_string(),
        ];
        assert_eq!(clean_relays(input), expected);
    }

    #[test]
    fn test_all_extensions() {
        let extensions = vec![
            ".png", ".jpg", ".jpeg", ".gif", ".webp",
            ".mov", ".mp4", ".avi", ".webm", 
            ".mp3", ".wav", ".ogg"
        ];
        
        for ext in extensions {
            let input = vec![
                format!("wss://relay.example.com/file{}", ext),
                "wss://valid.relay.com".to_string(),
            ];
            let expected = vec!["wss://valid.relay.com".to_string()];
            assert_eq!(clean_relays(input), expected, "Failed for extension: {}", ext);
        }
    }

    #[test]
    fn test_private_ip_ranges_comprehensive() {
        let private_ips = vec![
            "10.0.0.1",
            "10.255.255.255",
            "172.16.0.1",
            "172.31.255.255",
            "192.168.0.1",
            "192.168.255.255",
            "127.0.0.1",
            "localhost",
        ];
        
        for ip in private_ips {
            let input = vec![
                format!("wss://{}", ip),
                "wss://valid.relay.com".to_string(),
            ];
            let expected = vec!["wss://valid.relay.com".to_string()];
            assert_eq!(clean_relays(input), expected, "Failed for IP: {}", ip);
        }
    }

    #[test]
    fn test_public_ip_ranges() {
        let public_ips = vec![
            "8.8.8.8",
            "1.1.1.1",
            "172.15.255.255", // Just outside private range
            "172.32.0.0",     // Just outside private range
            "11.0.0.1",       // Outside 10.x range
            "193.168.0.1",    // Outside 192.168.x range
        ];
        
        for ip in public_ips {
            let input = vec![format!("wss://{}", ip)];
            let expected = vec![format!("wss://{}", ip)];
            assert_eq!(clean_relays(input), expected, "Failed for public IP: {}", ip);
        }
    }
}