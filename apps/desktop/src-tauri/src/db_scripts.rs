//! Script libraries installed INTO a database: the release's SQL and Lua
//! files, run into a schema on a connection the person chose — after they
//! have seen every statement. The parsing is pure and tested here; the
//! database side goes through the same pool the SQL editor uses.

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// What an install would run, shown on the permission screen before it does.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptPlan {
    pub version: String,
    pub files: Vec<String>,
    /// One line per statement: its head, not its body.
    pub statements: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbObject {
    /// `SCRIPT`, `ADAPTER SCRIPT`, `FUNCTION`, `TABLE`, `VIEW` — the word `DROP` takes.
    pub kind: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub id: String,
    pub name: String,
}

/// What an install did, recorded so removal undoes exactly that and nothing else.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbRecord {
    pub connection: Connection,
    pub schema: String,
    /// Whether the install created the schema (then removal drops it — only
    /// if it is empty by then) or found it (then the schema stays).
    pub created_schema: bool,
    pub objects: Vec<DbObject>,
}

/// A schema or object name Studio will put into a statement: one plain
/// identifier, uppercased the way Exasol treats an unquoted one.
pub fn valid_identifier(s: &str) -> bool {
    let mut chars = s.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
        && s.len() <= 128
}

fn quoted(s: &str) -> String {
    format!("\"{}\"", s.to_ascii_uppercase())
}

/// Split a bundle of scripts into statements. Exasol's convention for such a
/// file: a script body ends with a line holding only `/` and is one statement
/// whatever it contains; a line holding only `;` is filler between them; text
/// that ends without a `/` is ordinary SQL, split on `;`.
pub fn split_bundle(sql: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut chunk = String::new();
    for line in sql.lines() {
        if line.trim() == "/" {
            let script = filler_free(&chunk);
            if !script.is_empty() {
                out.push(script);
            }
            chunk.clear();
            continue;
        }
        chunk.push_str(line);
        chunk.push('\n');
    }
    let rest = filler_free(&chunk);
    if !rest.is_empty() {
        out.extend(
            crate::query::split_statements(&rest)
                .into_iter()
                .filter(|s| !crate::query::strip_leading_comments(s).trim().is_empty()),
        );
    }
    out
}

/// A chunk without its `;`-only filler lines, trimmed; empty when it holds
/// nothing but filler and comments.
fn filler_free(chunk: &str) -> String {
    let text: String = chunk.lines().filter(|l| l.trim() != ";").map(|l| format!("{l}\n")).collect();
    let text = text.trim();
    if crate::query::strip_leading_comments(text).trim().is_empty() {
        String::new()
    } else {
        text.to_string()
    }
}

/// The objects a list of statements creates, as `DROP` will need them.
pub fn created_objects(statements: &[String]) -> Vec<DbObject> {
    let re = regex::Regex::new(
        r#"(?is)^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:LUA|PYTHON3?|PYTHON|JAVA|R)\s+)?(?:(?:SCALAR|SET)\s+)?(ADAPTER\s+SCRIPT|SCRIPT|FUNCTION|TABLE|VIEW)\s+("?[A-Za-z_][A-Za-z0-9_]*"?(?:\s*\.\s*"?[A-Za-z_][A-Za-z0-9_]*"?)?)"#,
    )
    .expect("a fixed pattern");
    let mut seen = std::collections::HashSet::new();
    statements
        .iter()
        .filter_map(|s| {
            let head = crate::query::strip_leading_comments(s);
            let caps = re.captures(head)?;
            let kind = caps[1].split_whitespace().collect::<Vec<_>>().join(" ").to_ascii_uppercase();
            let raw = caps[2].rsplit('.').next().unwrap_or("").trim();
            let name = match raw.strip_prefix('"').and_then(|r| r.strip_suffix('"')) {
                Some(exact) => exact.to_string(),
                None => raw.to_ascii_uppercase(),
            };
            seen.insert(format!("{kind} {name}")).then_some(DbObject { kind, name })
        })
        .collect()
}

/// A Lua adapter shipped as a file becomes one CREATE statement in the
/// schema. `row-level-security-dist-1.5.8.lua` → `ROW_LEVEL_SECURITY_ADAPTER`.
pub fn adapter_statement(schema: &str, file: &str, lua: &str) -> (DbObject, String) {
    let stem = file.rsplit('/').next().unwrap_or(file).trim_end_matches(".lua");
    let base = stem.split("-dist-").next().unwrap_or(stem);
    let name = format!("{}_ADAPTER", base.replace('-', "_").to_ascii_uppercase());
    let statement = format!("CREATE OR REPLACE LUA ADAPTER SCRIPT {}.{} AS\n{}", quoted(schema), quoted(&name), lua.trim_end());
    (DbObject { kind: "ADAPTER SCRIPT".into(), name }, statement)
}

