import { useEffect, useRef } from "react";
import { createEscapeLayers, type EscapeHandler, type EscapeLayer } from "./escapeLayers";

const layers = createEscapeLayers();
let listeners = 0;

export const useEscapeLayer = (layer: EscapeLayer, active: boolean, onEscape: EscapeHandler) => {
	const callback = useRef(onEscape);
	callback.current = onEscape;
	useEffect(() => {
		if (!active) return;
		const unregister = layers.register(layer, () => callback.current());
		// Window receives Escape after the focused control can consume it.
		if (listeners++ === 0) window.addEventListener("keydown", layers.handle);
		return () => {
			unregister();
			if (--listeners === 0) window.removeEventListener("keydown", layers.handle);
		};
	}, [layer, active]);
};
