<!-- wolf:rendered base=routes-quality.md set=3.2.0 -->
# Verification, diagnosis and feedback

| When | How to apply | Result |
| --- | --- | --- |
| An assigned bug or unexpected behavior | wolf-debug: localize the cause by addressed experiments | Evidence of the cause or inference limit |
| A document review | wolf-review: assigned lens and criteria on a revision | SUMMARY/VERDICT/FINDINGS/SCOPE/LIMITS/EVIDENCE |
| An implementation review | requesting-code-review: give an independent executor materials, norms and evidence | Conformance first, quality after |
| Concrete needless complexity, or an assigned simplification | wolf-code-simplify: keep the contract, check the benefit; a reviewer only assesses | An addressed simplification or a justified refusal to transform |
| Remarks received | receiving-code-review: check grounds, fix what is relevant | A decision on finding IDs and an addressed re-check |
| A question, FRICTION, a deviation or W1–W4 | wolf-feedback: choose the addressee, do not investigate everything | A question, correction, complaint or assigned diagnosis |

Findings needing a choice between justified solutions go to wolf-council via the lead.
Several independent reviewers alone do not form a council. An expert gives a position, a
reviewer checks the corrected artifact; gates stay.

For code assessment, wolf-code-craft gives criteria, not a right to edit. Preferring
a different code shape does not block acceptance without a proven violation.
Simplification is not mandatory after every edit; do not load all
three engineering skills at once by default.

The first reviewer gets neither the expected verdict nor others' findings. A
repeated pass checks the fixes and touched changes; widening needs a ground. Do not
audit an adjacent defect. An obvious W1–W4 needs no repeats or session
diagnosis. A tool failure alone does not make a rule bad.
