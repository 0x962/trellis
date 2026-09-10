import type { UploadError } from "../../hooks/useUploads";

// The inline message of a refused upload: "notes.txt is not attached. The
// file is larger than the 1 MB limit." The limit reads in megabytes.
export const uploadErrorText = (filename: string, error: UploadError): string =>
	`${filename} is not attached. The file is larger than the ${error.maxBytes / (1024 * 1024)} MB limit.`;
