# Cloudflare Storage Wrapper

A unified TypeScript wrapper package for Cloudflare's storage services, providing consistent interfaces for KV, Durable Objects, D1, Hyperdrive, and R2.

## Features

- **Consistent API**: Unified interfaces across different Cloudflare storage services
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Flexibility**: Support for both eventual and strong consistency models
- **Easy Migration**: Portable interfaces compatible with other cloud providers (planned for future support)

## Installation
```bash
# npm
npm install @scirexs/cf-storage-adapter

# JSR (Deno)
deno add jsr:@scirexs/cf-storage-adapter
```

## Configuration

### For DOKVS (Durable Objects KV Store)

If you use `getKVSRealtime` function, you have to export `DOKVS` extended class with worker handlers, and include the class in your `wrangler.jsonc`:
```js
import { DOKVS } from "@scirexs/cf-storage-adapter";
export class MyClass extends DOKVS {}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> { }
}
```
```json
{
  "durable_objects": {
    "bindings": [
      {
        "name": "MY_DURABLE_OBJECT", // 
        "class_name": "MyClass"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": [
        "MyClass"
      ]
    }
  ]
}
```

## Storage Types

### Key-Value Store (KV)

Two consistency models are available:

#### Eventual Consistency (Workers KV)
```ts
import { getKVSEventual } from "@scirexs/cf-storage-adapter";

const kvs = getKVSEventual(env, "MY_KV_NAMESPACE");

// Store a value with TTL
await kvs?.put("user:123", "John Doe", { ttl: 3600 });

// Retrieve a value
const value = await kvs.get("user:123");

// List keys with prefix
const keys = await kvs.list({ prefix: "user:", limit: 100 });

// Delete a key
await kvs?.delete("user:123");
```

#### Strong Consistency (Durable Objects)
```ts
import { getKVSRealtime } from "@scirexs/cf-storage-adapter";

const kvs = getKVSRealtime(env, "my-kvs-instance");

// Store a value with absolute expiration
await kvs.put("session:abc", "data", { expiration: 1735689600 });

// Retrieve a value
const value = await kvs.get("session:abc");

// Store binary data
const buffer = new ArrayBuffer(8);
await kvs.put("binary:key", buffer);

// Retrieve binary data
const data = await kvs.get("binary:key", { type: "bytes" });
```

### Relational Database (D1)
```ts
import { getRDBEventual } from "@scirexs/cf-storage-adapter";

const rdb = getRDBEventual(env, "MY_D1_DATABASE");

// Execute a query
const users = await rdb.query("SELECT * FROM users WHERE age > ?", 18);

// Get first result
const user = await rdb.first("SELECT * FROM users WHERE id = ?", 123);

// Execute an update
const result = await rdb.execute("UPDATE users SET name = ? WHERE id = ?", "Alice", 123);
console.log(`Updated ${result.rows} rows`);

// Batch operations
await rdb.batch([
  { sql: "INSERT INTO users (name) VALUES (?)", params: ["Bob"] },
  { sql: "INSERT INTO users (name) VALUES (?)", params: ["Charlie"] }
]);
```

### Database Connection String (Hyperdrive)
```ts
import { getRDBConnectionString } from "@scirexs/cf-storage-adapter";

const connectionString = getRDBConnectionString(env, "MY_HYPERDRIVE");
// Use with external database clients or ORMs
```

### Binary Object Store (R2)
```ts
import { getBOS } from "@scirexs/cf-storage-adapter";

const storage = getBOS(env, "MY_R2_BUCKET");

// Store a file
const fileData = new ArrayBuffer(1024);
await storage.put("documents/file.pdf", fileData, {
  httpMetadata: {
    contentType: "application/pdf",
    cacheControl: "public, max-age=3600"
  },
  customMetadata: {
    uploadedBy: "user123",
    version: "1.0"
  }
});

// Retrieve a file
const data = await storage.get("documents/file.pdf");

// Get metadata only
const metadata = await storage.head("documents/file.pdf");
console.log(`File size: ${metadata?.size} bytes`);

// List files with prefix
const files = await storage.list({ prefix: "documents/", limit: 100 });
for (const [key, meta] of files) {
  console.log(`${key}: ${meta.size} bytes, uploaded ${meta.uploaded}`);
}

// Delete a file
await storage.delete("documents/file.pdf");
```

## API Reference

### Key-Value Store

#### IKVEventualStore / IKVRealtimeStore

- `consistency: ConsistencyType` - "eventual" or "strong"
- `get(key: string, options?: KVGetOptions): Promise<KVValue | undefined>`
- `put(key: string, value: KVValue, options?: KVPutOptions): Promise<void>`
- `delete(key: string): Promise<void>`
- `list(options?: KVListOptions): Promise<Map<string, number>>`

#### KVGetOptions
- `type?: "string" | "bytes"` - Type of value to retrieve

#### KVPutOptions
- `expiration?: number` - Unix timestamp for expiration (absolute)
- `ttl?: number` - Time to live in seconds (relative)

#### KVListOptions
- `prefix?: string` - Filter keys by prefix
- `limit?: number` - Maximum number of keys to return

### Relational Database

#### IRDBEventualStore

- `consistency: ConsistencyType` - "eventual"
- `query<T>(sql: string, ...params: unknown[]): Promise<T[]>`
- `first<T>(sql: string, ...params: unknown[]): Promise<T | undefined>`
- `execute(sql: string, ...params: unknown[]): Promise<{ rows: number }>`
- `batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<Array<{ rows: number }>>`

### Binary Object Store

#### IBOStore

- `consistency: ConsistencyType` - "strong"
- `get(key: string): Promise<ArrayBuffer | undefined>`
- `put(key: string, data: ArrayBuffer, options?: BOPutOptions): Promise<void>`
- `delete(key: string): Promise<void>`
- `list(options?: BOListOptions): Promise<Map<string, BOMetadata>>`
- `head(key: string): Promise<BOMetadata | undefined>`

#### BOPutOptions
- `httpMetadata?: BOHttpMetadata` - HTTP headers for the object
- `customMetadata?: Record<string, string>` - Custom key-value metadata

#### BOListOptions
- `prefix?: string` - Filter objects by prefix
- `limit?: number` - Maximum number of objects to return

#### BOMetadata
- `key: string` - Object key
- `size: number` - Object size in bytes
- `uploaded: Date` - Upload timestamp
- `httpMetadata?: BOHttpMetadata` - HTTP metadata
- `customMetadata?: Record<string, string>` - Custom metadata

## Portability Notes

### Binary Object Store
The `IBOStore` interface is designed to be compatible with multiple cloud storage providers:

- **Cloudflare R2**: Uses `httpMetadata` (camelCase) and `customMetadata` object
- **AWS S3**: Uses PascalCase headers (`ContentType`, `CacheControl`, etc.) and `x-amz-meta-` prefixed custom headers
- **Google Cloud Storage**: Uses camelCase headers (`contentType`, `cacheControl`, etc.) and `x-goog-meta-` prefixed custom headers

## License

MIT
