import { RUNTIME_PROTOCOL_VERSION, type RuntimeRequest } from "@trellis/runtime-protocol";

export function validateRequest(value: unknown): RuntimeRequest {
	const request = value as RuntimeRequest;
	if (!request || typeof request.id !== "string" || request.id.length > 128)
		throw new Error("Request identifier is required");
	if (request.version !== RUNTIME_PROTOCOL_VERSION)
		throw Object.assign(new Error("Runtime protocol version is incompatible"), { code: "PROTOCOL_MISMATCH" });
	const params = request.params as Record<string, unknown>;
	if (!params || typeof params !== "object") throw new Error("Request parameters are required");
	if (["start", "input", "deliver", "resize", "stop", "output"].includes(request.method)) {
		if (typeof params.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(params.id))
			throw new Error("Session identifier must contain letters, numbers, underscores, or hyphens");
	}
	switch (request.method) {
		case "hello":
		case "list":
		case "stop":
			break;
		case "start":
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
		case "output":
			if (params.stream !== undefined && params.stream !== "stdout" && params.stream !== "stderr")
				throw new Error("Output stream must be stdout or stderr");
			if (!Number.isSafeInteger(params.offset) || (params.offset as number) < 0)
				throw new Error("Output offset must be a positive byte count");
			break;
		default:
			throw new Error("Unknown runtime method");
	}
	return request;
}
