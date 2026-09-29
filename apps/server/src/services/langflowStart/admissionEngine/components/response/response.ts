import type { ZodType } from "zod";
import type { EngineResponse } from "../../../../../langflowHost";

export function responseValue<T>(response: EngineResponse, schema: ZodType<T>): T | null {
	if (response.state !== "received" || response.status !== 200 || response.contentType?.split(";")[0]?.trim().toLowerCase() !== "application/json")
		return null;
	try {
		const value = schema.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.bytes)));
		return value.success ? value.data : null;
	} catch {
		return null;
	}
}
