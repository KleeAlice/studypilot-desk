//! Native route table for the Rust-owned gateway.
//!
//! Actix-Web routes are matched here and dispatched to Python domain
//! callables by name.  Unmatched paths fall back to the legacy Python
//! passthrough while the route migration is in progress.

use std::collections::HashMap;

pub struct Route {
    pub method: &'static str,
    pub segments: Vec<Segment>,
    pub function: &'static str,
    /// When true the raw request body is forwarded (base64) instead of being
    /// parsed as JSON — used for multipart uploads.
    pub raw_body: bool,
    /// When true the route streams NDJSON events back to the caller.
    pub streaming: bool,
}

pub enum Segment {
    Literal(&'static str),
    Param(&'static str),
}

pub fn route(method: &'static str, pattern: &'static str, function: &'static str) -> Route {
    route_with(method, pattern, function, false, false)
}

/// A route that forwards the raw multipart body (base64) to the domain
/// callable instead of parsing it as JSON.
pub fn raw_route(method: &'static str, pattern: &'static str, function: &'static str) -> Route {
    route_with(method, pattern, function, true, false)
}

/// A route whose domain callable yields NDJSON events that are streamed back.
pub fn stream_route(method: &'static str, pattern: &'static str, function: &'static str) -> Route {
    route_with(method, pattern, function, false, true)
}

fn route_with(
    method: &'static str,
    pattern: &'static str,
    function: &'static str,
    raw_body: bool,
    streaming: bool,
) -> Route {
    Route {
        method,
        segments: pattern
            .split('/')
            .filter(|seg| !seg.is_empty())
            .map(
                |seg| match seg.strip_prefix('{').and_then(|s| s.strip_suffix('}')) {
                    Some(name) => Segment::Param(name),
                    None => Segment::Literal(seg),
                },
            )
            .collect(),
        function,
        raw_body,
        streaming,
    }
}

/// Match a method + path against the table.  Returns the route and any path
/// parameters (raw string values).
pub fn match_route<'a>(
    method: &str,
    path: &str,
    table: &'a [Route],
) -> Option<(&'a Route, HashMap<String, String>)> {
    let segments: Vec<&str> = path.split('/').filter(|seg| !seg.is_empty()).collect();
    'routes: for r in table {
        if r.method != method || r.segments.len() != segments.len() {
            continue;
        }
        let mut params = HashMap::new();
        for (pattern, actual) in r.segments.iter().zip(segments.iter()) {
            match pattern {
                Segment::Literal(literal) => {
                    if literal != actual {
                        continue 'routes;
                    }
                }
                Segment::Param(name) => {
                    params.insert(name.to_string(), (*actual).to_string());
                }
            }
        }
        return Some((r, params));
    }
    None
}

/// Percent-decode a URL query value into a UTF-8 string (best effort).
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push((hi << 4) | lo);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            out.push(b' ');
        } else {
            out.push(bytes[i]);
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// Parse a query string into a JSON object.  Repeated keys become arrays.
pub fn parse_query(query: &str) -> serde_json::Map<String, serde_json::Value> {
    let mut map = serde_json::Map::new();
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (raw_key, raw_value) = match pair.split_once('=') {
            Some((key, value)) => (key, value),
            None => (pair, ""),
        };
        let key = percent_decode(raw_key);
        let value = serde_json::Value::String(percent_decode(raw_value));
        map.entry(key)
            .and_modify(|existing| match existing {
                serde_json::Value::Array(items) => items.push(value.clone()),
                _ => {
                    let previous = existing.take();
                    *existing = serde_json::Value::Array(vec![previous, value.clone()]);
                }
            })
            .or_insert(value);
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table() -> Vec<Route> {
        vec![
            route("GET", "/api/health", "health"),
            route("GET", "/api/system/status", "system.status"),
            route("GET", "/api/courses/{course_id}/home", "courses.home"),
            route("GET", "/api/courses/trash", "courses.trash"),
            route("PUT", "/api/settings/{key}", "settings.update"),
            route("GET", "/api/search", "search"),
            route("DELETE", "/api/documents/{document_id}", "documents.delete"),
        ]
    }

    #[test]
    fn matches_literal_route() {
        let table = table();
        let (r, params) = match_route("GET", "/api/system/status", &table).unwrap();
        assert_eq!(r.function, "system.status");
        assert!(params.is_empty());
    }

    #[test]
    fn matches_param_route() {
        let table = table();
        let (r, params) = match_route("GET", "/api/courses/7/home", &table).unwrap();
        assert_eq!(r.function, "courses.home");
        assert_eq!(params.get("course_id").map(String::as_str), Some("7"));
    }

    #[test]
    fn literal_wins_over_param_at_same_depth() {
        let table = table();
        let (r, _) = match_route("GET", "/api/courses/trash", &table).unwrap();
        assert_eq!(r.function, "courses.trash");
    }

    #[test]
    fn rejects_wrong_method() {
        let table = table();
        assert!(match_route("POST", "/api/health", &table).is_none());
        assert!(match_route("GET", "/api/settings/{key}", &table).is_none());
    }

    #[test]
    fn rejects_wrong_length() {
        let table = table();
        assert!(match_route("GET", "/api/courses", &table).is_none());
        assert!(match_route("GET", "/api/courses/7/home/extra", &table).is_none());
    }

    #[test]
    fn parses_query_values_and_arrays() {
        let q = parse_query("page=2&q=%E4%B8%AD%E6%96%87&tag=a&tag=b");
        assert_eq!(q["page"], serde_json::json!("2"));
        assert_eq!(q["q"], serde_json::json!("中文"));
        assert_eq!(q["tag"], serde_json::json!(["a", "b"]));
    }
}
