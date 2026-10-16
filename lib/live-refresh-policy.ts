export type LiveRefreshDecision = "ignore" | "refresh" | "notice";

export function liveRefreshDecision({
  preserveWork,
  autoRefreshing,
  submitting,
  dirtyForm,
  openDialog,
}: {
  preserveWork: boolean;
  autoRefreshing: boolean;
  submitting: boolean;
  dirtyForm: boolean;
  openDialog: boolean;
}): LiveRefreshDecision {
  if (autoRefreshing || submitting) return "ignore";
  if (preserveWork && (dirtyForm || openDialog)) return "notice";
  return "refresh";
}
