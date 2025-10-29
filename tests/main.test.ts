/// <reference lib="deno.ns" />

import { assertEquals, assertGreater } from "jsr:@std/assert";
import { exists } from "jsr:@std/fs/exists";
import { Miniflare } from "miniflare";
import { getBOS, getKVSEventual, getKVSRealtime, getRDBConnectionString, getRDBEventual } from "../src/main.ts";
import { DOKVS } from "../src/cfobj.ts";

let mf: Miniflare;
let env: Env;

const DO_CLASSNAME = "DOKVS";
const KV_NAMESPACE = "MY_KV_NAMESPACE";
const D1_DATABASE = "MY_D1_DATABASE";
const R2_BUCKET = "MY_R2_BUCKET";
const HYPERDRIVE = "MY_HYPERDRIVE_CONN";
const CONN_STR = "postgresql://user:pw@host:5432/db";
const testopts = { sanitizeResources: false, sanitizeOps: false };
const key = { k1: "key1", k2: "key2", k3: "key3", k4: "_key4" };
const val = { v1: "val1", v2: "val2", v3: "val3", v4: "_val4" };
const path = { from: "./tests/bin.png", to: "./tests/bin2.png", worker: "./tests/worker.js" };

Deno.test.beforeAll(async () => await setup());
Deno.test.afterAll(async () => {
  if (await exists(path.to)) await Deno.remove(path.to);
  if (await exists(path.worker)) await Deno.remove(path.worker);
  await mf.dispose();
});
async function setup() {
  mf = new Miniflare({
    modules: true,
    scriptPath: path.worker,
    durableObjects: { [DO_CLASSNAME]: { className: DO_CLASSNAME, useSQLite: true } },
    kvNamespaces: [KV_NAMESPACE],
    d1Databases: [D1_DATABASE],
    r2Buckets: [R2_BUCKET],
  });
  await setEnv();
}
async function setEnv() {
  env = {
    // @ts-expect-error: `await getDurableObjectNamespace` should return `DurableObjectNamespace` explained on readme, but got `Request_2<any>`
    DOKVS: await mf.getDurableObjectNamespace(DO_CLASSNAME) as DurableObjectNamespace<DOKVS>,
    // @ts-expect-error: `await getKVNamespace` should return `KVNamespace` explained on readme, but got `Request_2<any>`
    MY_KV_NAMESPACE: await mf.getKVNamespace(KV_NAMESPACE) as KVNamespace,
    MY_D1_DATABASE: await mf.getD1Database(D1_DATABASE) as D1Database,
    // @ts-expect-error: `await getR2Bucket` should return `R2Bucket` explained on readme, but got `Request_2<any>`
    MY_R2_BUCKET: await mf.getR2Bucket(R2_BUCKET) as R2Bucket,
    MY_HYPERDRIVE_CONN: {
      // @ts-expect-error: dummy fn
      connect: () => undefined,
      connectionString: CONN_STR,
      host: "host",
      port: 5432,
      user: "user",
      password: "pw",
      database: "db",
    },
  };
}
function getNow(): number {
  return Math.trunc(Date.now() / 1000);
}

Deno.test({
  ...testopts,
  name: "Eventual KVS (Workers KV)",
  fn: async (t) => {
    const kv = getKVSEventual(env, KV_NAMESPACE);

    await t.step("consistency", () => {
      assertEquals(kv.consistency, "eventual");
    });
    await t.step("put", async () => {
      await kv.put?.(key.k1, val.v1);
      await kv.put?.(key.k2, val.v2, { expiration: getNow() + 60 });
      await kv.put?.(key.k3, val.v3, { ttl: 60 });
      await kv.put?.(key.k4, (new TextEncoder()).encode(val.v4).buffer as ArrayBuffer);
    });
    await t.step("get", async () => {
      assertEquals(await kv.get(key.k1), val.v1, "put is not worked, or get is not worked: 1");
      assertEquals(await kv.get(key.k2), val.v2, "put is not worked, or get is not worked: 2");
      assertEquals(await kv.get(key.k3), val.v3, "put is not worked, or get is not worked: 3");
      const buf = await kv.get(key.k4, { type: "bytes" });
      const str = new TextDecoder().decode(buf as ArrayBuffer);
      assertEquals(str, val.v4, "put is not worked as bin, or get is not worked as bin: 4");
    });
    await t.step("list", async () => {
      const list = await kv.list({ prefix: "key" });
      const now = getNow();
      assertEquals(list.size, 3, `prefix "key" should have 3 entries`);
      list.values().forEach((x) => {
        if (x) assertGreater(x, now, "ttl should be grater than now");
      });
      const one = await kv.list({ limit: 1 });
      assertEquals(one.size, 1, "list size with limit should be same if limit less than 1000");
    });
    await t.step("delete", async () => {
      await kv.delete?.(key.k1);
      await kv.delete?.(key.k2);
      await kv.delete?.(key.k3);
      await kv.delete?.(key.k4);
      const list = await kv.list({ prefix: "key" });
      assertEquals(list.size, 0, "list size should be 0");
      assertEquals(await kv.get(key.k4), undefined, "get result should be undefined");
    });
  },
});

