//! The `exarrow-rs` driver, running **in-process**.
//!
//! Unlike the bridge drivers (PyExasol, JDBC, ODBC, TS) this one needs no
//! runtime to install and no child process: `exarrow-rs` is a Rust crate
//! compiled into Studio, so picking it is a zero-install choice like the
//! native `sqlx-exasol` path.
//!
//! What it is *for*: exarrow speaks Exasol's protocol but materialises results
//! as Apache Arrow `RecordBatch`es — the columnar format the analytics world
//! (DuckDB, Polars, pandas, ADBC) reads natively. Running a query through it
//! is how you see what an Arrow/ADBC client will actually get back.
//!
//! **Known limitation, deliberately not hidden:** exarrow 0.16 exposes no
//! public async pagination — `ResultSet::fetch_all` is the only way to read a
//! streamed result, so the *whole* result set is materialised in memory before
//! Studio truncates it to `max_rows`. The native driver streams and stops at
//! the limit, so it stays the default for browsing large tables.

use arrow::array::{Array, ArrayRef, AsArray};
use arrow::datatypes::{
    DataType, Date32Type, Decimal128Type, Float32Type, Float64Type, Int16Type, Int32Type,
    Int64Type, Int8Type, Schema, TimeUnit, TimestampMicrosecondType, TimestampMillisecondType,
    TimestampNanosecondType, TimestampSecondType, UInt16Type, UInt32Type, UInt64Type, UInt8Type,
};
use arrow::record_batch::RecordBatch;
use serde_json::{json, Value};
use std::time::{Duration, Instant};

use exarrow_rs::adbc::Database;
use exarrow_rs::connection::{ConnectionBuilder, ConnectionParams};

use crate::error::{AppError, AppResult};
use crate::profiles::ConnectionProfile;
use crate::query::{ColumnMeta, ExecuteResponse, StatementResult};

/// Timestamps render exactly like the native driver's, so the same value never
/// looks different depending on which driver fetched it.
const TIMESTAMP_FORMAT: &str = "%Y-%m-%d %H:%M:%S%.3f";

/// The driver id this module answers for.
pub fn is_exarrow(driver_id: &str) -> bool {
    driver_id == "exarrow-rs"
}

/// rustls resolves a *process-level* crypto provider for `ClientConfig::builder()`.
/// Studio now links two of them — `ring` (sqlx) and `aws-lc-rs` (pulled in by
/// exarrow) — and with two compiled in that automatic lookup panics instead of
/// choosing. exarrow uses the automatic form, so a default must be installed
/// once, at startup, before any TLS handshake.
///
/// **ring** is the one installed, deliberately: sqlx names ring explicitly, and
/// reqwest consults the process default before falling back to ring — so
/// choosing ring here leaves every existing TLS path byte-for-byte as it was,
/// and only exarrow's own connections are newly resolved (to ring).
pub fn install_crypto_provider() {
    // Err means someone already installed one — that is the desired end state.
    let _ = rustls::crypto::ring::default_provider().install_default();
}

// ── Pure conversion core (no database, no I/O — this is what the tests cover) ──

/// A readable Exasol-flavoured name for an Arrow type, for the grid header.
pub(crate) fn arrow_type_name(dt: &DataType) -> String {
    match dt {
        DataType::Boolean => "BOOLEAN".into(),
        DataType::Int8 | DataType::Int16 | DataType::Int32 | DataType::Int64 => "DECIMAL".into(),
        DataType::UInt8 | DataType::UInt16 | DataType::UInt32 | DataType::UInt64 => {
            "DECIMAL".into()
        }
        DataType::Float16 | DataType::Float32 | DataType::Float64 => "DOUBLE".into(),
        DataType::Decimal128(p, s) | DataType::Decimal256(p, s) => format!("DECIMAL({p},{s})"),
        DataType::Utf8 | DataType::LargeUtf8 | DataType::Utf8View => "VARCHAR".into(),
        DataType::Date32 | DataType::Date64 => "DATE".into(),
        DataType::Timestamp(_, Some(_)) => "TIMESTAMP WITH LOCAL TIME ZONE".into(),
        DataType::Timestamp(_, None) => "TIMESTAMP".into(),
        DataType::Interval(_) => "INTERVAL".into(),
        DataType::Binary | DataType::LargeBinary | DataType::BinaryView => "BINARY".into(),
        other => other.to_string(),
    }
}

