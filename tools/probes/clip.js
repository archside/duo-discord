// Which native views above the chat clip their children, and where their trailing edges sit.
// Decides whether chat surfaces can run past the safe area into a side band.
// Run in landscape with a channel open: npm run device -- eval --file tools/probes/clip.js
(function () {
	var probe = window.unbound && window.unbound.plugins && window.unbound.plugins.getEntity('duo.probe');
	var objc = probe && probe.context && probe.context.native && probe.context.native.objc;
	if (!objc) return 'Duo Probe context unavailable (is the plugin on?)';

	function ui(target, selector, args) {
		return objc.invoke(target, selector, args || [], { thread: 'main' });
	}
	function list(value) {
		return Array.isArray(value) ? value : objc.array(value);
	}
	function rect(raw) {
		var r = (raw && raw.value) || raw || {};
		return { x: (r.origin || r).x, y: (r.origin || r).y, width: (r.size || r).width, height: (r.size || r).height };
	}

	var app = ui(objc.getClass('UIApplication'), 'sharedApplication');
	var scenes = list(ui(ui(app, 'connectedScenes'), 'allObjects'));
	var keyWindow = null;
	for (var i = 0; i < scenes.length && !keyWindow; i++) {
		if (objc.respondsTo(scenes[i], 'keyWindow')) keyWindow = ui(scenes[i], 'keyWindow');
	}
	if (!keyWindow) return 'no key window';
	var bounds = rect(ui(keyWindow, 'bounds'));

	// The deepest chain of views containing the point, in window points from origins and
	// scroll offsets. Transforms are ignored, which holds while the chat panel is at rest.
	var visits = 0;
	function pathTo(point, view, origin) {
		var best = [];
		if (++visits > 1500) return best;
		var b = rect(ui(view, 'bounds'));
		var subviews = list(ui(view, 'subviews'));
		for (var j = subviews.length - 1; j >= 0; j--) {
			if (ui(subviews[j], 'isHidden')) continue;
			var f = rect(ui(subviews[j], 'frame'));
			var o = { x: origin.x + f.x - b.x, y: origin.y + f.y - b.y };
			if (point.x < o.x || point.x >= o.x + f.width || point.y < o.y || point.y >= o.y + f.height) continue;
			var entry = { cls: String(ui(ui(subviews[j], 'class'), 'description')), x: o.x, y: o.y, width: f.width, height: f.height, clips: Boolean(ui(subviews[j], 'clipsToBounds')) };
			var path = [entry].concat(pathTo(point, subviews[j], o));
			if (path.length > best.length) best = path;
		}
		return best;
	}

	var bandLeft = bounds.width - ui(keyWindow, 'safeAreaInsets').value.right;
	var points = { header: { x: bandLeft - 150, y: 45 }, body: { x: bandLeft - 150, y: bounds.height / 2 } };
	var out = { window: bounds, bandLeft: bandLeft };
	Object.keys(points).forEach(function (name) {
		visits = 0;
		var path = pathTo(points[name], keyWindow, { x: 0, y: 0 });
		out[name] = {
			depth: path.length,
			clippingBeforeBand: path.filter(function (v) { return v.clips && v.x + v.width <= bandLeft + 0.5; }),
			clipping: path.filter(function (v) { return v.clips; }),
			deepest: path.slice(-4),
		};
	});
	return JSON.stringify(out, null, 2);
})()
