import { MAX_TERMINAL_DIMENSION, RUNTIME_PROTOCOL_VERSION, type RuntimeRequest } from "@trellis/runtime-protocol";

import { validateHarnessEvent } from "./validateHarnessEvent.ts";

const validateCaptureRequest = (params: Record<string, unknown>) => {
	for (const key of ["captureId", "snapshotId", "hostId", "dataHomeId", "blockId"])
		if (typeof params[key] !== "string" || params[key] === "") throw new Error(`Capture ${key} is required`);
	if (!Number.isSafeInteger(params.generation) || (params.generation as number) < 0)
		throw new Error("Capture generation must be a nonnegative safe integer");
	if (!Array.isArray(params.identities)) throw new Error("Capture identities must be an array");
	for (const value of params.identities) {
		if (typeof value !== "object" || value === null) throw new Error("Capture identity must be an object");
		const identity = value as Record<string, unknown>;
		for (const key of ["harness", "agentRunId", "attemptId"])
			if (typeof identity[key] !== "string" || identity[key] === "")
				throw new Error(`Capture identity ${key} is required`);
		for (const key of ["accountId", "profileId", "providerSessionId"])
			if (identity[key] !== null && typeof identity[key] !== "string")
				throw new Error(`Capture identity ${key} must be a string or null`);
	}
};

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
			"recover",
			"hasMessage",
			"registerNativeDelivery",
			"observe",
			"turn",
			"input",
			"deliver",
			"queueInput",
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
		case "recover":
		case "stop":
			break;
		case "list":
		case "listPage":
			if (
				request.method === "listPage" &&
				params.cursor !== undefined &&
				(typeof params.cursor !== "string" || params.cursor.length === 0 || params.cursor.length > 128)
			)
				throw new Error("A list cursor must contain between 1 and 128 characters");
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
			if (
				params.limit !== undefined &&
				(typeof params.limit !== "number" || !Number.isSafeInteger(params.limit) || params.limit < 1)
			)
				throw new Error("A list limit must be a whole number of at least 1");
			break;
		case "capture": {
			validateCaptureRequest(params);
			break;
		}
		case "finalizeCapture": {
			if (typeof params.request !== "object" || params.request === null)
				throw new Error("Capture finalization request is required");
			validateCaptureRequest(params.request as Record<string, unknown>);
			if (params.outcome !== "committed" && params.outcome !== "abandoned")
				throw new Error("Capture finalization outcome is required");
			break;
		}
		case "hasMessage":
			if (typeof params.messageId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(params.messageId))
				throw new Error("Message identifier must contain letters, numbers, underscores, or hyphens");
			break;
		case "registerNativeDelivery":
			if (typeof params.token !== "string" || !params.token) throw new Error("An attempt token is required");
			if (typeof params.messageId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(params.messageId))
				throw new Error("A message identifier is required");
			if (typeof params.promptDigest !== "string" || !/^[a-f0-9]{64}$/.test(params.promptDigest))
				throw new Error("A SHA256 prompt digest is required");
			break;
		case "observe":
			if (typeof params.token !== "string" || !params.token) throw new Error("An attempt token is required");
			validateHarnessEvent(params.event);
			break;
		case "turn":
			if (typeof params.token !== "string" || !params.token) throw new Error("An attempt token is required");
			if (!["SessionStart", "UserPromptSubmit", "Stop"].includes(params.event as string))
				throw new Error("Unknown turn event");
			if (params.result !== undefined && typeof params.result !== "string")
				throw new Error("A turn result must be a string");
			if (
				params.messageId !== undefined &&
				(typeof params.messageId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(params.messageId))
			)
				throw new Error("Message identifier must contain letters, numbers, underscores, or hyphens");
			break;
		case "start":
			if (
				params.timeoutMs !== undefined &&
				(!Number.isSafeInteger(params.timeoutMs) || (params.timeoutMs as number) < 1)
			)
				throw new Error("Process timeout must be a positive safe integer");
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
			if (params.capture !== undefined) {
				if (typeof params.capture !== "object" || params.capture === null)
					throw new Error("Launch capture must be an object");
				const capture = params.capture as Record<string, unknown>;
				for (const key of ["harness", "agentRunId", "attemptId"])
					if (typeof capture[key] !== "string" || capture[key] === "")
						throw new Error(`Launch capture ${key} is required`);
				for (const key of ["accountId", "profileId"])
					if (capture[key] !== null && typeof capture[key] !== "string")
						throw new Error(`Launch capture ${key} must be a string or null`);
				if (capture.attemptId !== params.id) throw new Error("Launch capture attempt does not match the session");
				if (
					!Array.isArray(capture.providerScopePaths) ||
					!capture.providerScopePaths.every((path) => typeof path === "string" && path.startsWith("/"))
				)
					throw new Error("Launch provider scope paths must be absolute");
				if (!Array.isArray(capture.providerRoots)) throw new Error("Launch conversation roots are required");
				for (const value of capture.providerRoots) {
					if (typeof value !== "object" || value === null)
						throw new Error("Launch conversation root must be an object");
					const root = value as Record<string, unknown>;
					if (
						root.contentKind !== "conversation-directory" ||
						(root.sourceKind !== "account-profile" && root.sourceKind !== "opencode-export") ||
						typeof root.path !== "string" ||
						!root.path.startsWith("/") ||
						!Array.isArray(root.externalLinks)
					)
						throw new Error("Launch conversation root is invalid");
					for (const value of root.externalLinks) {
						if (
							typeof value !== "object" ||
							value === null ||
							typeof (value as Record<string, unknown>).path !== "string" ||
							typeof (value as Record<string, unknown>).target !== "string"
						)
							throw new Error("Launch conversation external link is invalid");
					}
				}
			}
			if (params.writerScopes !== undefined) {
				if (!Array.isArray(params.writerScopes)) throw new Error("Launch writer scopes must be an array");
				for (const value of params.writerScopes) {
					if (
						typeof value !== "object" ||
						value === null ||
						!["workspace", "provider", "repository"].includes(
							(value as Record<string, unknown>).kind as string,
						) ||
						typeof (value as Record<string, unknown>).directory !== "string" ||
						!((value as Record<string, unknown>).directory as string).startsWith("/")
					)
						throw new Error("Launch writer scope is invalid");
				}
			}
			for (const key of ["cols", "rows"])
				if (
					params[key] !== undefined &&
					(!Number.isInteger(params[key]) ||
						(params[key] as number) < 1 ||
						(params[key] as number) > MAX_TERMINAL_DIMENSION)
				)
					throw new Error(`Terminal dimensions must be between 1 and ${MAX_TERMINAL_DIMENSION}`);
			break;
		case "queueInput":
		case "deliver":
		case "input":
			if (params.userInput !== undefined && typeof params.userInput !== "boolean")
				throw new Error("The user input flag must be a boolean");
			if (
				(request.method === "deliver" || request.method === "queueInput") &&
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
				if (
					!Number.isInteger(params[key]) ||
					(params[key] as number) < 1 ||
					(params[key] as number) > MAX_TERMINAL_DIMENSION
				)
					throw new Error(`Terminal dimensions must be between 1 and ${MAX_TERMINAL_DIMENSION}`);
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
