// Command exasol-bridge-go runs SQL through the official Exasol Go driver and
// answers in exactly the JSON shape the Python and Node bridges use, so
// driver_exec.rs parses all three the same way.
//
// Native by construction: this is compiled to a static binary and shipped as an
// app resource, so choosing the Go driver installs nothing.
//
//	in : {host, port, user, password, schema?, tls?, verify?, maxRows?,
//	      statements[], expectRows[]}
//	out: {results: [{statement, kind, columns, rows, rowCount, truncated,
//	      elapsedMs, error}]}
//	or : {fatal: "<message>"}
//
// `expectRows[i]` says whether statement i returns a result set. Studio decides
// that with the same classifier the native path uses (driver_exec.rs::expect_rows
// -> query.rs::is_result_set_statement), so the Go driver never has to guess —
// and a statement is never run twice to find out, which would double its side
// effects. The trade-off is explicit: a statement the classifier calls DML runs
// exactly once but its rows are discarded and reported as a row count. That is
// the native path's behaviour too, and fixing the shared classifier fixes every
// driver at once — which is why this bridge does not keep a second opinion.
package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/exasol/exasol-driver-go"
)

type request struct {
	Host       string   `json:"host"`
	Port       int      `json:"port"`
	User       string   `json:"user"`
	Password   string   `json:"password"`
	Schema     string   `json:"schema"`
	TLS        *bool    `json:"tls"`
	Verify     bool     `json:"verify"`
	MaxRows    int      `json:"maxRows"`
	Statements []string `json:"statements"`
	ExpectRows []bool   `json:"expectRows"`
}

type column struct {
	Name     string `json:"name"`
	TypeName string `json:"typeName"`
}

type entry struct {
	Statement string   `json:"statement"`
	Kind      string   `json:"kind"`
	Columns   []column `json:"columns"`
	Rows      [][]any  `json:"rows"`
	RowCount  int64    `json:"rowCount"`
	Truncated bool     `json:"truncated"`
	ElapsedMs int64    `json:"elapsedMs"`
	Error     *string  `json:"error"`
}

func fatal(format string, args ...any) {
	out, _ := json.Marshal(map[string]string{"fatal": fmt.Sprintf(format, args...)})
	fmt.Println(string(out))
	os.Exit(0) // the response IS the error; a non-zero exit would hide it
}

// cell renders one driver value the way Studio's native driver renders it:
// numbers stay numbers, everything textual stays text, NULL stays null.
// []byte is what the driver hands back for DECIMAL and other exact types —
// keeping it as a string preserves every digit, where float64 would round.
func cell(v any) any {
	switch t := v.(type) {
	case nil:
		return nil
	case bool, float64, float32, int64, int32, int, string:
		return t
	case []byte:
		return string(t)
	case time.Time:
		return t.Format("2006-01-02 15:04:05.000")
	default:
		return fmt.Sprintf("%v", t)
	}
}

func main() {
	raw, err := io.ReadAll(os.Stdin)
	if err != nil {
		fatal("could not read the request: %v", err)
	}
	var req request
	if err := json.Unmarshal(raw, &req); err != nil {
		fatal("could not parse the request: %v", err)
	}
	maxRows := req.MaxRows
	if maxRows <= 0 {
		maxRows = 1000
	}
	tls := req.TLS == nil || *req.TLS

	conf := exasol.NewConfig(req.User, req.Password).
		Host(req.Host).
		Port(req.Port).
		Encryption(tls).
		ValidateServerCertificate(req.Verify).
		Autocommit(true)
	if req.Schema != "" {
		conf = conf.Schema(req.Schema)
	}
	db, err := sql.Open("exasol", conf.String())
	if err != nil {
		fatal("the Go driver could not open a connection: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		fatal("the Go driver could not connect: %v", err)
	}

	results := []entry{}
	for i, stmt := range req.Statements {
		started := time.Now()
		e := entry{Statement: stmt, Kind: "rowCount", Columns: []column{}, Rows: [][]any{}}
		expectRows := i < len(req.ExpectRows) && req.ExpectRows[i]
		if expectRows {
			runQuery(db, stmt, maxRows, &e)
		} else {
			runExec(db, stmt, &e)
		}
		e.ElapsedMs = time.Since(started).Milliseconds()
		results = append(results, e)
		if e.Error != nil {
			break // stop the script at the first failing statement
		}
	}

	out, err := json.Marshal(map[string]any{"results": results})
	if err != nil {
		fatal("could not encode the result: %v", err)
	}
	fmt.Println(string(out))
}

func fail(e *entry, err error) {
	msg := err.Error()
	e.Error = &msg
}

func runExec(db *sql.DB, stmt string, e *entry) {
	res, err := db.Exec(stmt)
	if err != nil {
		fail(e, err)
		return
	}
	// Not every statement reports affected rows (DDL does not); that is a
	// legitimate 0, not a failure.
	if n, err := res.RowsAffected(); err == nil {
		e.RowCount = n
	}
}

func runQuery(db *sql.DB, stmt string, maxRows int, e *entry) {
	rows, err := db.Query(stmt)
	if err != nil {
		fail(e, err)
		return
	}
	defer rows.Close()

	names, err := rows.Columns()
	if err != nil {
		fail(e, err)
		return
	}
	types, _ := rows.ColumnTypes()
	for i, n := range names {
		typeName := ""
		if types != nil && i < len(types) {
			typeName = types[i].DatabaseTypeName()
		}
		e.Columns = append(e.Columns, column{Name: n, TypeName: typeName})
	}
	e.Kind = "resultSet"

	for rows.Next() {
		if len(e.Rows) >= maxRows {
			e.Truncated = true
			break
		}
		holders := make([]any, len(names))
		pointers := make([]any, len(names))
		for i := range holders {
			pointers[i] = &holders[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			fail(e, err)
			return
		}
		row := make([]any, len(names))
		for i, v := range holders {
			row[i] = cell(v)
		}
		e.Rows = append(e.Rows, row)
	}
	// A streaming failure surfaces only here — without this check a query that
	// died mid-read would be reported as a short but successful result.
	if err := rows.Err(); err != nil {
		fail(e, err)
		return
	}
	e.RowCount = int64(len(e.Rows))
}
