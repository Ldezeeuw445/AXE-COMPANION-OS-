/**
 * Seeds global AXE knowledge documents + chunks + template strategy playbooks.
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Run: node scripts/seed-axe-knowledge.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const knowledgeRoot = path.join(root, "knowledge");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function walkMdFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walkMdFiles(p, acc);
    else if (name.isFile() && name.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

function slugFromPath(absPath) {
  const rel = path.relative(knowledgeRoot, absPath).replace(/\\/g, "/");
  return rel.replace(/\.md$/i, "");
}

function titleFromSlug(slug) {
  const base = slug.split("/").pop() ?? slug;
  return base
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function inferTags(slug, body) {
  const tags = new Set();
  const parts = slug.split("/");
  tags.add(`path:${parts[0]}`);
  if (parts[1]) tags.add(`topic:${parts[1]}`);
  const sym = body.match(/symbol:([A-Z0-9]+)/gi);
  if (sym) sym.forEach((m) => tags.add(m.split(":")[1].toUpperCase()));
  if (/XAUUSD|gold/i.test(body)) tags.add("XAUUSD");
  if (/BTC|bitcoin/i.test(body)) tags.add("BTCUSD");
  if (/EURUSD/i.test(body)) tags.add("EURUSD");
  if (/London/i.test(body)) tags.add("london");
  if (/\bNY\b|New York/i.test(body)) tags.add("ny");
  if (/FVG|fair value/i.test(body)) tags.add("fvg");
  if (/order block|OB\b/i.test(body)) tags.add("orderblock");
  return [...tags];
}

function chunkText(text, max = 1100) {
  const paras = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > max && cur) {
      out.push(cur.trim());
      cur = p;
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) out.push(cur.trim());
  return out.length ? out : [text.slice(0, max)];
}

async function seedMarkdownFiles() {
  const files = walkMdFiles(knowledgeRoot);
  if (!files.length) {
    console.warn("No markdown files under knowledge/");
    return;
  }

  for (const file of files.sort()) {
    const slug = slugFromPath(file);
    const body = fs.readFileSync(file, "utf8");
    const category = slug.split("/")[0] ?? "general";
    const title = titleFromSlug(slug);
    const tags = inferTags(slug, body);

    const { data: docRow, error: upErr } = await supabase
      .from("axe_knowledge_documents")
      .upsert(
        {
          slug,
          title,
          category,
          content: body,
          source_type: "seed",
          tags,
          user_id: null,
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();

    if (upErr) {
      console.error("Upsert doc", slug, upErr.message);
      continue;
    }

    const docId = docRow.id;
    await supabase.from("axe_knowledge_chunks").delete().eq("document_id", docId);

    const chunks = chunkText(body);
    const rows = chunks.map((chunk_text, chunk_index) => ({
      document_id: docId,
      chunk_index,
      chunk_text,
      tags,
    }));

    const { error: chErr } = await supabase.from("axe_knowledge_chunks").insert(rows);
    if (chErr) console.error("Insert chunks", slug, chErr.message);
    else console.log("Seeded", slug, `(${chunks.length} chunks)`);
  }
}

async function seedStrategyPlaybooks() {
  await supabase
    .from("axe_strategy_playbooks")
    .delete()
    .is("user_id", null)
    .in("name", ["London sweep", "NY continuation", "Liquidity reversal", "FVG retrace entry"]);

  const rows = [
    {
      user_id: null,
      name: "London sweep",
      symbol: "XAUUSD",
      timeframe: "London open",
      rules:
        "Sweep PDH/PDL or Asian liquidity → displacement → FVG/OB → retrace entry; stop beyond sweep; target EQ / opposing pool.",
      invalidation:
        "No displacement; chop through open; major news in ~15m without plan.",
      checklist:
        "HTF aligned; killzone valid; risk pre-sized; liquidity objective named.",
      active: true,
    },
    {
      user_id: null,
      name: "NY continuation",
      symbol: null,
      timeframe: "NY cash",
      rules:
        "London directional leg → NY continues → pullback to premium/discount of leg → OB/FVG confluence.",
      invalidation: "CHoCH against London impulse before trigger; surprise high-impact against thesis.",
      checklist: "Objective for partials; MAE defined.",
      active: true,
    },
    {
      user_id: null,
      name: "Liquidity reversal",
      symbol: null,
      timeframe: "Any",
      rules: "Raid pool → MSS/CHoCH → retest broken structure or inverted PD array.",
      invalidation: "Sweep-and-go acceptance; strong one-way trend day.",
      checklist: "Sweep depth vs ATR; news filter.",
      active: true,
    },
    {
      user_id: null,
      name: "FVG retrace entry",
      symbol: null,
      timeframe: "LTF",
      rules: "Displacement with HTF bias → valid FVG → retrace into gap → confirmation close.",
      invalidation: "Close through FVG against bias without reaction; opposing sweep breaks local structure.",
      checklist: "FVG timeframe matches plan; stop beyond invalidation swing.",
      active: true,
    },
  ];

  for (const r of rows) {
    const { error } = await supabase.from("axe_strategy_playbooks").insert(r);
    if (error) console.error("Playbook insert", r.name, error.message);
    else console.log("Playbook:", r.name);
  }
}

async function main() {
  console.log("Seeding knowledge markdown…");
  await seedMarkdownFiles();
  console.log("Seeding template strategy playbooks (global)…");
  await seedStrategyPlaybooks();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