/// The first meaningful line of a statement, for the permission screen.
pub fn headline(statement: &str) -> String {
    let line = crate::query::strip_leading_comments(statement).lines().next().unwrap_or("").trim();
    let line = line.split(" AS").next().unwrap_or(line).trim();
    if line.chars().count() > 110 {
        format!("{}…", line.chars().take(110).collect::<String>())
    } else {
        line.to_string()
    }
}

/// What removal runs: every object the install created, then the schema if
/// the install created it — without CASCADE, so a schema the person has put
/// their own objects into is not emptied behind their back.
pub fn drop_statements(record: &DbRecord) -> Vec<String> {
    let mut out: Vec<String> =
        record.objects.iter().map(|o| format!("DROP {} {}.{}", o.kind, quoted(&record.schema), quoted(&o.name))).collect();
    if record.created_schema {
        out.push(format!("DROP SCHEMA {}", quoted(&record.schema)));
    }
    out
}

/// The statements that would run, in order: `OPEN SCHEMA`, every script file's
/// statements, every Lua file as an adapter script. Also the objects they create.
pub fn statements_for(schema: &str, files: &[(String, String)]) -> (Vec<String>, Vec<DbObject>) {
    let mut statements = vec![format!("OPEN SCHEMA {}", quoted(schema))];
    let mut objects = Vec::new();
    for (name, content) in files {
        if name.ends_with(".lua") {
            let (object, statement) = adapter_statement(schema, name, content);
            statements.push(statement);
            objects.push(object);
        } else {
            let split = split_bundle(content);
            objects.extend(created_objects(&split));
            statements.extend(split);
        }
    }
    (statements, objects)
}

/// The release's script files, downloaded and verified: `(file name, content)`.
async fn fetch_files(
    app: &AppHandle,
    id: &str,
    repo: &str,
    requested: Option<&str>,
) -> AppResult<(String, Vec<(String, String)>)> {
    let repo_owned = repo.to_string();
    let tag = requested.map(str::to_string);
    let release = tauri::async_runtime::spawn_blocking(move || match tag {
        Some(t) => crate::upstream::by_tag(&repo_owned, &t)
            .ok_or_else(|| AppError::Storage(format!("Release {t} of {repo_owned} could not be read."))),
        None => crate::upstream::latest_detailed(&repo_owned)
            .map_err(|e| AppError::Storage(format!("Could not read the latest release of {repo_owned}. {e}"))),
    })
    .await
    .map_err(|e| AppError::Storage(e.to_string()))??;
    let scripts: Vec<_> = release
        .assets
        .iter()
        .filter(|a| (a.name.ends_with(".sql") || a.name.ends_with(".lua")) && !a.name.ends_with(".sha256"))
        .collect();
    if scripts.is_empty() {
        return Err(AppError::Storage(format!("Release {} of {repo} ships no .sql or .lua file to run.", release.tag)));
    }
    let mut files = Vec::new();
    for asset in scripts {
        let path = crate::market::download_only(app, id, &asset.url, &asset.name).await?;
        let sibling = match &asset.digest {
            Some(_) => None,
            None => {
                let url = asset.url.clone();
                tauri::async_runtime::spawn_blocking(move || crate::upstream::sha256_sibling(&url)).await.ok().flatten()
            }
        };
        let declared = asset.digest.as_deref().and_then(|d| d.strip_prefix("sha256:")).or(sibling.as_deref());
        if let Some(expected) = declared {
            let actual = crate::local_runtime::sha256_file(std::path::Path::new(&path))?;
            if !actual.eq_ignore_ascii_case(expected) {
                let _ = std::fs::remove_file(&path);
                return Err(AppError::Storage(format!("{} failed checksum verification — discarded.", asset.name)));
            }
        } else {
            crate::market::emit_log(app, id, format!("No checksum is published for {}; it runs as downloaded.", asset.name), "info");
        }
        let content = std::fs::read_to_string(&path)?;
        files.push((asset.name.clone(), content));
    }
    Ok((release.tag, files))
}

/// What would run — for the permission screen. Downloads and verifies the
/// files; runs nothing.
pub async fn plan(app: &AppHandle, id: &str, repo: &str, requested: Option<&str>, schema: &str) -> AppResult<ScriptPlan> {
    if !valid_identifier(schema) {
        return Err(AppError::Storage(format!("{schema:?} is not a schema name Studio will put into a statement.")));
    }
    let (version, files) = fetch_files(app, id, repo, requested).await?;
    let (statements, _) = statements_for(schema, &files);
    Ok(ScriptPlan {
        version,
        files: files.into_iter().map(|(n, _)| n).collect(),
        statements: statements.iter().map(|s| headline(s)).collect(),
    })
}

