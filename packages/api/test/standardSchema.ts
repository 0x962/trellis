import type { AnySchema } from "@orpc/contract";

// True when the Standard Schema accepts the value. Every contract input and
// output is a zod schema, so `validate` returns synchronously, but the spec
// allows a promise and the helper awaits it.
export const accepts = async (schema: AnySchema | undefined, value: unknown) => {
	const result = await schema!["~standard"].validate(value);
	return !("issues" in result);
};
