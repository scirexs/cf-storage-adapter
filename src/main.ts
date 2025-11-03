export { getBOS, getKVSEventual, getKVSRealtime, getRDBConnectionString, getRDBEventual };

import type {
  BOListOptions,
  BOMetadata,
  BOPutOptions,
  ConsistencyType,
  IBOStore,
  IKVEventualStore,
  IKVRealtimeStore,
  IRDBEventualStore,
  KVGetOptions,
  KVListOptions,
  KVPutOptions,
  KVValue,
} from "./types.ts";
import { DOKVS } from "./cfobj.ts";

/**
 * Get an eventual consistency Key-Value Store instance from environment bindings
 *
 * Retrieves a KV Namespace binding and wraps it in a portable IKVEventualStore interface.
 * This store provides eventual consistency suitable for caching and non-critical data.
 *
 * @param name - Name of the KV Namespace binding defined in wrangler.jsonc
 * @param env - Cloudflare Workers environment containing bindings
 * @returns Key-Value Store instance with eventual consistency
 * @throws {Error} If the specified binding name doesn't exist or is not a KV Namespace
 *
 * @example
 * ```ts
 * const kvs = getKVSEventual(env, "MY_WORKERS_KV");
 * await kvs.put("key", "value", { ttl: 3600 });
 * ```
 */
function getKVSEventual(name: string, env: Env): IKVEventualStore {
  const obj = getEnvProp(env, name);
  if (isKVNamespace(obj)) return new KVEventualStore(obj);
  throw new Error(`"${name}" is not binding as KV Namespace.`);
}
/**
 * Get a strong consistency Key-Value Store instance from environment bindings
 *
 * Retrieves a Durable Objects binding and wraps it in a portable IKVRealtimeStore interface.
 * This store provides strong consistency suitable for critical data requiring immediate reads after writes.
 *
 * @param name - Name of the Durable Object binding defined in wrangler.jsonc
 * @param env - Cloudflare Workers environment containing bindings
 * @returns Key-Value Store instance with strong consistency
 * @throws {Error} If the specified binding name doesn't exist or is not a Durable Objects namespace
 *
 * @example
 * ```ts
 * const kvs = getKVSRealtime(env, "MY_DURABLE_OBJ");
 * await kvs.put("lastAccess", Date.now().toString());
 * ```
 */
function getKVSRealtime(name: string, env: Env): IKVRealtimeStore {
  const obj = getEnvProp(env, name);
  if (isDurableObjectNamespace(obj)) return new KVRealtimeStore(obj);
  throw new Error(`"${name}" is not binding as Durable Objects.`);
}
/**
 * Get an eventual consistency Relational Database Store instance from environment bindings
 *
 * Retrieves a D1 Database binding and wraps it in a portable IRDBEventualStore interface.
 * This store provides SQL query execution with eventual consistency.
 *
 * @param name - Name of the D1 Database binding defined in wrangler.jsonc
 * @param env - Cloudflare Workers environment containing bindings
 * @returns Relational Database Store instance with eventual consistency
 * @throws {Error} If the specified binding name doesn't exist or is not a D1 Database
 *
 * @example
 * ```ts
 * const rdb = getRDBEventual(env, "MY_D1_RDB");
 * const users = await rdb.query("SELECT * FROM users WHERE id = ?", userId);
 * ```
 */
function getRDBEventual(name: string, env: Env): IRDBEventualStore {
  const obj = getEnvProp(env, name);
  if (isD1Database(obj)) return new RDBEventualStore(obj);
  throw new Error(`"${name}" is not binding as D1 Database.`);
}
/**
 * Get a database connection string from environment bindings
 *
 * Retrieves a Hyperdrive binding and returns its connection string for use with
 * external database clients or ORMs.
 *
 * @param name - Name of the Hyperdrive binding defined in wrangler.jsonc
 * @param env - Cloudflare Workers environment containing bindings
 * @returns Connection string of Hyperdrive  (e.g., "postgresql://user:pass@host:port/db")
 * @throws {Error} If the specified binding name doesn't exist or is not a Hyperdrive instance
 *
 * @example
 * ```ts
 * const connStr = getRDBConnectionString(env, "MY_HYPERDRIVE");
 * const client = new PostgresClient(connStr);
 * ```
 */
