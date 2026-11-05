import { describe, it as test } from "node:test";
import { strict as assert } from "node:assert";
import { collectPages, createKeyedQueue } from "./reliability";

describe("lead persistence", () => {
  test("latest edit is saved after an earlier edit on the same lead", async () => {
    const enqueue = createKeyedQueue();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let called = false;
    const first = enqueue("lead", async () => { await gate; called = true; });
    const second = enqueue("lead", async () => { called = false; });
    release();
    await Promise.all([first, second]);
    assert.equal(called, false);
  });
  test("failed save does not block later saves", async () => {
    const enqueue = createKeyedQueue();
    const failed = enqueue("lead", async () => { throw new Error("offline"); });
    const next = enqueue("lead", async () => "saved");
    await assert.rejects(failed, /offline/);
    assert.equal(await next, "saved");
  });
  test("loads all leads beyond the first 1000", async () => {
    const data = Array.from({ length: 2061 }, (_, i) => i);
    assert.deepEqual(await collectPages(async (offset, size) => data.slice(offset, offset + size)), data);
  });
  test("failed page rejects instead of returning incomplete leads", async () => {
    await assert.rejects(collectPages(async (offset) => {
      if (offset > 0) throw new Error("offline");
      return Array.from({ length: 1000 }, (_, i) => i);
    }), /offline/);
  });
});