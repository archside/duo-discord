// Runs the built bundles against stand-ins for React Native, Unbound and the Discord
// modules they patch. Proves bundling, start/stop/re-enable cleanup and decision wiring.
// It does NOT prove patched Discord works; only the device does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

function world({ width = 951, fontScale = 1, shape = true, insets = { top: 0, left: 0, bottom: 34, right: 84 } } = {}) {
	const listeners = { dimensions: new Set(), a11y: new Set(), keyboard: new Set(), app: new Set(), settings: new Set() };
	const env = { width, fontScale };
	const sub = (set, fn) => (set.add(fn), { remove: () => set.delete(fn) });

	const base = {
		default: () => ({ width: env.width, height: 669 }),
		getBaseAppContainerDimensions: () => ({ width: env.width, height: 669 }),
	};
	const classOf = (w) => (w <= 360 ? 0 : w <= 600 ? 1 : w <= 840 ? 2 : 3);
	const classifier = shape
		? { default: () => classOf(base.default().width), getWindowSizeClassifier: () => classOf(base.getBaseAppContainerDimensions().width) }
		: { default: () => 3 };
	const chat = { getChatLayout: () => ({ isChatBesideChannelList: classifier.getWindowSizeClassifier() >= 2, isChatLockedOpen: classifier.getWindowSizeClassifier() >= 3 }) };
	chat.default = () => chat.getChatLayout();
	let storeState = { byAppEntry: { main: { windowDimensions: { width: env.width, height: 669 } } } };
	const dimensionsStore = { default: { getState: () => storeState, setState: (fn) => ((storeState = { ...storeState, ...fn(storeState) }), dimensionsStore.updates++) }, updates: 0 };
	const drawer = { DRAWER_LEFT_WIDTH_MIN: 332, useDrawerWidth: () => 332, getDrawerWidth: () => 332 };
	const element = (type, props, ...children) => ({ type, props: { ...props, children: children.length > 1 ? children : children[0] } });
	const mainTabsChild = { type: 'ThemeProvider', props: {} };
	const mainTabs = { default: { type: () => element('View', { style: [{ flex: 1 }, { marginLeft: 0, marginRight: 84 }] }, mainTabsChild) } };
	const youBar = { default: { type: () => element('YouBar', {}) } };
	const guilds = { default: { type: () => element('GuildsPanel', {}) } };
	// Discord's channel screen, shaped as on device: its header is a component private to the
	// screen's module that reads the safe-area top itself, and returns a fragment whose root
	// pairs that top (padding, or margin beside the channel list) with a minimum height.
	function Header(props) {
		const top = safeArea.default().top;
		const spacing = props.frame ? { marginTop: top, minHeight: 56 } : { paddingTop: top, minHeight: top + 56 };
		const root = element('View', { style: [{ zIndex: 1, flexDirection: 'row' }, undefined, undefined, undefined, undefined, spacing] }, element('Fragment', {}, element('View', { style: { height: 1 } }), element('LayerScope', {})));
		return element('Fragment', {}, root, props.frame);
	}
	const headerProps = { channelId: '2594', screenIndex: 0, guildId: '@me', isNavigationScreen: false, showCreateThread: false, isBackEnabled: true, measureNavigationTTI: false };
	const channelScreen = {
		default: {
			type: ({ frame = null } = {}) =>
				element(
					'NavTTISurfaceProvider',
					{ name: 'channel_screen', style: [{ flex: 1 }] },
					element('Fragment', {}, element(Header, { ...headerProps, frame }), element('NavTTIView', { name: 'chat_container', style: [{ flex: 1 }] }, element('Messages', {}))),
				),
		},
	};
	const safeAreaResult = { ...insets };
	const safeArea = { default: () => safeAreaResult };
	const youBarHeight = { useYouBarTotalHeight: () => 34 + 56 };
	const nav = {
		// As measured: the tabs stack can hold several server lists; the active one is last.
		state: {
			routes: [
				{
					name: 'main',
					state: {
						routes: [
							{
								name: 'tabs',
								state: {
									index: 2,
									routes: [{ name: 'guilds', params: { guildId: '0171' } }, { name: 'notifications' }, { name: 'guilds', params: { guildId: '@me', channelId: '2594' } }],
								},
							},
						],
					},
				},
			],
		},
		calls: [],
	};
	const navigationRouteUtils = {
		navigateToChannel: (target) => nav.calls.push(['channel', target]),
		navigateToRootTab: (target) => nav.calls.push(['tab', target]),
		getCurrentNavigationRouteName: () => 'guilds',
		useCurrentNavigationRouteName: () => 'guilds',
	};
	class VoiceCardLayout {
		updateState(items, metrics) {
			this.metrics = metrics;
		}
	}
	const modules = {
		'modules/main_tabs_v2/native/MainTabs.tsx': mainTabs,
		'modules/main_tabs_v2/native/tabs/guilds/Guilds.tsx': guilds,
		'modules/main_tabs_v2/native/channel/StandaloneChannelScreen.tsx': channelScreen,
		'modules/main_tabs_v2/native/you_bar/YouBar.tsx': youBar,
		'modules/main_tabs_v2/native/you_bar/hooks/useYouBarTotalHeight.tsx': youBarHeight,
		'modules/main_tabs_v2/native/you_bar/YouBarConstants.tsx': { YOU_BAR_HEIGHT: 56 },
		'modules/main_tabs_v2/RootNavigationRef.native.tsx': {
			getRootNavigationRef: () => ({ isReady: () => true, getRootState: () => nav.state, navigate: (...a) => nav.calls.push(['navigate', ...a]) }),
		},
		'modules/main_tabs_v2/helpers/NavigationRouteUtils.native.tsx': navigationRouteUtils,
		'modules/safe_area/useSafeAreaInsets.native.tsx': safeArea,
		'modules/voice_panel/native/card/VoicePanelCardLayoutManager.tsx': { default: VoiceCardLayout },
		'modules/screen/native/useWindowSizeClassifier.tsx': classifier,
		'modules/screen/native/useBaseAppContainerDimensions.tsx': base,
		'modules/screen/native/drawer/useDrawerWidth.tsx': drawer,
		'modules/screen/native/DimensionsStore.ios.tsx': dimensionsStore,
		'modules/chat/native/useChatLayout.tsx': chat,
	};

	const patches = new Set();
	function patch(kind, parent, method, cb) {
		const original = parent[method];
		const record = { parent, method, original };
		parent[method] = function (...args) {
			if (kind === 'before') {
				cb({ args, this: this });
				return original.apply(this, args);
			}
			const result = original.apply(this, args);
			const replaced = cb({ args, result, this: this });
			return replaced === undefined ? result : replaced;
		};
		record.patched = parent[method];
		patches.add(record);
		return () => {
			if (parent[method] === record.patched) parent[method] = original;
			patches.delete(record);
		};
	}

	const stores = new Map();
	const storage = {
		getStore(name) {
			const values = stores.get(name) ?? new Map();
			stores.set(name, values);
			const notify = (key, value) => [...listeners.settings].forEach((l) => l.predicate({ store: name, key, value }) && l.cb({ store: name, key, value }));
			return {
				get: (k, d) => (values.has(k) ? values.get(k) : d),
				set: (k, v) => (values.set(k, v), notify(k, v)),
				useSettingsStore: () => ({ get: (k, d) => (values.has(k) ? values.get(k) : d), set: (k, v) => (values.set(k, v), notify(k, v)) }),
				addListener: (predicate, cb) => {
					const l = { predicate, cb };
					listeners.settings.add(l);
					return () => listeners.settings.delete(l);
				},
			};
		},
	};

	const pending = [];
	const metro = {
		filters: { byFilePath: (path) => ({ path }) },
		find: (filter) => modules[filter.path],
		findLazy: (filter, { signal }) =>
			new Promise((done) => {
				pending.push(() => !signal?.aborted && done(modules[filter.path]));
			}),
		findStore: () => ({ getLastSelectedGuildId: () => 'g1', getGuildId: () => null }),
		findByProps: () => ({ transitionToGuild: (id) => nav.calls.push(['guild', id]) }),
		stores: { Users: { getCurrentUser: () => ({ getAvatarURL: () => 'https://cdn.example/avatar.png' }) } },
		components: { Discord: { createStyles: (factory) => () => factory() } },
		common: { Clipboard: { setString() {} }, Theme: { colors: {} }, FluxHooks: { useStateFromStores: () => null } },
	};

	const logs = [];
	const window = {
		React: {
			createElement: (type, props, ...children) => ({ type, key: props?.key, props: { ...props, children: children.length > 1 ? children : children[0] } }),
			cloneElement: (el, props, ...children) => ({
				...el,
				props: { ...el.props, ...props, children: children.length ? (children.length > 1 ? children : children[0]) : (props?.children ?? el.props.children) },
			}),
			useReducer: () => [0, () => {}],
			useRef: (current) => ({ current }),
			useEffect: () => {},
			useCallback: (fn) => fn,
			useState: (v) => [v, () => {}],
			useSyncExternalStore: (_, get) => get(),
			Fragment: 'Fragment',
		},
		ReactNative: {
			Dimensions: { get: () => ({ width: env.width, height: 669, fontScale: env.fontScale }), addEventListener: (_, fn) => sub(listeners.dimensions, fn) },
			PixelRatio: { getFontScale: () => env.fontScale },
			AccessibilityInfo: {
				addEventListener: (_, fn) => sub(listeners.a11y, fn),
				isReduceMotionEnabled: async () => true,
				isScreenReaderEnabled: async () => false,
			},
			Keyboard: { addListener: (_, fn) => sub(listeners.keyboard, fn) },
			AppState: { addEventListener: (_, fn) => sub(listeners.app, fn) },
			View: 'View',
			Image: 'Image',
			Pressable: 'Pressable',
			ScrollView: 'ScrollView',
			Text: 'Text',
		},
		unbound: { assets: { getIDByName: () => 1 }, metro, patcher: { createPatcher: () => ({ before: (...a) => patch('before', ...a), after: (...a) => patch('after', ...a) }) }, storage },
	};
	const console = { log: (m) => logs.push(m), warn: (m) => logs.push(`WARN ${m}`), error: (m) => logs.push(`ERROR ${m}`) };
	const load = (folder) => new Function('window', 'console', `return ${readFileSync(resolve(root, 'dist', folder, 'index.js'), 'utf8')}`)(window, console);
	const flush = async () => {
		while (pending.length) pending.shift()();
		for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
	};
	const live = () => Object.values(listeners).reduce((n, set) => n + set.size, 0);
	const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));
	return { env, classifier, chat, dimensionsStore, patches, logs, load, flush, settle, live, storage, listeners, drawer, mainTabs, mainTabsChild, youBar, youBarHeight, guilds, safeArea, channelScreen, nav, VoiceCardLayout };
}

