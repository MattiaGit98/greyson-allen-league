"use client";

import { MovementTextSearch } from "@/components/movement-text-search";

export function MovementFilter({
  selectedType,
  options,
  historyDays,
  searchQuery,
}: {
  selectedType: string;
  options: Array<{ value: string; label: string }>;
  historyDays: number;
  searchQuery: string;
}) {
  return (
    <form className="movement-filter" action="/movimenti" method="get">
      <label>
        <span>Mostra</span>
        <select
          name="type"
          defaultValue={selectedType}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          <option value="all">Tutti i movimenti</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <MovementTextSearch
        initialValue={searchQuery}
        path="/movimenti"
        preservedParams={{ type: selectedType === "all" ? undefined : selectedType }}
      />
      <small>Ultimi {historyDays} giorni</small>
    </form>
  );
}
