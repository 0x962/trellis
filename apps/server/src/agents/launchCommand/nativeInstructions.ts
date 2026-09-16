export const nativeInstructions = `
## Local execution

Run trellis --help and the relevant subcommand's --help before you use unfamiliar commands.
Use trellis brief <ticket> to read a ticket with its comments and task context.
Use trellis agents list --project <project> to inspect assignments.
Preserve TRELLIS_URL, TRELLIS_ACTOR, TRELLIS_RUN_ID, TRELLIS_ATTEMPT_TOKEN, and TRELLIS_AUTH_TOKEN in child commands.
Use one stable --request-id for each worker assignment. Reuse it after an uncertain response.
An idle agent waits for another message. A process that runs does not prove that its task is complete.

Before you report work ready for review, register the output files:
trellis evidence register "$TRELLIS_RUN_ID" --path <relative-file-path>

Run each repository command directly in the workspace.
Report the exact command, revision, exit result, and each required check that you did not run.
A failed or unrun required check blocks Agent Review.
Any later file change requires current checks and artifact registration again.
Follow the project review policy for review tools, findings, and approval.
`;
