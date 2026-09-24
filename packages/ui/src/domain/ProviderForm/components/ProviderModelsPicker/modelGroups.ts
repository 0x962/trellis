import type { CommandGroup, CommandItem } from "../../../../primitives/Command";

const creators: Record<string, string> = {
	anthropic: "Anthropic",
	google: "Google",
	meta: "Meta",
	openai: "OpenAI",
	"typesafe-ai": "TypeSafe AI",
};
const order = Object.keys(creators);

export function modelGroups(
	models: readonly { id: string; name: string }[],
	selected: readonly string[],
): CommandGroup[] {
	const groups = new Map<string, { heading: string; items: CommandItem[] }>();
	for (const model of models) {
		const creator = model.id.includes("/") ? model.id.split("/")[0]! : "Other";
		const group = groups.get(creator) ?? { heading: creators[creator] ?? creator, items: [] };
		group.items.push({ id: model.id, label: model.name, keywords: [model.id], checked: selected.includes(model.id) });
		groups.set(creator, group);
	}
	return [...groups]
		.sort(([a], [b]) => {
			const first = order.includes(a) ? order.indexOf(a) : order.length;
			const second = order.includes(b) ? order.indexOf(b) : order.length;
			return first - second || a.localeCompare(b);
		})
		.map(([, group]) => group);
}
