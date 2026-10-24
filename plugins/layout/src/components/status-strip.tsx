import React from 'react';
import { Image, Pressable, View } from 'react-native';
import { assets, metro } from '@unbound-app/api';

import { columnLift, headerRow, sideBand, toolbar } from '../../../../src/shared/posture.ts';
import { findLoaded } from '../../../../src/shared/when-loaded.ts';
import { paths, SelectedGuildStore, sensor, settings, theme, UserStore } from '../modules.ts';
import { activeTab, openYou, subscribeNavigation, toggleMessages } from '../navigation.ts';
import { report } from '../report.ts';
import { chatHeaderFrames } from './chat-header-frames.ts';

type Insets = { top: number; right: number; bottom: number; left: number };
type Styles = Record<string, object>;

const PILL_WIDTH = 56;
// Space between the status bar and the pill below it.
const PILL_GAP = 12;

let useStyles: (() => Styles) | undefined;
function styles(): Styles {
	const colors = theme().colors;
	useStyles ??= metro.components.Discord.createStyles(() => ({
		band: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.BACKGROUND_BASE_LOWEST },
		chat: { position: 'absolute', bottom: 0, backgroundColor: colors.STANDALONE_CHANNEL_CONTENT_BACKGROUND },
		behindStatus: { position: 'absolute', top: 0, backgroundColor: colors.STANDALONE_CHANNEL_CONTENT_BACKGROUND },
		divider: { position: 'absolute', height: 1, backgroundColor: colors.STANDALONE_CHANNEL_HEADER_BORDER },
		slot: { position: 'absolute', alignItems: 'center', paddingTop: PILL_GAP },
		pill: {
			width: PILL_WIDTH,
			alignItems: 'center',
			paddingVertical: 6,
			gap: 4,
			borderRadius: PILL_WIDTH / 2,
			backgroundColor: colors.BACKGROUND_SURFACE_HIGH,
			borderWidth: 1,
			borderColor: colors.BORDER_SUBTLE,
			shadowColor: '#000',
			shadowOpacity: 0.35,
			shadowRadius: 12,
			shadowOffset: { width: 0, height: 4 },
		},
		button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
		selected: { backgroundColor: colors.INTERACTIVE_BACKGROUND_SELECTED },
		pressed: { opacity: 0.55 },
		icon: { width: 24, height: 24, tintColor: colors.INTERACTIVE_ICON_DEFAULT },
		iconSelected: { tintColor: colors.INTERACTIVE_ICON_ACTIVE },
		avatar: { width: 32, height: 32, borderRadius: 16 },
	})) as () => Styles;
	return useStyles();
}

export const useView = () => React.useSyncExternalStore(sensor.current.subscribe, sensor.current.get);

// Discord re-renders flux consumers through this hook; read once per render.
function useInMessages(): boolean {
	const flux = (metro.common as unknown as { FluxHooks?: { useStateFromStores?: (stores: unknown[], get: () => unknown) => unknown } }).FluxHooks;
	const guildId = flux?.useStateFromStores?.([SelectedGuildStore], () => SelectedGuildStore.getGuildId?.());
	return !guildId;
}

function MessagesButton({ s }: { s: Styles }) {
	const inMessages = useInMessages();
	return (
		<Pressable
			accessibilityRole='button'
			accessibilityLabel={inMessages ? 'Back to servers' : 'Direct Messages'}
			accessibilityState={{ selected: inMessages }}
			onPress={toggleMessages}
			style={({ pressed }) => [s.button, inMessages && s.selected, pressed && s.pressed]}
		>
			<Image source={assets.getIDByName('ChatIcon')} style={[s.icon, inMessages && s.iconSelected]} />
		</Pressable>
	);
}

function YouButton({ s }: { s: Styles }) {
	const avatar = UserStore.getCurrentUser?.()?.getAvatarURL?.(null, 64);
	return (
		<Pressable accessibilityRole='button' accessibilityLabel='You' onPress={openYou} style={({ pressed }) => [s.button, pressed && s.pressed]}>
			{avatar ? <Image source={{ uri: avatar }} style={s.avatar} /> : <Image source={assets.getIDByName('UserCircleIcon')} style={s.icon} />}
		</Pressable>
	);
}

// The YouBar's destinations as a floating pill in the side band, just below the status bar:
// messages, Discord's own notifications button (with its badge), and you.
function NavigationPill({ insets, s }: { insets: Insets; s: Styles }) {
	const view = useView();
	const slot = view.shape ? toolbar(view.shape)?.frame : null;
	const Notifications = findLoaded(paths.notificationsButton)?.default;
	if (!slot) return null;

	return (
		<View style={[s.slot, { right: -insets.right, top: slot.y, width: slot.width, height: slot.height }]} pointerEvents='box-none'>
			<View accessibilityRole='tablist' style={s.pill}>
				<MessagesButton s={s} />
				{Notifications ? <Notifications hasNameplate={false} /> : null}
				<YouButton s={s} />
			</View>
		</View>
	);
}

