import type { EditableLeagueState } from "./league-state";
import type { createSupabaseServerClient } from "./supabase/server";

type Supabase = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

export function replaceLeagueStateIfUnchanged(
  supabase: Supabase,
  expectedState: EditableLeagueState,
  nextState: EditableLeagueState,
  auditReason: string,
) {
  return supabase.rpc("replace_league_state_if_unchanged", {
    expected_state_payload: expectedState,
    next_state_payload: nextState,
    audit_reason: auditReason,
  });
}
