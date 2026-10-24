// Serves one folder's files on the LAN so the phone can download them in Safari,
// for example an IPA to open in SideStore.
//   node tools/serve.mjs downloads/unbound-original [--port 8731]
// Only files directly inside the folder are served; nothing leaves the local network.
import { createServer } from 'node:http';
import { createReadStream, readdirSync, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { basename, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const port = Number(portFlag === -1 ? (process.env.DUO_SERVE_PORT ?? 8731) : args[portFlag + 1]);
const folder = resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port') ?? 'dist');
const files = () => readdirSync(folder).filter((name) => statSync(join(folder, name)).isFile());
const hosts = Object.values(networkInterfaces()).flat().filter((i) => i?.family === 'IPv4' && !i.internal);

createServer((req, res) => {
	const name = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1));
	if (!name) {
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
		res.end(`<meta name="viewport" content="width=device-width"><h3>${basename(folder)}</h3>${files().map((f) => `<p><a href="/${encodeURIComponent(f)}">${f}</a></p>`).join('')}`);
	} else if (files().includes(name)) {
		const { size } = statSync(join(folder, name));
		res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': size, 'content-disposition': `attachment; filename="${name}"` });
		createReadStream(join(folder, name)).pipe(res);
	} else {
		res.writeHead(404).end();
	}
	console.log(`${res.statusCode} ${req.socket.remoteAddress} ${req.url}`);
}).listen(port, () => {
	console.log(`Serving ${folder}. On the phone, open in Safari:`);
	for (const h of hosts) console.log(`  http://${h.address}:${port}/`);
});
