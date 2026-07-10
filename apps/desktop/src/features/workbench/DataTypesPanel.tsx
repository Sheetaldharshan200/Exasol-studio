import { useEffect, useMemo, useState } from "react";
import { Binary, Loader2, Search, Shapes } from "lucide-react";
import { Input } from "@/components/ui/input";
import { errorMessage, ipc, type DataType } from "@/lib/ipc";

/** Curated reference layered on top of the live EXA_SQL_TYPES list. */
const TYPE_REFERENCE: Record<string, { category: string; description: string; example: string }> = {
  BOOLEAN: { category: "Boolean", description: "Logical TRUE / FALSE / NULL value.", example: "TRUE" },
  CHAR: { category: "String", description: "Fixed-length character string, space-padded (1–2000).", example: "CHAR(10)" },
  VARCHAR: { category: "String", description: "Variable-length character string up to 2,000,000 chars.", example: "VARCHAR(100) UTF8" },
  DATE: { category: "Datetime", description: "Calendar date (year, month, day).", example: "DATE '2026-07-10'" },
  TIMESTAMP: { category: "Datetime", description: "Date and time with fractional seconds.", example: "TIMESTAMP '2026-07-10 12:00:00'" },
  "TIMESTAMP WITH LOCAL TIME ZONE": { category: "Datetime", description: "Timestamp normalized to the session time zone.", example: "TIMESTAMP WITH LOCAL TIME ZONE" },
  DECIMAL: { category: "Numeric", description: "Exact fixed-point number, precision up to 36 digits.", example: "DECIMAL(18,2)" },
  DOUBLE: { category: "Numeric", description: "Double-precision (64-bit) floating-point number.", example: "DOUBLE PRECISION" },
  "INTERVAL DAY TO SECOND": { category: "Interval", description: "Span of days, hours, minutes and seconds.", example: "INTERVAL '2 12:00:00' DAY TO SECOND" },
  "INTERVAL YEAR TO MONTH": { category: "Interval", description: "Span of years and months.", example: "INTERVAL '1-6' YEAR TO MONTH" },
  GEOMETRY: { category: "Spatial", description: "Geospatial object (point, line, polygon, …).", example: "GEOMETRY(4326)" },
  HASHTYPE: { category: "Binary", description: "Fixed-size hash value stored compactly.", example: "HASHTYPE(16 BYTE)" },
};

function categoryFor(name: string): string {
  return TYPE_REFERENCE[name.toUpperCase()]?.category ?? "Other";
}

export function DataTypesPanel({
  profileId,
  connectionName,
}: {
  profileId: string;
  connectionName: string;
}) {
  const [types, setTypes] = useState<DataType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    ipc
      .listDataTypes(profileId)
      .then((data) => alive && setTypes(data.types))
      .catch((err) => alive && setError(errorMessage(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [profileId]);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      types.filter((t) => {
        if (!needle) return true;
        const ref = TYPE_REFERENCE[t.typeName.toUpperCase()];
        return (
          t.typeName.toLowerCase().includes(needle) ||
          (ref?.description.toLowerCase().includes(needle) ?? false) ||
          (ref?.category.toLowerCase().includes(needle) ?? false)
        );
      }),
    [types, needle],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading data types…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-muted-foreground">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-editor">
      <div className="mx-auto max-w-5xl p-6">
        <header className="mb-5 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal/15 text-teal">
            <Shapes className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-heading text-[15px] font-bold text-foreground">Data Types</h2>
            <p className="text-xs text-muted-foreground">
              {connectionName} · {types.length} SQL types
            </p>
          </div>
        </header>

        <div className="mb-4 relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
            placeholder="Filter data types…"
          />
        </div>

        <section className="overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0">
              <tr className="bg-secondary text-left text-muted-foreground">
                <th className="border-b border-border px-3 py-1.5 font-medium">Type</th>
                <th className="w-16 border-b border-l border-border px-3 py-1.5 text-right font-medium">ID</th>
                <th className="w-28 border-b border-l border-border px-3 py-1.5 font-medium">Category</th>
                <th className="border-b border-l border-border px-3 py-1.5 font-medium">Description</th>
                <th className="border-b border-l border-border px-3 py-1.5 font-medium">Example</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const ref = TYPE_REFERENCE[t.typeName.toUpperCase()];
                return (
                  <tr
                    key={t.typeName}
                    className="odd:bg-transparent even:bg-secondary/20 hover:bg-accent/50"
                  >
                    <td className="border-b border-border px-3 py-1.5">
                      <span className="flex items-center gap-1.5 font-mono font-medium text-syntax-type">
                        <Binary className="h-3 w-3 opacity-60" />
                        {t.typeName}
                      </span>
                    </td>
                    <td className="border-b border-l border-border px-3 py-1.5 text-right font-mono text-muted-foreground">
                      {t.typeId ?? "—"}
                    </td>
                    <td className="border-b border-l border-border px-3 py-1.5 text-muted-foreground">
                      {categoryFor(t.typeName)}
                    </td>
                    <td className="border-b border-l border-border px-3 py-1.5 text-foreground">
                      {ref?.description ?? "—"}
                    </td>
                    <td className="border-b border-l border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                      {ref?.example ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No matching types.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
