"use client";
import { useResource } from "./source";
import { buildPairs } from "./derive";
import type { BackendEvent, Pool } from "./types";

export const usePool = (poll = 5000) => useResource<Pool>("pool", (a) => a.pool(), poll);
export const useCommittee = () => useResource<any>("committee", (a) => a.committee(), 8000);
export const useEvents = () => useResource<BackendEvent[]>("events", (a) => a.events(0), 3000);
export const useLoop = (id: string | null) => useResource<any>(id ? `loop:${id}` : null, (a) => a.loop(id!), 4000);
export const useQueries = () => useResource<Record<string, string>>("queries", (a) => a.queries());

/** All published pairs across hospitals, each with its current loop. */
export const usePairs = () =>
  useResource("pairs", async (a) => {
    const pool = await a.pool();
    const hs = await Promise.all(pool.hospitals.map((h) => a.hospital(h.code)));
    return { pool, rows: buildPairs(pool, hs) };
  }, 10000);
