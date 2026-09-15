# R driver bridge — runs SQL through `exasol`, the official Exasol R package,
# and answers in exactly the JSON shape the Python, Node and Go bridges use, so
# driver_exec.rs parses all four the same way.
#
#   in : {host, port, user, password, schema?, tls?, verify?, maxRows?,
#         statements[], expectRows[], driverPath?, rLib?}
#   out: {results: [{statement, kind, columns, rows, rowCount, truncated,
#         elapsedMs, error}]}
#   or : {fatal: "<message>"}
#
# Unlike the Go and TS bridges this one is NOT self-contained: R cannot be
# bundled (it is a large, non-relocatable runtime) and `exasol` reaches the
# database through the Exasol ODBC driver, which it compiles against. Studio
# therefore installs the package into a managed library and points it at the
# ODBC driver it already manages — see driver_exec.rs::setup_r.

.lib <- Sys.getenv("EXASOL_STUDIO_R_LIB")
if (nzchar(.lib)) .libPaths(c(.lib, .libPaths()))

fatal <- function(msg) {
  cat(jsonlite::toJSON(list(fatal = msg), auto_unbox = TRUE), "\n", sep = "")
  quit(save = "no", status = 0) # the response IS the error; a non-zero exit would hide it
}

if (!requireNamespace("jsonlite", quietly = TRUE)) {
  # Without jsonlite there is no way to speak the protocol at all, so this one
  # message is plain text — driver_exec.rs reports a non-JSON reply verbatim.
  cat("The R runtime is missing the jsonlite package. Install the R driver runtime from Studio.\n")
  quit(save = "no", status = 1)
}

req <- tryCatch(
  jsonlite::fromJSON(paste(readLines(file("stdin"), warn = FALSE), collapse = "\n"),
                     simplifyVector = FALSE),
  error = function(e) NULL
)
if (is.null(req)) fatal("could not parse the request")

if (!requireNamespace("exasol", quietly = TRUE)) {
  fatal(paste("The official Exasol R package is not installed in Studio's managed R library.",
              "Install the R driver runtime from the Drivers tab."))
}

max_rows <- if (is.null(req$maxRows)) 1000L else as.integer(req$maxRows)
if (is.na(max_rows) || max_rows <= 0L) max_rows <- 1000L
statements <- if (is.null(req$statements)) list() else req$statements
expect_rows <- if (is.null(req$expectRows)) list() else req$expectRows

# `exasol` connects through ODBC. Studio passes the driver library it manages,
# so no system-wide odbcinst registration is ever required.
conn_args <- list(
  exahost = paste0(req$host, ":", req$port),
  uid = req$user,
  pwd = req$password
)
if (!is.null(req$schema) && nzchar(req$schema)) conn_args$schema <- req$schema
if (!is.null(req$driverPath) && nzchar(req$driverPath)) conn_args$driver <- req$driverPath
encryption <- is.null(req$tls) || isTRUE(req$tls)
conn_args$encryption <- if (encryption) "Y" else "N"
if (encryption && !isTRUE(req$verify)) conn_args$sslcertificate <- "SSL_VERIFY_NONE"

# `autocommit = "Y"` is the package default, and it is what Studio needs: the
# transaction is otherwise rolled back on disconnect, silently losing writes.
conn_args$autocommit <- "Y"
conn <- tryCatch(
  do.call(DBI::dbConnect, c(list(exasol::exa()), conn_args)),
  error = function(e) e
)
if (inherits(conn, "error")) fatal(paste("the R driver could not connect:", conditionMessage(conn)))

# One cell, rendered the way Studio's native driver renders it: numbers stay
# numbers, exact types stay text (so no digit is lost), NA is a real NULL.
cell <- function(v) {
  if (length(v) == 0 || is.na(v)) return(NULL)
  if (is.logical(v) || is.numeric(v)) return(unname(v))
  as.character(v)
}

results <- list()
for (i in seq_along(statements)) {
  stmt <- statements[[i]]
  started <- Sys.time()
  e <- list(statement = stmt, kind = "rowCount", columns = list(), rows = list(),
            rowCount = 0L, truncated = FALSE, elapsedMs = 0L, error = NULL)
  wants_rows <- i <= length(expect_rows) && isTRUE(expect_rows[[i]])

  # Everything goes through dbSendQuery: r-exasol implements dbSendQuery and
  # dbGetRowsAffected but NOT dbExecute/dbSendStatement, so DBI's dbExecute
  # would dispatch to a method that does not exist and fail on every write.
  res <- NULL
  out <- tryCatch({
    res <- DBI::dbSendQuery(conn, stmt)
    if (wants_rows) {
      # One row over the limit tells truncation from "exactly max_rows rows",
      # which is a complete result and must not be flagged.
      df <- DBI::dbFetch(res, n = max_rows + 1)
      e$kind <- "resultSet"
      e$columns <- lapply(names(df), function(n) {
        list(name = n, typeName = toupper(class(df[[n]])[1]))
      })
      if (nrow(df) > max_rows) {
        df <- df[seq_len(max_rows), , drop = FALSE]
        e$truncated <- TRUE
      }
      e$rows <- lapply(seq_len(nrow(df)), function(r) {
        lapply(seq_along(df), function(c) cell(df[r, c]))
      })
      e$rowCount <- nrow(df)
    } else {
      affected <- DBI::dbGetRowsAffected(res)
      # DDL reports nothing; that is a legitimate 0, not a failure.
      e$rowCount <- if (is.numeric(affected) && !is.na(affected)) as.integer(affected) else 0L
    }
    NULL
  }, error = function(err) conditionMessage(err))
  # Released per statement, not at script exit: `on.exit` inside this loop would
  # register on the global frame and hold every result handle open.
  if (!is.null(res)) try(DBI::dbClearResult(res), silent = TRUE)

  if (!is.null(out)) e$error <- out
  e$elapsedMs <- as.integer(as.numeric(difftime(Sys.time(), started, units = "secs")) * 1000)
  results[[length(results) + 1L]] <- e
  if (!is.null(e$error)) break # stop the script at the first failing statement
}

try(DBI::dbDisconnect(conn), silent = TRUE)
cat(jsonlite::toJSON(list(results = results), auto_unbox = TRUE, null = "null"), "\n", sep = "")