function fakeNative() {
	const h = (name) => ({ name });
	// Matches the device bridge: structs are host objects whose fields sit on a hidden `value`.
	const struct = (name, value) => Object.defineProperties({}, { name: { value: name }, value: { value } });
	const window = h('window'), scene = h('scene'), traits = h('traits'), kind = h('kind'), region = h('region');
	const info = { DTSDKName: 'iphoneos26.2', DTPlatformVersion: '26.2', MinimumOSVersion: '16.0' };
	const answers = {
		'UIApplication.sharedApplication': h('app'),
		'app.connectedScenes': h('set'),
		'set.allObjects': [scene],
		'scene.keyWindow': window,
		'scene.screen': h('screen'),
		'scene.effectiveGeometry': h('geometry'),
		'geometry.interfaceOrientation': 3,
		'window.traitCollection': traits,
		'traits.horizontalSizeClass': 2,
		'traits.verticalSizeClass': 2,
		'window.bounds': struct('CGRect', { origin: { x: 0, y: 0 }, size: { width: 951, height: 669 } }),
		'screen.bounds': struct('CGRect', { origin: { x: 0, y: 0 }, size: { width: 951, height: 669 } }),
		'window.safeAreaInsets': struct('UIEdgeInsets', { top: 0, left: 0, bottom: 20, right: 62 }),
		'UIViewReservedRegionKind.divisionRegionKind': kind,
		'UIViewReservedRegionKind.occlusionRegionKind': kind,
		'window.reservedRegionsOfKind:options:': [region],
		'region.frame': struct('CGRect', { origin: { x: 470, y: 0 }, size: { width: 11, height: 669 } }),
		'region.isActive': 1,
		'UIDevice.currentDevice': h('device'),
		'device.userInterfaceIdiom': 0,
		'device.systemVersion': '27.1',
		'NSBundle.mainBundle': h('bundle'),
		'bundle.infoDictionary': info,
	};
	const calls = [];
	const objc = {
		getClass: (name) => h(name),
		respondsTo: () => true,
		array: () => {
			throw new Error('arrays arrive already converted on device');
		},
		invoke(handle, selector, args, options) {
			calls.push({ selector, thread: options?.thread });
			return answers[`${handle.name}.${selector}`] ?? null;
		},
	};
	return { calls, context: { native: { apiVersion: '1.0.0', abiVersion: '1.0.0', capabilities: ['native.objc.classes', 'native.objc.invoke'], objc } } };
}

