//! Script libraries installed INTO a database: the release's SQL and Lua
//! files, run into a schema on a connection the person chose — after they
//! have reviewed every statement. The parsing is pure and tested here; the
//! database side goes through the same pool the SQL editor uses.

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

/// One statement as the review shows it: its head, and the whole body.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Statement {
    pub head: String,
    pub body: String,
}

/// What an install would run, shown for review before it does. The
/// fingerprint is over the statements; the install refuses anything else.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptPlan {
    pub version: String,
    pub files: Vec<String>,
    pub statements: Vec<Statement>,
    pub fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbObject {
    /// `SCRIPT`, `ADAPTER SCRIPT`, `FUNCTION`, `TABLE`, `VIEW` — the word `DROP` takes.
    pub kind: String,
    /// The exact identifier, as `"…"` will quote it: uppercased when the
    /// statement left it unquoted, kept as written when it quoted it.
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
/// identifier, treated the way Exasol treats an unquoted one.
pub fn valid_identifier(s: &str) -> bool {
    let mut chars = s.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
        && s.len() <= 128
}

/// An exact identifier, quoted; a quote inside is doubled, as SQL wants.
fn quoted(exact: &str) -> String {
    format!("\"{}\"", exact.replace('"', "\"\""))
}

/// The object kinds an install may create — and the only words `DROP` will
/// ever be given.
const TRACKED_KINDS: [&str; 5] = ["SCRIPT", "ADAPTER SCRIPT", "FUNCTION", "TABLE", "VIEW"];

impl DbRecord {
    /// A record is read back from a file before its names go into `DROP`
    /// statements; it is trusted no further than the identifiers it holds.
    pub fn validate(&self) -> AppResult<()> {
        let ok = valid_identifier(&self.schema)
            && self.objects.iter().all(|o| valid_identifier(&o.name) && TRACKED_KINDS.contains(&o.kind.as_str()));
        if ok {
            Ok(())
        } else {
            Err(AppError::Storage("The install record names objects Studio will not put into a statement — nothing was dropped.".into()))
        }
    }
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

/// The CREATE target of one statement: `(kind, schema qualifier if any, exact name)`.
fn create_target(statement: &str) -> Option<(String, Option<String>, String)> {
    let re = regex::Regex::new(
        r#"(?is)^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:LUA|PYTHON3?|PYTHON|JAVA|R)\s+)?(?:(?:SCALAR|SET)\s+)?(ADAPTER\s+SCRIPT|SCRIPT|FUNCTION|TABLE|VIEW)\s+("?[A-Za-z_][A-Za-z0-9_]*"?)(?:\s*\.\s*("?[A-Za-z_][A-Za-z0-9_]*"?))?"#,
    )
    .expect("a fixed pattern");
    let caps = re.captures(crate::query::strip_leading_comments(statement))?;
    let kind = caps[1].split_whitespace().collect::<Vec<_>>().join(" ").to_ascii_uppercase();
    let exact = |raw: &str| match raw.strip_prefix('"').and_then(|r| r.strip_suffix('"')) {
        Some(quoted) => quoted.to_string(),
        None => raw.to_ascii_uppercase(),
    };
    Some(match caps.get(3) {
        Some(name) => (kind, Some(exact(&caps[2])), exact(name.as_str())),
        None => (kind, None, exact(&caps[2])),
    })
}

/// The objects a list of statements creates, as `DROP` will need them.
pub fn created_objects(statements: &[String]) -> Vec<DbObject> {
    let mut seen = std::collections::HashSet::new();
    statements
        .iter()
        .filter_map(|s| create_target(s))
        .filter_map(|(kind, _, name)| seen.insert(format!("{kind} {name}")).then_some(DbObject { kind, name }))
        .collect()
}

/// Statements an install will not run: anything but `CREATE` of a tracked
/// kind. A `CREATE SCHEMA`, a `GRANT`, an `ALTER SYSTEM` or a `DROP` would
/// change the database in a way the record cannot undo.
pub fn untracked_statements(statements: &[String]) -> Vec<String> {
    statements.iter().filter(|s| create_target(s).is_none()).map(|s| headline(s)).collect()
}

/// Statements whose CREATE names a schema other than the chosen one — they
/// would put objects where removal could not follow them.
pub fn foreign_targets(statements: &[String], schema: &str) -> Vec<String> {
    let own = schema.to_ascii_uppercase();
    statements
        .iter()
        .filter_map(|s| create_target(s))
        .filter_map(|(_, qualifier, name)| qualifier.filter(|q| *q != own).map(|q| format!("{q}.{name}")))
        .collect()
}

/// A Lua adapter shipped as a file becomes one CREATE statement in the
/// schema. `row-level-security-dist-1.5.8.lua` → `ROW_LEVEL_SECURITY_ADAPTER`.
/// A file whose name does not make a plain identifier is refused.
pub fn adapter_statement(schema: &str, file: &str, lua: &str) -> AppResult<(DbObject, String)> {
    let stem = file.rsplit('/').next().unwrap_or(file).trim_end_matches(".lua");
    let base = stem.split("-dist-").next().unwrap_or(stem);
    let name = format!("{}_ADAPTER", base.replace('-', "_").to_ascii_uppercase());
    if !valid_identifier(&name) {
        return Err(AppError::Storage(format!("{file:?} does not name an adapter script Studio can create.")));
    }
    let statement = format!(
        "CREATE OR REPLACE LUA ADAPTER SCRIPT {}.{} AS\n{}",
        quoted(&schema.to_ascii_uppercase()),
        quoted(&name),
        lua.trim_end()
    );
    Ok((DbObject { kind: "ADAPTER SCRIPT".into(), name }, statement))
}

/// The first meaningful line of a statement, for the review and the log.
pub fn headline(statement: &str) -> String {
    let line = crate::query::strip_leading_comments(statement).lines().next().unwrap_or("").trim();
    let line = line.split(" AS").next().unwrap_or(line).trim();
    if line.chars().count() > 110 {
        format!("{}…", line.chars().take(110).collect::<String>())
    } else {
        line.to_string()
    }
}

/// A digest over exactly the statements that would run.
pub fn fingerprint(statements: &[String]) -> String {
    let mut hasher = Sha256::new();
    for s in statements {
        hasher.update(s.as_bytes());
        hasher.update(b"\n/\n");
    }
    format!("{:x}", hasher.finalize())
}

/// What removal runs: every object the install created, newest first so a
/// dependent object goes before what it depends on, then the schema if the
/// install created it — without CASCADE, so a schema the person has put
/// their own objects into is not emptied behind their back.
pub fn drop_statements(record: &DbRecord) -> Vec<String> {
    let schema = quoted(&record.schema);
    let mut out: Vec<String> =
        record.objects.iter().rev().map(|o| format!("DROP {} {schema}.{}", o.kind, quoted(&o.name))).collect();
    if record.created_schema {
        out.push(format!("DROP SCHEMA {schema}"));
    }
    out
}

/// The statements that would run, in order: `OPEN SCHEMA`, every script file's
/// statements, every Lua file as an adapter script — and the objects they
/// create. Refused when a statement names another schema.
pub fn statements_for(schema: &str, files: &[(String, String)]) -> AppResult<(Vec<String>, Vec<DbObject>)> {
    let mut statements = vec![format!("OPEN SCHEMA {}", quoted(&schema.to_ascii_uppercase()))];
    let mut objects = Vec::new();
    for (name, content) in files {
        if name.ends_with(".lua") {
            let (object, statement) = adapter_statement(schema, name, content)?;
            statements.push(statement);
            objects.push(object);
        } else {
            let split = split_bundle(content);
            let untracked = untracked_statements(&split);
            if !untracked.is_empty() {
                return Err(AppError::Storage(format!(
                    "{name} holds statements Studio will not run into your database (only CREATE of scripts, functions, tables and views is): {}",
                    untracked.join("; ")
                )));
            }
            let foreign = foreign_targets(&split, schema);
            if !foreign.is_empty() {
                return Err(AppError::Storage(format!(
                    "{name} creates objects outside {}: {} — Studio installs only into the schema you chose.",
                    schema.to_ascii_uppercase(),
                    foreign.join(", ")
                )));
            }
            objects.extend(created_objects(&split));
            statements.extend(split);
        }
    }
    Ok((statements, objects))
}

/// The release's script files, downloaded and verified against the digest
/// their publisher provides: `(file name, content)`. A script that will run
/// inside a database is never taken on trust — no digest, no install.
async fn fetch_files(app: &AppHandle, id: &str, repo: &str, requested: Option<&str>) -> AppResult<(String, Vec<(String, String)>)> {
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
        .filter(|a| (a.name.ends_with(".sql") || a.name.ends_with(".lua")) && crate::installers::safe_file_name(&a.name))
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
        let Some(expected) = asset.digest.as_deref().and_then(|d| d.strip_prefix("sha256:")).or(sibling.as_deref()) else {
            let _ = std::fs::remove_file(&path);
            return Err(AppError::Storage(format!(
                "{repo} publishes no checksum for {}. A script that runs inside your database must be verifiable, so it is not installed.",
                asset.name
            )));
        };
        let actual = crate::local_runtime::sha256_file(std::path::Path::new(&path))?;
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = std::fs::remove_file(&path);
            return Err(AppError::Storage(format!("{} failed checksum verification — discarded.", asset.name)));
        }
        files.push((asset.name.clone(), std::fs::read_to_string(&path)?));
    }
    Ok((release.tag, files))
}

