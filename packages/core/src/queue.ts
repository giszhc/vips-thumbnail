import { isAbortError } from "./errors.js";
import { validateConcurrency } from "./options.js";
import type { QueueOptions, TaskResult } from "./types.js";

export interface TaskQueueHooks {
  onItemStart?: (index: number, total: number) => void;
  onItemEnd?: (result: TaskResult, index: number) => void;
  onProgress?: (done: number, total: number) => void;
}

export type TaskRunner<T> = (item: T, signal: AbortSignal) => Promise<TaskResult>;

/**
 * 并发任务队列：
 * - 并发数 1-4；
 * - cancel() 后不再启动新任务，进行中的通过 AbortSignal 中止；
 * - 单项失败（非取消）不中断队列；
 * - 已完成项结果保留。
 */
export class TaskQueue {
  private readonly concurrency: number;
  private readonly controller: AbortController;
  private canceled = false;

  constructor(options: QueueOptions) {
    this.concurrency = validateConcurrency(options.concurrency);
    this.controller = new AbortController();
    if (options.signal) {
      if (options.signal.aborted) this.controller.abort();
      else options.signal.addEventListener("abort", () => this.cancel(), { once: true });
    }
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  cancel(): void {
    this.canceled = true;
    this.controller.abort();
  }

  async run<T>(
    items: T[],
    runner: TaskRunner<T>,
    hooks: TaskQueueHooks = {}
  ): Promise<TaskResult[]> {
    const total = items.length;
    const results: TaskResult[] = new Array(total);
    let nextIndex = 0;
    let done = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        if (this.canceled) return;
        const index = nextIndex;
        if (index >= total) return;
        nextIndex += 1;

        hooks.onItemStart?.(index, total);
        let result: TaskResult;
        try {
          result = await runner(items[index], this.controller.signal);
        } catch (error) {
          const item = items[index] as { input?: string; output?: string; originalSize?: number };
          result = {
            input: item?.input ?? "",
            output: item?.output ?? "",
            status: isAbortError(error) ? "canceled" : "failed",
            originalSize: item?.originalSize ?? 0,
            compressedSize: 0,
            error: error instanceof Error ? error.message : String(error)
          };
        }
        results[index] = result;
        done += 1;
        hooks.onItemEnd?.(result, index);
        hooks.onProgress?.(done, total);
      }
    };

    const workers = Array.from(
      { length: Math.min(this.concurrency, Math.max(total, 1)) },
      () => worker()
    );
    await Promise.all(workers);

    // 未启动的任务标记为已取消
    for (let i = 0; i < total; i++) {
      if (!results[i]) {
        const item = items[i] as { input?: string; output?: string; originalSize?: number };
        results[i] = {
          input: item?.input ?? "",
          output: item?.output ?? "",
          status: "canceled",
          originalSize: item?.originalSize ?? 0,
          compressedSize: 0
        };
      }
    }
    return results;
  }
}
