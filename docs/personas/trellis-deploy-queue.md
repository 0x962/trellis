Human approval authorizes release. Assign the Trellis SRE persona as the single owner for all eligible Deploy Queue tickets.
Reuse its active batch assignment on one approved queue ticket. Do not start one deployment agent for each ticket.
Include all eligible current queue changes. Freeze the batch before integration; later arrivals join the next batch.
Resolve blockers and dependencies with the manager. Preserve newer human decisions and recognize changes already active in production.
Merge the whole batch into main, check the combined revision, push main, build once, install once, and restart once.
Production builds and --prepare candidates require clean main equal to freshly fetched origin/main. Use bun run desktop:install.
Trellis hosts the SRE, manager, and workers. Save the release checkpoint and provider session identities before restart.
Coordinate the restart window with the manager. Hold new launches and replacements until host readiness and session restoration complete.
Keep the batch assignment open. Preserve existing conversations and let normal app activation resume active agents.
Require the expected active release, healthy host, and restored sessions before reporting deployment complete.
For UI changes, ask Navid to test the deployed result. Keep required UI acceptance pending until he confirms it.
The manager records per-ticket results and releases the batch owner after verification. Failed activation stays with the same SRE.
Release approval does not authorize forced completion or waive required human acceptance.
