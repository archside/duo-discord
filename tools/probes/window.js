// One-shot window and build report, read on the phone through Unbound's raw native bridge.
// Run: npm run device -- eval --file tools/probes/window.js
(function () {
	// The client deletes the raw bridge at startup; borrow Duo Probe's scoped context.
	var probe = window.unbound && window.unbound.plugins && window.unbound.plugins.getEntity('duo.probe');
	var objc = probe && probe.context && probe.context.native && probe.context.native.objc;
	var rn = window.ReactNative;
	var out = { rn: { window: rn.Dimensions.get('window'), screen: rn.Dimensions.get('screen'), fontScale: rn.PixelRatio.getFontScale() } };
	if (!objc) return JSON.stringify(Object.assign(out, { native: 'Duo Probe context unavailable (is the plugin on?)' }), null, 2);

	function ui(target, selector, args) {
		return objc.invoke(target, selector, args || [], { thread: 'main' });
	}
	// The bridge hands NSArray back as a plain array.
	function list(value) {
		return Array.isArray(value) ? value : objc.array(value);
	}
	function rect(raw) {
		var r = (raw && raw.value) || raw || {};
		return { x: (r.origin || r).x, y: (r.origin || r).y, width: (r.size || r).width, height: (r.size || r).height };
	}

	var app = ui(objc.getClass('UIApplication'), 'sharedApplication');
	var scenes = list(ui(ui(app, 'connectedScenes'), 'allObjects'));
	var scene = null, keyWindow = null;
	for (var i = 0; i < scenes.length; i++) {
		if (!objc.respondsTo(scenes[i], 'keyWindow')) continue;
		var w = ui(scenes[i], 'keyWindow');
		if (w) { scene = scenes[i]; keyWindow = w; break; }
	}
	if (keyWindow) {
		var traits = ui(keyWindow, 'traitCollection');
		var screen = ui(scene, 'screen');
		out.native = {
			window: rect(ui(keyWindow, 'bounds')),
			windowInScreen: rect(ui(keyWindow, 'frame')),
			screen: rect(ui(screen, 'bounds')),
			screenScale: ui(screen, 'scale'),
			safeArea: ui(keyWindow, 'safeAreaInsets'),
			horizontalSizeClass: ui(traits, 'horizontalSizeClass'),
			verticalSizeClass: ui(traits, 'verticalSizeClass'),
			interfaceOrientation: objc.respondsTo(scene, 'effectiveGeometry') ? ui(ui(scene, 'effectiveGeometry'), 'interfaceOrientation') : null,
			reservedRegionApi: Boolean(objc.getClass('UIViewReservedRegionKind')) && objc.respondsTo(keyWindow, 'reservedRegionsOfKind:options:'),
		};
		if (out.native.reservedRegionApi) {
			var kinds = objc.getClass('UIViewReservedRegionKind');
			out.native.regions = ['division', 'occlusion'].map(function (kind) {
				return list(ui(keyWindow, 'reservedRegionsOfKind:options:', [ui(kinds, kind + 'RegionKind'), 1])).map(function (region) {
					return { kind: kind, frame: rect(ui(region, 'frame')), active: Boolean(ui(region, objc.respondsTo(region, 'isActive') ? 'isActive' : 'active')), margins: (ui(region, 'margins') || {}).value };
				});
			});
		}
	}

	var info = ui(ui(objc.getClass('NSBundle'), 'mainBundle'), 'infoDictionary');
	out.build = {};
	['CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleVersion', 'DTSDKName', 'DTXcode', 'MinimumOSVersion'].forEach(function (key) {
		// The bridge hands NSDictionary back as a plain object.
		var value = info ? info[key] : undefined;
		out.build[key] = value === undefined ? null : value;
	});
	var device = ui(objc.getClass('UIDevice'), 'currentDevice');
	out.device = { systemVersion: ui(device, 'systemVersion'), idiom: ui(device, 'userInterfaceIdiom'), model: ui(device, 'model') };
	out.bridge = { api: probe.context.native.apiVersion, abi: probe.context.native.abiVersion, capabilities: probe.context.native.capabilities };
	return JSON.stringify(out, null, 2);
})()
