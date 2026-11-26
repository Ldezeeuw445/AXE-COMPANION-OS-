"use client";

import { useState, type ReactNode } from "react";
import "./home.css";

export function CockpitLearningSection({
  children,
  badge,
  alignmentScore,
  signalCount,
  message,
}: {
  children: ReactNode;
  badge?: string;
  alignmentScore?: number | null;
  signalCount?: number;
  message?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`home-v2 ${open ? "is-expanded" : ""}`} style={{ paddingTop: 0 }}>
      <article className={`home-card ${open ? "is-expanded" : ""}`}>
        <header className="home-card-h">
          <span className="home-card-title">Cockpit learning</span>
          <span className="grow" />
          {badge ? <span className="home-badge">{badge}</span> : null}
          <button
            type="button"
            className="home-expand"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg className="home-chev" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M2.5 4.5 L6 8 L9.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            {open ? "Collapse" : "Open"}
          </button>
        </header>
        {open ? (
          <div className="home-card-b" style={{ gap: 20 }}>
            {children}
          </div>
        ) : (
          <div className="home-card-b">
            <div className="home-gauges" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <div className="home-gauge">
                <div className="home-cap">AXE alignment</div>
                <div className="home-gauge-val">{alignmentScore != null ? alignmentScore : "—"}</div>
                <div className="home-gauge-sub">100 = fully aligned</div>
              </div>
              <div className="home-gauge">
                <div className="home-cap">Signals</div>
                <div className="home-gauge-val">{signalCount ?? "—"}</div>
                <div className="home-gauge-sub">From the latest snapshot</div>
              </div>
            </div>
            <p className="home-gauge-sub" style={{ marginTop: 10 }}>
              {message ||
                "Alignment, Learning Arc, confidence and behavior stay here — expand to open the full cockpit."}
            </p>
          </div>
        )}
      </article>
    </div>
  );
}
