import type { createController } from "../../agents/controller/controller.ts";

export const loopRuntimes = new Map<string, ReturnType<typeof createController>>();