pub(crate) fn columns_of(schema: &Schema) -> Vec<ColumnMeta> {
    schema
        .fields()
        .iter()
        .map(|f| ColumnMeta {
            name: f.name().to_string(),
            type_name: arrow_type_name(f.data_type()),
        })
        .collect()
}

/// One Arrow cell as JSON, rendered the way the native driver renders it:
/// numbers stay numbers, exact decimals become strings (no float rounding),
/// dates and timestamps become formatted strings.
///
/// NULL is decided from the array's validity bitmap FIRST, so an absent value
/// is never confused with "no branch matched".
pub(crate) fn cell(array: &ArrayRef, row: usize) -> Value {
    if row >= array.len() || array.is_null(row) {
        return Value::Null;
    }
    match array.data_type() {
        DataType::Boolean => Value::from(array.as_boolean().value(row)),
        DataType::Int8 => Value::from(array.as_primitive::<Int8Type>().value(row)),
        DataType::Int16 => Value::from(array.as_primitive::<Int16Type>().value(row)),
        DataType::Int32 => Value::from(array.as_primitive::<Int32Type>().value(row)),
        DataType::Int64 => Value::from(array.as_primitive::<Int64Type>().value(row)),
        DataType::UInt8 => Value::from(array.as_primitive::<UInt8Type>().value(row)),
        DataType::UInt16 => Value::from(array.as_primitive::<UInt16Type>().value(row)),
        DataType::UInt32 => Value::from(array.as_primitive::<UInt32Type>().value(row)),
        DataType::UInt64 => Value::from(array.as_primitive::<UInt64Type>().value(row)),
        DataType::Float32 => json!(array.as_primitive::<Float32Type>().value(row) as f64),
        DataType::Float64 => json!(array.as_primitive::<Float64Type>().value(row)),
        // Exasol's INTEGER arrives as DECIMAL(p,0). A scale-0 decimal that fits
        // in an i64 is a whole number and is sent as one, matching the native
        // driver; anything scaled keeps full precision as text, because a
        // DECIMAL(36,18) through f64 is silently wrong.
        DataType::Decimal128(_, 0) => {
            let v = array.as_primitive::<Decimal128Type>().value(row);
            match i64::try_from(v) {
                Ok(n) => Value::from(n),
                Err(_) => Value::String(v.to_string()),
            }
        }
        DataType::Decimal128(_, _) => {
            Value::String(array.as_primitive::<Decimal128Type>().value_as_string(row))
        }
        DataType::Utf8 => Value::String(array.as_string::<i32>().value(row).to_string()),
        DataType::LargeUtf8 => Value::String(array.as_string::<i64>().value(row).to_string()),
        DataType::Date32 => match array.as_primitive::<Date32Type>().value_as_date(row) {
            Some(d) => Value::String(d.to_string()),
            None => Value::Null,
        },
        DataType::Timestamp(unit, _) => {
            let dt = match unit {
                TimeUnit::Second => array
                    .as_primitive::<TimestampSecondType>()
                    .value_as_datetime(row),
                TimeUnit::Millisecond => array
                    .as_primitive::<TimestampMillisecondType>()
                    .value_as_datetime(row),
                TimeUnit::Microsecond => array
                    .as_primitive::<TimestampMicrosecondType>()
                    .value_as_datetime(row),
                TimeUnit::Nanosecond => array
                    .as_primitive::<TimestampNanosecondType>()
                    .value_as_datetime(row),
            };
            match dt {
                Some(d) => Value::String(d.format(TIMESTAMP_FORMAT).to_string()),
                None => Value::Null,
            }
        }
        // Anything exotic (INTERVAL, GEOMETRY, HASHTYPE, …) is real data, so it
        // is rendered as text rather than dropped to NULL.
        _ => match arrow::util::display::array_value_to_string(array, row) {
            Ok(s) => Value::String(s),
            Err(_) => Value::String(format!("<unreadable {}>", array.data_type())),
        },
    }
}

