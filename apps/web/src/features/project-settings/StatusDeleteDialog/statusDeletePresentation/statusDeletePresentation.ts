export function statusDeletePresentation(ticketCount: number, lastStatus: boolean, moveTo: string) {
	const needsReplacement = ticketCount > 0;
	return {
		needsReplacement,
		confirmDisabled: lastStatus || (needsReplacement && moveTo === ""),
		description: lastStatus
			? "A project keeps at least one status. Add another status before you delete this one."
			: needsReplacement
				? `${ticketCount} ${ticketCount === 1 ? "ticket uses" : "tickets use"} this status. Select a status to move ${ticketCount === 1 ? "it" : "them"} to.`
				: "Trellis deletes the status from the project.",
	};
}