fn check_schema(schema: &str) -> AppResult<()> {
    if valid_identifier(schema) {
        Ok(())
    } else {
        Err(AppError::Storage(format!("{schema:?} is not a schema name Studio will put into a statement.")))
    }
}

/// What would run — for review. Downloads and verifies the files; runs nothing.
pub async fn plan(app: &AppHandle, id: &str, repo: &str, requested: Option<&str>, schema: &str) -> AppResult<ScriptPlan> {
    check_schema(schema)?;
    let (version, files) = fetch_files(app, id, repo, requested).await?;
    let (statements, _) = statements_for(schema, &files)?;
    Ok(ScriptPlan {
        version,
        files: files.into_iter().map(|(n, _)| n).collect(),
        fingerprint: fingerprint(&statements),
        statements: statements.iter().map(|s| Statement { head: headline(s), body: s.clone() }).collect(),
    })
}

/// What a script library's install would run into `schema` — downloaded and
/// verified, shown for review, run by nothing here.
#[tauri::command]
pub async fn market_db_scripts_plan(
    app: AppHandle,
    id: String,
    repo: String,
    requested: Option<String>,
    schema: String,
) -> AppResult<ScriptPlan> {
    if !crate::installers::valid_item_id(&id) {
        return Err(AppError::Storage(format!("{id:?} is not a marketplace item id.")));
    }
    let requested = requested.filter(|v| crate::market::valid_version_tag(v));
    plan(&app, &id, &repo, requested.as_deref(), &schema).await
}

