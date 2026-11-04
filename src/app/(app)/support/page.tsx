import { AxeTopBarInjector } from "@/components/axe/AxeTopBarInjector";
import { SupportForm } from "@/components/support/SupportForm";
import { FounderDiscordCard } from "@/components/founder/FounderDiscordCard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserAxeEntitlement } from "@/services/billingService";
import { isPrioritySupportPlan } from "@/lib/support/priority";
import {
  canSeeFounderDiscord,
  founderDiscordInviteUrl,
} from "@/lib/founder/discord";
import Link from "next/link";

export default async function SupportPage() {
  const supabase = await createServerSupabaseClient();
  let priorityEligible = false;
  let discordVisible = false;
  const inviteUrl = founderDiscordInviteUrl();

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const ent = await getUserAxeEntitlement(supabase, user.id);
      priorityEligible = isPrioritySupportPlan(ent.plan);
      discordVisible = canSeeFounderDiscord({
        plan: ent.plan,
        founderBadge: ent.founderBadge,
      });
    }
  }

  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-6">
      <AxeTopBarInjector
        title="Support"
        subtitle="In-app help"
        sections={[]}
        center={
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
            Support
          </span>
        }
      />
      <SupportForm priorityEligible={priorityEligible} />
      <FounderDiscordCard inviteUrl={inviteUrl} visible={discordVisible} />
      <p className="text-center text-[10px] text-tos-dim">
        Also see{" "}
        <Link href="/feedback" className="underline-offset-2 hover:underline">
          Feedback
        </Link>{" "}
        and{" "}
        <Link href="/roadmap" className="underline-offset-2 hover:underline">
          Roadmap
        </Link>
        .
      </p>
    </div>
  );
}
