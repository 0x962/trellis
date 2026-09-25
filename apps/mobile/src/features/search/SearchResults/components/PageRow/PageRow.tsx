import type { PageSummary } from "@trellis/api";
import { StyleSheet, Text } from "react-native";
import { Row } from "../../../../../components/Row";
import { tokens } from "../../../../../theme/tokens";
import { usePalette } from "../../../../../theme/usePalette";

const styles = StyleSheet.create({
	summary: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm },
});

export function PageRow({ page }: { page: PageSummary }) {
	const palette = usePalette();
	return (
		<Row
			testID={`page-row-${page.ref}`}
			id={page.projectKey}
			title={page.title}
			meta={
				<Text numberOfLines={1} style={[styles.summary, { color: palette.fgMuted }]}>
					{page.summary || `Version ${page.latestVersion}`}
				</Text>
			}
		/>
	);
}
