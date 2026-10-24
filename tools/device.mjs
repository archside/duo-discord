// Device loop for Unbound's built-in debugger, runnable on Windows without Bun.
//   node tools/device.mjs bridge [--port 9090]   phone connects here; logs stream to this terminal
//   node tools/device.mjs eval "<js>" | --file probe.js
//   node tools/device.mjs push <plugin-folder>   hot-reloads a built plugin from dist/
// The wire protocol matches @unbound-app/debugger-protocol, so eval/push also work
// against the official `bunx @unbound-app/debugger` bridge.
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const i = args.indexOf(name);
	return i === -1 ? fallback : args[i + 1];
};
const port = Number(flag('--port', process.env.DUO_BRIDGE_PORT ?? 9090));

function lanAddresses() {
	return Object.values(networkInterfaces())
		.flat()
		.filter((i) => i?.family === 'IPv4' && !i.internal)
		.map((i) => `${i.address}:${port}`);
}

function bridge() {
	let device = null;
	const controllers = new Set();
	const pending = new Map();
	const server = new WebSocketServer({ port });

	server.on('connection', (socket, request) => {
		if (new URL(request.url, 'ws://x').searchParams.has('mcp')) {
			// Controllers can run code inside Discord, so only this PC may be one.
			const from = request.socket.remoteAddress ?? '';
			if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(from)) return socket.close(1008, 'Controllers must connect from this PC.');
			controllers.add(socket);
			socket.send(JSON.stringify({ type: 'device-status', connected: Boolean(device) }));
			socket.on('message', (raw) => {
				const message = JSON.parse(String(raw));
				if (!device) {
					const type = message.type === 'plugin-push' ? 'plugin-push-result' : 'eval-result';
					return socket.send(JSON.stringify({ type, id: message.id, ok: false, error: 'No device is connected to the debugger.' }));
				}
				pending.set(message.id, socket);
				device.send(JSON.stringify(message));
			});
			socket.on('close', () => controllers.delete(socket));
			return;
		}

		if (device) return socket.close(1013, 'A device is already connected.');
		device = socket;
		console.log('Device connected');
		for (const c of controllers) c.send(JSON.stringify({ type: 'device-status', connected: true }));

		socket.on('message', (raw) => {
			const message = JSON.parse(String(raw));
			if (message.type === 'log') {
				const tint = { 1: '\x1b[90m', 2: '\x1b[33m', 3: '\x1b[31m' }[message.level] ?? '';
				console.log(`${tint}« ${message.message}\x1b[0m`);
				for (const c of controllers) c.send(JSON.stringify(message));
				return;
			}
			const owner = pending.get(message.id);
			pending.delete(message.id);
			owner?.send(JSON.stringify(message));
		});
		socket.on('close', () => {
			device = null;
			console.log('Device disconnected');
			for (const c of controllers) c.send(JSON.stringify({ type: 'device-status', connected: false }));
		});
	});

	console.log(`Bridge listening. Set Unbound > Developer > Debugger Address to one of:\n  ${lanAddresses().join('\n  ')}`);
}

// Waits for the phone to be connected before sending: Unbound drops the debugger socket
// whenever Discord is in the background, and reconnects when it is active again.
function request(message, timeout = Number(flag('--wait', 120)) * 1000) {
	return new Promise((done, fail) => {
		const socket = new WebSocket(`ws://127.0.0.1:${port}?mcp`);
		const timer = setTimeout(() => (socket.close(), fail(new Error(`No device or no answer within ${timeout / 1000}s`))), timeout);
		let sent = false;
		socket.on('message', (raw) => {
			const reply = JSON.parse(String(raw));
			if (reply.type === 'device-status') {
				if (reply.connected && !sent) (sent = true), socket.send(JSON.stringify(message));
				return;
			}
			if (reply.id !== message.id) return;
			clearTimeout(timer);
			socket.close();
			done(reply);
		});
		socket.on('error', fail);
	});
}

const command = args[0];
if (command === 'bridge') {
	bridge();
} else if (command === 'eval') {
	const code = flag('--file') ? readFileSync(flag('--file'), 'utf8') : args[1];
	const reply = await request({ type: 'eval', id: randomUUID(), code });
	console.log(reply.ok ? reply.value : `Error: ${reply.error}`);
	process.exitCode = reply.ok ? 0 : 1;
} else if (command === 'push') {
	const dist = join(root, 'dist', args[1]);
	const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
	const bundle = readFileSync(join(dist, 'index.js'), 'utf8');
	const reply = await request({ type: 'plugin-push', id: randomUUID(), addonId: manifest.id, bundle, manifest });
	console.log(reply.ok ? `Pushed ${manifest.id}@${manifest.version}` : `Push failed: ${reply.error}`);
	process.exitCode = reply.ok ? 0 : 1;
} else {
	console.log('Usage: node tools/device.mjs bridge | eval "<js>" | eval --file <path> | push <plugin-folder>');
}
