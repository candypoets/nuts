use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// EOSE (End of Stored Events) represents the completion of stored events delivery
/// This matches the Go type from types/eose.go
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[wasm_bindgen]
pub struct EOSE {
    #[serde(rename = "totalConnections")]
    #[wasm_bindgen(getter_with_clone)]
    pub total_connections: i32,

    #[serde(rename = "remainingConnections")]
    #[wasm_bindgen(getter_with_clone)]
    pub remaining_connections: i32,
}

#[wasm_bindgen]
impl EOSE {
    #[wasm_bindgen(constructor)]
    pub fn new(total_connections: i32, remaining_connections: i32) -> Self {
        Self {
            total_connections,
            remaining_connections,
        }
    }

    /// Check if all connections are complete (remaining connections is 0)
    #[wasm_bindgen]
    pub fn is_complete(&self) -> bool {
        self.remaining_connections == 0
    }

    /// Get the number of completed connections
    #[wasm_bindgen]
    pub fn completed_connections(&self) -> i32 {
        self.total_connections - self.remaining_connections
    }

    /// Get the completion percentage (0.0 to 1.0)
    #[wasm_bindgen]
    pub fn completion_percentage(&self) -> f64 {
        if self.total_connections == 0 {
            1.0
        } else {
            (self.total_connections - self.remaining_connections) as f64
                / self.total_connections as f64
        }
    }

    /// Convert to JSON string
    #[wasm_bindgen]
    pub fn to_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(self).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Create from JSON string
    #[wasm_bindgen]
    pub fn from_json(json: &str) -> Result<EOSE, JsValue> {
        serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

impl Default for EOSE {
    fn default() -> Self {
        Self {
            total_connections: 0,
            remaining_connections: 0,
        }
    }
}

impl std::fmt::Display for EOSE {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "EOSE(total: {}, remaining: {}, completed: {})",
            self.total_connections,
            self.remaining_connections,
            self.completed_connections()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_eose_creation() {
        let eose = EOSE::new(5, 2);
        assert_eq!(eose.total_connections, 5);
        assert_eq!(eose.remaining_connections, 2);
        assert_eq!(eose.completed_connections(), 3);
        assert!(!eose.is_complete());
    }

    #[test]
    fn test_eose_completion() {
        let eose = EOSE::new(3, 0);
        assert!(eose.is_complete());
        assert_eq!(eose.completion_percentage(), 1.0);
    }

    #[test]
    fn test_eose_completion_percentage() {
        let eose = EOSE::new(10, 3);
        assert_eq!(eose.completion_percentage(), 0.7);
    }

    #[test]
    fn test_eose_zero_total() {
        let eose = EOSE::new(0, 0);
        assert!(eose.is_complete());
        assert_eq!(eose.completion_percentage(), 1.0);
    }

    #[test]
    fn test_eose_serialization() {
        let eose = EOSE::new(5, 2);
        let json = serde_json::to_string(&eose).unwrap();
        let expected = r#"{"totalConnections":5,"remainingConnections":2}"#;
        assert_eq!(json, expected);

        let deserialized: EOSE = serde_json::from_str(&json).unwrap();
        assert_eq!(eose, deserialized);
    }

    #[test]
    fn test_eose_display() {
        let eose = EOSE::new(5, 2);
        let display = format!("{}", eose);
        assert_eq!(display, "EOSE(total: 5, remaining: 2, completed: 3)");
    }
}
