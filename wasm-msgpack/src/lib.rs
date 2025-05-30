use wasm_bindgen::prelude::*;
use serde_json::Value;

// Import the `console.log` function from the browser's JS runtime
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// Define a macro to make console logging easier
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

// Set up panic hook for better error messages in the browser
#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn decode_msgpack(data: &[u8]) -> Result<String, JsValue> {
    if data.is_empty() {
        return Err(JsValue::from_str("Empty data provided"));
    }
    
    match rmp_serde::from_slice::<Value>(data) {
        Ok(decoded) => {
            match serde_json::to_string(&decoded) {
                Ok(json_string) => Ok(json_string),
                Err(e) => Err(JsValue::from_str(&format!("JSON serialization error: {}", e)))
            }
        },
        Err(e) => {
            Err(JsValue::from_str(&format!("MessagePack decode error: {}", e)))
        }
    }
}

#[wasm_bindgen]
pub fn decode_msgpack_batch(data: &[u8]) -> Result<String, JsValue> {
    if data.is_empty() {
        return Ok("[]".to_string());
    }
    
    // Try to decode as an array of values first
    match rmp_serde::from_slice::<Vec<Value>>(data) {
        Ok(decoded) => {
            match serde_json::to_string(&decoded) {
                Ok(json_string) => Ok(json_string),
                Err(e) => Err(JsValue::from_str(&format!("JSON serialization error: {}", e)))
            }
        },
        Err(_) => {
            // If that fails, try as a single value and wrap in array
            match decode_msgpack(data) {
                Ok(single_json) => {
                    let single_value: Value = serde_json::from_str(&single_json)
                        .map_err(|e| JsValue::from_str(&format!("Failed to parse single value JSON: {}", e)))?;
                    let array = vec![single_value];
                    serde_json::to_string(&array)
                        .map_err(|e| JsValue::from_str(&format!("Failed to serialize wrapped array: {}", e)))
                },
                Err(e) => Err(e)
            }
        }
    }
}

#[wasm_bindgen]
pub fn encode_msgpack(json_str: &str) -> Result<Vec<u8>, JsValue> {
    match serde_json::from_str::<Value>(json_str) {
        Ok(value) => {
            match rmp_serde::to_vec(&value) {
                Ok(encoded) => Ok(encoded),
                Err(e) => Err(JsValue::from_str(&format!("MessagePack encode error: {}", e)))
            }
        },
        Err(e) => Err(JsValue::from_str(&format!("JSON parse error: {}", e)))
    }
}

#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}