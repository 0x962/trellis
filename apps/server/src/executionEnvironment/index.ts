import { createExecutionEnvironment } from "./executionEnvironment.ts";
import { loginEnvironment } from "./loginEnvironment/loginEnvironment.ts";

export const executionEnvironment = createExecutionEnvironment(process.env, loginEnvironment);
export type { ExecutionEnvironment } from "./executionEnvironment.ts";