/// Flatten Arrow batches into the row-major grid the UI expects, stopping at
/// `max_rows`. The bool is `truncated` — true only when rows were actually left
/// behind, so a result of exactly `max_rows` rows is not mislabelled.
pub(crate) fn batches_to_rows(batches: &[RecordBatch], max_rows: usize) -> (Vec<Vec<Value>>, bool) {
    let mut rows: Vec<Vec<Value>> = Vec::new();
    let mut truncated = false;
    for batch in batches {
        for r in 0..batch.num_rows() {
            if rows.len() >= max_rows {
                truncated = true;
                return (rows, truncated);
            }
            rows.push(batch.columns().iter().map(|c| cell(c, r)).collect());
        }
    }
    (rows, truncated)
}

/// Columns for a result: the schema Exasol reported, falling back to the first
/// batch when a driver hands back batches without separate metadata.
pub(crate) fn columns_for(schema: Option<&Schema>, batches: &[RecordBatch]) -> Vec<ColumnMeta> {
    if let Some(s) = schema {
        return columns_of(s);
    }
    batches
        .first()
        .map(|b| columns_of(b.schema().as_ref()))
        .unwrap_or_default()
}

fn failed(statement: &str, elapsed: Duration, message: String) -> StatementResult {
    StatementResult {
        statement: statement.to_string(),
        kind: "rowCount".into(),
        columns: Vec::new(),
        rows: Vec::new(),
        row_count: 0,
        truncated: false,
        elapsed_ms: elapsed.as_millis() as u64,
        exec_ms: elapsed.as_millis() as u64,
        fetch_ms: 0,
        error: Some(message),
    }
}

// ── Connection + execution ────────────────────────────────────────────────────

/// Build exarrow connection parameters from a Studio profile.
///
/// Built through exarrow's builder rather than a URI string: credentials never
/// have to survive percent-encoding, so a password containing `@`, `/` or `?`
/// cannot silently produce a different connection.
pub(crate) fn connection_params(profile: &ConnectionProfile) -> AppResult<ConnectionParams> {
    let tls = profile.ssl_mode != "disabled";
    let verify = profile.ssl_mode == "verify_ca" || profile.ssl_mode == "verify_identity";
    let mut builder = ConnectionBuilder::new()
        .host(&profile.host)
        .port(profile.port)
        .username(&profile.username)
        .password(&profile.password)
        .use_tls(tls)
        .validate_server_certificate(verify)
        .client_name("Exasol Studio");
    if let Some(schema) = profile.schema.as_ref().filter(|s| !s.trim().is_empty()) {
        builder = builder.schema(schema);
    }
    builder
        .build()
        .map_err(|e| AppError::Storage(format!("exarrow connection setup failed: {e}")))
}

