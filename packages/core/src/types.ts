export type SupportedExt = ".jpg" | ".jpeg" | ".png";

/** 输出扩展名：--ext 允许 .jpg/.jpeg/.png，与 CLI 协议保持一致 */
export type OutputExt = ".jpg" | ".jpeg" | ".png";

/** 输出目录模式：CLI 为拍平（flat），桌面端默认保留相对结构（preserve） */
export type OutputMode = "flat" | "preserve";

export interface ProcessOptions {
  /** 1-100，仅对 JPG 输出有效 */
  quality: number;
  /** 最长边尺寸；null 表示保持原尺寸 */
  size: number | null;
  /** 输出格式；null 表示保持原格式 */
  ext: OutputExt | null;
}

export interface FileEntry {
  absolutePath: string;
  /** 文件名（含扩展名） */
  fileName: string;
  /** 不含扩展名的基础名 */
  baseName: string;
  ext: SupportedExt;
  /** 字节 */
  size: number;
  width: number;
  height: number;
  mtimeMs: number;
  /** 所属扫描根目录（目录拖入时用于计算相对路径），文件直接添加时为其所在目录 */
  rootDir: string;
  /** true 表示来自文件夹扫描（用于 UI 按文件夹聚合展示） */
  fromDir?: boolean;
}

export type TaskStatus =
  | "pending"
  | "processing"
  | "done"
  | "skipped"
  | "failed"
  | "canceled";

export interface TaskResult {
  input: string;
  output: string;
  status: TaskStatus;
  originalSize: number;
  compressedSize: number;
  error?: string;
}

export interface ScanOptions {
  recursive: boolean;
  /**
   * true 时跳过解析图片宽高（width/height 置 0）。
   * 大批量文件时逐个读取图片头开销显著，桌面端列表不展示尺寸时应开启。
   */
  skipImageInfo?: boolean;
}

export interface QueueOptions {
  concurrency: number;
  signal?: AbortSignal;
}

export type InstallPhase = "download" | "verify" | "extract" | "finalize";

export interface InstallProgress {
  phase: InstallPhase;
  received: number;
  total: number;
  /** 0-100，仅下载阶段有精确值，其余阶段为阶段性数值 */
  percent: number;
}
