import { Plus } from "@phosphor-icons/react";
import type { CommandItem } from "@trellis/ui";
import { createElement } from "react";

export function createNameItem(
	kind: string,
	search: string,
	names: readonly string[],
	valid: (name: string) => boolean = (name) => name.length > 0,
): CommandItem | null {
	const name = search.trim();
	if (!valid(name) || names.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
		return null;
	}
	return {
		id: `create-${kind}:${name}`,
		label: `Create ${kind} "${name}"`,
		keywords: [name],
		icon: createElement(Plus),
		pinned: true,
	};
}
