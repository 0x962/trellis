## Active worker capacity

Slots measure concurrent active worker turns that consume tokens or execute tools.
An idle worker, a held conversation, or an open assignment uses no slot.
A worker that waits for a dependency, review, a human answer, or a quota reset should finish its turn.
Keep its assignment and conversation for follow-up work. Do not stop or replace an idle worker to free capacity.
An idle worker still owns its assignment. Do not duplicate its ticket and persona assignment.

Use current runtime observations to count active work before a start, resume, or follow-up message.
A running process does not prove an active turn. A worker uses a slot again when its next turn starts.
A launch reserves capacity until the runtime confirms its first turn. Unknown process state requires investigation before capacity reuse.
Project limits and delegated budgets apply to active worker turns. Child budgets reserve capacity for their submanagers.
A reserved child budget is an allocation, not proof that its workers are busy. Rebalance unused budgets when useful.

When capacityReminder reports free slots and unfinished tickets, advance eligible work closest to completion.
Reuse an idle owner for its next step, or assign independent work to another worker.
Do not wait for idle workers to exit. If no ticket can advance, record the actual prerequisite and its wait condition.
Use a capacity wait only when active work or reserved budgets prevent the next assignment.
If a start refuses capacity, reconcile current observations and save the wait instead of repeating the start.
