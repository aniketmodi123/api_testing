# Multi-Request Groups

Status: Existing (via Collections + Bulk Runner)
Coverage: 80%

## Implemented
Collections + Bulk Runner together provide multi-request group execution. A folder node IS a request group — bulk run executes all cases under a node.

## Missing
- Explicit "request group" concept separate from collection folder (not needed — collections serve this role)
- Parallel execution option (currently sequential)

## Current Task
None

## Next Task
Parallel execution mode in bulk runner (low priority)

## Dependencies
- 09-collection-runner

## Priority
P3
