import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSeeFounderDiscord, founderDiscordInviteUrl } from "@/lib/founder/discord";

describe("founder discord", () => {
  it("visibility for Founders", () => {
    assert.equal(canSeeFounderDiscord({ plan: "founder", founderBadge: false }), true);
    assert.equal(canSeeFounderDiscord({ plan: "free", founderBadge: true }), true);
    assert.equal(canSeeFounderDiscord({ plan: "pro", founderBadge: false }), false);
  });

  it("returns null when invite unset", () => {
    const prev = process.env.NEXT_PUBLIC_FOUNDER_DISCORD_INVITE;
    delete process.env.NEXT_PUBLIC_FOUNDER_DISCORD_INVITE;
    delete process.env.FOUNDER_DISCORD_INVITE;
    assert.equal(founderDiscordInviteUrl(), null);
    if (prev !== undefined) process.env.NEXT_PUBLIC_FOUNDER_DISCORD_INVITE = prev;
  });

  it("accepts discord.gg https invite", () => {
    process.env.NEXT_PUBLIC_FOUNDER_DISCORD_INVITE = "https://discord.gg/example";
    assert.equal(founderDiscordInviteUrl(), "https://discord.gg/example");
    delete process.env.NEXT_PUBLIC_FOUNDER_DISCORD_INVITE;
  });
});
