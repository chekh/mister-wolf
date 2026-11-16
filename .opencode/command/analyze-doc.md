---
description: Document analysis of an assigned question with verifiable conclusions. Usage: /analyze-doc <file-path> [question]
agent: mr-wolf
---
<!-- wolf:rendered base=analyze-doc.md set=3.1.1 -->
Analyze the document: $ARGUMENTS

L0 applies using-skills, wolf-work-strategy and wolf-brainstorm: aligns the
expected result with request and delivered context; on substantial
ambiguity asks the user a short question. After a working alignment it does
addressed reading on its own or hires an executor directly (wolf-researcher
for research/diagnostics) with a finite TASK: goal, addressed inputs, assigned
skill in full, verification, limit. A missing detailed brief does not become
an audit of the surrounding system. The executor researches nothing beyond
the TASK boundary, returning a RESULT with grounds and constraints. A
sufficient related source is allowed; experiments and changes must fit the
mandate. Skill complaints go via wolf-feedback, without self-mutation.
