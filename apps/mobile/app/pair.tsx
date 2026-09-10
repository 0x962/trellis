import { Redirect, useLocalSearchParams } from "expo-router";

// The target of the pair link `trellis://pair?url=<server URL>` that the web
// settings page draws as a QR code. The setup screen fills its field with the
// URL and probes it; the person still presses Save.
export default function PairRoute() {
	const { url } = useLocalSearchParams<{ url?: string }>();
	return <Redirect href={{ pathname: "/setup", params: { url } }} />;
}
