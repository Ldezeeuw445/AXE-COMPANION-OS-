"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { hasSupabaseConfig } from "@/lib/env";
import { signInAction, signUpAction } from "@/app/actions/auth";
import { GlassPanel } from "@/components/ui/GlassPanel";

type ActionResult = { error?: string; message?: string } | undefined;

function SubmitButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="tos-btn-cyan w-full rounded-2xl py-3 text-sm font-semibold disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export function LoginForm() {
  const supabaseConfigured = hasSupabaseConfig();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInFormAction] = useActionState<ActionResult, FormData>(signInAction, undefined);
  const [signUpState, signUpFormAction] = useActionState<ActionResult, FormData>(signUpAction, undefined);

  const state = mode === "signin" ? signInState : signUpState;

  return (
    <GlassPanel glow="warm" className="p-6">
      <div>
        <h2 className="text-sm font-bold text-tos-text">{mode === "signin" ? "Sign in" : "Create account"}</h2>
        <p className="mt-1 text-xs text-tos-muted">
          {mode === "signin"
            ? "Use the email and password for your Trading OS Supabase user."
            : "Create a new user in the same Supabase project. If email confirmation is on, check your inbox then sign in."}
        </p>
      </div>

      {supabaseConfigured ? (
        <>
          {mode === "signin" ? (
            <form action={signInFormAction} className="mt-5 space-y-3">
              <div>
                <label htmlFor="email" className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text placeholder:text-tos-dim"
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text placeholder:text-tos-dim"
                  required
                />
              </div>
              {state?.error ? (
                <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400" role="alert">
                  {state.error}
                </p>
              ) : null}
              <SubmitButton label="Enter Trading OS" />
            </form>
          ) : (
            <form action={signUpFormAction} className="mt-5 space-y-3">
              <div>
                <label htmlFor="su-email" className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
                  Email
                </label>
                <input
                  id="su-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text placeholder:text-tos-dim"
                  required
                />
              </div>
              <div>
                <label htmlFor="su-password" className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
                  Password
                </label>
                <input
                  id="su-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text placeholder:text-tos-dim"
                  required
                  minLength={8}
                />
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-snug text-tos-muted">
                <input
                  type="checkbox"
                  name="acceptTerms"
                  required
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-white/20 bg-tos-bg/80 text-tos-accent-cyan focus:ring-tos-accent-cyan/40"
                />
                <span>
                  I agree to the{" "}
                  <Link href="/terms" className="text-tos-warm underline-offset-2 hover:underline">
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="text-tos-warm underline-offset-2 hover:underline">
                    Privacy Policy
                  </Link>{" "}
                  and understand that AXE does not provide financial advice.
                </span>
              </label>
              {state?.error ? (
                <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400" role="alert">
                  {state.error}
                </p>
              ) : null}
              {state?.message ? (
                <p className="rounded-xl bg-green-500/10 px-3 py-2 text-sm font-medium text-green-400" role="alert">
                  {state.message}
                </p>
              ) : null}
              <SubmitButton label="Create account" />
            </form>
          )}

          <p className="mt-5 border-t border-white/[0.06] pt-4 text-center text-xs text-tos-muted">
            {mode === "signin" ? (
              <>
                Need an account?{" "}
                <button
                  type="button"
                  className="font-medium text-tos-warm hover:underline"
                  onClick={() => setMode("signup")}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already registered?{" "}
                <button
                  type="button"
                  className="font-medium text-tos-warm hover:underline"
                  onClick={() => setMode("signin")}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </>
      ) : (
        <div className="mt-4 space-y-2 text-xs text-tos-muted">
          <p>
            Supabase is not configured. Copy{" "}
            <code className="rounded bg-white/5 px-1 font-mono text-[10px]">.env.local.example</code> to{" "}
            <code className="rounded bg-white/5 px-1 font-mono text-[10px]">.env.local</code> and set{" "}
            <code className="rounded bg-white/5 px-1 font-mono text-[10px]">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code className="rounded bg-white/5 px-1 font-mono text-[10px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, and{" "}
            <code className="rounded bg-white/5 px-1 font-mono text-[10px]">NEXT_PUBLIC_DATA_SOURCE=supabase</code>.
            Then restart <code className="rounded bg-white/5 px-1 font-mono text-[10px]">npm run dev</code>.
          </p>
        </div>
      )}
    </GlassPanel>
  );
}
