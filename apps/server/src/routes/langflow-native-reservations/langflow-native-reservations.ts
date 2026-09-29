import { ORPCError } from "@orpc/server";
import { Hono } from "hono";

export type NativeReservationTransport = {
	reserve(input: { authorization: string; capabilityId: string; requestBytes: string }): Promise<string>;
};

export function langflowNativeReservations(transport: NativeReservationTransport) {
	const app = new Hono();
	app.post("/api/langflow-private/v1/native-reservations", async (c) => {
		const authorization = c.req.header("authorization");
		if (authorization === undefined) throw new ORPCError("UNAUTHORIZED", { status: 401 });
		const capabilityId = c.req.header("x-trellis-capability-id");
		if (capabilityId === undefined || capabilityId === "") throw new ORPCError("FORBIDDEN", { status: 403 });
		const contentType = c.req.header("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
		if (contentType !== "application/json") throw new ORPCError("UNSUPPORTED_MEDIA_TYPE", { status: 415 });
		const bytes = await c.req.arrayBuffer();
		let requestBytes: string;
		try {
			requestBytes = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
		} catch {
			throw new ORPCError("BAD_REQUEST", { status: 400, message: "The request must contain valid UTF-8." });
		}
		const handleBytes = await transport.reserve({ authorization, capabilityId, requestBytes }).catch((error: unknown) => {
			if (error instanceof Error && error.message === "authentication_denied")
				throw new ORPCError("UNAUTHORIZED", { status: 401 });
			throw error;
		});
		return new Response(handleBytes, {
			status: 200,
			headers: { "content-type": "application/json", "cache-control": "no-store" },
		});
	});
	return app;
}