/// Run the release's scripts into `schema` on the chosen connection — the
/// exact statements the review showed (`expected` is their fingerprint).
/// Returns the version installed, the record removal needs, and a note.
pub async fn install(
    app: &AppHandle,
    id: &str,
    repo: &str,
    requested: Option<&str>,
    profile_id: &str,
    schema: &str,
    expected: Option<&str>,
) -> AppResult<(String, DbRecord, String)> {
    check_schema(schema)?;
    let state = app.state::<crate::state::AppState>();
    let profile = crate::profiles::find_profile(&state, profile_id)?;
    let (version, files) = fetch_files(app, id, repo, requested).await?;
    let (statements, objects) = statements_for(schema, &files)?;
    let actual = fingerprint(&statements);
    if expected.is_some_and(|e| !e.eq_ignore_ascii_case(&actual)) {
        return Err(AppError::Storage("The release's scripts changed since you reviewed them. Review again before installing.".into()));
    }
    let upper = schema.to_ascii_uppercase();
    crate::market::emit_log(app, id, format!("Connecting to {}…", profile.name), "info");
    crate::connection::connect(app.state(), profile_id.to_string()).await?;
    let pool = crate::connection::require_pool(&state, profile_id).await?;
    let existing =
        crate::query::fetch_all_rows(&pool, &format!("SELECT SCHEMA_NAME FROM SYS.EXA_SCHEMAS WHERE SCHEMA_NAME = '{upper}'")).await?;
    let created_schema = existing.is_empty();
    if !created_schema && !objects.is_empty() {
        // CREATE OR REPLACE would silently take over an object the person
        // already has there — and removal would later drop it as ours.
        let names = objects.iter().map(|o| format!("'{}'", o.name)).collect::<Vec<_>>().join(", ");
        let taken = crate::query::fetch_all_rows(
            &pool,
            &format!("SELECT OBJECT_NAME FROM SYS.EXA_ALL_OBJECTS WHERE ROOT_NAME = '{upper}' AND OBJECT_NAME IN ({names})"),
        )
        .await?;
        if !taken.is_empty() {
            let list = taken.iter().filter_map(|r| r.first()?.as_str()).collect::<Vec<_>>().join(", ");
            return Err(AppError::Storage(format!(
                "Schema {upper} already holds {list}. Pick another schema, or remove those objects first — Studio does not replace what it did not create."
            )));
        }
    }
    let mut conn = pool.acquire().await.map_err(|e| AppError::Storage(e.to_string()))?;
    let record = DbRecord {
        connection: Connection { id: profile.id.clone(), name: profile.name.clone() },
        schema: upper.clone(),
        created_schema,
        objects: Vec::new(),
    };
    if created_schema {
        crate::market::emit_log(app, id, format!("Creating schema {upper}…"), "info");
        run(&mut conn, &format!("CREATE SCHEMA {}", quoted(&upper))).await?;
    }
    // Every statement that ran is recorded as it runs, so a failure midway
    // rolls back exactly what got in, and nothing is left that Studio could
    // not name.
    let mut done = record.clone();
    for statement in &statements {
        crate::market::emit_log(app, id, headline(statement), "cmd");
        if let Err(error) = run(&mut conn, statement).await {
            let undo = drop_statements(&done);
            let mut left = Vec::new();
            for stmt in &undo {
                if run(&mut conn, stmt).await.is_err() {
                    left.push(stmt.clone());
                }
            }
            return Err(AppError::Storage(if left.is_empty() {
                format!(
                    "{error} Rolled back the {} statement(s) that had run{}.",
                    undo.len(),
                    if created_schema { " and the new schema" } else { "" }
                )
            } else {
                format!("{error} Rollback could not undo: {}. Remove these by hand.", left.join("; "))
            }));
        }
        if let Some(object) = created_objects(std::slice::from_ref(statement)).pop() {
            if !done.objects.contains(&object) {
                done.objects.push(object);
            }
        }
    }
    let note = format!("Installed in {} — {} object(s) in schema {upper}.", profile.name, done.objects.len());
    Ok((version, done, note))
}

