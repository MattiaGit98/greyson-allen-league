import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { conciseMovementDetail, movementFilterOptions, movementOperationLabel } from "@/lib/movement-display";
import { MovementList } from "./movement-list";

const movementsPerPage = 25;
const movementHistoryDays = 365;

const movementDateFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string }>;
}) {
  const query = await searchParams;
  const selectedType = movementFilterOptions.some((option) => option.value === query.type) ? query.type! : "all";
  const requestedPage = positiveInteger(query.page) ?? 1;
  const since = new Date();
  since.setDate(since.getDate() - movementHistoryDays);

  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase non configurato: registro movimenti non disponibile.");

  const loadPage = (page: number) => {
    let request = supabase
      .from("league_movement_feed")
      .select("id,operation_type,summary,reverted,created_at", { count: "exact" })
      .eq("reverted", false)
      .gte("created_at", since.toISOString());
    if (selectedType !== "all") request = request.eq("operation_type", selectedType);
    const from = (page - 1) * movementsPerPage;
    return request.order("created_at", { ascending: false }).range(from, from + movementsPerPage - 1);
  };

  const initialResponse = await loadPage(requestedPage);
  if (initialResponse.error) throw new Error(`Registro movimenti non disponibile: ${initialResponse.error.message}`);
  const totalMovements = initialResponse.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalMovements / movementsPerPage));
  const currentPage = Math.min(requestedPage, totalPages);
  const response = currentPage === requestedPage ? initialResponse : await loadPage(currentPage);
  if (response.error) throw new Error(`Registro movimenti non disponibile: ${response.error.message}`);
  const movements = response.data ?? [];
  const pagination = paginationItems(currentPage, totalPages);

  return (
    <section className="section movements-page">
      <form className="movement-filter" action="/movimenti" method="get">
        <label>
          <span>Mostra</span>
          <select name="type" defaultValue={selectedType}>
            <option value="all">Tutti i movimenti</option>
            {movementFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button className="button secondary" type="submit">Applica filtro</button>
        <small>Ultimi {movementHistoryDays} giorni</small>
      </form>

      <MovementList historyDays={movementHistoryDays} movements={movements.map((movement) => {
        const operationType = String(movement.operation_type);
        const fullDetail = String(movement.summary);
        return {
          id: String(movement.id),
          dateTime: movement.created_at,
          displayedDate: formatMovementDate(movement.created_at),
          operation: movementOperationLabel(operationType),
          conciseDetail: conciseMovementDetail(operationType, fullDetail),
          fullDetail,
        };
      })} />

      {totalMovements > movementsPerPage && (
        <nav className="movement-pagination" aria-label="Pagine dei movimenti">
          {currentPage > 1 ? <Link href={pageHref(currentPage - 1, selectedType)}>Precedente</Link> : <span aria-disabled="true">Precedente</span>}
          {pagination.map((item, index) => item === null
            ? <i key={`ellipsis-${index}`} aria-hidden="true">…</i>
            : <Link className={item === currentPage ? "active" : ""} aria-current={item === currentPage ? "page" : undefined} key={item} href={pageHref(item, selectedType)}>{item}</Link>)}
          {currentPage < totalPages ? <Link href={pageHref(currentPage + 1, selectedType)}>Successiva</Link> : <span aria-disabled="true">Successiva</span>}
        </nav>
      )}
    </section>
  );
}

function pageHref(page: number, type: string) {
  const params = new URLSearchParams();
  if (type !== "all") params.set("type", type);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/movimenti?${query}` : "/movimenti";
}

function paginationItems(currentPage: number, totalPages: number) {
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1].filter((page) => page >= 1 && page <= totalPages));
  const sorted = [...pages].sort((left, right) => left - right);
  return sorted.flatMap((page, index) => index > 0 && page - sorted[index - 1] > 1 ? [null, page] : [page]);
}

function positiveInteger(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatMovementDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : movementDateFormatter.format(date);
}
