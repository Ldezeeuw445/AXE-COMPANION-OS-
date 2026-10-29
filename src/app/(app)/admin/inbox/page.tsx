import { AxeTopBarInjector } from "@/components/axe/AxeTopBarInjector";
import { AdminInboxClient } from "@/components/admin/AdminInboxClient";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin/isAdmin";
import { redirect } from "next/navigation";

export default async function AdminInboxPage() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser({ userId: user.id, email: user.email })) {
    redirect("/settings");
  }

  return (
    <div className="axe-stagger-enter flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-6">
      <AxeTopBarInjector
        title="Admin inbox"
        subtitle="Priority support + Founder feedback"
        sections={[]}
        center={
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
            Admin inbox
          </span>
        }
      />
      <AdminInboxClient />
    </div>
  );
}
