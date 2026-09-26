import { hostRequest } from "../../hostRequest/hostRequest.ts";

type RequestDetails = {
	url: string;
	resourceType: string;
	webContentsId?: number;
	frame?: { url: string } | null;
};

export const authorizedHostRequest = (details: RequestDetails, windowId: number, hostOrigin: string): boolean => {
	if (!hostRequest(details.url, hostOrigin)) return false;
	if (details.webContentsId === windowId) return true;
	if (details.resourceType !== "image" || details.frame === undefined || details.frame === null) return false;
	return hostRequest(details.frame.url, hostOrigin);
};
