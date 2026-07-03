import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthUserAdapter } from "../contract";

export class SupabaseAuthAdapter implements AuthUserAdapter {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly userId?: string,
  ) {}

  async getCurrentUserId(): Promise<string> {
    if (this.userId) return this.userId;
    const {
      data: { user },
      error,
    } = await this.supabase.auth.getUser();
    if (error || !user) throw new Error("Not signed in");
    return user.id;
  }
}

/** Fixed user id for server actions that already resolved auth. */
export function authAdapterForUser(userId: string): AuthUserAdapter {
  return {
    getCurrentUserId: async () => userId,
  };
}