/// Run a batch of statements through exarrow on one session, stopping at the
/// first failure exactly like the native and bridge paths do.
pub async fn execute_exarrow(
    profile: &ConnectionProfile,
    statements: &[String],
    max_rows: usize,
) -> AppResult<ExecuteResponse> {
    install_crypto_provider();
    let batch_started = Instant::now();
    let database = Database::new(connection_params(profile)?);
    let mut conn = database
        .connect()
        .await
        .map_err(|e| AppError::Storage(format!("exarrow could not connect: {e}")))?;

    let mut results: Vec<StatementResult> = Vec::new();
    let mut success = true;
    for statement in statements {
        let started = Instant::now();
        let result_set = match conn.execute(statement.clone()).await {
            Ok(rs) => rs,
            Err(e) => {
                results.push(failed(statement, started.elapsed(), e.to_string()));
                success = false;
                break;
            }
        };
        let exec = started.elapsed();

        if let Some(count) = result_set.row_count() {
            results.push(StatementResult {
                statement: statement.clone(),
                kind: "rowCount".into(),
                columns: Vec::new(),
                rows: Vec::new(),
                row_count: count.max(0) as u64,
                truncated: false,
                elapsed_ms: started.elapsed().as_millis() as u64,
                exec_ms: exec.as_millis() as u64,
                fetch_ms: 0,
                error: None,
            });
            continue;
        }

        let schema = result_set.metadata().map(|m| m.schema.clone());
        let batches = match result_set.fetch_all().await {
            Ok(b) => b,
            Err(e) => {
                results.push(failed(statement, started.elapsed(), e.to_string()));
                success = false;
                break;
            }
        };
        let (rows, truncated) = batches_to_rows(&batches, max_rows);
        let columns = columns_for(schema.as_deref(), &batches);
        results.push(StatementResult {
            statement: statement.clone(),
            kind: "resultSet".into(),
            row_count: rows.len() as u64,
            columns,
            rows,
            truncated,
            elapsed_ms: started.elapsed().as_millis() as u64,
            exec_ms: exec.as_millis() as u64,
            fetch_ms: started.elapsed().saturating_sub(exec).as_millis() as u64,
            error: None,
        });
    }

    // Best-effort: the batch's results are already in hand, so a close failure
    // must not turn a successful run into an error.
    let _ = conn.close().await;

    Ok(ExecuteResponse {
        results,
        total_elapsed_ms: batch_started.elapsed().as_millis() as u64,
        success,
        profile_session: None,
        profile_base_stmt: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use arrow::array::{
        BooleanArray, Decimal128Array, Float64Array, Int64Array, StringArray,
        TimestampMicrosecondArray,
    };
    use arrow::datatypes::Field;
    use std::sync::Arc;

    fn batch(fields: Vec<Field>, columns: Vec<ArrayRef>) -> RecordBatch {
        RecordBatch::try_new(Arc::new(Schema::new(fields)), columns).expect("valid batch")
    }

    #[test]
    fn null_is_null_for_every_type() {
        let arrays: Vec<ArrayRef> = vec![
            Arc::new(Int64Array::from(vec![None::<i64>])),
            Arc::new(StringArray::from(vec![None::<&str>])),
            Arc::new(BooleanArray::from(vec![None::<bool>])),
            Arc::new(Float64Array::from(vec![None::<f64>])),
        ];
        for a in &arrays {
            assert_eq!(cell(a, 0), Value::Null, "{:?}", a.data_type());
        }
    }

    #[test]
    fn out_of_range_row_is_null_not_a_panic() {
        let a: ArrayRef = Arc::new(Int64Array::from(vec![1i64]));
        assert_eq!(cell(&a, 5), Value::Null);
    }

    #[test]
    fn numbers_stay_numbers_and_scaled_decimals_stay_exact() {
        let ints: ArrayRef = Arc::new(Int64Array::from(vec![42i64]));
        assert_eq!(cell(&ints, 0), Value::from(42i64));

        let doubles: ArrayRef = Arc::new(Float64Array::from(vec![1.5f64]));
        assert_eq!(cell(&doubles, 0), json!(1.5));

        // DECIMAL(18,0) — Exasol's INTEGER — reads back as a whole number.
        let whole: ArrayRef = Arc::new(
            Decimal128Array::from(vec![7i128])
                .with_precision_and_scale(18, 0)
                .unwrap(),
        );
        assert_eq!(cell(&whole, 0), Value::from(7i64));

        // DECIMAL(10,2) keeps its scale as text — through f64 it would round.
        let money: ArrayRef = Arc::new(
            Decimal128Array::from(vec![123_456i128])
                .with_precision_and_scale(10, 2)
                .unwrap(),
        );
        assert_eq!(cell(&money, 0), Value::String("1234.56".into()));
    }

    #[test]
    fn a_decimal_too_big_for_i64_keeps_all_its_digits() {
        let huge: ArrayRef = Arc::new(
            Decimal128Array::from(vec![i128::from(i64::MAX) + 1])
                .with_precision_and_scale(36, 0)
                .unwrap(),
        );
        assert_eq!(
            cell(&huge, 0),
            Value::String("9223372036854775808".into()),
            "a value past i64 must not wrap or lose digits"
        );
    }

    #[test]
    fn timestamps_render_like_the_native_driver() {
        // 2026-09-15 10:30:00.123 UTC in microseconds.
        let micros = 1_789_475_400_123_000i64;
        let ts: ArrayRef = Arc::new(TimestampMicrosecondArray::from(vec![micros]));
        let rendered = cell(&ts, 0);
        let text = rendered.as_str().expect("timestamp renders as text");
        assert!(text.starts_with("2026-09-15 "), "{text}");
        assert!(text.ends_with(".123"), "milliseconds are kept: {text}");
    }

    #[test]
    fn rows_are_row_major_and_truncation_is_reported_honestly() {
        let b = batch(
            vec![
                Field::new("ID", DataType::Int64, true),
                Field::new("NAME", DataType::Utf8, true),
            ],
            vec![
                Arc::new(Int64Array::from(vec![1i64, 2, 3])),
                Arc::new(StringArray::from(vec!["a", "b", "c"])),
            ],
        );

        let (rows, truncated) = batches_to_rows(&[b.clone()], 10);
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[1], vec![Value::from(2i64), Value::String("b".into())]);
        assert!(!truncated, "nothing was left behind");

        let (rows, truncated) = batches_to_rows(&[b.clone()], 2);
        assert_eq!(rows.len(), 2);
        assert!(truncated, "a row was dropped, so the grid must say so");

        // Exactly at the limit is NOT truncation.
        let (rows, truncated) = batches_to_rows(&[b], 3);
        assert_eq!(rows.len(), 3);
        assert!(!truncated, "exactly max_rows rows is a complete result");
    }

    #[test]
    fn rows_span_multiple_batches_in_order() {
        let f = vec![Field::new("N", DataType::Int64, true)];
        let first = batch(f.clone(), vec![Arc::new(Int64Array::from(vec![1i64, 2]))]);
        let second = batch(f, vec![Arc::new(Int64Array::from(vec![3i64, 4]))]);
        let (rows, truncated) = batches_to_rows(&[first, second], 10);
        assert_eq!(
            rows.iter().map(|r| r[0].clone()).collect::<Vec<_>>(),
            vec![
                Value::from(1i64),
                Value::from(2i64),
                Value::from(3i64),
                Value::from(4i64)
            ]
        );
        assert!(!truncated);
    }

    #[test]
    fn column_names_survive_even_when_duplicated() {
        // `SELECT 1 AS A, 2 AS A` is legal; a name-keyed conversion would lose
        // one of these columns, so the grid is built positionally.
        let b = batch(
            vec![
                Field::new("A", DataType::Int64, true),
                Field::new("A", DataType::Int64, true),
            ],
            vec![
                Arc::new(Int64Array::from(vec![1i64])),
                Arc::new(Int64Array::from(vec![2i64])),
            ],
        );
        let cols = columns_for(None, &[b.clone()]);
        assert_eq!(cols.len(), 2);
        assert_eq!(cols[0].name, "A");
        assert_eq!(cols[1].name, "A");
        let (rows, _) = batches_to_rows(&[b], 10);
        assert_eq!(rows[0], vec![Value::from(1i64), Value::from(2i64)]);
    }

    #[test]
    fn an_empty_result_still_carries_its_columns() {
        let schema = Schema::new(vec![Field::new("ONLY", DataType::Utf8, true)]);
        let cols = columns_for(Some(&schema), &[]);
        assert_eq!(cols.len(), 1);
        assert_eq!(cols[0].name, "ONLY");
        assert_eq!(cols[0].type_name, "VARCHAR");
    }

    /// Live proof that the driver really speaks to a database and that the
    /// conversion above matches what Exasol actually sends. Ignored by default;
    /// run it against a real server with:
    ///
    /// ```text
    /// EXASOL_LIVE_HOST=127.0.0.1 EXASOL_LIVE_PORT=8563 \
    /// EXASOL_LIVE_USER=sys EXASOL_LIVE_PASSWORD=… \
    ///   cargo test exarrow_live -- --ignored --nocapture
    /// ```
    #[tokio::test]
    #[ignore = "needs a live database (EXASOL_LIVE_* env)"]
    async fn exarrow_live_roundtrip() {
        let profile = live_profile();
        let resp = execute_exarrow(
            &profile,
            &[
                "SELECT 1 AS N, 'hello' AS S, CAST(1234.56 AS DECIMAL(10,2)) AS D, \
                 DATE '2026-09-15' AS DT, CAST(NULL AS VARCHAR(5)) AS NOTHING"
                    .to_string(),
            ],
            10,
        )
        .await
        .expect("exarrow connects and runs");
        assert!(resp.success, "{:?}", resp.results.first().map(|r| &r.error));
        let r = &resp.results[0];
        assert_eq!(r.kind, "resultSet");
        assert_eq!(r.rows.len(), 1);
        assert_eq!(r.rows[0][0], Value::from(1i64), "INTEGER stays a number");
        assert_eq!(r.rows[0][1], Value::String("hello".into()));
        assert_eq!(r.rows[0][2], Value::String("1234.56".into()), "scale kept");
        assert_eq!(r.rows[0][3], Value::String("2026-09-15".into()));
        assert_eq!(r.rows[0][4], Value::Null, "a real NULL stays NULL");
        assert_eq!(r.columns.len(), 5);
        assert_eq!(r.columns[0].name, "N");
    }

    /// A failing statement must be reported as an ERROR, never as a silent
    /// zero-row success — the exact bug the TS bridge shipped with.
    #[tokio::test]
    #[ignore = "needs a live database (EXASOL_LIVE_* env)"]
    async fn exarrow_live_reports_a_failing_statement_as_an_error() {
        let profile = live_profile();
        let resp = execute_exarrow(
            &profile,
            &["SELECT * FROM A_TABLE_THAT_DOES_NOT_EXIST_XYZ".to_string()],
            10,
        )
        .await
        .expect("the batch itself runs");
        assert!(!resp.success, "a failing statement must fail the batch");
        let err = resp.results[0].error.as_deref().unwrap_or("");
        assert!(!err.is_empty(), "the failure must carry a message");
        assert!(!err.contains("[object"), "never a stringified object: {err}");
    }

    fn live_profile() -> ConnectionProfile {
        ConnectionProfile {
            id: "live".into(),
            name: "live".into(),
            host: std::env::var("EXASOL_LIVE_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
            port: std::env::var("EXASOL_LIVE_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(8563),
            username: std::env::var("EXASOL_LIVE_USER").unwrap_or_else(|_| "sys".into()),
            password: std::env::var("EXASOL_LIVE_PASSWORD").expect("EXASOL_LIVE_PASSWORD"),
            schema: None,
            notes: None,
            // Local databases use a self-signed certificate: encrypted, unverified.
            ssl_mode: "preferred".into(),
            compression: false,
            driver_id: "exarrow-rs".into(),
            created_at: None,
            last_used_at: None,
        }
    }

    #[test]
    fn type_names_read_like_exasol_types() {
        assert_eq!(arrow_type_name(&DataType::Utf8), "VARCHAR");
        assert_eq!(arrow_type_name(&DataType::Boolean), "BOOLEAN");
        assert_eq!(arrow_type_name(&DataType::Float64), "DOUBLE");
        assert_eq!(arrow_type_name(&DataType::Date32), "DATE");
        assert_eq!(arrow_type_name(&DataType::Decimal128(18, 2)), "DECIMAL(18,2)");
        assert_eq!(
            arrow_type_name(&DataType::Timestamp(TimeUnit::Microsecond, None)),
            "TIMESTAMP"
        );
    }
}
