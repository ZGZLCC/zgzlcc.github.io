export type AppErrorCode = "validation" | "overlap" | "not_found" | "storage";

/** 业务错误；组件读取 `message` 直接展示，界面无需区分错误来源。 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly conflictingEntryId?: string;

  constructor(code: AppErrorCode, message: string, conflictingEntryId?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.conflictingEntryId = conflictingEntryId;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** 把任意异常统一转成可直接展示的中文提示。 */
export function messageOf(error: unknown, fallback = "操作失败，请检查应用状态后重试。"): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
