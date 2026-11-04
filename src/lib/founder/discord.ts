/**
 * Founder Discord invite — cannot be created from code.
 * Set NEXT_PUBLIC_FOUNDER_DISCORD_INVITE to a full Discord invite URL to show
 * the button to Founders. When unset, UI shows "invite komt".
 */

export function founderDiscordInviteUrl(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_FOUNDER_DISCORD_INVITE?.trim() ||
    process.env.FOUNDER_DISCORD_INVITE?.trim() ||
    "";
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname.toLowerCase();
    const ok =
      host === "discord.gg" ||
      host.endsWith(".discord.gg") ||
      host === "discord.com" ||
      host.endsWith(".discord.com");
    if (!ok) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function canSeeFounderDiscord(opts: {
  plan: string;
  founderBadge: boolean;
}): boolean {
  return opts.plan === "founder" || opts.founderBadge;
}
