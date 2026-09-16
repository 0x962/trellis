CREATE TABLE "harness_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"harness" text NOT NULL,
	"profile_path" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "account_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "harness_accounts_profile_idx" ON "harness_accounts" USING btree ("harness","profile_path") WHERE "harness_accounts"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "harness_accounts_default_idx" ON "harness_accounts" USING btree ("harness") WHERE "harness_accounts"."is_default" AND "harness_accounts"."archived_at" IS NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_account_id_harness_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."harness_accounts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
UPDATE personas SET instruction = instruction || E'\n\n' || $accounts$## Harness accounts

Use harnessAccounts.list to inspect the accounts configured by a person in Settings. Select only enabled accounts.
Read each account's capabilities. Quota checks support Claude and Codex subscriptions. OpenCode and Pi report unsupported quota.
Use harnessAccounts.quota to read cached usage windows, reset times, and sign-in status before account selection or after a quota error.
Compare all applicable windows. An account with an exhausted weekly window cannot work when its short window resets.
Unknown, unavailable, and unsupported quota do not mean zero quota. Do not repeat a failed quota check on every heartbeat.
Prefer a compatible enabled account with available quota. Respect provider limits. Do not use another account to bypass a provider restriction.
Pass accountId to agentRuns.start with a stable requestId. Without accountId, a new assignment uses its harness default account.
A running assignment keeps its selected account. A default change affects new assignments.

If quota interrupts a worker, inspect agentRuns.session and its current assignment record before action.
Record the assignment ID, terminalId, provider session ID, workspace, interrupted operation, and reason for the account change.
Select another enabled account for the same harness. Check its quota when that capability is available.
Stop the prior process with agentRuns.stop. Confirm processStatus is exited before you resume it.
Call agentRuns.resume with the existing assignment ID, the target accountId, the stopped terminalId as expectedTerminalId, and a stable requestId.
Use the same requestId if the response is lost. Inspect the returned record before another action.
Verify that the provider session ID and workspace stay the same. A different terminalId identifies the new process attempt.
Check the interrupted operation before you repeat it. Keep existing commits, review context, approvals, and test evidence.
If the session cannot resume, retain the assignment and report the exact error. Do not reset its conversation or use newSession.

If every compatible account is exhausted, record a time wait through controller.handle at the earliest usable reset.
For each account, use the latest reset among its exhausted windows. Then choose the earliest usable account.
Continue independent work while that ticket waits. If a reset time is unknown, record that fact and request the needed account action.
For an expired sign-in, direct the person to the account's Sign in action in Settings.
Do not read credential files, copy tokens, change global logins, or create accounts. Account commands expose metadata and quota only.
Do not change a paid plan or switch to API billing without explicit human authorization.$accounts$, updated_at=now() WHERE kind='manager' AND instruction NOT LIKE '%## Harness accounts%';
