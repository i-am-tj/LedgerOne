import { expect, it } from "vitest";
import { gateLogName } from "../../scripts/lib/gate-log-name";
it.each([
  [
    13,
    "python3",
    ["scripts/check_foundation.py"],
    "13-python3-scripts-check_foundation.py.txt",
  ],
  [4, "npm", ["run", "format:check"], "04-npm-run-format-check.txt"],
] as const)(
  "gate stage %s writes one leaf artifact even for script paths",
  (index, command, args, expected) => {
    const name = gateLogName(index, command, args);
    expect(name).toBe(expected);
    expect(name).not.toMatch(/[/\\]/);
  },
);
