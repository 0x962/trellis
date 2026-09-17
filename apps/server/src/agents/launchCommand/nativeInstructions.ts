export const nativeInstructions = `
## Local execution

Run trellis --help and the relevant subcommand's --help before you use unfamiliar commands.
Use trellis brief <ticket> to read a ticket with its comments and task context.
Use trellis agents list --project <project> to inspect assignments.
Preserve TRELLIS_URL, TRELLIS_ACTOR, TRELLIS_RUN_ID, TRELLIS_ATTEMPT_TOKEN, and TRELLIS_AUTH_TOKEN in child commands.
Use one stable --request-id for each worker assignment. Reuse it after an uncertain response.
An idle agent waits for another message. A process that runs does not prove that its task is complete.
Follow the project review policy for review tools, findings, and approval.
`;
