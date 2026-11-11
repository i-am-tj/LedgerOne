"""Planning-document checks only; does not test application accounting behavior."""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
required = [
    "PRD.md", "ARCHITECTURE.md", "ACCOUNTING.md", "ROADMAP.md",
    "BACKLOG.md", "TEST_PLAN.md", "PROGRESS.md", "DECISIONS_NEEDED.md",
    "ADR/0001-modular-monolith-and-ledger.md",
]
for name in required:
    assert (DOCS / name).is_file(), f"Missing document: {name}"

backlog = (DOCS / "BACKLOG.md").read_text()
sections = re.split(r"\n## (P1-S\d{2}) — [^\n]+\n", backlog)
ids = sections[1::2]
assert ids == [f"P1-S{i:02}" for i in range(1, 10)], "Story order/coverage"
fields = [
    "ID", "Title", "Epic", "Priority", "Dependencies", "User story",
    "Inputs (data/API/preconditions)", "Outputs (UI/API/schema/docs)",
    "Implementation tasks", "Acceptance criteria (Given/When/Then)",
    "Unit tests", "Integration/E2E tests", "Failure/edge cases",
    "Rollback/migration notes", "Definition of done",
]
for story, body in zip(ids, sections[2::2]):
    for field in fields:
        assert f"**{field}:**" in body, f"{story}: missing {field}"
    assert "- [ ] " in body, f"{story}: missing task checkboxes"
    assert "Given " in body and "when " in body and "then " in body, story

prd = (DOCS / "PRD.md").read_text()
plan = (DOCS / "TEST_PLAN.md").read_text()
for number in range(1, 21):
    requirement = f"R{number:02}"
    assert re.search(rf"\| {requirement}\s*\|", prd), requirement
    assert re.search(rf"\| {requirement}\s*\|", plan), requirement
for number in range(1, 8):
    assert re.search(rf"\| G{number}\s*\| NOT RUN\s*\|", plan), f"Gate {number} status"

# Check displayed example arithmetic independently of any proposed domain code.
# Ignore parenthesized native quantities/rates; sum functional INR legs only.
examples = 0
for line in (DOCS / "ACCOUNTING.md").read_text().splitlines():
    if not line.startswith("| "):
        continue
    cells = [cell.strip() for cell in line.strip("|").split("|")]
    if cells[0] == "Event" or len(cells) != 4 or set(cells[0]) <= {"-", ":", " "}:
        continue
    totals = []
    for cell in cells[1:3]:
        cell = re.sub(r"\([^)]*\)", "", cell)
        amounts = re.findall(r"\b\d[\d,]*\b", cell)
        assert amounts, f"Missing functional amount: {line}"
        totals.append(sum(int(amount.replace(",", "")) for amount in amounts))
    assert totals[0] == totals[1], f"Unbalanced displayed example: {line}"
    examples += 1
assert examples == 15, f"Expected 15 table examples, found {examples}"

print("PASS: 9 required documents; 9 current ordered stories with all mandatory fields/tasks")
print("PASS: 20 requirements mapped; 7 gates explicitly NOT RUN")
print("PASS: 15 displayed journal examples balance in functional INR")
print("LIMIT: structural/arithmetic checks only; no application tests or review approval")