/// Undo an install: drop what it created, on the connection it used.
pub async fn uninstall(app: &AppHandle, record: &DbRecord) -> AppResult<()> {
    record.validate()?;
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
    fn created_objects_are_read_from_the_statement_heads_with_exact_names() {
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
            "CREATE OR REPLACE LUA ADAPTER SCRIPT \"EXA_RLS\".\"MyAdapter\" AS x".into(),
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
    fn a_statement_naming_another_schema_is_refused() {
        let stmts = vec![
            "CREATE OR REPLACE SCRIPT \"EXA_RLS\".X AS y".to_string(),
            "CREATE TABLE OTHER.T(a INT)".to_string(),
            "CREATE VIEW exa_rls.v AS SELECT 1".to_string(),
        ];
        assert_eq!(foreign_targets(&stmts, "exa_rls"), vec!["OTHER.T"]);
        let files = vec![("s.sql".to_string(), "CREATE TABLE OTHER.T(a INT);".to_string())];
        assert!(statements_for("EXA_RLS", &files).unwrap_err().to_string().contains("OTHER.T"));
    }

    #[test]
    fn a_lua_file_becomes_one_adapter_script_named_after_it_or_is_refused() {
        let (object, statement) = adapter_statement("exa_rls", "row-level-security-dist-1.5.8.lua", "local x = 1\n\n").unwrap();
        assert_eq!(object, DbObject { kind: "ADAPTER SCRIPT".into(), name: "ROW_LEVEL_SECURITY_ADAPTER".into() });
        assert_eq!(statement, "CREATE OR REPLACE LUA ADAPTER SCRIPT \"EXA_RLS\".\"ROW_LEVEL_SECURITY_ADAPTER\" AS\nlocal x = 1");
        assert!(adapter_statement("s", "x\"; DROP SCHEMA S; --.lua", "").is_err(), "a name that is not an identifier never reaches SQL");
        assert!(adapter_statement("s", "9lives.lua", "").is_err());
    }

    #[test]
    fn removal_drops_newest_first_exactly_what_was_created_and_the_schema_only_if_created() {
        let record = DbRecord {
            connection: Connection { id: "p1".into(), name: "Prod".into() },
            schema: "EXA_RLS".into(),
            created_schema: true,
            objects: vec![
                DbObject { kind: "SCRIPT".into(), name: "EXA_RLS_BASE".into() },
                DbObject { kind: "ADAPTER SCRIPT".into(), name: "MyAdapter".into() },
            ],
        };
        assert_eq!(
            drop_statements(&record),
            vec![
                "DROP ADAPTER SCRIPT \"EXA_RLS\".\"MyAdapter\"",
                "DROP SCRIPT \"EXA_RLS\".\"EXA_RLS_BASE\"",
                "DROP SCHEMA \"EXA_RLS\"",
            ],
            "reverse order, exact quoting"
        );
        let found = DbRecord { created_schema: false, ..record };
        assert!(!drop_statements(&found).iter().any(|s| s.starts_with("DROP SCHEMA")), "a schema that existed before stays");
        assert!(!drop_statements(&found).iter().any(|s| s.contains("CASCADE")));
    }

    #[test]
    fn statements_open_the_schema_first_headlines_are_short_and_the_fingerprint_follows_the_text() {
        let files = vec![("administration-sql-scripts-1.5.8.sql".to_string(), BUNDLE.to_string()), ("row-level-security-dist-1.5.8.lua".to_string(), "x".to_string())];
        let (statements, objects) = statements_for("exa_rls", &files).unwrap();
        assert_eq!(statements[0], "OPEN SCHEMA \"EXA_RLS\"");
        assert_eq!(statements.len(), 5);
        assert_eq!(objects.len(), 4);
        assert_eq!(headline(&statements[1]), "CREATE OR REPLACE SCRIPT EXA_RLS_BASE");
        assert_eq!(headline(&statements[4]), "CREATE OR REPLACE LUA ADAPTER SCRIPT \"EXA_RLS\".\"ROW_LEVEL_SECURITY_ADAPTER\"");
        assert!(headline(&format!("SELECT {}", "x".repeat(300))).ends_with('…'));
        let fp = fingerprint(&statements);
        assert_eq!(fp.len(), 64);
        assert_eq!(fp, fingerprint(&statements), "stable");
        let mut changed = statements.clone();
        changed[1].push_str(" -- tampered");
        assert_ne!(fp, fingerprint(&changed), "any change to any statement changes it");
    }

    #[test]
    fn only_tracked_creates_run_and_a_record_is_validated_before_it_drops_anything() {
        let stmts: Vec<String> = ["CREATE SCHEMA OTHER", "GRANT SELECT ON T TO PUBLIC", "ALTER SYSTEM SET X = 1", "DROP TABLE T", "CREATE OR REPLACE SCRIPT S AS x"]
            .iter().map(|s| s.to_string()).collect();
        assert_eq!(untracked_statements(&stmts), vec!["CREATE SCHEMA OTHER", "GRANT SELECT ON T TO PUBLIC", "ALTER SYSTEM SET X = 1", "DROP TABLE T"]);
        let files = vec![("s.sql".to_string(), "CREATE SCHEMA OTHER;\nCREATE TABLE T(a INT);".to_string())];
        assert!(statements_for("EXA_RLS", &files).unwrap_err().to_string().contains("CREATE SCHEMA OTHER"));

        let good = DbRecord { connection: Connection { id: "p".into(), name: "P".into() }, schema: "EXA_RLS".into(), created_schema: false, objects: vec![DbObject { kind: "SCRIPT".into(), name: "A".into() }] };
        assert!(good.validate().is_ok());
        let bad_schema = DbRecord { schema: "X\"; DROP SCHEMA Y; --".into(), ..good.clone() };
        assert!(bad_schema.validate().is_err());
        let bad_kind = DbRecord { objects: vec![DbObject { kind: "SCHEMA".into(), name: "A".into() }], ..good.clone() };
        assert!(bad_kind.validate().is_err());
        let bad_name = DbRecord { objects: vec![DbObject { kind: "TABLE".into(), name: "a.b".into() }], ..good };
        assert!(bad_name.validate().is_err());
        assert_eq!(quoted("a\"b"), "\"a\"\"b\"", "a quote inside an identifier is doubled");
    }

    #[test]
    fn identifiers_are_one_plain_name() {
        assert!(valid_identifier("EXA_RLS") && valid_identifier("_x9"));
        assert!(!valid_identifier("") && !valid_identifier("9x") && !valid_identifier("a.b") && !valid_identifier("a\"b") && !valid_identifier("a b"));
    }
}
