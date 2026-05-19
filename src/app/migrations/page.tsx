import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { MigrationCopyBlock } from "./MigrationCopyBlock";

export const metadata: Metadata = {
  title: "Supabase migrations — copy SQL",
  robots: { index: false, follow: false },
};

const DEFAULT_KEY = "axe-migrate-2026";

type Search = { key?: string | string[] };

function readMigrationFiles(): { name: string; sql: string }[] {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  if (!fs.existsSync(dir)) {
    return [];
  }
  const names = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return names.map((name) => ({
    name,
    sql: fs.readFileSync(path.join(dir, name), "utf8"),
  }));
}

export default async function MigrationsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const raw = sp.key;
  const key = Array.isArray(raw) ? raw[0] : raw;
  const expected = (process.env.AXE_MIGRATIONS_PAGE_SECRET ?? DEFAULT_KEY).trim();

  if (!key || key !== expected) {
    return (
      <div className="mx-auto max-w-lg px-5 py-16 text-tos-text">
        <h1 className="text-lg font-semibold text-white">Migration SQL (copy-paste)</h1>
        <p className="mt-3 text-sm text-tos-muted">
          Open this page with the secret query parameter to list every file in{" "}
          <code className="rounded bg-white/10 px-1 font-mono text-xs">supabase/migrations</code> and copy SQL into
          the Supabase SQL editor.
        </p>
        <p className="mt-4 text-sm text-tos-muted">
          Example URL (default secret matches your internal migrate header value):
        </p>
        <p className="mt-2 break-all rounded-xl border border-white/10 bg-[#0e0f12]/95 p-3 font-mono text-[11px] text-tos-warm">
          /migrations?key={DEFAULT_KEY}
        </p>
        <p className="mt-4 text-xs text-tos-dim">
          Optional env <code className="text-tos-muted">AXE_MIGRATIONS_PAGE_SECRET</code> overrides the default key.
          Do not share this URL publicly.
        </p>
      </div>
    );
  }

  const files = readMigrationFiles();

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 pb-20 text-tos-text">
      <h1 className="text-xl font-semibold text-white">Supabase migrations</h1>
      <p className="mt-2 text-sm text-tos-muted">
        Copy each block into <strong className="text-tos-text">Supabase → SQL → New query</strong>, run, then repeat
        for the next file if needed. For production, prefer{" "}
        <code className="rounded bg-white/10 px-1 font-mono text-xs">supabase db push</code> when your project is
        linked.
      </p>
      <p className="mt-2 text-xs text-tos-dim">
        {files.length} file{files.length === 1 ? "" : "s"} under <code className="font-mono">supabase/migrations</code>
      </p>

      {files.length === 0 ? (
        <p className="mt-8 text-sm text-tos-muted">No .sql files found in supabase/migrations (unexpected in deploy).</p>
      ) : (
        <div className="mt-8">
          {files.map((f) => (
            <MigrationCopyBlock key={f.name} filename={f.name} sql={f.sql} />
          ))}
        </div>
      )}
    </div>
  );
}
