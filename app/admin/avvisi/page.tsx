import { PublicNoticeEditor } from "./public-notice-editor";
import { loadEditableLeagueState } from "@/lib/league-state";

export default async function PublicNoticesPage() {
  const state = await loadEditableLeagueState();
  return (
    <section className="section page-top admin-dashboard public-notices-page">
      <PublicNoticeEditor initialNotice={state.publicNotice ?? ""} />
    </section>
  );
}