Deno.test({
  ...testopts,
  name: "Realtime KVS (Durable Objects)",
  fn: async (t) => {
    const dokv = getKVSRealtime(env, DO_CLASSNAME);

    await t.step("consistency", () => {
      assertEquals(dokv.consistency, "strong");
    });
    await t.step("put", async () => {
      await dokv.put(key.k1, val.v1);
      await dokv.put(key.k2, val.v2, { expiration: getNow() + 60 });
      await dokv.put(key.k3, val.v3, { ttl: 60 });
      await dokv.put(key.k4, (new TextEncoder()).encode(val.v4).buffer as ArrayBuffer);
    });
    await t.step("get", async () => {
      assertEquals(await dokv.get(key.k1), val.v1, "put is not worked, or get is not worked: 1");
      assertEquals(await dokv.get(key.k2), val.v2, "put is not worked, or get is not worked: 2");
      assertEquals(await dokv.get(key.k3), val.v3, "put is not worked, or get is not worked: 3");
      const buf = await dokv.get(key.k4, { type: "bytes" });
      const str = new TextDecoder().decode(buf as ArrayBuffer);
      assertEquals(str, val.v4, "put is not worked as bin, or get is not worked as bin: 4");
    });
    await t.step("list", async () => {
      const list = await dokv.list({ prefix: "key" });
      const now = getNow();
      assertEquals(list.size, 3, `prefix "key" should have 3 entries`);
      list.values().forEach((x) => {
        if (x) assertGreater(x, now, "ttl should be grater than now");
      });
      const one = await dokv.list({ limit: 1 });
      assertEquals(one.size, 1, "list size with limit should be same if limit less than 1000");
    });
    await t.step("delete", async () => {
      await dokv.delete(key.k1);
      await dokv.delete(key.k2);
      await dokv.delete(key.k3);
      await dokv.delete(key.k4);
      const list = await dokv.list({ prefix: "key" });
      assertEquals(list.size, 0, "list size should be 0");
      assertEquals(await dokv.get(key.k4), undefined, "get result should be undefined");
    });
  },
});

Deno.test({
  ...testopts,
  name: "Realtime KVS (Durable Objects)",
  fn: async (t) => {
    const dokv = getKVSRealtime(env, DO_CLASSNAME);

    await t.step("consistency", () => {
      assertEquals(dokv.consistency, "strong");
    });
    await t.step("put", async () => {
      await dokv.put(key.k1, val.v1);
      await dokv.put(key.k2, val.v2, { expiration: getNow() + 60 });
      await dokv.put(key.k3, val.v3, { ttl: 60 });
      await dokv.put(key.k4, (new TextEncoder()).encode(val.v4).buffer as ArrayBuffer);
    });
    await t.step("get", async () => {
      assertEquals(await dokv.get(key.k1), val.v1, "put is not worked, or get is not worked: 1");
      assertEquals(await dokv.get(key.k2), val.v2, "put is not worked, or get is not worked: 2");
      assertEquals(await dokv.get(key.k3), val.v3, "put is not worked, or get is not worked: 3");
      const buf = await dokv.get(key.k4, { type: "bytes" });
      const str = new TextDecoder().decode(buf as ArrayBuffer);
      assertEquals(str, val.v4, "put is not worked as bin, or get is not worked as bin: 4");
    });
    await t.step("list", async () => {
      const list = await dokv.list({ prefix: "key" });
      const now = getNow();
      assertEquals(list.size, 3, `prefix "key" should have 3 entries`);
      list.values().forEach((x) => {
        if (x) assertGreater(x, now, "ttl should be grater than now");
      });
      const one = await dokv.list({ limit: 1 });
      assertEquals(one.size, 1, "list size with limit should be same if limit less than 1000");
    });
    await t.step("delete", async () => {
      await dokv.delete(key.k1);
      await dokv.delete(key.k2);
      await dokv.delete(key.k3);
      await dokv.delete(key.k4);
      const list = await dokv.list({ prefix: "key" });
      assertEquals(list.size, 0, "list size should be 0");
      assertEquals(await dokv.get(key.k4), undefined, "get result should be undefined");
    });
  },
});

