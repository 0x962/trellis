import MarkdownDisplay, {
	createMarkdownIt,
	type RenderRules,
	renderRules,
} from "@ronradtke/react-native-markdown-display";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { usePalette } from "../../theme/usePalette";
import { markdownStyles } from "./markdownStyles";
import { taskAttribute, taskListPlugin } from "./taskList";

export type MarkdownProps = {
	source: string;
};

// Quotes and dashes stay as the author typed them, so a rendered comment
// matches its source.
const parser = createMarkdownIt({ typographer: false, plugins: [taskListPlugin] });

const defaults = renderRules(Text);

// A task list item is a checkbox with its checked state, then the text. Every
// other list item renders as the library draws it.
const rules: RenderRules = {
	list_item: (node, children, parents, styles, ...extra) => {
		const task = node.attributes[taskAttribute];
		if (task === undefined) return defaults.list_item!(node, children, parents, styles, ...extra);
		const done = task === "done";
		return (
			<View key={node.key} style={[styles._VIEW_SAFE_list_item, taskRow.row]}>
				<View
					accessible
					accessibilityRole="checkbox"
					accessibilityState={{ checked: done }}
					style={[styles._VIEW_SAFE_task_box, done && styles._VIEW_SAFE_task_box_done, taskRow.box]}
				>
					{done && <Text style={styles.task_check}>✓</Text>}
				</View>
				<View style={styles._VIEW_SAFE_bullet_list_content}>{children}</View>
			</View>
		);
	},
};

const taskRow = StyleSheet.create({
	row: { flexDirection: "row", alignItems: "flex-start" },
	box: { alignItems: "center", justifyContent: "center" },
});

// Read-only markdown in the palette: the description and the comment bodies.
export function Markdown({ source }: MarkdownProps) {
	const palette = usePalette();
	const style = useMemo(() => markdownStyles(palette), [palette]);
	return (
		<MarkdownDisplay markdownit={parser} rules={rules} style={style}>
			{source}
		</MarkdownDisplay>
	);
}