// Window shapes as measured on the iPhone Duo.
const poses = {
	landscape: { window: { width: 951, height: 669 }, safe: { top: 0, left: 0, bottom: 34, right: 84 }, sizeClass: 2, occlusion: { x: 867, y: 0, width: 84, height: 124 }, fold: { x: 455.5, y: 0, width: 40, height: 669 } },
	portrait: { window: { width: 669, height: 951 }, safe: { top: 82, left: 0, bottom: 34, right: 0 }, sizeClass: 2, occlusion: { x: 525, y: 0, width: 144, height: 82 }, fold: { x: 0, y: 455.5, width: 669, height: 40 } },
};

// The layout plugin's native side: the bridge as measured on device, plus hooks.
function duoNative(pose, { folded = false } = {}) {
	const h = (name) => ({ name });
	const struct = (name, value) => Object.defineProperties({}, { name: { value: name }, value: { value } });
	const rect = ({ x, y, width, height }) => struct('CGRect', { origin: { x, y }, size: { width, height } });
	const state = { pose, folded };
	const hooks = new Set();
	const regions = () => ({
		division: [{ frame: rect(state.pose.fold), active: state.folded }],
		occlusion: [{ frame: rect(state.pose.occlusion), active: true }],
	});
	const answers = () => ({
		'UIApplication.sharedApplication': h('app'),
		'app.connectedScenes': h('set'),
		'set.allObjects': [h('scene')],
		'scene.keyWindow': h('window'),
		'scene.screen': h('screen'),
		'scene.effectiveGeometry': h('geometry'),
		'geometry.interfaceOrientation': 3,
		'window.traitCollection': h('traits'),
		'traits.horizontalSizeClass': state.pose.sizeClass,
		'traits.verticalSizeClass': 2,
		'window.bounds': rect({ x: 0, y: 0, ...state.pose.window }),
		'screen.bounds': rect({ x: 0, y: 0, ...state.pose.window }),
		'window.safeAreaInsets': struct('UIEdgeInsets', state.pose.safe),
		'UIViewReservedRegionKind.divisionRegionKind': h('division'),
		'UIViewReservedRegionKind.occlusionRegionKind': h('occlusion'),
		'UIDevice.currentDevice': h('device'),
		'device.userInterfaceIdiom': 0,
	});
	const objc = {
		getClass: (name) => h(name),
		respondsTo: () => true,
		array: () => {
			throw new Error('arrays arrive already converted on device');
		},
		invoke(handle, selector, args) {
			if (selector === 'reservedRegionsOfKind:options:') return regions()[args[0].name];
			if (handle.frame) return selector === 'frame' ? handle.frame : selector === 'isActive' ? (handle.active ? 1 : 0) : null;
			return answers()[`${handle.name}.${selector}`] ?? null;
		},
		hook(className, selector, handlers, options) {
			const token = { className, selector, handlers, options, remove: () => hooks.delete(token) };
			hooks.add(token);
			return token;
		},
	};
	const touch = () => {
		for (const token of [...hooks]) {
			if (token.selector !== 'sendEvent:') continue;
			if (token.options?.once) hooks.delete(token);
			token.handlers.after?.({});
		}
	};
	const capabilities = ['native.objc.classes', 'native.objc.invoke', 'native.objc.hooks'];
	return { state, hooks, touch, context: { native: { apiVersion: '1.0.0', abiVersion: '1.0.0', capabilities, objc } } };
}