function getRDBConnectionString(name: string, env: Env): string {
  const obj = getEnvProp(env, name);
  if (isHyperdrive(obj)) return obj.connectionString;
  throw new Error(`"${name}" is not binding as Hyperdrive.`);
}
/**
 * Get a Binary Object Store instance from environment bindings
 *
 * Retrieves an R2 Bucket binding and wraps it in a portable IBOStore interface,
 * allowing easy migration between different cloud storage providers.
 *
 * @param name - Name of the R2 Bucket binding defined in wrangler.jsonc
 * @param env - Cloudflare Workers environment containing bindings
 * @returns Binary Object Store instance with strong consistency
 * @throws {Error} If the specified binding name doesn't exist or is not an R2 Bucket
 *
 * @example
 * ```ts
 * const storage = getBOS(env, "MY_R2_BUCKET");
 * await storage.put("file.txt", buffer);
 * ```
 */
function getBOS(name: string, env: Env): IBOStore {
  const obj = getEnvProp(env, name);
  if (isR2Bucket(obj)) return new BOStore(obj);
  throw new Error(`"${name}" is not binding as R2 Bucket.`);
}

function getEnvProp(env: Env, name: string): unknown {
  // @ts-expect-error: the string of name is unknown
  return env[name] as unknown;
}
function isDurableObjectNamespace(obj: unknown): obj is DurableObjectNamespace<DOKVS> {
  if (!obj) return false;
  if (typeof DurableObjectNamespace !== "undefined") return typeof obj === "object" && obj instanceof DurableObjectNamespace;
  return ["newUniqueId", "idFromName", "idFromString", "get", "getByName", "jurisdiction"].every((method) =>
    typeof (obj as Record<string, unknown>)[method] === "function"
  );
}
function isKVNamespace(obj: unknown): obj is KVNamespace {
  if (!obj || typeof obj !== "object") return false;
  return ["get", "put", "delete", "list", "getWithMetadata"].every((method) =>
    typeof (obj as Record<string, unknown>)[method] === "function"
  );
}
function isD1Database(obj: unknown): obj is D1Database {
  if (!obj) return false;
  if (typeof D1Database !== "undefined") return typeof obj === "object" && obj instanceof D1Database;
  return ["prepare", "batch", "exec", "withSession"].every((method) => typeof (obj as Record<string, unknown>)[method] === "function");
}
function isHyperdrive(obj: unknown): obj is Hyperdrive {
  if (!obj || typeof obj !== "object") return false;
  return ["connect", "connectionString", "host", "port", "user", "password", "database"].every((method) => method in obj);
}
function isR2Bucket(obj: unknown): obj is R2Bucket {
  if (!obj) return false;
  if (typeof R2Bucket !== "undefined") return typeof obj === "object" && obj instanceof R2Bucket;
  return ["head", "get", "put", "delete", "list", "createMultipartUpload", "resumeMultipartUpload"].every((method) =>
    typeof (obj as Record<string, unknown>)[method] === "function"
  );
}

class KVEventualStore implements IKVEventualStore {
  #KVNS;
  constructor(arg: KVNamespace) {
    this.#KVNS = arg;
  }
  get consistency(): ConsistencyType {
    return "eventual";
  }

