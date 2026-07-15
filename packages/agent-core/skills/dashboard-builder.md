---
name: dashboard-builder
description: Build a live SQL-backed dashboard (schema-qualified, aggregated, chart per panel)
---

# Building a dashboard

Use `dashboard_save`. Each panel: {id, title, grid:{x,y,w,h}, query:{sql}, viz}.

- Panel SQL MUST be schema-qualified (SCHEMA.TABLE) and aggregate in the DB (GROUP BY / LIMIT) — panels run without a default schema and a chart needs a few hundred rows, not millions.
- Verify columns with describe_table before writing SQL; test each query with run_sql before saving.
- viz: {type:"echarts",chart:"bar|line|area|pie|scatter",xField,yFields} · {type:"kpi",valueField,unit} · {type:"table"} · {type:"explore"} (drag-drop studio) · or {type:"echarts",option:{…full ECharts…}} for anything else.
- Lay panels on the 12-col grid: a KPI row (w:3 h:4) on top, charts (w:6 h:8) below, a table (w:12) at the bottom.