interface TestRow {
  num: number;
  str: string;
}
Deno.test({
  ...testopts,
  name: "Eventual RDB (D1 SQL Database)",
  fn: async (t) => {
    const d1 = getRDBEventual(env, D1_DATABASE);

    await t.step("consistency", () => {
      assertEquals(d1.consistency, "eventual");
    });
    await t.step("execute", async () => {
      await d1.execute("create table if not exists test_tbl (num integer, str text);");
      await d1.execute("delete from test_tbl;");
      const { rows } = await d1.execute(
        "insert into test_tbl (num, str) values (?, ?),(2, ?),(2, ?),(2, ?);",
        1,
        val.v1,
        val.v2,
        val.v3,
        val.v4,
      );
      assertEquals(rows, 4, "should be inserted 4 rows");
    });
    await t.step("query", async () => {
      const condition = "val%";
      const results = await d1.query<TestRow>("select num, str from test_tbl where str like ? and num = ?;", condition, 2);
      assertEquals(results.length, 2, "should be selected 2 rows");
      const noresult = await d1.query<TestRow>("select num, str from test_tbl where str like ? and num = ?;", condition, 99);
      assertEquals(noresult.length, 0, "should be selected no rows");
    });
    await t.step("first", async () => {
      const condition = 2;
      const result = await d1.first<TestRow>("select num from test_tbl where num = ?;", condition);
      assertEquals(result?.num, 2, "should be selected 1 row, and num is 2");
      assertEquals(result?.str, undefined, "result.str should be undefined that not selected");
      const noresult = await d1.first<TestRow>("select num, str from test_tbl where num = 99;");
      assertEquals(noresult, undefined, "should be undefined the result");
    });
    await t.step("batch", async () => {
      const results = await d1.batch([
        { sql: "insert into test_tbl (num, str) values (?, ?);", params: [3, "xxx"] },
        { sql: "update test_tbl set num = 2 where num = ?;", params: [3] },
        { sql: "delete from test_tbl where num = 2;" },
        { sql: "drop table if exists test_tbl;" },
      ]);
      assertEquals(results[0].rows, 1, "should be inserted 1 row");
      assertEquals(results[1].rows, 1, "should be updated 1 row");
      assertEquals(results[2].rows, 4, "should be deleted 4 rows");
      assertEquals(results[3].rows, 0, "should be 0 row");
      const noresult = await d1.batch([]);
      assertEquals(noresult.length, 0, "length should be 0");
    });
  },
});

Deno.test("Realtime RDB (Hyperdrive)", async (t) => {
  await t.step("getRDBConnectionString", () => {
    const conn = getRDBConnectionString(env, HYPERDRIVE);
    assertEquals(conn, CONN_STR, "should return connection string of Hyperdrive");
  });
});

