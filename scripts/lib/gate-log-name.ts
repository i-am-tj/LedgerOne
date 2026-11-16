// Command arguments can contain paths; artifacts must always be leaf files.
export function gateLogName(
  index: number,
  command: string,
  args: readonly string[],
) {
  return `${String(index).padStart(2, "0")}-${[command, ...args].join("-").replace(/[^a-zA-Z0-9._-]+/g, "-")}.txt`;
}
