import sys, json, time

def cell(v):
    if v is None: return None
    if isinstance(v, (int, float, bool)): return v
    return str(v)

def run_pyexasol(req):
    import pyexasol
    dsn = "%s:%s" % (req["host"], req["port"])
    C = pyexasol.connect(dsn=dsn, user=req["user"], password=req["password"],
        schema=req.get("schema") or "", encryption=bool(req.get("tls", True)),
        websocket_sslopt={"cert_reqs": 0} if (req.get("tls", True) and not req.get("verify")) else None)
    max_rows = int(req.get("maxRows", 1000))
    out = {"results": []}
    for stmt in req.get("statements", []):
        t0 = time.time()
        e = {"statement": stmt, "kind": "rowCount", "columns": [], "rows": [], "rowCount": 0, "truncated": False, "elapsedMs": 0, "error": None}
        try:
            st = C.execute(stmt)
            if getattr(st, "result_type", "") == "resultSet":
                cols = st.columns(); names = list(cols.keys())
                e["kind"] = "resultSet"
                e["columns"] = [{"name": n, "typeName": str(cols[n].get("type", ""))} for n in names]
                rows = st.fetchmany(max_rows)
                e["rows"] = [[cell(v) for v in r] for r in rows]
                e["rowCount"] = len(e["rows"]); e["truncated"] = len(e["rows"]) >= max_rows
            else:
                e["rowCount"] = st.rowcount()
        except Exception as ex:
            e["error"] = str(ex)
        e["elapsedMs"] = int((time.time()-t0)*1000); out["results"].append(e)
        if e["error"]: break
    try: C.close()
    except Exception: pass
    return out

def run_sqlalchemy(req):
    # The POINT of this driver is the SQLAlchemy dialect — running plain
    # pyexasol here (what the old fallback did) would be a different driver.
    from sqlalchemy import create_engine
    import urllib.parse as _u
    auth = "%s:%s" % (_u.quote_plus(req["user"]), _u.quote_plus(req["password"]))
    url = "exa+websocket://%s@%s:%s/%s" % (auth, req["host"], req["port"], req.get("schema") or "")
    params = []
    if not req.get("tls", True):
        params.append("ENCRYPTION=n")
    elif not req.get("verify"):
        params.append("SSLCertificate=SSL_VERIFY_NONE")
    if params:
        url += "?" + "&".join(params)
    engine = create_engine(url)
    max_rows = int(req.get("maxRows", 1000))
    out = {"results": []}
    # AUTOCOMMIT: SQLAlchemy 2.0 opens a transaction by default, so DDL/DML
    # would roll back when the connection closes.
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as C:
        for stmt in req.get("statements", []):
            t0 = time.time()
            e = {"statement": stmt, "kind": "rowCount", "columns": [], "rows": [], "rowCount": 0, "truncated": False, "elapsedMs": 0, "error": None}
            try:
                # exec_driver_sql: raw SQL, so ':' in the text is never taken
                # as a bind parameter.
                res = C.exec_driver_sql(stmt)
                if res.returns_rows:
                    e["kind"] = "resultSet"
                    e["columns"] = [{"name": str(k), "typeName": ""} for k in res.keys()]
                    rows = res.fetchmany(max_rows)
                    e["rows"] = [[cell(v) for v in r] for r in rows]
                    e["rowCount"] = len(e["rows"]); e["truncated"] = len(e["rows"]) >= max_rows
                else:
                    e["rowCount"] = res.rowcount if res.rowcount and res.rowcount > 0 else 0
            except Exception as ex:
                e["error"] = str(ex)
            e["elapsedMs"] = int((time.time()-t0)*1000); out["results"].append(e)
            if e["error"]: break
    try: engine.dispose()
    except Exception: pass
    return out