// Renders the channel screen and, through it, the header component it ends up with.
function channelHeader(w, props) {
	const screen = w.channelScreen.default.type(props);
	const [header, body] = screen.props.children.props.children;
	const tree = header.type(header.props);
	const root = tree.props.children[0];
	return { header, body, root, frame: tree.props.children[1], measurer: root.props.children.find?.((c) => c?.key === 'duo-header-frame') };
}

// The strip the plugin appended to MainTabs, rendered one level: [band, chat runoff, pill].
function statusStrip(w) {
	const strip = w.mainTabs.default.type().props.children.at(-1);
	return strip.type(strip.props).props.children;
}

function resize(w, width) {
	w.env.width = width;
	for (const fn of w.listeners.dimensions) fn();
}

check("layout 0.2: status strip is appended after Discord's own MainTabs child and removed on stop", async () => {
	const w = world();
	const plugin = w.load('layout');
	plugin.start(duoNative(poses.landscape).context);
	await w.flush();
	const patched = w.mainTabs.default.type();
	assert.ok(Array.isArray(patched.props.children), 'children became a list');
	assert.equal(patched.props.children[0], w.mainTabsChild, "Discord's child stays first");
	assert.equal(patched.props.children[1].key, 'duo-status-strip');
	plugin.stop();
	assert.equal(w.mainTabs.default.type().props.children, w.mainTabsChild);
});

