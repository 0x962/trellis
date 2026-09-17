import { expect, test } from "bun:test";
import { showMaximizedWindow } from "./showMaximizedWindow.ts";

const fixture = ({ minimized = false, fullscreen = false } = {}) => {
	const calls: string[] = [];
	let leave = () => {};
	const window = {
		isMinimized: () => minimized,
		restore: () => calls.push("restore"),
		isFullScreen: () => fullscreen,
		setFullScreen: (value: boolean) => calls.push(`fullscreen:${value}`),
		once: (event: string, callback: () => void) => {
			calls.push(event);
			leave = callback;
		},
		maximize: () => calls.push("maximize"),
		show: () => calls.push("show"),
		focus: () => calls.push("focus"),
	};
	return { window, calls, leaveFullscreen: () => leave() };
};

test("opening a normal window maximizes it before show and focus", () => {
	const { window, calls } = fixture();
	showMaximizedWindow(window);
	expect(calls).toEqual(["maximize", "show", "focus"]);
});

test("opening a minimized window restores it before maximize", () => {
	const { window, calls } = fixture({ minimized: true });
	showMaximizedWindow(window);
	expect(calls).toEqual(["restore", "maximize", "show", "focus"]);
});

test("opening a fullscreen window waits for the normal window before maximize", () => {
	const { window, calls, leaveFullscreen } = fixture({ fullscreen: true });
	showMaximizedWindow(window);
	expect(calls).toEqual(["leave-full-screen", "fullscreen:false"]);
	leaveFullscreen();
	expect(calls).toEqual(["leave-full-screen", "fullscreen:false", "maximize", "show", "focus"]);
});
