/** vips 未安装或执行失败 */
export class VipsError extends Error {
  constructor(message: string, public readonly detail?: string) {
    super(message);
    this.name = "VipsError";
  }
}

/** libvips 下载 / 校验 / 解压 / 安装失败 */
export class InstallError extends Error {
  constructor(message: string, public readonly phase?: string) {
    super(message);
    this.name = "InstallError";
  }
}

/** 用户取消 */
export class AbortError extends Error {
  constructor(message = "任务已取消") {
    super(message);
    this.name = "AbortError";
  }
}

/** 参数不合法 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof AbortError ||
    (error instanceof Error && error.name === "AbortError")
  );
}
