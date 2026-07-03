import { SmartOnboardingClient } from "@/components/onboarding/SmartOnboardingClient";
import { PageTitleInjector } from "@/components/shell/PageTitleInjector";

export default function OnboardingPage() {
  return (
    <div className="axe-stagger-enter flex flex-col gap-4 py-2">
      <PageTitleInjector title="Setup" premium />
      <SmartOnboardingClient />
    </div>
  );
}
