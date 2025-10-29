import type { KVListOptions, KVValue } from "./types.ts";
import { DurableObject } from "cloudflare:workers";

interface SelectRow {
  val: string;
  vtype: number;
  [key: string]: SqlStorageValue;
}

/**
 * A strongly consistent key-value store implementation using Cloudflare Durable Objects.
 * Supports string and binary values with optional TTL (time-to-live) functionality.
 */
export class DOKVS extends DurableObject<Env> {
  /**
   * Creates a new DOKVS instance.
   * Initializes the SQL storage and creates necessary tables if they don't exist.
   *
   * @param ctx - The Durable Object state context
   * @param env - The Cloudflare Workers environment bindings
   */
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.#sql = ctx.storage.sql;
    DOKVS.#initialize(ctx);
  }

  #sql: SqlStorage;
  #interval: number = 86400;
  #timing: number = 0;

  static #VTYPE = { string: 0, buffer: 1 };
  static #TABLE =
    "create table if not exists dokvs (key string primary key not null, val text not null, ttl integer not null, vtype integer not null);";
  static #INDEX = "create index expindex on dokvs(ttl);";
  static #UPSERT =
    "insert into dokvs (key, val, ttl, vtype) values (?, ?, ?, ?) on conflict (key) do update set val = excluded.val, ttl = excluded.ttl, vtype = excluded.vtype;";
  static #SELECT = "select val, vtype from dokvs where key = ? and (ttl = 0 or ttl >= ?);";
  static #LIST = "select key, ttl from dokvs where key like ? and (ttl = 0 or ttl >= ?) limit ?;";
  static #DELETE = "delete from dokvs where key = ?;";
  static #CLEAR = "delete from dokvs;";
  static #CLEANUP = "delete from dokvs where ttl > 0 and ttl < ?;";

  static #initialize(ctx: DurableObjectState) {
    ctx.blockConcurrencyWhile(async () => {
      if (await DOKVS.#isTable(ctx)) return;
      await DOKVS.#createTable(ctx);
    });
  }
  static async #isTable(ctx: DurableObjectState): Promise<boolean> {
    return await ctx.storage.get("init") ?? false;
  }
  static async #createTable(ctx: DurableObjectState): Promise<void> {
    await ctx.storage.put("init", true);
    ctx.storage.sql.exec(DOKVS.#TABLE);
    ctx.storage.sql.exec(DOKVS.#INDEX);
  }
  static #toStoreValue(value: KVValue): [string, number] {
    switch (typeof value) {
      case "string":
        return [value, DOKVS.#VTYPE.string];
      default:
        return [DOKVS.#bin2str(new Uint8Array(value)), DOKVS.#VTYPE.buffer];
    }
  }
  static #bin2str(bin: Uint8Array): string {
    return Array.from(bin)
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  }
  static #toUseValue(value: string, vtype: number): KVValue | undefined {
    switch (vtype) {
      case DOKVS.#VTYPE.string:
        return value;
      case DOKVS.#VTYPE.buffer:
        return DOKVS.#str2bin(value);
    }
  }
  static #str2bin(str: string): ArrayBuffer {
    return new Uint8Array(str.match(/.{2}/g)!.map((x) => parseInt(x, 16))).buffer;
  }
  /**
   * Returns the current Unix timestamp in seconds.
   *
   * @returns Current time as Unix timestamp (seconds)
   */
  static now(): number {
    return Math.trunc(Date.now() / 1000);
  }

  /**
   * Retrieves a value from the store by key.
   * Returns undefined if the key doesn't exist or has expired.
   *
   * @param key - The key to retrieve
   * @returns The stored value, or undefined if not found or expired
   */
  get(key: string): KVValue | undefined {
    const result = this.#sql.exec<SelectRow>(DOKVS.#SELECT, key, DOKVS.now()).next();
    return result.done ? undefined : DOKVS.#toUseValue(result.value.val, result.value.vtype);
  }
  /**
   * Stores a key-value pair with optional expiration.
   * If the key already exists, its value and expiration will be updated.
   * If expiration is in the past, the operation is ignored.
   *
   * @param key - The key to store
   * @param value - The value to store (string or ArrayBuffer)
   * @param expiration - Optional Unix timestamp (seconds) for expiration. 0 or undefined means no expiration
   */
  put(key: string, value: KVValue, expiration?: number) {
    const exp = Math.trunc(expiration ?? 0);
    if (exp && exp < DOKVS.now()) return;
    const [v, vt] = DOKVS.#toStoreValue(value);
    this.ctx.waitUntil(
      Promise.resolve().then(() => {
        this.#sql.exec(DOKVS.#UPSERT, key, v, exp, vt);
        this.#cleanup();
      }),
    );
  }
  /**
   * Deletes a key-value pair from the store.
   * The operation is asynchronous and non-blocking.
   *
   * @param key - The key to delete
   */
  delete(key: string) {
    this.ctx.waitUntil(Promise.resolve().then(() => this.#sql.exec(DOKVS.#DELETE, key)));
  }
  /**
   * Removes all key-value pairs from the store.
   * The operation is asynchronous and non-blocking.
   */
  clear() {
    this.ctx.waitUntil(Promise.resolve().then(() => this.#sql.exec(DOKVS.#CLEAR)));
  }
  /**
   * Lists keys in the store with optional filtering.
   * Returns a map of keys to their expiration timestamps (0 means no expiration).
   *
   * @param options - Optional listing options
   * @param options.prefix - Filter keys by prefix (default: "")
   * @param options.limit - Maximum number of keys to return (1-1000, default: 1000)
   * @param ignoreTtl - Listing all entries regardless of TTL
   * @returns Map of keys to their expiration Unix timestamps
   */
  list(options?: KVListOptions, ignoreTtl?: boolean): Map<string, number> {
    const prefix = options?.prefix === "%" ? "%" : (options?.prefix ?? "") + "%";
    const limit = Math.trunc(Math.min(Math.max(options?.limit ?? 1000, 1), 1000));
    const result = this.#sql.exec(DOKVS.#LIST, prefix, ignoreTtl ? 0 : DOKVS.now(), limit).toArray() as { key: string; ttl: number }[];
    return new Map(result.map(({ key, ttl }) => [key, ttl]));
  }
  /**
   * Configures the interval for automatic cleanup of expired entries.
   *
   * @param interval - Cleanup interval in seconds (must be positive)
   * @param reset - If true, resets the cleanup timer immediately
   */
  setCleanupInterval(interval: number, reset?: boolean) {
    if (interval <= 0) return;
    this.#interval = Math.trunc(interval);
    if (reset) this.#timing = DOKVS.now() + this.#interval;
  }
  #cleanup() {
    if (this.#timing >= DOKVS.now()) return;
    const now = DOKVS.now();
    this.#timing = now + this.#interval;
    this.#sql.exec(DOKVS.#CLEANUP, now);
  }
}
