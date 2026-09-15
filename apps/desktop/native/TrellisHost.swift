import Darwin
import Foundation
import ServiceManagement

let plistName = "com.trellis.desktop.host.plist"
let service = SMAppService.agent(plistName: plistName)
struct SelectedHome: Decodable {
	let version: Int
	let home: String
}

let command = CommandLine.arguments.dropFirst().first ?? "status"

func emitStatus() throws {
	let name: String
	switch service.status {
	case .notRegistered: name = "notRegistered"
	case .enabled: name = "enabled"
	case .requiresApproval: name = "requiresApproval"
	case .notFound: name = "notFound"
	@unknown default: name = "unknown"
	}
	let data = try JSONSerialization.data(withJSONObject: [
		"status": name, "bundle": Bundle.main.bundlePath,
	])
	print(String(data: data, encoding: .utf8)!)
}

func run() throws {
	switch command {
	case "status": try emitStatus()
	case "register":
		try service.register()
		try emitStatus()
	case "unregister":
		try service.unregister()
		try emitStatus()
	case "settings": SMAppService.openSystemSettingsLoginItems()
	case "serve":
		var size: UInt32 = 0
		_NSGetExecutablePath(nil, &size)
		var executable = [CChar](repeating: 0, count: Int(size))
		_NSGetExecutablePath(&executable, &size)
		let contents = URL(fileURLWithPath: String(cString: executable)).resolvingSymlinksInPath()
			.deletingLastPathComponent().deletingLastPathComponent()
		let environment = ProcessInfo.processInfo.environment
		let userData = environment["TRELLIS_DESKTOP_USER_DATA"]
			?? environment["TRELLIS_DESKTOP_HOME"].map { URL(fileURLWithPath: $0).deletingLastPathComponent().path }
			?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(
				"Library/Application Support/Trellis"
			).path
		let selectionPath = URL(fileURLWithPath: userData).appendingPathComponent("selected-home.json")
		let home: String
		if let override = environment["TRELLIS_DESKTOP_HOME"] {
			home = override
		} else if FileManager.default.fileExists(atPath: selectionPath.path) {
			let selected = try JSONDecoder().decode(SelectedHome.self, from: Data(contentsOf: selectionPath))
			guard selected.version == 1 && selected.home.hasPrefix("/") else {
				throw NSError(domain: "Trellis", code: 1, userInfo: [NSLocalizedDescriptionKey: "The selected Trellis data directory is invalid."])
			}
			var isDirectory: ObjCBool = false
			guard FileManager.default.fileExists(atPath: selected.home, isDirectory: &isDirectory) && isDirectory.boolValue else {
				throw NSError(domain: "Trellis", code: 1, userInfo: [NSLocalizedDescriptionKey: "The selected Trellis data directory does not exist."])
			}
			home = URL(fileURLWithPath: selected.home).resolvingSymlinksInPath().path
		} else {
			home = URL(fileURLWithPath: userData).appendingPathComponent("host").path
		}
		try FileManager.default.createDirectory(
			atPath: home, withIntermediateDirectories: true,
			attributes: [.posixPermissions: 0o700])
		let log = open(home + "/desktop-host.log", O_WRONLY | O_CREAT | O_APPEND, 0o600)
		guard log >= 0 else { fatalError("Could not open the host log") }
		dup2(log, STDOUT_FILENO)
		dup2(log, STDERR_FILENO)
		close(log)
		let node = contents.appendingPathComponent("Resources/host/bin/node").path
		let entry = contents.appendingPathComponent("Resources/host-service.cjs").path
		let arguments: [UnsafeMutablePointer<CChar>?] =
			[node, entry].map { value in value.withCString { strdup($0) } } + [nil]
		arguments.withUnsafeBufferPointer { buffer in
			_ = execv(node, buffer.baseAddress!)
		}
		fatalError("Could not execute the bundled host runtime: errno \(errno)")
	default: fatalError("Unknown service command")
	}

}
do {
	try run()
} catch {
	FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
	exit(1)
}
