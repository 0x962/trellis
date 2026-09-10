import { fireEvent } from "@testing-library/react";

// One keydown on `target`, the body by default. A hotkey bound with
// `useHotkey` reads it from the document.
export const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) =>
	fireEvent.keyDown(target, { key, ...init });

// The Command chord: `mod` is Command on a Mac and Control elsewhere.
export const mod = (key: string, init: KeyboardEventInit = {}) => press(key, { metaKey: true, ...init });