check('layout 0.2: the rail replaces the YouBar and frees its height only while a side band fits', async () => {
	const w = world();
	const plugin = w.load('layout');
	plugin.start(duoNative(poses.landscape).context);
	await w.flush();
	await w.settle();
	const gate = w.youBar.default.type();
	assert.equal(gate.type(gate.props), null, 'YouBar hidden in landscape');
	assert.equal(w.youBarHeight.useYouBarTotalHeight(), 34);
	w.storage.getStore('duo.layout').set('rail', false);
	assert.equal(gate.type(gate.props).props.children.type, 'YouBar', 'YouBar back when the pill is switched off');
	plugin.stop();
	assert.equal(w.patches.size, 0);
});

check('layout 0.3: portrait keeps the YouBar and lifts the server list into the top band', async () => {
	const w = world({ width: 669, insets: poses.portrait.safe });
	w.drawer.useDrawerWidth = () => 372;
	const plugin = w.load('layout');
	plugin.start(duoNative(poses.portrait).context);
	await w.flush();
	await w.settle();
	const gate = w.youBar.default.type();
	assert.equal(gate.type(gate.props).props.children.type, 'YouBar', 'YouBar stays in portrait');
	const lift = w.guilds.default.type();
	assert.equal(lift.type(lift.props).props.style.marginTop, -54);
	assert.equal(w.safeArea.default().top, 82, 'portrait top inset untouched');
	const main = w.nav.state.routes[0].state.routes;
	main.push({ name: 'channel', params: { channelId: '2594' } });
	const full = channelHeader(w);
	const row = { marginTop: 0, paddingTop: 28, minHeight: 84, borderTopWidth: 0, paddingRight: 152 };
	assert.deepEqual(full.root.props.style.at(-1), row, 'full-width header on the shared row from the top edge, clear of the status bar');
	assert.equal(full.root.props.children[0].type, 'Fragment', "Discord's header children keep their position");
	assert.ok(full.measurer, 'header reports its frame');
	assert.equal(full.body.props.name, 'chat_container', 'conversation untouched');
	assert.equal(full.body.props.style.length, 1);
	const fading = { type: 'ChannelScreenAnimatedFrame', props: {} };
	const expanded = channelHeader(w, { frame: fading });
	assert.deepEqual(expanded.root.props.style.at(-1), row, 'expanded chat header takes the status row, its surface from the top edge and no card border');
	assert.equal(expanded.frame.props.children, fading, "Discord's status-bar bar stays mounted");
	assert.deepEqual(expanded.frame.props.style.at(-1), { height: 0, overflow: 'hidden' }, 'but is cut away, since the header covers the band');
	const behindStatus = () => statusStrip(w)[2].type(statusStrip(w)[2].props);
	assert.equal(behindStatus(), null, 'an expanded chat is pushed above MainTabs and keeps its own clearance');
	main.pop();
	const peeking = channelHeader(w, { frame: fading });
	assert.deepEqual(peeking.root.props.style, expanded.root.props.style, 'peeking or expanded, the header holds the row, so the slide never moves it');
	assert.deepEqual(Object.assign({}, ...behindStatus().props.style.slice(1)), { right: 0, width: 152, height: 82 }, 'a surface behind the status icons ends a long peeking title short of them');
	main.push({ name: 'channel', params: { channelId: '2594' } });
	w.storage.getStore('duo.layout').set('band', false);
	assert.equal(channelHeader(w).root.props.style.length, 6, 'band switch off keeps the stock header');
	main.pop();
	plugin.stop();
	assert.equal(w.guilds.default.type().type, 'GuildsPanel');
	assert.equal(w.channelScreen.default.type().props.children.props.children[0].props.channelId, '2594');
	assert.equal(w.channelScreen.default.type().props.children.props.children[0].type.name, 'Header', 'stock header back after stop');
});

