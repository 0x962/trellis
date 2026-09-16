import type { UploadError } from "../../hooks/useUploads";

// The inline message names the file and explains why it was not attached.
// A size limit reads in megabytes.
export const uploadErrorText = (filename: string, error: UploadError): string =>
	error.code === "PAYLOAD_TOO_LARGE"
		? `${filename} is not attached. The file is larger than the ${error.maxBytes / (1024 * 1024)} MB limit.`
		: `${filename} is not attached. The upload failed.`;
