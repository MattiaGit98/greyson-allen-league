import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("migrazione della capacità stagionale Two-way", () => {
  it("aggiunge solo la capacità al confronto canonico, mantenendo la protezione e la compatibilità con i vecchi stati", () => {
    const source = readFileSync("supabase/migrations/20261030001055_seasonal_two_way_capacity.sql", "utf8");
    const previous = readFileSync("supabase/migrations/20261003130133_state_concurrency_and_atomic_admin_operations.sql", "utf8");
    const body = source.split("$$")[1];
    const oldBody = previous.split("$$")[1];
    const withoutCapacity = body.replace(/'twoWaySlotLimit', case when jsonb_typeof\(state_payload->'twoWaySlotLimit'\) = 'number'\s+then state_payload->'twoWaySlotLimit' else '2'::jsonb end,/, "");
    expect(withoutCapacity.replace(/\s+/g, "")).toBe(oldBody.replace(/\s+/g, ""));
    expect(source).toContain("security invoker");
    expect(source).toContain("set search_path = ''");
    expect(source).toContain("from public, anon, authenticated");
    expect(source).not.toMatch(/\b(update|insert into|delete from|alter table)\s+public\./i);
  });
});
