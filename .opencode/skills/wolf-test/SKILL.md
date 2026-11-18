---
name: wolf-test
description: "Execution of independent behavioral, integration and regression verifications."
---
<!-- wolf:rendered base=SKILL.md set=3.2.0 -->

# Verify behavior

Record revision/digest, environment, data and criteria. Execute assigned
scenarios with the requirements oracle, recording METHOD/cwd/OUTCOME/LIMITS.
Do not repeat the author's run on unchanged code without a reason: independence
is needed for significant properties/interactions, not a second identical log.
Scenarios sharing services/data must be isolated or ordered. A defect: minimal
reproduction, expected/actual, evidence, impact. Do not change the product or AC
to make a test green. An environment failure is a verification limitation.
After a fix — targeted and affected-area regression; after integration — interactions.
PASS confirms the verified scenarios, not absence of all defects.
