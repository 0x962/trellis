import { act, fireEvent } from "@testing-library/react-native";
import { DeviceEventEmitter } from "react-native";

type Frame = { x: number; y: number; width: number; height: number };

// Reports the frame a view has inside its parent, the way the native layout
// pass does. A KeyboardAvoidingView reads this frame to find its bottom edge.
export const layoutOf = (element: Parameters<typeof fireEvent>[0], layout: Frame) =>
	fireEvent(element, "layout", { persist: () => {}, nativeEvent: { layout } });

// Sends the iOS keyboard notification of a keyboard whose top edge sits
// `screenY` px below the top of the window.
export const showKeyboard = (screenY: number, height: number) =>
	act(async () => {
		DeviceEventEmitter.emit("keyboardWillShow", {
			duration: 0,
			easing: "keyboard",
			isEventFromThisApp: true,
			startCoordinates: { screenX: 0, screenY: screenY + height, width: 400, height },
			endCoordinates: { screenX: 0, screenY, width: 400, height },
		});
	});
