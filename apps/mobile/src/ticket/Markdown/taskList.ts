import type { PluginSimple } from "markdown-it";

// The task marker at the start of a list item: "[ ] " or "[x] ".
const marker = /^\[( |x|X)\] /;

// The attribute the rule sets on `list_item_open`: "done" or "todo". The
// renderer reads it from `node.attributes.task`.
export const taskAttribute = "task";

// A markdown-it rule for GitHub task lists. A list item whose first text
// starts with a task marker loses the marker and carries `task` as an
// attribute. The rule runs right after `inline`, so the marker sits in one
// text token.
export const taskListPlugin: PluginSimple = (md) => {
	md.core.ruler.after("inline", "task_list", (state) => {
		const { tokens } = state;
		tokens.forEach((token, index) => {
			if (token.type !== "list_item_open") return;
			const inline = tokens[index + 2];
			if (tokens[index + 1]?.type !== "paragraph_open" || inline?.type !== "inline") return;
			const first = inline.children?.[0];
			if (first?.type !== "text") return;
			const match = marker.exec(first.content);
			if (match === null) return;
			first.content = first.content.slice(match[0].length);
			token.attrSet(taskAttribute, match[1] === " " ? "todo" : "done");
		});
		return true;
	});
};