check('layout 0.3: landscape keeps a comfortable top edge and the server list in place', async () => {
	const w = world();
	const plugin = w.load('layout');
	plugin.start(duoNative(poses.landscape).context);
	await w.flush();
	await w.settle();
	assert.equal(w.safeArea.default().top, 20);
	assert.equal(w.safeArea.default(), w.safeArea.default(), 'same object while the numbers are unchanged');
	const lift = w.guilds.default.type();
	assert.equal(lift.type(lift.props).props.style.marginTop, -0);
	const { root, measurer } = channelHeader(w, { frame: { type: 'FadingFrame', props: {} } });
	assert.equal(root.props.style.length, 6, 'landscape header keeps its place');
	assert.equal(statusStrip(w)[1].type(statusStrip(w)[1].props), null, 'no runoff before the header has measured itself');
	measurer.props.ref.current = { measureInWindow: (done) => done(333, 20, 534, 56) };
	measurer.props.onLayout();
	const [surface, divider] = statusStrip(w)[1].type(statusStrip(w)[1].props).props.children;
	assert.deepEqual(Object.assign({}, ...surface.props.style.slice(1)), { right: -84, width: 84, top: 20 }, 'chat surface continues across the band from the header down');
	assert.deepEqual(Object.assign({}, ...divider.props.style.slice(1)), { right: -84, width: 84, top: 75 }, "header divider continues at the header's bottom edge");
	w.nav.state.routes[0].state.routes[0].state.index = 1;
	assert.equal(statusStrip(w)[1].type(statusStrip(w)[1].props), null, 'plain band while another tab is on screen');
	w.nav.state.routes[0].state.routes[0].state.index = 2;
	w.storage.getStore('duo.layout').set('band', false);
	assert.equal(w.safeArea.default().top, 0, 'band switch off restores the stock inset');
	plugin.stop();
	assert.equal(w.patches.size, 0);
});