/// Run the release's scripts into `schema` on the chosen connection. Returns
/// the version installed, the record removal needs, and a note for the card.
pub async fn install(
    app: &AppHandle,
    id: &str,
    repo: &str,
    requested: Option<&str>,
    profile_id: &str,
    schema: &str,
) -> AppResult<(String, DbRecord, String)> {
    if !valid_identifier(schema) {
        return Err(AppError::Storage(format!("{schema:?} is not a schema name Studio will put into a statement.")));
    }
    let state = app.state::<crate::state::AppState>();
    let profile = crate::profiles::find_profile(&state, profile_id)?;
    let (version, files) = fetch_files(app, id, repo, requested).await?;
    let (statements, objects) = statements_for(schema, &files);
    crate::market::emit_log(app, id, format!("Connecting to {}…", profile.name), "info");
    crate::connection::connect(app.state(), profile_id.to_string()).await?;
    let pool = crate::connection::require_pool(&state, profile_id).await?;
    let upper = schema.to_ascii_uppercase();
    let existing = crate::query::fetch_all_rows(&pool, &format!("SELECT SCHEMA_NAME FROM EXA_SCHEMAS WHERE SCHEMA_NAME = '{upper}'")).await?;
    let created_schema = existing.is_empty();
    let mut conn = pool.acquire().await.map_err(|e| AppError::Storage(e.to_string()))?;
    if created_schema {
        crate::market::emit_log(app, id, format!("Creating schema {upper}…"), "info");
        run(&mut conn, &format!("CREATE SCHEMA {}", quoted(schema))).await?;
    }
    for statement in &statements {
        crate::market::emit_log(app, id, headline(statement), "cmd");
        run(&mut conn, statement).await?;
    }
    let record = DbRecord {
        connection: Connection { id: profile.id.clone(), name: profile.name.clone() },
        schema: upper.clone(),
        created_schema,
        objects,
    };
    let note = format!("Installed in {} — {} object(s) in schema {upper}.", profile.name, record.objects.len());
    Ok((version, record, note))
}

/// Undo an install: drop what it created, on the connection it used.
pub async fn uninstall(app: &AppHandle, record: &DbRecord) -> AppResult<()> {
    let state = app.state::<crate::state::AppState>();
    crate::connection::connect(app.state(), record.connection.id.clone()).await?;
    let pool = crate::connection::require_pool(&state, &record.connection.id).await?;
    let mut conn = pool.acquire().await.map_err(|e| AppError::Storage(e.to_string()))?;
    for statement in drop_statements(record) {
        run(&mut conn, &statement).await?;
    }
    Ok(())
}

async fn run(conn: &mut sqlx_exasol::ExaConnection, statement: &str) -> AppResult<()> {
    sqlx_exasol::query(sqlx_exasol::AssertSqlSafe(statement.to_string()))
        .execute(&mut *conn)
        .await
        .map(|_| ())
        .map_err(|e| AppError::Storage(format!("{} failed: {e}", headline(statement))))
}

#[cfg(test)]
mod tests {
    use super::*;

    const BUNDLE: &str = "-- Row Level Security administration script bundle\n--\n-- Script source 'exa_rls_base.lua'\nCREATE OR REPLACE SCRIPT EXA_RLS_BASE AS\nlocal M = {}\nfunction M.check(x) return x; end\nreturn M\n/\n;\n\n-- Script source 'add_rls_role.lua'\nCREATE OR REPLACE SCRIPT ADD_RLS_ROLE(role_name, role_id) AS\nimport(exa.meta.script_schema .. '.EXA_RLS_BASE', 'base')\n/\n;\nCREATE OR REPLACE LUA SCALAR SCRIPT BIT_POSITIONS(num DOUBLE) EMITS(pos DOUBLE) AS\nfunction run(ctx) end\n/\n;\n";

    #[test]
    fn a_slash_terminated_bundle_splits_into_whole_scripts_without_filler() {
        let parts = split_bundle(BUNDLE);
        assert_eq!(parts.len(), 3, "{parts:#?}");
        assert!(parts[0].starts_with("-- Row Level Security"));
        assert!(parts[0].ends_with("return M"), "the body is kept whole: {:?}", parts[0]);
        assert!(parts[1].contains("import(exa.meta.script_schema"));
        assert!(!parts.iter().any(|p| p.trim() == ";"), "filler lines never become statements");
    }

    #[test]
    fn ordinary_sql_after_the_scripts_is_split_on_semicolons_and_comments_are_dropped() {
        let parts = split_bundle("CREATE TABLE T(a INT);\n-- trailing note\nINSERT INTO T VALUES (1);\n-- only a comment\n");
        assert_eq!(parts.len(), 2, "{parts:#?}");
        assert!(parts[0].starts_with("CREATE TABLE T"));
    }

