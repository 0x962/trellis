import { launchGuide } from "../../agentPrompt/launchGuide";

export function nativePromptGuide(
	limits: { deadlineAt?: number; budgetMs?: number },
	guide: typeof launchGuide = launchGuide,
): typeof launchGuide {
	return (ctx, input) => {
		const notice = [
			limits.deadlineAt === undefined
				? ""
				: [
						`Flow deadline: ${new Date(limits.deadlineAt).toISOString()}.`,
						`Remaining time at prompt creation: ${Math.max(0, limits.deadlineAt - ctx.now().getTime())} ms.`,
					].join(" "),
			limits.budgetMs === undefined ? "" : `Flow time limit from process launch: ${limits.budgetMs} ms.`,
		]
			.filter(Boolean)
			.join("\n");
		return guide(ctx, {
			...input,
			message: [input.message, notice].filter(Boolean).join("\n\n") || undefined,
		});
	};
}
