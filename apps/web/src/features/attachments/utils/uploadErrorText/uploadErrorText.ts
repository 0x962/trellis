import type { UploadError } from "../../hooks/useUploads";

// The inline message of a refused upload: "notes.txt is larger than the 1 MB
// limit." The limit reads in megabytes.
export const uploadErrorText = (_filename: string, _error: UploadError): string => {
	throw new Error("uploadErrorText is not implemented.");
};