  async get(key: string, options?: KVGetOptions): Promise<KVValue | undefined> {
    return options?.type === "bytes"
      ? await this.#KVNS.get(key, "arrayBuffer") ?? undefined
      : await this.#KVNS.get(key, "text") ?? undefined;
  }
  async put(key: string, value: KVValue, options?: KVPutOptions) {
    await this.#KVNS.put(key, value, KVEventualStore.#replacePutOption(options));
  }
  async delete(key: string) {
    await this.#KVNS.delete(key);
  }
  async list(options?: KVListOptions): Promise<Map<string, number>> {
    const result = (await this.#KVNS.list(options)).keys;
    return new Map(result.map((x) => [x.name, x.expiration ?? 0]));
  }
  static #replacePutOption(options?: KVPutOptions): KVNamespacePutOptions | undefined {
    if (!options || Object.keys(options).length <= 0) return;
    return {
      expiration: options.expiration,
      expirationTtl: options.ttl,
    };
  }
}

class KVRealtimeStore implements IKVRealtimeStore {
  static #DOKVS_NAME = "DOKVS";
  #DOKVS;
  constructor(arg: DurableObjectNamespace<DOKVS>) {
    this.#DOKVS = arg.get(arg.idFromName(KVRealtimeStore.#DOKVS_NAME));
  }
  get consistency(): ConsistencyType {
    return "strong";
  }

  async get(key: string, _options?: KVGetOptions): Promise<KVValue | undefined> {
    return await this.#DOKVS.get(key);
  }
  async put(key: string, value: KVValue, options?: KVPutOptions) {
    return await this.#DOKVS.put(key, value, KVRealtimeStore.#getTTL(options));
  }
  async delete(key: string) {
    return await this.#DOKVS.delete(key);
  }
  async list(options?: KVListOptions): Promise<Map<string, number>> {
    return await this.#DOKVS.list(options);
  }
  static #getTTL(options?: KVPutOptions): number {
    if (!options) return 0;
    if (options.expiration) return options.expiration;
    if (!options.ttl) return 0;
    return DOKVS.now() + options.ttl;
  }
}

class RDBEventualStore implements IRDBEventualStore {
  #D1;
  constructor(arg: D1Database) {
    this.#D1 = arg;
  }
  get consistency(): ConsistencyType {
    return "eventual";
  }
  async query<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]> {
    const result = await this.#D1.prepare(sql).bind(...params).run<T>();
    return result.success ? result.results : [];
  }
  async first<T = unknown>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const result = await this.#D1.prepare(sql).bind(...params).first<T>();
    return result ?? undefined;
  }
  async execute(sql: string, ...params: unknown[]): Promise<{ rows: number }> {
    const result = await this.#D1.prepare(sql).bind(...params).run();
    return { rows: result.meta.changes };
  }
  async batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<Array<{ rows: number }>> {
    if (!statements.length) return [];
    const results = await this.#D1.batch(statements.map(({ sql, params }) => {
      return params?.length ? this.#D1.prepare(sql).bind(...params) : this.#D1.prepare(sql);
    }));
    return results.map((x) => ({ rows: x.success ? x.meta.changes : 0 }));
  }
}

class BOStore implements IBOStore {
  #R2;
  constructor(arg: R2Bucket) {
    this.#R2 = arg;
  }
  get consistency(): ConsistencyType {
    return "strong";
  }

  async get(key: string): Promise<ArrayBuffer | undefined> {
    const result = await this.#R2.get(key);
    return await result?.arrayBuffer?.();
  }
  async put(key: string, data: ArrayBuffer, options?: BOPutOptions): Promise<void> {
    await this.#R2.put(key, data, options);
  }
  async delete(key: string): Promise<void> {
    await this.#R2.delete(key);
  }
  async list(options?: BOListOptions): Promise<Map<string, BOMetadata>> {
    const result = await this.#R2.list(options);
    return new Map(result.objects.map((x) => [x.key, BOStore.#toBOMetadata(x)]));
  }
  async head(key: string): Promise<BOMetadata | undefined> {
    const result = await this.#R2.head(key);
    if (!result) return;
    return BOStore.#toBOMetadata(result);
  }
  static #toBOMetadata(obj: R2Object): BOMetadata {
    return {
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded,
      httpMetadata: obj.httpMetadata,
      customMetadata: obj.customMetadata,
    };
  }
}
