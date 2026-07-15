#!/usr/bin/env python3
"""Probe whether the bundled sales semantic model is ready without changing data."""

from __future__ import annotations

import os
import ssl

import pyexasol


def scalar(connection: object, sql: str) -> int:
    statement = connection.execute(sql)  # type: ignore[attr-defined]
    row = statement.fetchone()
    return int(row[0]) if row else 0


def main() -> int:
    connection = pyexasol.connect(
        dsn=f"{os.environ['EXASOL_HOST']}:{os.environ['EXASOL_PORT']}",
        user=os.environ["EXASOL_USER"],
        password=os.environ["EXASOL_PASSWORD"],
        schema="SYS",
        encryption=True,
        websocket_sslopt={"cert_reqs": ssl.CERT_NONE},
    )
    try:
        ready = scalar(
            connection,
            """SELECT COUNT(*)
                 FROM SEMANTIC_AGENT.MODELS_FOR_AGENT
                WHERE UPPER(MODEL_NAME) = 'SALES'
                  AND UPPER(AGENT_READINESS) = 'VALID'""",
        )
        if ready:
            print("Bundled sales semantic model is valid.")
            return 0

        model = scalar(
            connection,
            "SELECT COUNT(*) FROM SYS_SEMANTIC.MODELS WHERE UPPER(MODEL_NAME) = 'SALES' AND STATUS <> 'DELETED'",
        )
        mart_objects = scalar(
            connection,
            """SELECT COUNT(*)
                 FROM SYS.EXA_ALL_TABLES
                WHERE TABLE_SCHEMA = 'MART'
                  AND TABLE_NAME IN ('CUSTOMERS', 'PRODUCTS', 'ORDERS', 'ORDER_LINES')""",
        )
        if model or mart_objects:
            print("Existing SALES/MART state is incomplete or user-owned; refusing destructive reset.")
            return 4
        print("No bundled sales model exists; clean example install is safe.")
        return 3
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
