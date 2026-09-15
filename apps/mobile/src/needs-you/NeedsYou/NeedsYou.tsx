import { StyleSheet, View } from "react-native";

const styles = StyleSheet.create({
	screen: { flex: 1 },
});

// The Needs you tab: an empty screen under the tab header.
export function NeedsYou() {
	return <View testID="needs-you-body" style={styles.screen} />;
}
