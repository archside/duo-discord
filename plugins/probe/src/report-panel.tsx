import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { metro, storage } from '@unbound-app/api';

import { report } from './report.ts';

// Baked in by tools/build.mjs: this PC's LAN address and bridge port.
declare const __DUO_BRIDGE_ADDRESS__: string;

// Unbound 0.9's Developer screen draws the Debugger Address row without its text field,
// so the address is set here instead. It writes only Unbound's own debugger.address key.
function DebuggerAddress() {
	const { Discord } = metro.components;
	const stored = () => `stored: enabled=${String(storage.get('unbound', 'debugger.enabled', false))}, address="${storage.get('unbound', 'debugger.address', '')}"`;
	const [address, setAddress] = React.useState(storage.get('unbound', 'debugger.address', '') || __DUO_BRIDGE_ADDRESS__);
	const [saved, setSaved] = React.useState(false);
	const [test, setTest] = React.useState('');

	function testConnection() {
		setTest(`connecting to ws://${address.trim()} ...`);
		const socket = new WebSocket(`ws://${address.trim()}`);
		const timer = setTimeout(() => (setTest('no answer after 5 s'), socket.close()), 5000);
		socket.onopen = () => (clearTimeout(timer), setTest('reachable: the PC bridge answered'), socket.close());
		socket.onerror = (event: any) => (clearTimeout(timer), setTest(`failed: ${event?.message ?? 'socket error'}`));
	}

	return (
		<View style={{ gap: 8 }}>
			<Text style={{ color: '#b5bac1', fontSize: 13 }}>PC debugger address (restart Discord after saving)</Text>
			<Text selectable style={{ color: '#b5bac1', fontSize: 12 }}>{stored()}</Text>
			<Discord.TextInput value={address} onChange={(value: string) => (setAddress(value), setSaved(false))} placeholder='192.168.0.10:9090' />
			<Discord.Button
				text={saved ? 'Saved' : 'Save debugger address'}
				size='sm'
				onPress={() => {
					storage.set('unbound', 'debugger.address', address.trim());
					storage.set('unbound', 'debugger.enabled', true);
					setSaved(true);
				}}
			/>
			<Discord.Button text='Test connection' size='sm' variant='secondary' onPress={testConnection} />
			{test ? <Text selectable style={{ color: '#b5bac1', fontSize: 12 }}>{test}</Text> : null}
		</View>
	);
}

export function ReportPanel() {
	const [, rerender] = React.useReducer((n: number) => n + 1, 0);
	const text = JSON.stringify(
		{ bridge: report.bridge, bundle: report.bundle, latest: report.events[0], history: report.events.slice(1).map((e) => `${e.at} ${e.cause} ${e.environment.geometry.window.width}x${e.environment.geometry.window.height}`) },
		null,
		2,
	);
	const { Discord } = metro.components;

	return (
		<ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
			<DebuggerAddress />
			<View style={{ flexDirection: 'row', gap: 8 }}>
				<Discord.Button text='Refresh' size='sm' onPress={rerender} />
				<Discord.Button text='Copy report' size='sm' variant='secondary' onPress={() => metro.common.Clipboard.setString(text)} />
			</View>
			<Text selectable style={{ fontFamily: 'Menlo', fontSize: 11, color: '#b5bac1' }}>
				{text}
			</Text>
		</ScrollView>
	);
}
