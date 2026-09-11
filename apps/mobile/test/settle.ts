import { act } from "@testing-library/react-native";

// Gives the requests in flight and the renders they cause time to finish, so
// a test that asserts an absence waits for the screen to go quiet first.
export const settle = (ms = 50) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