check('layout 0.2: half-folded like a book, the tiled sidebar ends at the far edge of the fold', async () => {
	const w = world();
	const native = duoNative(poses.landscape);
	const plugin = w.load('layout');
	plugin.start(native.context);
	await w.flush();
	await w.settle();
	assert.equal(w.drawer.useDrawerWidth(), 332, 'flat: stock sidebar');
	native.state.folded = true;
	native.touch();
	await w.settle(200);
	assert.equal(w.drawer.useDrawerWidth(), 495.5);
	assert.equal(w.drawer.getDrawerWidth(), 495.5);
	plugin.stop();
	assert.equal(w.drawer.useDrawerWidth(), 332);
});

check('layout 0.2: folding from columns to the phone layout opens the hidden conversation once', async () => {
	const w = world();
	const plugin = w.load('layout');
	plugin.start(duoNative(poses.landscape).context);
	await w.flush();
	resize(w, 466);
	await w.settle();
	assert.deepEqual(w.nav.calls.filter((c) => c[0] === 'channel'), [['channel', { guildId: '@me', channelId: '2594' }]]);
	w.nav.state.routes[0].state.routes.push({ name: 'channel', params: { channelId: '2594' } });
	assert.ok(true, 'pushed from the active server list, not the first one in the stack');
	resize(w, 951);
	await w.settle();
	resize(w, 466);
	await w.settle();
	assert.equal(w.nav.calls.filter((c) => c[0] === 'channel').length, 1, 'not pushed again when a chat screen already exists');
	plugin.stop();
});

check('layout 0.2: tabletop limits the call grid to the half above the fold', async () => {
	const w = world({ width: 669 });
	const plugin = w.load('layout');
	plugin.start(duoNative(poses.portrait, { folded: true }).context);
	await w.flush();
	await w.settle();
	const grid = new w.VoiceCardLayout();
	grid.updateState([], { windowHeight: 951, windowWidth: 669 });
	assert.equal(grid.metrics.windowHeight, 455.5);
	plugin.stop();
	grid.updateState([], { windowHeight: 951, windowWidth: 669 });
	assert.equal(grid.metrics.windowHeight, 951);
});

check('layout 0.2: stop removes every patch, native hook and listener', async () => {
	const w = world();
	const native = duoNative(poses.landscape);
	const plugin = w.load('layout');
	plugin.start(native.context);
	await w.flush();
	await w.settle();
	assert.ok(native.hooks.size > 0, 'touch sensor armed');
	plugin.stop();
	assert.equal(w.patches.size, 0);
	assert.equal(native.hooks.size, 0);
	assert.equal(w.live(), 0);
});

check('layout 0.2: without the native bridge the fold features stay off and nothing throws', async () => {
	const w = world();
	const plugin = w.load('layout');
	plugin.start();
	await w.flush();
	await w.settle();
	const gate = w.youBar.default.type();
	assert.equal(gate.type(gate.props).props.children.type, 'YouBar');
	assert.equal(w.drawer.useDrawerWidth(), 332);
	assert.equal(w.safeArea.default().top, 0);
	assert.ok(w.logs.some((l) => l.includes('native bridge unavailable')));
	plugin.stop();
	assert.equal(w.patches.size, 0);
});

check('layout: stock Discord tiles a 951 pt window before the plugin starts', async () => {
	const w = world({ fontScale: 1.3 });
	assert.equal(w.classifier.default(), 3);
});

check('layout: larger text moves hook and getter to chat-beside-list together', async () => {
	const w = world({ fontScale: 1.3 });
	const plugin = w.load('layout');
	plugin.start();
	await w.flush();
	assert.equal(w.classifier.default(), 2);
	assert.equal(w.classifier.getWindowSizeClassifier(), 2);
	assert.deepEqual(w.chat.getChatLayout(), { isChatBesideChannelList: true, isChatLockedOpen: false });
	assert.ok(w.logs.some((l) => l.includes('XLARGE -> LARGE')), w.logs.join('\n'));
	plugin.stop();
});

check('layout: phone-only setting collapses at once and re-renders through the store', async () => {
	const w = world();
	const plugin = w.load('layout');
	plugin.start();
	await w.flush();
	const before = w.dimensionsStore.updates;
	w.storage.getStore('duo.layout').set('mode', 'phone');
	assert.equal(w.classifier.default(), 1);
	assert.equal(w.dimensionsStore.updates, before + 1);
	plugin.stop();
});

