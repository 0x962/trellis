import { RUNTIME_PROTOCOL_VERSION, type RuntimeRequest } from "@trellis/runtime-protocol";

import { validateHarnessEvent } from "./validateHarnessEvent.ts";

export function validateRequest(value: unknown): RuntimeRequest {
	const request = value as RuntimeRequest;
	if (!request || typeof request.id !== "string" || request.id.length > 128)
		throw new Error("Request identifier is required");
	if (request.version !== RUNTIME_PROTOCOL_VERSION)
		throw Object.assign(new Error("Runtime protocol version is incompatible"), { code: "PROTOCOL_MISMATCH" });
	const params = request.params as Record<string, unknown>;
	if (!params || typeof params !== "object") throw new Error("Request parameters are required");
	if (
		[
			"start",
			"inspect",
			"hasMessage",
			"registerNativeDelivery",
			"observe",
			"turn",
			"input",
			"deliver",
			"resize",
			"stop",
			"output",
			"subscribe",
			"terminal",
		].includes(request.method)
	) {
		if (typeof params.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(params.id))
			throw new Error("Session identifier must contain letters, numbers, underscores, or hyphens");
	}
	if (params.expected !== undefined) {
		const expected = params.expected as Record<string, unknown>;
		if (
			!expected ||
			typeof expected !== "object" ||
			(expected.turnId !== null && typeof expected.turnId !== "string") ||
			typeof expected.activityAt !== "string" ||
			(expected.idleBefore !== undefined &&
				(typeof expected.idleBefore !== "string" || !Number.isFinite(Date.parse(expected.idleBefore))))
		)
			throw new Error("An expected provider turn requires turnId and activityAt");
	}
	switch (request.method) {
		case "shutdown":
		case "hello":
		case "inspect":
		case "stop":
			break;
		case "list":
			if (
				params.ids !== undefined &&
				(!Array.isArray(params.ids) ||
					!params.ids.every((id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id)))
			)
				throw new Error("Session identifiers must contain letters, numbers, underscores, or hyphens");
			if (params.status !== undefined && !["running", "exited", "unknown"].includes(params.status as string))
				throw new Error("Unknown process status filter");
			if (params.activity !== undefined && !["ready", "working", "idle"].includes(params.activity as string))
				throw new Error("Unknown process activity filter");
			if (params.hasError !== undefined && typeof params.hasError !== "boolean")
				throw new Error("The process error filter must be a boolean");
			break;
		case "hasMessage":
			if (typeof params.messageId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(params.messageId))
				throw new Error("Message identifier must contain letters, numbers, underscores, or hyphens");
			break;
		case "registerNativeDelivery":
			if (typeof params.token !== "string" || !params.token || params.token.length > 1024)
				throw new Error("An attempt token is required");
			if (typeof params.messageId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(params.messageId))
				throw new Error("A message identifier is required");
			if (typeof params.promptDigest !== "string" || !/^[a-f0-9]{64}$/.test(params.promptDigest))
				throw new Error("A SHA256 prompt digest is required");
			break;
		case "observe":
			if (typeof params.token !== "string" || !params.token || params.token.length > 1024)
				throw new Error("An attempt token is required");
			validateHarnessEvent(params.event);
			break;
		case "turn":
			if (typeof params.token !== "string" || !params.token || params.token.length > 1024)
				throw new Error("An attempt token is required");
			if (!["SessionStart", "UserPromptSubmit", "Stop"].includes(params.event as string))
				throw new Error("Unknown turn event");
			if (params.result !== undefined && (typeof params.result !== "string" || params.result.length > 200000))
				throw new Error("A turn result must be a string of at most 200000 characters");
			if (
				params.messageId !== undefined &&
				(typeof params.messageId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(params.messageId))
			)
				throw new Error("Message identifier must contain letters, numbers, underscores, or hyphens");
			break;
		case "start":
			if (
				params.timeoutMs !== undefined &&
				(!Number.isSafeInteger(params.timeoutMs) ||
					(params.timeoutMs as number) < 1 ||
					(params.timeoutMs as number) > 86400000)
			)
				throw new Error("Process timeout must be between 1 and 86400000 milliseconds");
			if (
				typeof params.command !== "string" ||
				!params.command ||
				typeof params.cwd !== "string" ||
				!params.cwd.startsWith("/")
			)
				throw new Error("A command and absolute working directory are required");
			if (!Array.isArray(params.args) || !params.args.every((arg) => typeof arg === "string"))
				throw new Error("Command arguments must be strings");
			if (params.mode !== "pty" && params.mode !== "stdio") throw new Error("Process mode must be pty or stdio");
			if (
				params.env !== undefined &&
				(!params.env ||
					typeof params.env !== "object" ||
					!Object.values(params.env).every((value) => typeof value === "string"))
			)
				throw new Error("Environment values must be strings");
			for (const key of ["cols", "rows"])
				if (
					params[key] !== undefined &&
					(!Number.isInteger(params[key]) || (params[key] as number) < 1 || (params[key] as number) > 1000)
				)
					throw new Error("Terminal dimensions must be between 1 and 1000");
			break;
		case "deliver":
		case "input":
			if (params.userInput !== undefined && typeof params.userInput !== "boolean")
				throw new Error("The user input flag must be a boolean");
			if (
				request.method === "deliver" &&
				(typeof params.messageId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(params.messageId))
			)
				throw new Error("Message identifier is required");
			if (
				typeof params.data !== "string" ||
				!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(params.data)
			)
				throw new Error("Input must be base64 bytes");
			break;
		case "resize":
			for (const key of ["cols", "rows"])
				if (!Number.isInteger(params[key]) || (params[key] as number) < 1 || (params[key] as number) > 1000)
					throw new Error("Terminal dimensions must be between 1 and 1000");
			break;
		case "subscribe":
		case "terminal":
		case "output":
			if (params.output !== undefined && typeof params.output !== "boolean")
				throw new Error("The output subscription flag must be a boolean");
			if (
				params.stream !== undefined &&
				params.stream !== "stdout" &&
				params.stream !== "stderr" &&
				params.stream !== "events"
			)
				throw new Error("Output stream must be stdout, stderr, or events");
			if (!Number.isSafeInteger(params.offset) || (params.offset as number) < 0)
				throw new Error("Output offset must be a positive byte count");
			break;
		default:
			throw new Error("Unknown runtime method");
	}
	return request;
}
