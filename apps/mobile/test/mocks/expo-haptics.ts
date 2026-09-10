import { jest } from "@jest/globals";

// A stand-in for expo-haptics. `notificationAsync` records every call; the
// jest setup clears it before each test.
export const NotificationFeedbackType = { Success: "success", Warning: "warning", Error: "error" } as const;

export const notificationAsync = jest.fn(async (_type: string) => {});