    #[test]
    fn created_objects_are_read_from_the_statement_heads() {
        let objects = created_objects(&split_bundle(BUNDLE));
        assert_eq!(
            objects,
            vec![
                DbObject { kind: "SCRIPT".into(), name: "EXA_RLS_BASE".into() },
                DbObject { kind: "SCRIPT".into(), name: "ADD_RLS_ROLE".into() },
                DbObject { kind: "SCRIPT".into(), name: "BIT_POSITIONS".into() },
            ]
        );
        let more = created_objects(&[
            "CREATE OR REPLACE LUA ADAPTER SCRIPT \"Rls\".\"MyAdapter\" AS x".into(),
            "create view v_all as select 1".into(),
            "CREATE OR REPLACE FUNCTION PUBLIC_ROLE_MASK() RETURN DECIMAL(20,0) IS BEGIN RETURN 1; END".into(),
            "SELECT 1".into(),
            "CREATE OR REPLACE FUNCTION PUBLIC_ROLE_MASK() RETURN DECIMAL(20,0) IS BEGIN RETURN 2; END".into(),
        ]);
        assert_eq!(
            more,
            vec![
                DbObject { kind: "ADAPTER SCRIPT".into(), name: "MyAdapter".into() },
                DbObject { kind: "VIEW".into(), name: "V_ALL".into() },
                DbObject { kind: "FUNCTION".into(), name: "PUBLIC_ROLE_MASK".into() },
            ],
            "quoted names keep their case, unquoted ones are uppercased, duplicates collapse"
        );
    }

    #[test]
    fn a_lua_file_becomes_one_adapter_script_named_after_it() {
        let (object, statement) = adapter_statement("exa_rls", "row-level-security-dist-1.5.8.lua", "local x = 1\n\n");
        assert_eq!(object, DbObject { kind: "ADAPTER SCRIPT".into(), name: "ROW_LEVEL_SECURITY_ADAPTER".into() });
        assert_eq!(statement, "CREATE OR REPLACE LUA ADAPTER SCRIPT \"EXA_RLS\".\"ROW_LEVEL_SECURITY_ADAPTER\" AS\nlocal x = 1");
    }

    #[test]
    fn removal_drops_exactly_what_was_created_and_the_schema_only_if_it_was_created() {
        let record = DbRecord {
            connection: Connection { id: "p1".into(), name: "Prod".into() },
            schema: "EXA_RLS".into(),
            created_schema: true,
            objects: vec![
                DbObject { kind: "SCRIPT".into(), name: "EXA_RLS_BASE".into() },
                DbObject { kind: "ADAPTER SCRIPT".into(), name: "ROW_LEVEL_SECURITY_ADAPTER".into() },
            ],
        };
        assert_eq!(
            drop_statements(&record),
            vec![
                "DROP SCRIPT \"EXA_RLS\".\"EXA_RLS_BASE\"",
                "DROP ADAPTER SCRIPT \"EXA_RLS\".\"ROW_LEVEL_SECURITY_ADAPTER\"",
                "DROP SCHEMA \"EXA_RLS\"",
            ]
        );
        let found = DbRecord { created_schema: false, ..record };
        assert!(!drop_statements(&found).iter().any(|s| s.starts_with("DROP SCHEMA")), "a schema that existed before stays");
        assert!(!drop_statements(&found).iter().any(|s| s.contains("CASCADE")));
    }

    #[test]
    fn statements_open_the_schema_first_and_headlines_are_short() {
        let files = vec![("administration-sql-scripts-1.5.8.sql".to_string(), BUNDLE.to_string()), ("row-level-security-dist-1.5.8.lua".to_string(), "x".to_string())];
        let (statements, objects) = statements_for("exa_rls", &files);
        assert_eq!(statements[0], "OPEN SCHEMA \"EXA_RLS\"");
        assert_eq!(statements.len(), 5);
        assert_eq!(objects.len(), 4);
        assert_eq!(headline(&statements[1]), "CREATE OR REPLACE SCRIPT EXA_RLS_BASE");
        assert_eq!(headline(&statements[4]), "CREATE OR REPLACE LUA ADAPTER SCRIPT \"EXA_RLS\".\"ROW_LEVEL_SECURITY_ADAPTER\"");
        assert!(headline(&format!("SELECT {}", "x".repeat(300))).ends_with('…'));
    }

    #[test]
    fn identifiers_are_one_plain_name() {
        assert!(valid_identifier("EXA_RLS") && valid_identifier("_x9"));
        assert!(!valid_identifier("") && !valid_identifier("9x") && !valid_identifier("a.b") && !valid_identifier("a\"b") && !valid_identifier("a b"));
    }
}
