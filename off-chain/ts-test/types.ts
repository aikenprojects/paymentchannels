export type Result<T> =
  | { type: "ok"; data: T }
  | { type: "error"; error: Error };