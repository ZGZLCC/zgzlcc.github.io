/**
 * Worker 运行环境的最小类型声明。
 * 只声明本项目实际用到的 KV 接口，避免为了一次类型检查引入庞大的类型包。
 */
interface KVListKey {
  name: string;
}

interface KVListResult {
  keys: KVListKey[];
  list_complete: boolean;
  cursor?: string;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVListResult>;
}
