// The shell command Start with agent and Re-run with agent copy. `{brief}`
// in the template stands for the shell substitution that prints the ticket
// brief. Failing check names, when there are any, are appended as one
// instruction.
export const agentCommand = (_template: string, _identifier: string, _failing: string[] = []): string => {
	throw new Error("agentCommand is not implemented.");
};
