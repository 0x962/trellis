import { jest } from "@jest/globals";
import { View } from "react-native";

// A stand-in for expo-camera. The camera module has no native side under
// jest. `CameraView` keeps the scan callback of the view on screen, and
// `scan` hands that view one code, as the camera does when a QR code enters
// the frame. Camera access starts granted.

type Scanned = { type: string; data: string };

let onScanned: ((result: Scanned) => void) | undefined;

export function CameraView(props: { onBarcodeScanned?: (result: Scanned) => void }) {
	onScanned = props.onBarcodeScanned;
	return <View testID="camera" />;
}

export const scan = (data: string) => onScanned!({ type: "qr", data });

const granted = { granted: true, status: "granted", canAskAgain: true, expires: "never" } as const;

export const requestCameraPermission = jest.fn(async () => granted);

export const useCameraPermissions = () => [granted, requestCameraPermission, requestCameraPermission] as const;
