export type {
  BOHttpMetadata,
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
};

type ConsistencyType = "strong" | "eventual";
type KVValue = string | ArrayBuffer;

// ============================================================================
// For Storing KV Data
// ============================================================================

/** Interface of storing eventual KV data */
interface IKVEventualStore {
  /** Type of storing consistency */
  consistency: ConsistencyType;

  /**
   * Get a stored value by key
   * @param key Key to retrieve
   * @returns Stored value, or undefined if not found
   */
  get(key: string, options?: KVGetOptions): Promise<KVValue | undefined>;

  /**
   * Set a string / binary value
   * @param key Key to set
   * @param value string / binary value
   * @param options Options including TTL
   */
  put?(key: string, value: KVValue, options?: KVPutOptions): Promise<void>;

  /**
   * Delete a key
   * @param key Key to delete
   */
  delete?(key: string): Promise<void>;

  /**
   * List keys
   * @param options Listing options
   * @returns Stored keys, and the expirations
   */
  list(options?: KVListOptions): Promise<Map<string, number>>;
}

/** Interface of storing realtime KV data */
interface IKVRealtimeStore extends IKVEventualStore {
  /**
   * Set a string / binary value
   * @param key Key to set
   * @param value string / binary value
   * @param options Options including TTL
   */
  put(key: string, value: KVValue, options?: KVPutOptions): Promise<void>;

  /**
   * Delete a key
   * @param key Key to delete
   */
  delete(key: string): Promise<void>;
}

/** Options for KV get operation */
interface KVGetOptions {
  /** Type of stored value */
  type?: "string" | "bytes";
}

/** Options for KV put operation */
interface KVPutOptions {
  /** Expiration time as UNIX timestamp (absolute) */
  expiration?: number;
  /** Expiration time in seconds (relative) */
  ttl?: number;
}

/** Options for listing KV keys */
interface KVListOptions {
  prefix?: string;
  limit?: number;
}

// ============================================================================
// For Storing RDB Data
// ============================================================================

/** Interface of eventual storing RDB data like Cloudflare D1 SQL Database */
interface IRDBEventualStore {
  /** Type of storing consistency */
  consistency: ConsistencyType;

  /**
   * Execute a query (SELECT, etc.)
   * @param sql SQL statement
   * @param params Bind parameters
   * @returns Query results
   */
  query<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]>;

  /**
   * Execute a query (SELECT, etc.), and return first row
   * @param sql SQL statement
   * @param params Bind parameters
   * @returns First result of the query
   */
  first<T = unknown>(sql: string, ...params: unknown[]): Promise<T | undefined>;

  /**
   * Execute an update statement (INSERT/UPDATE/DELETE, etc.)
   * @param sql SQL statement
   * @param params Bind parameters
   * @returns Number of affected rows
   */
  execute(sql: string, ...params: unknown[]): Promise<{ rows: number }>;

  /**
   * Execute multiple statements in batch
   * @param statements Array of SQL statements and parameters
   * @returns Execution results for each statement
   */
  batch(
    statements: Array<{ sql: string; params?: unknown[] }>,
  ): Promise<Array<{ rows: number }>>;
}

// ============================================================================
// For storing binary objects as files
//
// PORTABILITY NOTES:
// - Operations are compatible with CF R2, AWS S3 and GCS
// - BOHttpMetadata field names differ slightly between providers:
//   * Cloudflare R2: httpMetadata (camelCase)
//   * AWS S3: ContentType, CacheControl, etc. (PascalCase)
//   * GCS: contentType, cacheControl, etc. (camelCase)
// - Custom metadata handling:
//   * Cloudflare R2: customMetadata object
//   * AWS S3: x-amz-meta- prefixed headers
//   * GCS: x-goog-meta- prefixed headers
// ============================================================================

/** Interface of storeing binary object */
interface IBOStore {
  /** Type of storing consistency */
  consistency: ConsistencyType;

  /**
   * Get an object
   * @param key Object key
   * @returns Binary data, or undefined if not found
   */
  get(key: string): Promise<ArrayBuffer | undefined>;

  /**
   * Put an object
   * @param key Object key
   * @param data Binary data
   * @param options Metadata and HTTP headers
   */
  put(
    key: string,
    data: ArrayBuffer,
    options?: BOPutOptions,
  ): Promise<void>;

  /**
   * Delete an object
   * @param key Object key
   */
  delete(key: string): Promise<void>;

  /**
   * List objects
   * @param options Listing options
   * @returns Stored key, and object metadata
   */
  list(options?: BOListOptions): Promise<Map<string, BOMetadata>>;

  /**
   * Get object metadata only (without downloading data)
   * @param key Object key
   * @returns Metadata, or undefined if not found
   */
  head(key: string): Promise<BOMetadata | undefined>;
}

/** Options for BO put operation */
interface BOPutOptions {
  httpMetadata?: BOHttpMetadata;
  customMetadata?: Record<string, string>;
}

/** Options for listing binary objects */
interface BOListOptions {
  prefix?: string;
  limit?: number;
}

/** Metadata for binary objects */
interface BOMetadata {
  key: string;
  size: number;
  uploaded: Date;
  httpMetadata?: BOHttpMetadata;
  customMetadata?: Record<string, string>;
}

/** Metadata for http response */
interface BOHttpMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
}

/*** Fake definition for testing ***/
export declare abstract class DurableObject<Env = unknown> {
  __DURABLE_OBJECT_BRAND: never;
  protected ctx: DurableObjectState;
  protected env: Env;
  constructor(ctx: DurableObjectState, env: Env);
}
