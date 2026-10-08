import React from "react";
import { View } from "react-native";

const fixture = () => globalThis.__TRELLIS_CAMERA_FIXTURE__ ?? { permission: "prompt" };

const permissionFor = (state) => {
	if (state === "granted") return { granted: true, canAskAgain: true, status: "granted" };
	if (state === "denied") return { granted: false, canAskAgain: false, status: "denied" };
	return { granted: false, canAskAgain: true, status: "undetermined" };
};

export function useCameraPermissions() {
	const [permission, setPermission] = React.useState(() => {
		const state = fixture().permission;
		return state === "checking" ? null : permissionFor(state);
	});
	const requestPermission = React.useCallback(async () => {
		const next = permissionFor("granted");
		setPermission(next);
		return next;
	}, []);
	return [permission, requestPermission];
}

export function CameraView({ onBarcodeScanned, style }) {
	React.useEffect(() => {
		const data = fixture().barcode;
		if (typeof data !== "string") return;
		const timer = setTimeout(() => onBarcodeScanned({ data }), 40);
		return () => clearTimeout(timer);
	}, [onBarcodeScanned]);
	return React.createElement(View, {
		style: [style, { backgroundColor: "rgba(110,110,115,0.22)" }],
		"aria-hidden": true,
	});
}
