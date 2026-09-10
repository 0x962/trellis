import { type PanGesture, State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

// A drag on the row's pan gesture, which carries the test id `swipe-<identifier>`.
// A drag that ends 40 px out stays under the action threshold; 160 px passes it.
export const shortDragPx = 40;
export const longDragPx = 160;

const drag = (identifier: string, to: number, end: boolean) => {
	const steps: Array<{ state: State; translationX: number }> = [
		{ state: State.BEGAN, translationX: 0 },
		{ state: State.ACTIVE, translationX: to / 2 },
		{ state: State.ACTIVE, translationX: to },
	];
	if (end) steps.push({ state: State.END, translationX: to });
	fireGestureHandler<PanGesture>(getByGestureTestId(`swipe-${identifier}`), steps);
};

// A finger that rests `px` to the right or the left and has not lifted.
const hold = (identifier: string, to: number) => {
	const pan = getByGestureTestId(`swipe-${identifier}`);
	const event = { translationX: to } as never;
	pan.handlers.onStart?.(event);
	pan.handlers.onUpdate?.(event);
};

export const holdRight = (identifier: string, px = longDragPx) => hold(identifier, px);
export const holdLeft = (identifier: string, px = longDragPx) => hold(identifier, -px);

// A complete swipe past the threshold.
export const swipeRight = (identifier: string, px = longDragPx) => drag(identifier, px, true);
export const swipeLeft = (identifier: string, px = longDragPx) => drag(identifier, -px, true);
