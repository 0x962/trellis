import { type StyleProp, StyleSheet, type ViewStyle } from "react-native";

// The colors a rendered tree paints: every color-valued style key, and the
// `fill`, `stroke`, and `color` props. A test reads this set and never the
// shape of the tree, so a component may draw with Views or with SVG.
const styleKeys = [
	"color",
	"backgroundColor",
	"borderColor",
	"borderTopColor",
	"borderRightColor",
	"borderBottomColor",
	"borderLeftColor",
	"tintColor",
];

const propKeys = ["fill", "stroke", "color"];

export const paintedColors = (tree: unknown): Set<string> => {
	const colors = new Set<string>();
	const visit = (node: unknown) => {
		if (node === null || node === undefined || typeof node === "string") return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		const { props, children } = node as { props?: Record<string, unknown>; children?: unknown };
		if (props) {
			const style = (StyleSheet.flatten(props.style as StyleProp<ViewStyle>) ?? {}) as Record<string, unknown>;
			for (const key of styleKeys) {
				if (typeof style[key] === "string") colors.add(style[key]);
			}
			for (const key of propKeys) {
				if (typeof props[key] === "string") colors.add(props[key]);
			}
		}
		visit(children);
	};
	visit(tree);
	return colors;
};
