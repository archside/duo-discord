import React from 'react';
import { Keyboard, AppState } from 'react-native';
import type { PluginContext } from '@unbound-app/api/native';

import { createEnvironmentStore } from '../../../src/shared/geometry-store.ts';
import { createNativeGeometry, nativeCapabilities, type NativeSnapshot } from '../../../src/shared/native-geometry.ts';
import { findLoaded } from '../../../src/shared/when-loaded.ts';
import { readBundleFacts } from './bundle-facts.ts';
import { ReportPanel } from './report-panel.tsx';
import { report, type ProbeEvent } from './report.ts';

let dispose = () => {};

// What Discord itself decided for this window, read from its own layout module.
export function discordLayout(): unknown {
	try {
		return findLoaded('modules/chat/native/useChatLayout.tsx')?.getChatLayout?.() ?? 'layout module not loaded';
	} catch (error) {
		return `unreadable: ${String(error)}`;
	}
}

function log(event: ProbeEvent) {
	event.discord = discordLayout();
	report.events = [event, ...report.events].slice(0, 30);
	console.log(`[DuoProbe] ${event.cause} ${JSON.stringify({ ...event.environment, discord: event.discord, native: event.native, keyboard: event.keyboard })}`);
}

function start(context?: PluginContext) {
	const native = context?.native;
	const nativeReady = Boolean(native) && nativeCapabilities.every((c) => native!.capabilities.includes(c));
	report.bridge = native ? `api ${native.apiVersion}, abi ${native.abiVersion}, ${native.capabilities.join(' ')}` : 'unavailable';

	const reader = nativeReady ? createNativeGeometry(native!) : null;
	let lastNative: NativeSnapshot | null = null;
	const store = createEnvironmentStore(
		reader
			? async () => {
					lastNative = await reader.read();
					return lastNative ? { safeArea: lastNative.safeArea, horizontalSizeClass: lastNative.horizontalSizeClass, verticalSizeClass: lastNative.verticalSizeClass } : {};
				}
			: undefined,
	);

	const stamp = () => new Date().toISOString().slice(11, 23);
	const unsubscribe = store.subscribe((environment) => log({ at: stamp(), cause: 'environment', environment, native: lastNative }));
	const keyboard = ['keyboardDidShow', 'keyboardDidHide', 'keyboardDidChangeFrame'].map((name) =>
		Keyboard.addListener(name as 'keyboardDidShow', (e) => log({ at: stamp(), cause: name, environment: store.get(), keyboard: e?.endCoordinates })),
	);
	const app = AppState.addEventListener('change', (state) => state === 'active' && store.refresh());

	if (nativeReady) {
		readBundleFacts(native!)
			.then((facts) => {
				report.bundle = facts;
				console.log(`[DuoProbe] bundle ${JSON.stringify(facts)}`);
			})
			.catch((error) => console.warn('[DuoProbe] bundle facts unavailable', error));
	}
	log({ at: stamp(), cause: 'start', environment: store.get() });

	dispose = () => {
		unsubscribe();
		for (const k of keyboard) k.remove();
		app.remove();
		store.dispose();
		report.events = [];
	};
}

function stop() {
	dispose();
	dispose = () => {};
}

export default { start, stop, getSettingsPanel: () => <ReportPanel /> };
