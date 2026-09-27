import { safeStorage } from "electron";
import type { SecureStorage } from "./credentialStore.ts";
import { secureStorageIsAvailable } from "./secureStoragePolicy.ts";

export const createElectronSecureStorage = (platform = process.platform): SecureStorage => ({
	available: () =>
		secureStorageIsAvailable(
			platform,
			safeStorage.isEncryptionAvailable(),
			platform === "linux" ? safeStorage.getSelectedStorageBackend() : "unknown",
		),
	encrypt: (value) => safeStorage.encryptString(value),
	decrypt: (value) => safeStorage.decryptString(value),
});
