import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Button } from "../../../components/Button";
import { Spinner } from "../../../components/Spinner";
import { tokens } from "../../../theme/tokens";
import { usePalette } from "../../../theme/usePalette";

export type QrScannerProps = {
	// The text of the first QR code the camera reads.
	onScan: (data: string) => void;
	onCancel: () => void;
};

const styles = StyleSheet.create({
	box: { gap: tokens.space[3] },
	heading: { fontSize: tokens.text.lg, lineHeight: tokens.leading.lg },
	camera: { aspectRatio: 1, borderRadius: tokens.radius.lg, overflow: "hidden" },
	status: { flexDirection: "row", alignItems: "center", gap: tokens.space[2] },
	message: { flex: 1, fontSize: tokens.text.base, lineHeight: tokens.leading.base },
});

export function QrScanner({ onScan, onCancel }: QrScannerProps) {
	const [permission, requestPermission] = useCameraPermissions();
	const palette = usePalette();
	// The camera reports a code on every frame that shows it. The first report
	// ends the scan, so the screen probes the server once.
	const scanned = useRef(false);

	return (
		<View style={styles.box}>
			<Text accessibilityRole="header" style={[styles.heading, { color: palette.fg }]}>
				Scan a pairing code
			</Text>
			{permission === null ? (
				<View style={styles.status}>
					<Spinner />
					<Text accessibilityLiveRegion="polite" style={[styles.message, { color: palette.fgMuted }]}>
						Checking camera access…
					</Text>
				</View>
			) : permission.granted ? (
				<>
					<Text style={[styles.message, { color: palette.fgMuted }]}>Point the camera at the Trellis pair code.</Text>
					<CameraView
						accessible={false}
						style={styles.camera}
						facing="back"
						barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
						onBarcodeScanned={(result) => {
							if (scanned.current) return;
							scanned.current = true;
							onScan(result.data);
						}}
					/>
				</>
			) : permission.canAskAgain ? (
				<>
					<Text style={[styles.message, { color: palette.fgMuted }]}>
						Allow camera access to scan the Trellis pair code.
					</Text>
					<Button
						label="Allow camera"
						accessibilityHint="Opens the system camera permission request."
						onPress={() => void requestPermission()}
					/>
				</>
			) : (
				<>
					<Text
						accessibilityLiveRegion="assertive"
						accessibilityRole="alert"
						style={[styles.message, { color: palette.danger }]}
					>
						Camera access is off. Open Settings and allow camera access for Trellis.
					</Text>
					<Button
						label="Open Settings"
						accessibilityHint="Opens the Trellis permissions in the system Settings app."
						onPress={() => void Linking.openSettings()}
					/>
				</>
			)}
			<Button label="Cancel scan" onPress={onCancel} />
		</View>
	);
}
