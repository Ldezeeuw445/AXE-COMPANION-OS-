"use client";

import { useEffect, useState } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Badge } from "@/components/ui/Badge";

type Ticket = {
  id: string;
  subject: string;
  body: string;
  plan: string;
  priority: boolean;
  founder_badge: boolean;
  status: string;
  created_at: string;
};

type Feedback = {
  id: string;
  body: string;
  plan: string;
  founder_tagged: boolean;
  screenshot_path: string | null;
  created_at: string;
};

export function AdminInboxClient() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/inbox");
        const json = (await res.json()) as {
          error?: string;
          tickets?: Ticket[];
          feedback?: Feedback[];
        };
        if (!res.ok) {
          setError(json.error ?? "Forbidden or unavailable.");
          return;
        }
        setTickets(json.tickets ?? []);
        setFeedback(json.feedback ?? []);
      } catch {
        setError("Network error.");
      }
    })();
  }, []);

  if (error) return <p className="text-xs text-rose-300">{error}</p>;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-tos-dim">
          Support (priority first)
        </h2>
        {tickets.map((t) => (
          <GlassPanel key={t.id} className="p-3">
            <div className="flex flex-wrap items-center gap-1">
              {t.priority ? <Badge variant="warm">Priority</Badge> : null}
              {t.founder_badge ? <Badge variant="warm">Founder</Badge> : null}
              <Badge variant="neutral">{t.plan}</Badge>
              <Badge variant="neutral">{t.status}</Badge>
            </div>
            <p className="mt-2 text-sm font-medium text-tos-text">{t.subject}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-tos-muted">{t.body}</p>
            <p className="mt-2 text-[10px] text-tos-dim">{t.created_at}</p>
          </GlassPanel>
        ))}
        {tickets.length === 0 ? <p className="text-xs text-tos-dim">No tickets.</p> : null}
      </section>
      <section className="space-y-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-tos-dim">
          Product feedback (Founder-tagged first)
        </h2>
        {feedback.map((f) => (
          <GlassPanel key={f.id} className="p-3">
            <div className="flex flex-wrap items-center gap-1">
              {f.founder_tagged ? <Badge variant="warm">Founder</Badge> : null}
              <Badge variant="neutral">{f.plan}</Badge>
              {f.screenshot_path ? <Badge variant="long">Screenshot</Badge> : null}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-xs text-tos-muted">{f.body}</p>
            <p className="mt-2 text-[10px] text-tos-dim">{f.created_at}</p>
          </GlassPanel>
        ))}
        {feedback.length === 0 ? <p className="text-xs text-tos-dim">No feedback.</p> : null}
      </section>
    </div>
  );
}
