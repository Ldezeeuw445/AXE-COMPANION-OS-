import Link from "next/link";

export default function RootNotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
        background: "#060608",
        color: "#fff",
        fontFamily: "system-ui, -apple-system, sans-serif",
        textAlign: "center",
        padding: "1.5rem",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>◇</div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
        Page not found
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.5)",
          maxWidth: 320,
          margin: "0 auto 24px",
        }}
      >
        This page doesn&apos;t exist.
      </p>
      <Link
        href="/"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          color: "#fff",
          padding: "10px 20px",
          fontSize: 14,
          textDecoration: "none",
        }}
      >
        Go home
      </Link>
    </div>
  );
}
