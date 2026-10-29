import { AxeTopBarInjector } from "@/components/axe/AxeTopBarInjector";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserAxeEntitlement } from "@/services/billingService";
import Link from "next/link";

export default async function FeedbackPage() {
  const supabase = await createServerSupabaseClient();
  let founderTagged = false;
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const ent = await getUserAxeEntitlement(supabase, user.id);
      founderTagged = ent.plan === "founder" || ent.founderBadge;
    }
  }

  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-6">
      <AxeTopBarInjector
        title="Feedback"
        subtitle="Direct product channel"
        sections={[]}
        center={
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
            Feedback
          </span>
        }
      />
      <FeedbackForm founderTagged={founderTagged} />
      <p className="text-center text-[10px] text-tos-dim">
        Need help?{" "}
        <Link href="/support" className="underline-offset-2 hover:underline">
          Support
        </Link>
      </p>
    </div>
  );
}