def run_jdbc(req):
    import jaydebeapi
    url = "jdbc:exa:%s:%s" % (req["host"], req["port"])
    if not req.get("tls", True): url += ";encryption=0"
    elif not req.get("verify"): url += ";validateservercertificate=0"
    if req.get("schema"): url += ";schema=%s" % req["schema"]
    C = jaydebeapi.connect("com.exasol.jdbc.EXADriver", url, [req["user"], req["password"]], req["jarPath"])
    max_rows = int(req.get("maxRows", 1000))
    out = {"results": []}
    for stmt in req.get("statements", []):
        t0 = time.time()
        e = {"statement": stmt, "kind": "rowCount", "columns": [], "rows": [], "rowCount": 0, "truncated": False, "elapsedMs": 0, "error": None}
        cur = C.cursor()
        try:
            cur.execute(stmt)
            if cur.description:
                e["kind"] = "resultSet"
                e["columns"] = [{"name": d[0], "typeName": ""} for d in cur.description]
                rows = cur.fetchmany(max_rows)
                e["rows"] = [[cell(v) for v in r] for r in rows]
                e["rowCount"] = len(e["rows"]); e["truncated"] = len(e["rows"]) >= max_rows
            else:
                try: e["rowCount"] = cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
                except Exception: e["rowCount"] = 0
        except Exception as ex:
            e["error"] = str(ex)
        finally:
            try: cur.close()
            except Exception: pass
        e["elapsedMs"] = int((time.time()-t0)*1000); out["results"].append(e)
        if e["error"]: break
    try: C.close()
    except Exception: pass
    return out

def run_odbc(req):
    import pyodbc
    # A driver LIBRARY PATH (Marketplace install) needs no OS registration;
    # a system-registered driver is the fallback.
    drv = req.get("driverPath") or ""
    if not drv:
        exa = [d for d in pyodbc.drivers() if "exa" in d.lower()]
        if not exa:
            raise Exception("No Exasol ODBC driver found. Install the ODBC Driver from the Marketplace, then retry.")
        drv = exa[0]
    # ODBC braced-value escaping: a literal } doubles, or it ends the value.
    cs = "DRIVER={%s};EXAHOST=%s:%s;EXAUID=%s;EXAPWD=%s" % (drv.replace("}", "}}"), req["host"], req["port"], req["user"], req["password"])
    if req.get("tls", True) and not req.get("verify"):
        cs += ";SSLCERTIFICATE=SSL_VERIFY_NONE"
    if req.get("schema"):
        cs += ";SCHEMA=%s" % req["schema"]
    C = pyodbc.connect(cs, autocommit=True)
    max_rows = int(req.get("maxRows", 1000))
    out = {"results": []}
    for stmt in req.get("statements", []):
        t0 = time.time()
        e = {"statement": stmt, "kind": "rowCount", "columns": [], "rows": [], "rowCount": 0, "truncated": False, "elapsedMs": 0, "error": None}
        cur = C.cursor()
        try:
            cur.execute(stmt)
            if cur.description:
                e["kind"] = "resultSet"
                e["columns"] = [{"name": d[0], "typeName": ""} for d in cur.description]
                rows = cur.fetchmany(max_rows)
                e["rows"] = [[cell(v) for v in r] for r in rows]
                e["rowCount"] = len(e["rows"]); e["truncated"] = len(e["rows"]) >= max_rows
            else:
                try: e["rowCount"] = cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
                except Exception: e["rowCount"] = 0
        except Exception as ex:
            e["error"] = str(ex)
        finally:
            try: cur.close()
            except Exception: pass
        e["elapsedMs"] = int((time.time()-t0)*1000); out["results"].append(e)
        if e["error"]: break
    try: C.close()
    except Exception: pass
    return out

def main():
    try:
        req = json.load(sys.stdin)
    except Exception as ex:
        print(json.dumps({"fatal": "bad request: %s" % ex})); return
    driver = req.get("driver")
    try:
        if driver == "jdbc":
            out = run_jdbc(req)
        elif driver == "odbc":
            out = run_odbc(req)
        elif driver == "sqlalchemy":
            out = run_sqlalchemy(req)
        else:
            out = run_pyexasol(req)
    except Exception as ex:
        print(json.dumps({"fatal": "%s" % ex})); return
    print(json.dumps(out))

main()