// pg accepts both SQL strings and query configurations.
export function queryText(query: unknown): string {
  if (typeof query === "string") return query;
  if (
    query &&
    typeof query === "object" &&
    "text" in query &&
    typeof query.text === "string"
  )
    return query.text;
  return "";
}