// Discord clips its chat column at the safe area, so the band beside it carries the
// chat on instead: the header's surface and divider, then the conversation's background,
// drawn from where the header measured itself. Only while the chat is pinned beside the
// channel list and the server tab is on screen, so other screens keep the plain band.
function ChatRunoff({ insets, s }: { insets: Insets; s: Styles }) {
	const view = useView();
	React.useSyncExternalStore(chatHeaderFrames.subscribe, chatHeaderFrames.version);
	const tab = React.useSyncExternalStore(subscribeNavigation, activeTab);
	const layout = findLoaded(paths.chatLayout)?.default?.() as { isChatLockedOpen?: boolean } | undefined;
	const band = view.shape ? sideBand(view.shape) : null;
	if (band?.edge !== 'trailing' || !layout?.isChatLockedOpen || tab !== 'guilds') return null;
	// Pinned open, the chat is the trailing column; the frame nearest the band gives the header's height.
	const header = chatHeaderFrames
		.all()
		.filter((f) => f.height > 0)
		.sort((a, b) => Math.abs(a.x + a.width - band.frame.x) - Math.abs(b.x + b.width - band.frame.x))[0];
	if (!header) {
		report(`chat runoff off: no measured channel header (${chatHeaderFrames.all().length} frames)`);
		return null;
	}
	report(`chat runoff from y ${Math.round(header.y)} to the header divider at ${Math.round(header.y + header.height - 1)}`);
	const edge = { right: -insets.right, width: insets.right };
	return (
		<>
			<View pointerEvents='none' style={[s.chat, edge, { top: header.y }]} />
			<View pointerEvents='none' style={[s.divider, edge, { top: header.y + header.height - 1 }]} />
		</>
	);
}

// While the chat peeks beside the channel list its header shares the status bar's row,
// and a long title would run under the status icons. This surface, in the header's color,
// sits behind them so the title ends a gap short instead. Expanded chats are pushed above
// MainTabs and keep their own clearance.
function BehindStatus({ s }: { s: Styles }) {
	const view = useView();
	const tab = React.useSyncExternalStore(subscribeNavigation, activeTab);
	const layout = findLoaded(paths.chatLayout)?.default?.() as { isChatBesideChannelList?: boolean } | undefined;
	const row = view.shape ? headerRow(view.shape) : null;
	if (!row || !view.shape || !layout?.isChatBesideChannelList || tab !== 'guilds') return null;
	return <View pointerEvents='none' style={[s.behindStatus, { right: 0, width: row.trailing, height: view.shape.safeArea.top }]} />;
}

// Appended to Discord's MainTabs root, which keeps the side insets as margins. Children
// offset by those margins land in the system's side band without moving Discord's content.
export function StatusStrip() {
	const store = settings.useSettingsStore();
	const insets = (findLoaded(paths.safeAreaInsets)?.default?.() ?? { top: 0, right: 0, bottom: 0, left: 0 }) as Insets;
	const s = styles();
	const fill = store.get('band', true);

	return (
		<>
			{fill && insets.right > 0 ? <View pointerEvents='none' style={[s.band, { right: -insets.right, width: insets.right }]} /> : null}
			{fill && insets.right > 0 ? <ChatRunoff insets={insets} s={s} /> : null}
			{fill ? <BehindStatus s={s} /> : null}
			{fill && insets.left > 0 ? <View pointerEvents='none' style={[s.band, { left: -insets.left, width: insets.left }]} /> : null}
			{store.get('rail', true) ? <NavigationPill insets={insets} s={s} /> : null}
		</>
	);
}

// Hides Discord's floating YouBar while the pill carries its destinations.
export function YouBarGate({ children }: { children: React.ReactNode }) {
	const view = useView();
	const store = settings.useSettingsStore();
	const replaced = store.get('rail', true) && Boolean(view.shape && toolbar(view.shape));
	return replaced ? null : <>{children}</>;
}

// Wraps Discord's server-list column. In portrait, with chat beside it and nothing of the
// system's above it, the column rises into the top band beside the status bar, the way
// native iPhone Duo apps put their header row there. One View either way, so toggling
// never remounts the column.
export function ColumnLift({ children }: { children: React.ReactNode }) {
	const view = useView();
	const store = settings.useSettingsStore();
	const layout = findLoaded(paths.chatLayout)?.default?.() as { isChatBesideChannelList?: boolean } | undefined;
	const drawer = Number(findLoaded(paths.drawerWidth)?.useDrawerWidth?.() ?? 0);
	const lift =
		store.get('band', true) && layout?.isChatBesideChannelList && view.shape && drawer > 0
			? columnLift(view.shape, view.shape.safeArea.left + drawer)
			: 0;
	return <View style={{ flex: 1, marginTop: -lift }}>{children}</View>;
}
