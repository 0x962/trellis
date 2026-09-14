export const nativeInstructions = `
## Local execution

Run trellis --help and the relevant subcommand's --help before you use unfamiliar commands.
Use trellis brief <ticket> to read a ticket with its comments and task context.
Use trellis agents list --project <project> to inspect assignments.
Preserve TRELLIS_URL, TRELLIS_ACTOR, TRELLIS_RUN_ID, TRELLIS_ATTEMPT_TOKEN, and TRELLIS_AUTH_TOKEN in child commands.
Use one stable --request-id for each worker assignment. Reuse it after an uncertain response.
An idle agent waits for another message. A process that runs does not prove that its task is complete.

Before you report work ready for review, register the output files and run the relevant checks:
trellis evidence register "$TRELLIS_RUN_ID" --path <relative-file-path>
trellis evidence check "$TRELLIS_RUN_ID" --request-id <stable-uuid> --command <executable> --args '<JSON-array>'
trellis evidence list "$TRELLIS_RUN_ID"

Use a new UUID for an intentional check rerun. Reuse the UUID to retrieve a check after an uncertain response.
Confirm readyForReview is true before you report evidence ready. Report failed or outdated checks with their retained output.
Any later file change requires current checks and artifact registration again.
For a pull request review, read margin list <pr-url> first. Post review findings to margin, as the repository rules require.
`;
