// The shell command Start with agent and Re-run with agent copy. `{brief}`
// in the template stands for the shell substitution that prints the ticket
// brief. Failing check names, when there are any, are appended as one
// instruction.
export const agentCommand = (template: string, identifier: string, failing: string[] = []): string => {
	const command = template.replace("{brief}", () => `$(trellis brief ${identifier})`);
	if (failing.length === 0) return command;
	return `${command} fix the failing checks: ${failing.join(", ")}`;
};
