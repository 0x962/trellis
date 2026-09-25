import { type ErrorCode, errors } from "@trellis/api";
import type { Context } from "hono";

// The response rules the frame document and the page document share.

const PERMISSIONS =
	"accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()";

export const guardHeaders = () => ({
	"x-content-type-options": "nosniff",
	"referrer-policy": "no-referrer",
	"permissions-policy": PERMISSIONS,
});

// The `frame-src` and the resource policies name the origin, because a
// sandboxed document has no origin of its own and `'self'` matches nothing
// inside it.
export const originOf = (c: Context) => new URL(c.req.url).origin;

export const framePolicy = (origin: string, root: string, nonce: string) =>
	[
		"default-src 'none'",
		"style-src 'unsafe-inline'",
		`script-src 'nonce-${nonce}'`,
		`frame-src ${origin}${root}`,
		"form-action 'none'",
		"base-uri 'none'",
		"object-src 'none'",
	].join("; ");

// What the page document itself may load: its own files, and data or blob
// addresses its scripts build. It reaches no other site, submits no form,
// holds no frame, and creates no code at run time.
export const contentPolicy = (origin: string, root: string) => {
	const own = `${origin}${root}`;
	return [
		"default-src 'none'",
		`script-src ${own} 'unsafe-inline'`,
		`style-src ${own} 'unsafe-inline'`,
		`img-src ${own} data: blob:`,
		`font-src ${own} data:`,
		`media-src ${own} data: blob:`,
		"connect-src 'none'",
		"form-action 'none'",
		"frame-src 'none'",
		"child-src 'none'",
		"object-src 'none'",
		"base-uri 'none'",
	].join("; ");
};

// The body of every refusal these routes write. It never holds the lease,
// because that value is the whole authorization of one viewer.
export const errorBody = (code: ErrorCode, data?: unknown) => ({
	defined: true,
	code,
	status: errors[code].status,
	message: errors[code].message,
	data,
});
