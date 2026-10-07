import Ionicons from "@expo/vector-icons/Ionicons";
import type { PageSummary } from "@trellis/api";
import { StyleSheet, Text, View } from "react-native";
import { Row } from "../../../../../components/Row";
import { layout } from "../../../../../theme/layout";
import { tokens } from "../../../../../theme/tokens";
import { usePalette } from "../../../../../theme/usePalette";

const styles = StyleSheet.create({
	summary: { flex: 1, fontSize: tokens.text.sm, lineHeight: tokens.leading.sm },
});

// A Page title with its project and the line the publisher wrote. A Page
// without that line shows the version number it stands at.
export function PageRow({ page }: { page: PageSummary }) {
	const palette = usePalette();
	const detail = page.summary === "" ? `Version ${page.latestVersion}` : page.summary;
	return (
		<View accessible accessibilityLabel={`Page. ${page.title}. In ${page.projectKey}. ${detail}`}>
			<Row
				testID={`page-row-${page.ref}`}
				id={page.projectKey}
				title={page.title}
				leading={<Ionicons name="document-text-outline" size={layout.statusIcon} color={palette.fgFaint} />}
				meta={
					<Text numberOfLines={1} style={[styles.summary, { color: palette.fgMuted }]}>
						{detail}
					</Text>
				}
			/>
		</View>
	);
}
