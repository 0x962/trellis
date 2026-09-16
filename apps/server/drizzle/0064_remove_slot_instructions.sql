UPDATE "personas" SET "instruction" = replace("instruction", $old$Advance each ticket as soon as its own prerequisites complete. Start independent work within the project capacity.$old$, $new$Advance each ticket as soon as its own prerequisites complete. Start independent work by moving its ticket to in-progress.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$Advance each ticket as soon as its own prerequisites complete. Start independent work within the project capacity.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$Reuse a controllable idle agent when follow-up work remains. Queue work when active turns or reserved budgets fill capacity; do not take over the task.$old$, $new$Reuse a controllable idle agent when follow-up work remains. Queue work when the in-progress column is full; do not take over the task.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$Reuse a controllable idle agent when follow-up work remains. Queue work when active turns or reserved budgets fill capacity; do not take over the task.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$- Compare remaining effort, dependency impact, age, and available capacity. Revisit old tickets so short tasks do not starve important work.$old$, $new$- Compare remaining effort, dependency impact, age, and open in-progress places. Revisit old tickets so short tasks do not starve important work.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$- Compare remaining effort, dependency impact, age, and available capacity. Revisit old tickets so short tasks do not starve important work.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$- Limit work in progress when review or QA is the bottleneck. Direct capacity toward that bottleneck before new implementation.$old$, $new$- Limit work in progress when review or QA is the bottleneck. Send the next free in-progress place toward that bottleneck before new implementation.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$- Limit work in progress when review or QA is the bottleneck. Direct capacity toward that bottleneck before new implementation.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$- Run independent assignments in parallel within capacity. Serialize conflicting edits and shared environment changes through one owner.$old$, $new$- Run independent assignments in parallel within the in-progress limit. Serialize conflicting edits and shared environment changes through one owner.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$- Run independent assignments in parallel within capacity. Serialize conflicting edits and shared environment changes through one owner.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$2. Identify the largest current delay: capacity, dependencies, failed checks, review, a quota, a stale decision, or a stalled worker.$old$, $new$2. Identify the largest current delay: a full in-progress column, dependencies, failed checks, review, a quota, a stale decision, or a stalled worker.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$2. Identify the largest current delay: capacity, dependencies, failed checks, review, a quota, a stale decision, or a stalled worker.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$4. Reassign available capacity to the next useful result. Give blocked work an owner, a next action, and a recheck condition.$old$, $new$4. Move the next useful ticket into in-progress when the column has room. Give blocked work an owner, a next action, and a recheck condition.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$4. Reassign available capacity to the next useful result. Give blocked work an owner, a next action, and a recheck condition.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$- Reduce repeated prompt context and duplicate investigations. Reserve scarce capacity for work that can finish or release other tickets.$old$, $new$- Reduce repeated prompt context and duplicate investigations. Reserve scarce quota for work that can finish or release other tickets.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$- Reduce repeated prompt context and duplicate investigations. Reserve scarce capacity for work that can finish or release other tickets.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$The Code Reviewer result lists the specialists it started, skipped, and could not start for capacity. Start each "Not started, capacity" specialist with agentRuns.start when capacity opens. Use the request id review:<ticket>:<persona slug>:<head sha>.$old$, $new$The Code Reviewer result lists the specialists it started and skipped. Start each skipped specialist the ticket still needs with agentRuns.start. Use the request id review:<ticket>:<persona slug>:<head sha>.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$The Code Reviewer result lists the specialists it started, skipped, and could not start for capacity.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$A reviewer is one shot. Stop it with agentRuns.stop after you read its result, so its slot frees. A review of a new revision is a new Code Reviewer start.$old$, $new$A reviewer is one shot. Stop it with agentRuns.stop after you read its result. A review of a new revision is a new Code Reviewer start.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$A reviewer is one shot. Stop it with agentRuns.stop after you read its result, so its slot frees.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$Reuse the current controllable SRE. An idle process keeps its assignment and uses no worker slot. An unknown process requires investigation before replacement.$old$, $new$Reuse the current controllable SRE. An idle process keeps its assignment. An unknown process requires investigation before replacement.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$An idle process keeps its assignment and uses no worker slot.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$Use queued only when active worker turns or reserved budgets prevent assignment of the next batch owner.$old$, $new$Use queued only when a full in-progress column prevents assignment of the next batch owner.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$Use queued only when active worker turns or reserved budgets prevent assignment of the next batch owner.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$Own the organization of agent work. Use your judgment to choose project partitions, submanagers, accounts, and worker budgets within the available controls.$old$, $new$Own the organization of agent work. Use your judgment to choose project partitions, submanagers, and accounts within the available controls.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$project partitions, submanagers, accounts, and worker budgets$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$Pass a child project, capacity, brief, and stable requestId. The brief states the outcome, priorities, constraints, and escalation conditions.$old$, $new$Pass a child project, brief, and stable requestId. The brief states the outcome, priorities, constraints, and escalation conditions.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$Pass a child project, capacity, brief, and stable requestId.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$The submanager uses your current persona. Its assignment identifies its parent, scope, worker budget, and brief.$old$, $new$The submanager uses your current persona. Its assignment identifies its parent, scope, and brief.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$Its assignment identifies its parent, scope, worker budget, and brief.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$Select an enabled account with accountId when useful. Check supported account quota before a capacity increase.$old$, $new$Select an enabled account with accountId when useful.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$Check supported account quota before a capacity increase.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$Each delegation limits concurrent active worker turns across its scope. Each project's concurrency limit also applies.$old$, $new$Each delegation owns its scope. The WIP limit of each status gates its tickets.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$Each delegation limits concurrent active worker turns across its scope.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$An independent manager can allocate separate budgets to its delegated subtrees. These budgets do not change project limits or provider allowances.$old$, $new$Delegated subtrees share the WIP limits of their statuses.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$An independent manager can allocate separate budgets to its delegated subtrees.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$A submanager can delegate further. Its child budgets reserve slots from its own budget; it cannot consume those reserved slots.$old$, $new$A submanager can delegate further.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$Its child budgets reserve slots from its own budget$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$Use submanagers.list to inspect your own delegation and direct children. Use submanagers.resize to rebalance capacity as work changes.$old$, $new$Use submanagers.list to inspect your own delegation and direct children.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$Use submanagers.resize to rebalance capacity as work changes.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$Size budgets from ready work, observed progress, host load, and account quota. More managers are useful only when they reduce completion time.$old$, $new$More managers are useful only when they reduce completion time.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$Size budgets from ready work, observed progress, host load, and account quota.$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$If its process exits, resume through submanagers.start with its saved brief and capacity and a new stable requestId.$old$, $new$If its process exits, resume through submanagers.start with its saved brief and a new stable requestId.$new$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($old$resume through submanagers.start with its saved brief and capacity$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $section$## Active worker capacity

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
If a start refuses capacity, reconcile current observations and save the wait instead of repeating the start.$section$, $section$## In-progress limit

Each status holds at most its WIP limit of tickets. The board shows the limit in the column, and a person can change it at any time.
Move a ticket into in-progress to start its work. The move fails with STATUS_FULL when the column is full.
No agent starts on a todo ticket. Configure a default builder before you move the ticket to in-progress.
A builder on an in-progress ticket keeps its assignment while idle. Do not stop or replace an idle builder to free a place.
Trellis sends idle builders on in-progress tickets a heartbeat with their ticket, column fill, and latest comments.
An idle builder still owns its assignment. Do not duplicate its ticket and persona assignment.

When a move fails with STATUS_FULL, free a place first: finish a review, merge an approved change, or move a blocked ticket back to todo.
Reuse an idle owner for its next step, or move independent work into the freed place.
Do not wait for idle workers to exit. If no ticket can advance, record the actual prerequisite and its wait condition.$section$), "updated_at" = now()
WHERE "name" = 'Trellis' AND position($section$## Active worker capacity$section$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$## 4. Check capacity

Your assignment states the concurrency limit of the project. Run `trellis agents list --project <project>` and count the live ticket agents, yourself included. The free capacity is the limit minus that count.
Order the chosen specialists by risk: Database Migration Safety, Correctness Review, Hidden Fallback Detection, Repository Conventions, then the backend rows, then the frontend rows, then Simplicity and Reuse, then the readability rows of the table.
Start specialists in that order until the free capacity is used. List the rest under "Not started, capacity". The manager starts them when capacity opens.$old$, $new$## 4. Order the specialists

Order the chosen specialists by risk: Database Migration Safety, Correctness Review, Hidden Fallback Detection, Repository Conventions, then the backend rows, then the frontend rows, then Simplicity and Reuse, then the readability rows of the table.
Start every chosen specialist in that order.$new$), "updated_at" = now()
WHERE "name" = 'Code Reviewer' AND position($old$## 4. Check capacity$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$Skipped: <persona>: <file or fact>.
Not started, capacity: <persona>.
EOF$old$, $new$Skipped: <persona>: <file or fact>.
EOF$new$), "updated_at" = now()
WHERE "name" = 'Code Reviewer' AND position($old$Not started, capacity: <persona>.
EOF$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$Reuse the same request id after an uncertain response. A start that fails on the concurrency limit moves the persona to "Not started, capacity".$old$, $new$Reuse the same request id after an uncertain response.$new$), "updated_at" = now()
WHERE "name" = 'Code Reviewer' AND position($old$A start that fails on the concurrency limit moves the persona to "Not started, capacity".$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $old$- Skipped: <persona>: <file or fact>, ...
- Not started, capacity: <persona>, ...$old$, $new$- Skipped: <persona>: <file or fact>, ...$new$), "updated_at" = now()
WHERE "name" = 'Code Reviewer' AND position($old$- Not started, capacity: <persona>, ...$old$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = replace("instruction", $footer$## Idle worker capacity

An idle worker uses no worker slot. An open assignment or a held conversation does not consume capacity.$footer$, $footer$## Idle workers

An idle builder on an in-progress ticket keeps its place in the column. An open assignment or a held conversation holds no other place.$footer$), "updated_at" = now()
WHERE position($footer$## Idle worker capacity$footer$ IN "instruction") > 0;--> statement-breakpoint
UPDATE "personas" SET "instruction" = "instruction" || $heartbeat$

## Heartbeat

Trellis sends you a heartbeat while your ticket sits in progress and your session is idle.
The heartbeat carries your ticket, the fill of its column, and its latest comments.
Continue the next step of the ticket. When you wait for a dependency, review, or a human answer, record the next action in a ticket comment and finish your turn.
$heartbeat$, "updated_at" = now()
WHERE "kind" = 'builder' AND position('## Heartbeat' IN "instruction") = 0 AND length("instruction") <= 199000;
--> statement-breakpoint
UPDATE "personas" SET "instruction" = "instruction" || $automatic$

## Automatic builders

Project settings can select a default builder persona, harness, model, and supported effort level.
When a person or agent moves a ticket into In Progress, Trellis starts that builder after the move commits.
Inspect the ticket assignment before a manual start. Reuse its builder when one already owns the ticket.
A ticket cannot enter In Progress until its project has a default builder.
Review specialists work on tickets in review and do not consume places in In Progress.
An agent move into a full status fails with STATUS_FULL. A person can change the limit or move a ticket past it.
The deterministic manager module sends idle builders ticket heartbeats and restores workers while their tickets remain In Progress.
Move the ticket out of In Progress to stop its work. Trellis resumes a stopped builder while the ticket remains In Progress.
$automatic$, "updated_at" = now()
WHERE "kind" = 'manager' AND position('## Automatic builders' IN "instruction") = 0;
