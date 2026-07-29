import { describe, expect, it } from "vitest";
import { AbortError } from "../errors.js";
import { TaskQueue } from "../queue.js";
import type { TaskResult } from "../types.js";

interface Item {
  input: string;
  output: string;
  originalSize: number;
}

function makeItems(count: number): Item[] {
  return Array.from({ length: count }, (_, i) => ({
    input: `in-${i}`,
    output: `out-${i}`,
    originalSize: 100 + i
  }));
}

function okResult(item: Item): TaskResult {
  return {
    input: item.input,
    output: item.output,
    status: "done",
    originalSize: item.originalSize,
    compressedSize: 50
  };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("TaskQueue", () => {
  it("按并发数执行且全部完成", async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    let active = 0;
    let peak = 0;
    const results = await queue.run(makeItems(6), async item => {
      active += 1;
      peak = Math.max(peak, active);
      await sleep(10);
      active -= 1;
      return okResult(item);
    });
    expect(results).toHaveLength(6);
    expect(results.every(r => r.status === "done")).toBe(true);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(1);
  });

  it("结果顺序与输入一致", async () => {
    const queue = new TaskQueue({ concurrency: 4 });
    const results = await queue.run(makeItems(8), async item => {
      await sleep(Math.random() * 20);
      return okResult(item);
    });
    results.forEach((r, i) => expect(r.input).toBe(`in-${i}`));
  });

  it("单项失败不中断队列", async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const results = await queue.run(makeItems(3), async item => {
      if (item.input === "in-1") throw new Error("处理失败");
      return okResult(item);
    });
    expect(results[0].status).toBe("done");
    expect(results[1].status).toBe("failed");
    expect(results[1].error).toBe("处理失败");
    expect(results[2].status).toBe("done");
  });

  it("cancel 后未启动任务标记为 canceled，已完成结果保留", async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const results = await queue.run(makeItems(4), async (item, signal) => {
      if (item.input === "in-1") {
        queue.cancel();
        if (signal.aborted) throw new AbortError();
      }
      return okResult(item);
    });
    expect(results[0].status).toBe("done");
    expect(results[1].status).toBe("canceled");
    expect(results[2].status).toBe("canceled");
    expect(results[3].status).toBe("canceled");
  });

  it("外部 AbortSignal 触发取消", async () => {
    const controller = new AbortController();
    const queue = new TaskQueue({ concurrency: 1, signal: controller.signal });
    controller.abort();
    const results = await queue.run(makeItems(2), async item => okResult(item));
    expect(results.every(r => r.status === "canceled")).toBe(true);
  });

  it("progress 钩子被完整调用", async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    const progress: number[] = [];
    await queue.run(
      makeItems(5),
      async item => okResult(item),
      { onProgress: done => progress.push(done) }
    );
    expect(progress).toHaveLength(5);
    expect(progress[progress.length - 1]).toBe(5);
  });

  it("空任务列表直接完成", async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    const results = await queue.run([], async () => {
      throw new Error("不应被调用");
    });
    expect(results).toHaveLength(0);
  });
});