Deno.test({
  ...testopts,
  name: "Binary Objects (R2 Bucket)",
  fn: async (t) => {
    const r2 = getBOS(env, R2_BUCKET);
    const meta = { contentType: "application/octet-stream", originalName: "test_file.png" };

    if (!(await exists(path.from))) return console.error("not exists binary file for testing");
    if (await exists(path.to)) await Deno.remove(path.to);
    if (await r2.head(key.k1)) r2.delete(key.k1);
    if (await r2.head(key.k2)) r2.delete(key.k2);
    if (await r2.head(key.k4)) r2.delete(key.k4);

    await t.step("consistency", () => {
      assertEquals(r2.consistency, "strong");
    });
    await t.step("put", async () => {
      const file = await Deno.readFile(path.from);
      const strb = new TextEncoder().encode(val.v2).buffer as ArrayBuffer;
      await r2.put(key.k1, file.buffer);
      await r2.put(key.k2, strb, {
        httpMetadata: { contentType: meta.contentType },
        customMetadata: { originalName: meta.originalName },
      });
      await r2.put(key.k4, strb);
    });
    await t.step("head", async () => {
      const mt = await r2.head(key.k2);
      assertEquals(mt?.key, key.k2, "should be same with meta string");
      assertEquals(mt?.httpMetadata?.contentType, meta.contentType, "should be same with meta string");
      assertEquals(mt?.customMetadata?.originalName, meta.originalName, "should be same with meta string");
      assertEquals(await r2.head("invalid"), undefined, "invalid key should be undefined");
    });
    await t.step("get", async () => {
      const bin = await r2.get(key.k1);
      assertGreater(bin?.byteLength, 0, "byte length should be greater than 0");
      if (bin) await Deno.writeFile(path.to, new Uint8Array(bin));
      assertEquals(await r2.get("invalid"), undefined, "invalid key should be undefined");
    });
    await t.step("list", async () => {
      const list1 = await r2.list({ prefix: "key" });
      assertEquals(list1.size, 2, "list1 size should be 2");
      const list2 = await r2.list({ limit: 1 });
      assertEquals(list2.size, 1, "list2 size should be 1");
      const list3 = await r2.list();
      assertEquals(list3.size, 3, "list3 size should be 3");
    });
    await t.step("delete", async () => {
      await r2.delete(key.k1);
      await r2.delete(key.k2);
      await r2.delete(key.k4);
      const list = await r2.list();
      assertEquals(list.size, 0, "list size should be 0");
    });
  },
});

Deno.test({
  ...testopts,
  name: "DOKVS class",
  fn: async (t) => {
    const stub = env.DOKVS.get(env.DOKVS.idFromName("test")) as DurableObjectStub<DOKVS>;

    await t.step("now", () => {
      assertGreater(DOKVS.now(), 1760000000, "should be unix timestamp"); // > 2025-10-09 08:53:20 UTC
      assertGreater(5000000000, DOKVS.now(), "should be seconds, not millisec"); // < 2128-06-11 08:53:20 UTC
    });
    await t.step("put", async () => {
      await stub.put(key.k1, val.v1);
      await stub.put(key.k2, val.v2, getNow() + 60);
      await stub.put(key.k3, val.v3, getNow() + 1);
      await stub.put(key.k4, (new TextEncoder()).encode(val.v4).buffer as ArrayBuffer);
    });
    await t.step("get", async () => {
      assertEquals(await stub.get(key.k1), val.v1, "put is not worked, or get is not worked: 1");
      assertEquals(await stub.get(key.k2), val.v2, "put is not worked, or get is not worked: 2");
      await new Promise((resolve) => setTimeout(resolve, 2100));
      assertEquals(await stub.get(key.k3), undefined, "ttl of put is not worked, or get is not considered ttl: 3");
      const buf = await stub.get(key.k4);
      const str = new TextDecoder().decode(buf as ArrayBuffer);
      assertEquals(str, val.v4, "put is not worked as bin, or get is not worked as bin: 4");
    });
    await t.step("list", async () => {
      const list = await stub.list({ prefix: "key" });
      const now = DOKVS.now();
      assertEquals(list.size, 2, `prefix "key" should have 2 entries`);
      list.values().forEach((x) => {
        if (x) assertGreater(x, now, "ttl should be grater than now");
      });
      const one = await stub.list({ limit: 1 });
      assertEquals(one.size, 1, "list size with limit should be same if limit less than 1000");
    });
    await t.step("delete", async () => {
      await stub.delete(key.k1);
      const list = await stub.list();
      assertEquals(list.size, 2, "list size should be 2 (key2, 4)");
      assertEquals(await stub.get(key.k1), undefined, "get result should be undefined");
    });
    await t.step("setCleanupInterval", async () => {
      const before = await stub.list({}, true);
      assertEquals(before.size, 3, "list size should be 3 (key2, 3, 4)");
      await stub.setCleanupInterval(1, true);
      await new Promise((resolve) => setTimeout(resolve, 2100));
      await stub.put("key5", "test_value5"); // run cleanup in put, deleted key3
      await new Promise((resolve) => setTimeout(resolve, 100));
      const after = await stub.list({}, true);
      assertEquals(after.size, 3, "list size should be 3 (key2, 4, 5)");
    });
    await t.step("clear", async () => {
      await stub.clear();
      const list = await stub.list();
      assertEquals(list.size, 0, "list size should be 0");
    });
  },
});
