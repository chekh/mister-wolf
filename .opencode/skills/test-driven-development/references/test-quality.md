<!-- wolf:rendered base=test-quality.md set=3.1.1 -->
# Test independence and sensitivity

A test must catch a specific wrong result, side effect, or contract violation. Name the defect that will make it fail. Correct words in source or self-report do not prove the system works.

- Get the expected value from the requirement, manual calculation, or an independent oracle, not the same helper the implementation computes the actual value with.
- Test the consumer effect, not only a constant's value or the internal call order. Verify exact text when text itself is the contract.
- A mock is justified at an external boundary; do not test only your own mock's setup. Confirm an important interaction by a suitable integration test.
- For a defect, show sensitivity on a baseline with the defect. For characterization, a green baseline is acceptable; do not break working behavior for ritual RED.
- For a skill, evaluate action/evidence/outcome on a raw scenario. The presence of "scope" or "draft" is only a structural signal, not a behavioral pass.
- Control time, seed, files, env, cleanup affecting the test.

Example: a parser must return the sum of 3 and 4. Expected 7 is set independently; calling the same parser again to the right of an assertion catches no defect. Test the evidence-recording script with a command exiting non-zero: no success mark may appear. A fake self-report probe helps verify the rubric, not the model.
