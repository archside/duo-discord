// Builds every plugin in plugins/ into dist/<folder>/{manifest.json,index.js}.
// The bundle is a single expression object, the shape Unbound's loader evaluates.
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { swc } from 'rollup-plugin-swc3';

const root = resolve(import.meta.dirname, '..');
const only = process.argv[2];
const lan = Object.values(networkInterfaces()).flat().find((i) => i?.family === 'IPv4' && !i.internal);
const bridgeAddress = process.env.DUO_BRIDGE_ADDRESS ?? `${lan?.address ?? '127.0.0.1'}:9090`;

function globals(id) {
	if (id === 'react') return 'window.React';
	if (id === 'react-native') return 'window.ReactNative';
	if (id === '@unbound-app/api') return 'window.unbound';
	if (id.startsWith('@unbound-app/api/')) return `window.unbound.${id.slice(17).replaceAll('/', '.')}`;
}

function entry(folder) {
	for (const name of ['index.tsx', 'index.ts']) {
		const path = join(root, 'plugins', folder, 'src', name);
		if (existsSync(path)) return path;
	}
	throw new Error(`plugins/${folder} has no src/index.ts(x)`);
}

function wrap(code, hasSettingsPanel) {
	const body = code.trim().replace(/^var\s+[\w$]+\s*=\s*/, '').replace(/;\s*$/, '');
	const panel = hasSettingsPanel
		? ',getSettingsPanel(...a){const p=this.__load();const f=(p?.default??p)?.getSettingsPanel;return typeof f==="function"?f.apply(p?.default??p,a):null;}'
		: '';
	return `({__plugin:null,__load(){if(this.__plugin)return this.__plugin;this.__plugin=${body};return this.__plugin;},start(c){const p=this.__load();return (p?.default??p)?.start?.(c);},stop(){const p=this.__load();return (p?.default??p)?.stop?.();}${panel}})`;
}

async function build(folder) {
	const dir = join(root, 'plugins', folder);
	const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
	const bundle = await rollup({
		input: entry(folder),
		external: (id) => Boolean(globals(id)),
		plugins: [
			nodeResolve({ extensions: ['.tsx', '.ts', '.js'] }),
			commonjs(),
			// Same transform Unbound's first-party plugins ship with: SWC's default target, which Hermes runs.
			swc({ tsconfig: false }),
		],
		onwarn(warning, warn) {
			// SWC places JSX purity hints where Rollup drops them; the output is unaffected.
			if (warning.code !== 'MISSING_NODE_BUILTINS' && warning.code !== 'INVALID_ANNOTATION') warn(warning);
		},
	});
	const { output } = await bundle.generate({ format: 'iife', name: '__duo', exports: 'named', globals, compact: true });
	await bundle.close();

	const source = readFileSync(entry(folder), 'utf8');
	const out = join(root, 'dist', folder);
	mkdirSync(out, { recursive: true });
	const code = output[0].code.replaceAll('__DUO_BRIDGE_ADDRESS__', JSON.stringify(bridgeAddress));
	writeFileSync(join(out, 'index.js'), wrap(code, /getSettingsPanel/.test(source)));

	writeFileSync(join(out, 'manifest.json'), `${JSON.stringify({ ...manifest, main: 'index.js' }, null, '\t')}\n`);
	console.log(`built ${manifest.id}@${manifest.version} -> dist/${folder}`);
}

for (const folder of readdirSync(join(root, 'plugins'))) {
	if (!only || only === folder) await build(folder);
}
