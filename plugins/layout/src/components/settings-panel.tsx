import React from 'react';
import { ScrollView, View } from 'react-native';
import { metro } from '@unbound-app/api';

import { settings } from '../modules.ts';

const switches: { key: string; label: string; detail: string }[] = [
	{ key: 'continuity', label: 'Keep conversation when folding', detail: 'Folding mid-conversation keeps that conversation open on the outer display.' },
	{ key: 'band', label: 'Use the status bar band', detail: "In portrait, server list and chat headers share the status bar's row. In landscape, the chat carries on into the side band. On the outer display, chats run under the side band. Content keeps a comfortable top edge." },
	{ key: 'rail', label: 'Floating navigation', detail: 'In landscape, messages, notifications and You float just below the status bar instead of in the bottom bar. On the outer display, they float at the foot of the side band.' },
	{ key: 'book', label: 'Split at the fold', detail: 'Half-folded like a book, channels fill one half and the chat the other.' },
	{ key: 'tabletop', label: 'Tabletop calls', detail: 'Half-folded like a laptop during a call, video sits above the fold and controls below.' },
];

export function SettingsPanel() {
	const store = settings.useSettingsStore();
	const { Discord } = metro.components;

	return (
		<ScrollView contentContainerStyle={{ padding: 16 }}>
			<View style={{ gap: 24 }}>
				<Discord.TableRowGroup title='Columns'>
					<Discord.TableSwitchRow
						label='Phone layout only'
						subLabel='Keep single-column navigation even when the window is wide enough for channels beside chat.'
						value={store.get('mode', 'auto') === 'phone'}
						onValueChange={(on: boolean) => store.set('mode', on ? 'phone' : 'auto')}
					/>
				</Discord.TableRowGroup>
				<Discord.TableRowGroup title='iPhone Duo'>
					{switches.map(({ key, label, detail }) => (
						<Discord.TableSwitchRow key={key} label={label} subLabel={detail} value={store.get(key, true)} onValueChange={(on: boolean) => store.set(key, on)} />
					))}
				</Discord.TableRowGroup>
			</View>
		</ScrollView>
	);
}
