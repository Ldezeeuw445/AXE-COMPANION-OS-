import { NextResponse } from "next/server";

/**
 * GET /api/debug/build
 *
 * Which commit is actually serving, and when it was built.
 *
 * This exists because "the deploy is live" was a guess for most of this
 * project's life. The VPS pulls and rebuilds on a cron; a failed build
 * restarts nothing and the previous process keeps serving quite happily, so a
 * green `git push` proves only that GitHub accepted it. One request here now
 * settles it, and `age` makes a stuck deploy obvious without arithmetic.
 *
 * Public on purpose: a commit hash is an opaque identifier, and a version
 * endpoint nobody can reach cannot be used from a phone at the moment the
 * question comes up. It carries no configuration and no secrets.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const builtAt = process.env.AXE_BUILD_TIME || null;
  const builtMs = builtAt ? Date.parse(builtAt) : Number.NaN;

  return NextResponse.json(
    {
      // Empty when the build host had no git checkout — unknown, not wrong.
      commit: process.env.AXE_BUILD_COMMIT || null,
      shortCommit: (process.env.AXE_BUILD_COMMIT || "").slice(0, 7) || null,
      branch: process.env.AXE_BUILD_BRANCH || null,
      builtAt,
      ageSeconds: Number.isFinite(builtMs)
        ? Math.max(0, Math.round((Date.now() - builtMs) / 1000))
        : null,
      now: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
