import Ionicons from "@expo/vector-icons/Ionicons";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useReduceMotion } from "../../../../hooks/useReduceMotion";
import { layout } from "../../../../theme/layout";
import { tokens } from "../../../../theme/tokens";
import { usePalette } from "../../../../theme/usePalette";

export type SwipeRowProps = {
	// The ticket identifier. The pan gesture carries the test id `swipe-<identifier>`.
	identifier: string;
	children: ReactNode;
	// A right swipe past the threshold. Absent on a row outside Review.
	onApprove?: () => void;
	// A left swipe past the threshold. Absent on a row outside Review.
	onSendBack?: () => void;
	// True once the row leaves the list. The row collapses and fades, then
	// calls `onRemoved`. Under reduce motion it calls `onRemoved` at once.
	removing?: boolean;
	onRemoved?: () => void;
};

// A finger that travels this far and lifts fires the action. A shorter
// drag springs back.
export const swipeThresholdPx = 80;

// The sweep of a leaving row, in ms.
export const sweepMs = 200;

// The furthest the row follows the finger.
const maxDragPx = 160;

type Side = "right" | "left";

const styles = StyleSheet.create({
	reveal: {
		flexDirection: "row",
		alignItems: "center",
		gap: tokens.space[2],
		paddingHorizontal: tokens.space[4],
	},
	revealRight: { justifyContent: "flex-start" },
	revealLeft: { justifyContent: "flex-end" },
	label: { fontSize: tokens.text.md, lineHeight: tokens.leading.md, fontWeight: "600", color: tokens.onSaturated },
});

const clamp = (x: number) => Math.max(-maxDragPx, Math.min(maxDragPx, x));

// One Needs you row that a finger can drag. A right drag reveals Approve on
// the success ground; a left drag reveals Send back on the danger ground. A
// row without the matching action does not move. The gesture callbacks run
// on the JS thread, so React state drives the labels.
export function SwipeRow({ identifier, children, onApprove, onSendBack, removing = false, onRemoved }: SwipeRowProps) {
	const palette = usePalette();
	const reduceMotion = useReduceMotion();
	const [side, setSide] = useState<Side | undefined>();
	const translateX = useRef(new Animated.Value(0)).current;
	const height = useRef(new Animated.Value(layout.inboxRow)).current;
	const opacity = useRef(new Animated.Value(1)).current;
	const actions = useRef({ onApprove, onSendBack, onRemoved });
	actions.current = { onApprove, onSendBack, onRemoved };

	const pan = useMemo(() => {
		const sideOf = (x: number): Side | undefined => {
			if (x > 0 && actions.current.onApprove !== undefined) return "right";
			if (x < 0 && actions.current.onSendBack !== undefined) return "left";
			return undefined;
		};
		const follow = (x: number) => {
			const next = sideOf(x);
			translateX.setValue(next === undefined ? 0 : clamp(x));
			setSide(next);
		};
		const settle = () => {
			Animated.timing(translateX, { toValue: 0, duration: sweepMs, useNativeDriver: false }).start(() =>
				setSide(undefined),
			);
		};
		return Gesture.Pan()
			.withTestId(`swipe-${identifier}`)
			.runOnJS(true)
			.activeOffsetX([-12, 12])
			.failOffsetY([-10, 10])
			.onStart((event) => follow(event.translationX))
			.onUpdate((event) => follow(event.translationX))
			.onEnd((event) => {
				const next = sideOf(event.translationX);
				const fired = next !== undefined && Math.abs(event.translationX) >= swipeThresholdPx;
				// An approved row keeps its offset while it sweeps out of the list.
				// A sent-back row slides back at once, because the person can
				// still cancel the send-back sheet.
				if (fired && next === "right") {
					actions.current.onApprove?.();
					return;
				}
				if (fired) actions.current.onSendBack?.();
				settle();
			});
	}, [identifier, translateX]);

	useEffect(() => {
		if (!removing) {
			height.setValue(layout.inboxRow);
			opacity.setValue(1);
			translateX.setValue(0);
			setSide(undefined);
			return;
		}
		if (reduceMotion) {
			actions.current.onRemoved?.();
			return;
		}
		Animated.parallel([
			Animated.timing(height, { toValue: 0, duration: sweepMs, useNativeDriver: false }),
			Animated.timing(opacity, { toValue: 0, duration: sweepMs, useNativeDriver: false }),
		]).start();
		const timer = setTimeout(() => actions.current.onRemoved?.(), sweepMs);
		return () => clearTimeout(timer);
	}, [removing, reduceMotion, height, opacity, translateX]);

	const accessibilityActions = [
		...(onApprove === undefined ? [] : [{ name: "approve", label: "Approve" }]),
		...(onSendBack === undefined ? [] : [{ name: "sendBack", label: "Send back" }]),
	];

	return (
		<Animated.View
			style={{ height, opacity, overflow: "hidden" }}
			accessibilityActions={accessibilityActions}
			onAccessibilityAction={(event) => {
				if (event.nativeEvent.actionName === "approve") onApprove?.();
				if (event.nativeEvent.actionName === "sendBack") onSendBack?.();
			}}
		>
			{side === "right" && (
				<View
					style={[StyleSheet.absoluteFill, styles.reveal, styles.revealRight, { backgroundColor: palette.success }]}
				>
					<Ionicons name="checkmark" size={tokens.text.lg} color={tokens.onSaturated} />
					<Text style={styles.label}>Approve</Text>
				</View>
			)}
			{side === "left" && (
				<View style={[StyleSheet.absoluteFill, styles.reveal, styles.revealLeft, { backgroundColor: palette.danger }]}>
					<Text style={styles.label}>Send back</Text>
					<Ionicons name="arrow-undo" size={tokens.text.lg} color={tokens.onSaturated} />
				</View>
			)}
			<GestureDetector gesture={pan}>
				<Animated.View style={{ transform: [{ translateX }] }}>{children}</Animated.View>
			</GestureDetector>
		</Animated.View>
	);
}
