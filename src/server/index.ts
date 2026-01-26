import { resolve } from "node:path";
import type { ServerWebSocket } from "bun";
import type { ServerMessage } from "../shared/types";

// WebSocket data type - stores player ID for each connection
type WebSocketData = {
	readonly playerId: string;
};

// Store active WebSocket connections: playerId -> WebSocket
const connections = new Map<string, ServerWebSocket<WebSocketData>>();

// Check if a path is safe (prevents directory traversal attacks)
const isPathSafe = (requestedPath: string, baseDir: string): boolean => {
	const resolvedBase = resolve(baseDir);
	const resolvedPath = resolve(requestedPath);
	return resolvedPath.startsWith(resolvedBase);
};

// Broadcast a message to all connected clients
const broadcast = (message: ServerMessage): void => {
	const data = JSON.stringify(message);
	for (const ws of connections.values()) {
		try {
			ws.send(data);
		} catch {
			// Connection may have closed
		}
	}
};

// Get content type based on file extension
const getContentType = (path: string): string => {
	if (path.endsWith(".html")) return "text/html";
	if (path.endsWith(".js")) return "application/javascript";
	if (path.endsWith(".css")) return "text/css";
	if (path.endsWith(".json")) return "application/json";
	if (path.endsWith(".mp3")) return "audio/mpeg";
	if (path.endsWith(".wav")) return "audio/wav";
	if (path.endsWith(".ogg")) return "audio/ogg";
	if (path.endsWith(".png")) return "image/png";
	if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
	if (path.endsWith(".svg")) return "image/svg+xml";
	return "application/octet-stream";
};

// Serve static file helper with path safety check
const serveFile = async (
	filePath: string,
	baseDir: string,
): Promise<Response> => {
	// Validate path to prevent directory traversal
	if (!isPathSafe(filePath, baseDir)) {
		return new Response("Forbidden", { status: 403 });
	}

	const file = Bun.file(filePath);
	const exists = await file.exists();

	if (!exists) {
		return new Response("Not Found", { status: 404 });
	}

	return new Response(file, {
		headers: { "Content-Type": getContentType(filePath) },
	});
};

// Start the server
const server = Bun.serve<WebSocketData>({
	port: 3000,

	fetch(req, server) {
		const url = new URL(req.url);
		const pathname = url.pathname;

		// Try to upgrade to WebSocket for /ws path or any connection requesting upgrade
		if (req.headers.get("upgrade") === "websocket") {
			const playerId = crypto.randomUUID();
			const success = server.upgrade(req, {
				data: { playerId },
			});
			if (success) {
				return undefined;
			}
			return new Response("WebSocket upgrade failed", { status: 400 });
		}

		// Serve static files
		if (pathname === "/" || pathname === "/index.html") {
			return serveFile("src/client/index.html", "src/client");
		}

		// Serve bundled JS from dist/
		if (pathname.startsWith("/dist/")) {
			const filePath = pathname.slice(1); // Remove leading /
			return serveFile(filePath, "dist");
		}

		// Serve sounds from public/sounds/
		if (pathname.startsWith("/sounds/")) {
			const filePath = `public${pathname}`;
			return serveFile(filePath, "public/sounds");
		}

		// Serve other public files
		if (pathname.startsWith("/public/")) {
			const filePath = pathname.slice(1); // Remove leading /
			return serveFile(filePath, "public");
		}

		// 404 for everything else
		return new Response("Not Found", { status: 404 });
	},

	websocket: {
		open(ws) {
			const playerId = ws.data.playerId;
			connections.set(playerId, ws);
			console.log(`Client connected: ${playerId}`);
		},

		message(ws, message) {
			// TODO: Handle incoming messages in future tasks
			console.log(`Message from ${ws.data.playerId}:`, message);
		},

		close(ws) {
			const playerId = ws.data.playerId;
			connections.delete(playerId);
			console.log(`Client disconnected: ${playerId}`);
		},
	},
});

console.log(`Server running on http://localhost:${server.port}`);

// Export for potential testing
export { broadcast, connections };
