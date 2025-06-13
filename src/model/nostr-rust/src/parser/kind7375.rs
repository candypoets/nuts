use crate::parser::Parser;
use crate::types::Request;
use anyhow::{anyhow, Result};
use nostr::Event;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofUnion {
    // Placeholder for proof types - would need actual cashu types
    pub data: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Kind7375Parsed {
    #[serde(rename = "mintUrl")]
    pub mint_url: String,
    pub proofs: Vec<ProofUnion>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    #[serde(rename = "deletedIds")]
    pub deleted_ids: Vec<String>,
    pub decrypted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TokenContent {
    pub mint: String,
    pub id: String,
    pub proofs: Vec<ProofUnion>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub del: Vec<String>,
}

impl Parser {
    pub fn parse_kind_7375(&self, event: &Event) -> Result<(Kind7375Parsed, Option<Vec<Request>>)> {
        if event.kind.as_u64() != 7375 {
            return Err(anyhow!("event is not kind 7375"));
        }

        let parsed = Kind7375Parsed {
            mint_url: String::new(),
            proofs: Vec::new(),
            deleted_ids: Vec::new(),
            decrypted: false,
        };

        // Note: Decryption would require signer implementation
        // For now, we'll leave as empty
        // In a full implementation:
        // if let Some(signer) = &self.signer {
        //     let pubkey = signer.get_public_key()?;
        //     if let Ok(decrypted) = signer.nip44_decrypt(&pubkey, &event.content) {
        //         if !decrypted.is_empty() {
        //             if let Ok(content) = serde_json::from_str::<TokenContent>(&decrypted) {
        //                 parsed.mint_url = content.mint;
        //                 parsed.proofs = content.proofs;
        //                 parsed.deleted_ids = content.del;
        //                 parsed.decrypted = true;
        //             }
        //         }
        //     }
        // }

        Ok((parsed, None))
    }

    pub fn prepare_kind_7375(&self, event: &mut Event) -> Result<()> {
        if event.kind.as_u64() != 7375 {
            return Err(anyhow!("event is not kind 7375"));
        }

        // Content must be a valid JSON for TokenContent
        let _content: TokenContent = serde_json::from_str(&event.content)
            .map_err(|e| anyhow!("invalid token content: {}", e))?;

        // Validate content
        if _content.mint.is_empty() {
            return Err(anyhow!("token content must specify a mint"));
        }

        if _content.proofs.is_empty() {
            return Err(anyhow!("token content must include at least one proof"));
        }

        // Note: Encryption and signing would require signer implementation
        // For now, return error indicating encryption is needed
        Err(anyhow!("encryption and signing not implemented - requires signer"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use nostr::{EventBuilder, Keys, Kind};

    #[test]
    fn test_parse_kind_7375_basic() {
        let keys = Keys::generate();
        
        let event = EventBuilder::new(Kind::Custom(7375), "encrypted_content", Vec::new())
            .to_event(&keys)
            .unwrap();
        
        let parser = Parser::default();
        let (parsed, _) = parser.parse_kind_7375(&event).unwrap();
        
        assert!(!parsed.decrypted); // No decryption without signer
        assert!(parsed.mint_url.is_empty());
        assert!(parsed.proofs.is_empty());
    }

    #[test]
    fn test_prepare_kind_7375_invalid_content() {
        let keys = Keys::generate();
        
        let mut event = EventBuilder::new(Kind::Custom(7375), "invalid json", Vec::new())
            .to_event(&keys)
            .unwrap();
        
        let parser = Parser::default();
        let result = parser.prepare_kind_7375(&mut event);
        
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("invalid token content"));
    }

    #[test]
    fn test_parse_wrong_kind() {
        let keys = Keys::generate();
        
        let event = EventBuilder::new(Kind::TextNote, "test", Vec::new())
            .to_event(&keys)
            .unwrap();
        
        let parser = Parser::default();
        let result = parser.parse_kind_7375(&event);
        
        assert!(result.is_err());
    }
}