check('layout: stop restores stock decisions, removes every patch and listener, re-renders', async () => {
	const w = world({ fontScale: 1.3 });
	const plugin = w.load('layout');
	plugin.start();
	await w.flush();
	const before = w.dimensionsStore.updates;
	plugin.stop();
	assert.equal(w.classifier.default(), 3);
	assert.equal(w.patches.size, 0);
	assert.equal(w.listeners.settings.size, 0);
	assert.equal(w.dimensionsStore.updates, before + 1);
});

check('layout: re-enabling after disable applies again', async () => {
	const w = world({ fontScale: 1.3 });
	const plugin = w.load('layout');
	plugin.start();
	await w.flush();
	plugin.stop();
	plugin.start();
	await w.flush();
	assert.equal(w.classifier.default(), 2);
	plugin.stop();
	assert.equal(w.patches.size, 0);
});

check('layout: stopping before Discord loads its modules never patches later', async () => {
	const w = world({ fontScale: 1.3 });
	const plugin = w.load('layout');
	plugin.start();
	plugin.stop();
	await w.flush();
	assert.equal(w.patches.size, 0);
	assert.equal(w.classifier.default(), 3);
});

check('layout: unexpected classifier shape leaves stock columns and the rest of the plugin running', async () => {
	const w = world({ shape: false });
	const stock = w.classifier.default;
	const plugin = w.load('layout');
	plugin.start();
	await w.flush();
	assert.equal(w.classifier.default, stock, 'classifier left unpatched');
	assert.ok(w.logs.some((l) => l.startsWith('WARN [DuoLayout] Discord layout modules changed shape')));
	assert.ok([...w.patches].some((p) => p.parent === w.mainTabs.default), 'other features still applied');
	plugin.stop();
	assert.equal(w.patches.size, 0);
});

check('probe: logs Discord layout on window change and leaves no listeners after stop', async () => {
	const w = world();
	const plugin = w.load('probe');
	plugin.start();
	await w.flush();
	w.env.width = 466;
	for (const fn of w.listeners.dimensions) fn();
	await w.flush();
	const line = w.logs.findLast((l) => l.startsWith('[DuoProbe] environment'));
	assert.match(line, /"width":466/);
	assert.match(line, /"isChatBesideChannelList":false/);
	plugin.stop();
	assert.equal(w.live(), 0);
});

check('probe: reads UIKit geometry, fold regions and build SDK on the main thread', async () => {
	const w = world();
	const { calls, context } = fakeNative();
	const plugin = w.load('probe');
	plugin.start(context);
	await w.flush();
	const line = w.logs.findLast((l) => l.startsWith('[DuoProbe] environment') && l.includes('"native":{'));
	const native = JSON.parse(line.slice(line.indexOf('{'))).native;
	assert.deepEqual(native.window, { x: 0, y: 0, width: 951, height: 669 });
	assert.deepEqual(native.safeArea, { top: 0, left: 0, bottom: 20, right: 62 });
	assert.equal(native.horizontalSizeClass, 'regular');
	assert.deepEqual(native.regions[0], { kind: 'division', frame: { x: 470, y: 0, width: 11, height: 669 }, active: true });
	assert.ok(w.logs.some((l) => l.includes('"DTSDKName":"iphoneos26.2"')), 'bundle facts logged');
	assert.ok(calls.every((c) => c.thread === 'main'), 'every UIKit call on the main thread');
	plugin.stop();
	assert.equal(w.live(), 0);
});

let failed = 0;
for (const [name, fn] of checks) {
	try {
		await fn();
		console.log(`ok   ${name}`);
	} catch (error) {
		failed++;
		console.log(`FAIL ${name}\n     ${error.message.split('\n').join('\n     ')}`);
	}
}
console.log(`${checks.length - failed}/${checks.length} smoke checks passed (stand-ins only; not a device result)`);
process.exitCode = failed ? 1 : 0;
