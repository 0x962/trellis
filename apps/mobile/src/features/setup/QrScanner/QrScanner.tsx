import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../../components/Button";
import { tokens } from "../../../theme/tokens";
import { usePalette } from "../../../theme/usePalette";

export type QrScannerProps = {
	// The text of the first QR code the camera reads.
	onScan: (data: string) => void;
	onCancel: () => void;
};

const styles = StyleSheet.create({
	box: { gap: tokens.space[3] },
	camera: { aspectRatio: 1, borderRadius: tokens.radius.lg, overflow: "hidden" },
	message: { fontSize: tokens.text.base, lineHeight: tokens.leading.base },
});

// The camera view that reads one QR code. It asks for camera access when it
// opens. A person who refused access sees where to allow it.
export function QrScanner({ onScan, onCancel }: QrScannerProps) {
	const [permission, requestPermission] = useCameraPermissions();
	const palette = usePalette();
	// The camera reports a code on every frame that shows it. The first report
	// ends the scan, so the screen probes the server once.
	const scanned = useRef(false);

	useEffect(() => {
		if (permission !== null && !permission.granted && permission.canAskAgain) void requestPermission();
	}, [permission, requestPermission]);

	if (permission === null) return null;

	return (
		<View style={styles.box}>
			{permission.granted ? (
				<CameraView
					style={styles.camera}
					facing="back"
					barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
					onBarcodeScanned={(result) => {
						if (scanned.current) return;
						scanned.current = true;
						onScan(result.data);
					}}
				/>
			) : (
				<Text style={[styles.message, { color: palette.fgMuted }]}>
					Allow camera access for trellis in the Settings app to scan the code.
				</Text>
			)}
			<Button label="Cancel scan" onPress={onCancel} />
		</View>
	);
}
