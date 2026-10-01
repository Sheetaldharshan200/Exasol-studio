//! Production safety in the backend: a read-only connection runs only
//! statements that change nothing — for every run path of the app (editor,
//! notebooks, object menus, grid edits), not only the editor's Run button.
//! The same rule as the frontend's lib/sql-classify.ts.

use crate::state::AppState;

const READ_FIRST: &[&str] = &["SELECT", "WITH", "VALUES", "DESCRIBE", "DESC", "SHOW", "EXPLAIN", "OPEN", "CLOSE", "COMMIT", "ROLLBACK", "FLUSH", "PROFILE"];

/// Comments removed, string and quoted-identifier contents blanked.
fn blind(sql: &str) -> String {
    let mut out = String::with_capacity(sql.len());
    let mut chars = sql.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '-' if chars.peek() == Some(&'-') => {
                for n in chars.by_ref() {
                    if n == '\n' {
                        break;
                    }
                }
                out.push(' ');
            }
            '/' if chars.peek() == Some(&'*') => {
                chars.next();
                let mut prev = ' ';
                for n in chars.by_ref() {
                    if prev == '*' && n == '/' {
                        break;
                    }
                    prev = n;
                }
                out.push(' ');
            }
            '\'' | '"' => {
                // Skip to the closing quote; a doubled quote is an escape.
                loop {
                    match chars.next() {
                        Some(n) if n == c => {
                            if chars.peek() == Some(&c) {
                                chars.next();
                            } else {
                                break;
                            }
                        }
                        Some(_) => {}
                        None => break,
                    }
                }
                out.push(c);
                out.push(c);
            }
            _ => out.push(c),
        }
    }
    out
}

/// Whether a statement may change data or objects.
pub fn is_write(statement: &str) -> bool {
    let b = blind(statement).to_ascii_uppercase();
    let mut words = b.split(|c: char| c.is_whitespace() || c == '(').filter(|w| !w.is_empty());
    let first = words.next().unwrap_or("");
    let second = words.next().unwrap_or("");
    let session_only = first == "ALTER" && second == "SESSION";
    let into = b.split(|c: char| !c.is_ascii_alphanumeric() && c != '_').any(|w| w == "INTO");
    !((READ_FIRST.contains(&first) || session_only) && !into)
}

/// Why a read-only connection refuses these statements, or None.
pub fn read_only_refusal<S: AsRef<str>>(statements: &[S], name: &str) -> Option<String> {
    let w = statements.iter().map(AsRef::as_ref).find(|s| is_write(s))?;
    let shown: String = w.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(90).collect();
    Some(format!("\"{name}\" is read-only. This changes data or objects: {shown}"))
}

/// Properties → Safety → Read-only connection.
pub fn read_only(state: &AppState, profile_id: &str) -> bool {
    let settings = crate::connection_settings::read_settings(state, profile_id);
    crate::connection_settings::bool_at(&settings, &["safety", "readOnly"]).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_and_writes_are_told_apart_like_the_frontend_does() {
        for s in ["SELECT 1", "with q as (select 1) select * from q", "-- note\nSELECT * FROM t", "OPEN SCHEMA s", "ALTER SESSION SET X = 1", "COMMIT", "(SELECT 1)"] {
            assert!(!is_write(s), "{s}");
        }
        for s in ["INSERT INTO t VALUES (1)", "update t set a = 1", "CREATE TABLE x (a INT)", "ALTER TABLE t ADD c INT", "EXECUTE SCRIPT s.x()", "SELECT * INTO TABLE t2 FROM t", "/* c */ DELETE FROM t", "KILL SESSION 1", "GRANT DBA TO u"] {
            assert!(is_write(s), "{s}");
        }
        assert!(!is_write("SELECT 'INSERT INTO x', \"INTO\" FROM t"), "words in strings and quoted names do not count");
        assert!(!is_write("SELECT 'it''s INTO' FROM t"), "an escaped quote stays inside the string");
    }

    #[test]
    fn the_switch_is_read_from_the_connection_settings() {
        let dir = std::env::temp_dir().join(format!("studio-safety-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let state = AppState::new(dir.clone());
        assert!(!read_only(&state, "p1"), "off unless set");
        crate::connection_settings::write_settings(&state, "p1", serde_json::json!({ "safety": { "readOnly": true } })).unwrap();
        assert!(read_only(&state, "p1"));
        assert!(!read_only(&state, "p2"), "per connection");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_refusal_names_the_first_write() {
        assert_eq!(read_only_refusal(&["SELECT 1"], "R"), None);
        let m = read_only_refusal(&["SELECT 1", "DELETE   FROM\nt"], "Reporting").unwrap();
        assert_eq!(m, "\"Reporting\" is read-only. This changes data or objects: DELETE FROM t");
    }
}
