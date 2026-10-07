import { ActivityIndicator } from "react-native";
import { useReduceMotion } from "../../hooks/useReduceMotion";
import { usePalette } from "../../theme/usePalette";

export function Spinner() {
	const palette = usePalette();
	const reduceMotion = useReduceMotion();
	if (reduceMotion) return null;
	return <ActivityIndicator accessible={false} color={palette.accent} />;
}
