import { findLoaded } from '../../../src/shared/when-loaded.ts';
import { GuildRouting, ME, paths, SelectedGuildStore } from './modules.ts';

type Route = { name: string; params?: Record<string, unknown>; state?: { index?: number; routes: Route[] } };

function root() {
	const navigation = findLoaded(paths.rootNavigationRef)?.getRootNavigationRef?.();
	return navigation?.isReady?.() ? navigation : null;
}

function active(route: Route | undefined): Route | undefined {
	const state = route?.state;
	return state ? state.routes[state.index ?? state.routes.length - 1] : undefined;
}

// The ref queues listeners until the navigator mounts, so this works from the first render.
export function subscribeNavigation(listener: () => void): () => void {
	const navigation = findLoaded(paths.rootNavigationRef)?.getRootNavigationRef?.();
	return navigation?.addListener?.('state', listener) ?? (() => {});
}

// The screen on top of the main stack: 'tabs', or a pushed 'channel'.
function mainScreen(): Route | undefined {
	const state = root()?.getRootState?.() as { index?: number; routes: Route[] } | undefined;
	const top = state?.routes[state.index ?? state.routes.length - 1];
	return top?.name === 'main' ? active(top) : undefined;
}

// The MainTabs destination on screen ('guilds', 'notifications', 'you'), or null when a
// screen above MainTabs covers it.
export function activeTab(): string | null {
	const main = mainScreen();
	return main?.name === 'tabs' ? (active(main)?.name ?? null) : null;
}

// The conversation the active server list holds when no chat screen is pushed above it.
// Measured: folding from columns leaves exactly this state, and the tabs stack can hold
// several server lists (Discord's YouBar pushes screens), so only the active one counts.
export function hiddenConversation(): { guildId: unknown; channelId: unknown } | null {
	const state = root()?.getRootState?.() as { routes: Route[] } | undefined;
	const main = state?.routes.find((r) => r.name === 'main');
	if (!main || main.state?.routes.some((r) => r.name === 'channel')) return null;
	const tabs = main.state?.routes.find((r) => r.name === 'tabs');
	const guilds = active(tabs);
	const channelId = guilds?.name === 'guilds' ? guilds.params?.channelId : undefined;
	return channelId ? { guildId: guilds?.params?.guildId, channelId } : null;
}

export function openConversation(target: { guildId: unknown; channelId: unknown }): boolean {
	const utils = findLoaded(paths.navigationRouteUtils);
	if (typeof utils?.navigateToChannel !== 'function') return false;
	utils.navigateToChannel(target);
	return true;
}

// The YouBar avatar's destination.
export const openYou = () => root()?.navigate('you');

// Direct messages, and back to the last server on a second tap: the switch Discord's
// YouBar makes with a swipe, through the same routing call, so no screens pile up.
export function toggleMessages() {
	const inMessages = !SelectedGuildStore.getGuildId?.();
	GuildRouting.transitionToGuild(inMessages ? (SelectedGuildStore.getLastSelectedGuildId?.() ?? ME) : ME);
}
