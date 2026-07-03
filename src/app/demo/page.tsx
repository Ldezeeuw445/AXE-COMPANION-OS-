import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AXE Demo Login",
  description: "One-tap public demo entry for AXE Companion.",
};

export default async function DemoEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const resolved = await searchParams;
  const to = typeof resolved?.to === "string" ? resolved.to : "/chart?symbol=XAUUSD&tf=H1";
  const safeTo = to.startsWith("/") ? to : "/chart?symbol=XAUUSD&tf=H1";

  return (
    <main
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(70% 65% at 50% 5%, rgba(67,215,255,0.14), rgba(7,8,10,0.98) 55%)",
        color: "#e9f3ff",
        display: "grid",
        placeItems: "center",
        padding: 24,
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: "min(520px, 92vw)",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(8,10,14,0.86)",
          padding: "24px 22px",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.06), 0 28px 52px rgba(0,0,0,0.45)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            fontSize: 11,
            letterSpacing: ".18em",
            textTransform: "uppercase",
            color: "rgba(203,244,255,0.95)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "#44db84",
              boxShadow: "0 0 12px rgba(68,219,132,.7)",
            }}
          />
          AXE Public Demo
        </div>
        <h1 style={{ margin: 0, fontSize: "clamp(24px, 4vw, 34px)", lineHeight: 1.06 }}>
          Opening the real app demo
        </h1>
        <p
          style={{
            margin: "12px auto 0",
            maxWidth: 420,
            fontSize: 14,
            lineHeight: 1.65,
            color: "rgba(226,237,249,0.75)",
          }}
        >
          We are creating a temporary demo session and redirecting you to the
          live AXE interface.
        </p>
        <p id="demo-status" style={{ marginTop: 14, fontSize: 12, color: "rgba(143,220,241,0.95)" }}>
          Connecting…
        </p>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (async function () {
              var to = ${JSON.stringify(safeTo)};
              var status = document.getElementById("demo-status");
              try {
                var res = await fetch("/api/auth/demo", { method: "POST" });
                var body = {};
                try { body = await res.json(); } catch (_) {}
                if (!res.ok || !body.ok) {
                  if (status) status.textContent = body.error || "Demo sign-in failed.";
                  return;
                }
                if (status) status.textContent = "Connected. Launching app…";
                window.location.replace(to);
              } catch (error) {
                if (status) status.textContent = "Network error. Please retry.";
              }
            })();
          `,
        }}
      />
    </main>
  );
}
