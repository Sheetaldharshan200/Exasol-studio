/** The text shown for NULL: the setting as typed (an empty value shows
 *  nothing), at most 20 characters; "null" when it is not set. */
export function nullLabel(setting: unknown): string {
  return typeof setting === "string" ? setting.slice(0, 20) : "null";
}
