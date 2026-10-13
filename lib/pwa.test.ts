import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import manifest from "../app/manifest";

const projectRoot = process.cwd();

function pngSize(path: string) {
  const file = readFileSync(join(projectRoot, "public", "icons", path));
  expect(file.subarray(1, 4).toString()).toBe("PNG");
  return [file.readUInt32BE(16), file.readUInt32BE(20)];
}

describe("PWA online-only", () => {
  it("ha manifest installabile e icone delle dimensioni dichiarate", () => {
    const config = manifest();
    expect(config).toMatchObject({
      name: "Greyson Allen League",
      short_name: "Greyson Allen",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });
    for (const icon of config.icons ?? []) {
      const size = Number(icon.sizes?.split("x")[0]);
      expect(pngSize(icon.src.replace("/icons/", ""))).toEqual([size, size]);
    }
    expect(config.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
    expect(pngSize("apple-touch-icon.png")).toEqual([180, 180]);
    expect(pngSize("favicon-32.png")).toEqual([32, 32]);
  });

  it("non conserva pagine o dati nel service worker", () => {
    const worker = readFileSync(join(projectRoot, "public", "sw.js"), "utf8");
    expect(worker).toContain('event.request.mode !== "navigate"');
    expect(worker).toContain('fetch(event.request, { cache: "no-store" })');
    expect(worker).toContain("Connessione assente");
    expect(worker).not.toMatch(/caches\.|CacheStorage|precache|localStorage|indexedDB/i);
  });

  it("intercetta solo navigazioni GET; offline restituisce una pagina senza dati", async () => {
    const worker = readFileSync(join(projectRoot, "public", "sw.js"), "utf8");
    const handlers = new Map<string, (event: { request: { method: string; mode: string }; respondWith: (response: Promise<Response>) => void }) => void>();
    const fetched: Array<{ method: string; mode: string }> = [];
    runInNewContext(worker, {
      self: { addEventListener: (type: string, handler: (event: { request: { method: string; mode: string }; respondWith: (response: Promise<Response>) => void }) => void) => handlers.set(type, handler) },
      fetch: async (request: { method: string; mode: string }) => { fetched.push(request); throw new TypeError("offline"); },
      Response,
    });
    const handleFetch = handlers.get("fetch");
    expect(handleFetch).toBeDefined();
    let response: Promise<Response> | undefined;
    const respondWith = (value: Promise<Response>) => { response = value; };
    handleFetch?.({ request: { method: "POST", mode: "navigate" }, respondWith });
    handleFetch?.({ request: { method: "GET", mode: "cors" }, respondWith });
    expect(response).toBeUndefined();
    expect(fetched).toHaveLength(0);
    handleFetch?.({ request: { method: "GET", mode: "navigate" }, respondWith });
    expect((await response)?.status).toBe(503);
    expect((await response)?.headers.get("Cache-Control")).toBe("no-store");
    expect(await (await response)?.text()).toContain("Connessione assente");
    expect(fetched).toHaveLength(1);
  });
});
