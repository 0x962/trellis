export const captureError = (message: string, code = "CAPTURE_UNAVAILABLE") =>
	Object.assign(new Error(message), { code });

export const sameCaptureValue = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
