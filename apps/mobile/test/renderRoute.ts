import { jest } from "@jest/globals";
import { act, renderRouter, screen } from "expo-router/testing-library";
import { appContext } from "./appContext";

// Mounts the route tree the app ships at one URL, and hands back the route
// readers a test asserts on.
//
// renderRouter turns Jest's fake timers on, so React Navigation settles in one
// tick. A screen then reads a real socket, and a fake clock starves the event
// loop of that answer, so the clock goes back to real once the tree is
// mounted. A test that drives a debounce turns the fake clock on again.
//
// renderRouter hands back a promise that carries the readers, and an async
// function unwraps a promise it returns, so the readers travel in an object
// of their own.
export const renderRoute = async (url: string) => {
	const view = renderRouter(appContext(), { initialUrl: url });
	await view;
	// A query that settled during the mount notifies its component on a zero
	// delay timer. The switch drops every fake timer that is still pending, so
	// the zero delay ones run first.
	await act(() => jest.advanceTimersByTimeAsync(0));
	jest.useRealTimers();
	return {
		getPathname: () => view.getPathname(),
		getSegments: () => view.getSegments(),
		unmount: () => screen.unmount(),
	};
};
