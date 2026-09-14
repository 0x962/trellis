export function parseFlowDecision(output: string): "yes" | "no" | null {
	const answer = output.trim().toLowerCase();
	return answer === "yes" || answer === "no" ? answer : null;
}
