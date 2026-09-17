import type { UploadError } from "../../hooks/useUploads";

// The server reports a size cap in bytes, but the message reads in megabytes.
export const uploadErrorText = (filename: string, error: UploadError): string => {
	if (error.code === "PAYLOAD_TOO_LARGE")
		return `${filename} is not attached. The file is larger than the ${error.maxBytes / (1024 * 1024)} MB limit.`;
	if (error.code === "PROJECT_ARCHIVED") return `${filename} is not attached. The project is archived.`;
	return `${filename} is not attached. The upload failed.`;
};
