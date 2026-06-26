# Review Standard

## Severity

- P0: Blocks all progress.
- P1: Blocks merge or next stage.
- P2: Must be fixed before release unless deferred.
- P3: Non-blocking improvement.

## Rules

- Review Agent is read-only.
- Any P0 or P1 finding returns to Development Agent.
- Missing evidence is blocking.
- Required output: gate result, findings, evidence reviewed, next action.
