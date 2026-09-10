import { useEffect, useRef, useState } from "react";

// `ring` is true while the field holds a focus that came from the keyboard.
// A text field matches :focus-visible on every focus, autofocus included,
// so the page tracks the last input itself: a key press arms the ring and
// a pointer press clears it. Spread the handlers on the field.
export const useKeyboardFocusRing = () => {
	const keyboard = useRef(false);
	const [ring, setRing] = useState(false);
	useEffect(() => {
		const onKey = () => {
			keyboard.current = true;
		};
		const onPointer = () => {
			keyboard.current = false;
		};
		window.addEventListener("keydown", onKey, true);
		window.addEventListener("pointerdown", onPointer, true);
		return () => {
			window.removeEventListener("keydown", onKey, true);
			window.removeEventListener("pointerdown", onPointer, true);
		};
	}, []);
	return {
		ring,
		onFocus: () => setRing(keyboard.current),
		onBlur: () => setRing(false),
	};
};
