import { safeStorage } from "electron";
import type { SecureStorage } from "../credentialStore/index.ts";
import { isSecureStorageAvailable } from "../secureStoragePolicy/index.ts";

export const createElectronSecureStorage = (platform = process.platform): SecureStorage => ({
	isAvailable: () =>
		isSecureStorageAvailable(
			platform,
			safeStorage.isEncryptionAvailable(),
			platform === "linux" ? safeStorage.getSelectedStorageBackend() : "unknown",
		),
	encrypt: (value) => safeStorage.encryptString(value),
	decrypt: (value) => safeStorage.decryptString(value),
});
