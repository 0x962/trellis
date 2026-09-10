import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

// The system reduce-motion setting. The first render says false while the
// setting is read, and every later change to the setting re-renders.
export const useReduceMotion = (): boolean => {
	const [reduce, setReduce] = useState(false);
	useEffect(() => {
		let mounted = true;
		void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
			if (mounted) setReduce(enabled);
		});
		const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
		return () => {
			mounted = false;
			subscription.remove();
		};
	}, []);
	return reduce;
};
