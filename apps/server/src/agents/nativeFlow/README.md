# Native flow scheduler

`createFlowExecution` checks a saved FlowDoc and creates JSON state for its version. `advanceFlow` returns new state after one event. Both functions receive the clock as milliseconds. `pendingFlowActions` describes agent assignments, human decisions, and process stops. The host persists state before it performs those actions.

Each step occurrence has a key that includes its parents and loop round. Each agent task also includes its phase and round. A started event claims that task. An unknown task stays pending observation and produces no replacement assignment. A later observed completion can settle the same task.

A join waits for every incoming path to finish or skip. It receives outputs from the selected paths. A gate selects YES or NO edges. Unselected paths and their nested children receive explicit skipped states. `parseFlowDecision` accepts a whole YES or NO response. Other responses require attention.

A connected group starts its entry child. A parallel group starts every child. The group completes after every child settles. Entry children receive inputs from the group boundary. A loop asks its exit question after each round. YES completes the loop. NO starts another round with the prior outputs. NO at the round limit fails the flow.

A human step requires an explicit approval or rejection. Rejection fails the flow. A group deadline uses an absolute time, so a host restart cannot extend it. `boxClocks` lists the limits around a step. `timeLimitNotice` puts them in the step prompt, and `timeWarning` decides when the host sends the worker a time check: at half of the budget and at a quarter. A `warned` event stores the count on the step. Failure or cancellation cancels unfinished steps. Claimed tasks produce stop actions until the host confirms process exit.

Persistence must bind task keys to ordinary execution attempts before launch. It must reject results from another attempt and preserve the frozen graph version.
