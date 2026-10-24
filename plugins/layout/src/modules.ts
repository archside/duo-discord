import { metro, patcher, storage } from '@unbound-app/api';

import { flatSensor, type ShapeSensor } from './native/shape-sensor.ts';

// Every Discord module this plugin touches, by the source path Discord registers it under.
// A Discord rename is a one-line fix here; a missing module leaves stock behavior.
export const paths = {
	classifier: 'modules/screen/native/useWindowSizeClassifier.tsx',
	baseDimensions: 'modules/screen/native/useBaseAppContainerDimensions.tsx',
	drawerWidth: 'modules/screen/native/drawer/useDrawerWidth.tsx',
	chatLayout: 'modules/chat/native/useChatLayout.tsx',
	safeAreaInsets: 'modules/safe_area/useSafeAreaInsets.native.tsx',
	safeAreaStore: 'modules/safe_area/SafeAreaStore.native.tsx',
	notificationsButton: 'modules/main_tabs_v2/native/you_bar/YouBarNotificationsButton.tsx',
	guilds: 'modules/main_tabs_v2/native/tabs/guilds/Guilds.tsx',
	channelScreen: 'modules/main_tabs_v2/native/channel/StandaloneChannelScreen.tsx',
	mainTabs: 'modules/main_tabs_v2/native/MainTabs.tsx',
	mainTabsPanel: 'modules/main_tabs_v2/native/panels/MainTabsNavigatorPanel.tsx',
	youBarStack: 'modules/main_tabs_v2/native/you_bar/YouBarStackNavigator.tsx',
	youBar: 'modules/main_tabs_v2/native/you_bar/YouBar.tsx',
	youBarTotalHeight: 'modules/main_tabs_v2/native/you_bar/hooks/useYouBarTotalHeight.tsx',
	youBarConstants: 'modules/main_tabs_v2/native/you_bar/YouBarConstants.tsx',
	rootNavigationRef: 'modules/main_tabs_v2/RootNavigationRef.native.tsx',
	navigationRouteUtils: 'modules/main_tabs_v2/helpers/NavigationRouteUtils.native.tsx',
	voiceCardLayout: 'modules/voice_panel/native/card/VoicePanelCardLayoutManager.tsx',
	deviceOrientation: 'modules/device/native/DeviceOrientation.tsx',
	dimensionsStores: [
		'modules/screen/native/DimensionsStore.ios.tsx',
		'modules/screen/native/DimensionsStore.tsx',
		'modules/screen/native/DimensionsStore.android.tsx',
	],
};

// Discord's DM "guild" id.
export const ME = '@me';

export const SelectedGuildStore = metro.findStore('SelectedGuild', { lazy: true });
export const UserStore = metro.stores.Users;
// Loaded by Discord on first navigation, so found by its export rather than its path.
export const GuildRouting = metro.findByProps('transitionToGuild', { lazy: true });
// Discord's design tokens, read at render time; Discord.createStyles resolves them for the active theme.
export const theme = () => (metro.common as unknown as { Theme: { colors: Record<string, string> } }).Theme;

export const settings = storage.getStore('duo.layout');
export const Patcher = patcher.createPatcher('duo.layout');

// Set in start(): the live window shape, or the flat stand-in without a native bridge.
export const sensor: { current: ShapeSensor } = { current: flatSensor };

// Whether Discord's tabs navigator can take over MainTabs' trailing margin, so chats may fill
// the side band: 'on' once patched, 'missing' if the navigator was not where it was expected.
export const tabsInset: { state: 'off' | 'on' | 'missing' } = { state: 'off' };
