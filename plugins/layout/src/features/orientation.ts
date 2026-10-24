import { whenAllLoaded } from '../../../../src/shared/when-loaded.ts';
import type { Cleanup } from '../lifecycle.ts';
import { paths, Patcher, sensor, settings } from '../modules.ts';
import { report } from '../report.ts';

type Orientation = {
	lockOrientationForiOS: (lock?: string) => void;
	unlockOrientation: (options: { unlockAfterRotatingToPreviousLock: boolean }) => void;
	getOrientationLock: () => string | null;
	restoreDefaultOrientation: () => void;
};

// Discord locks iPhones to portrait at launch and again each time the app comes to the
// front; iPads get no default lock. Measured on the Duo: while that lock is held, a whole
// session unfolds into portrait however the phone is held. Once this device has shown a
// foldable's window it gets the iPad default instead. Locks a Discord screen asks for
// itself (sign-in, activities) still apply.
export function releasePortraitLock(): Cleanup {
	return whenAllLoaded([paths.deviceOrientation], ([module]) => {
		const orientation = module as Orientation | undefined;
		if (typeof orientation?.lockOrientationForiOS !== 'function' || typeof orientation.unlockOrientation !== 'function' || typeof orientation.getOrientationLock !== 'function') {
			console.warn("[DuoLayout] Discord's orientation lock changed shape; rotation keeps the stock lock.");
			return () => {};
		}
		const foldable = () => settings.get('foldable', false) === true;
		const release = () => {
			if (!foldable() || orientation.getOrientationLock() !== 'PORTRAIT') return;
			orientation.unlockOrientation({ unlockAfterRotatingToPreviousLock: false });
			report("released Discord's default portrait lock");
		};
		const learn = () => {
			const shape = sensor.current.get().shape;
			if (!foldable() && shape && (shape.regularWidth || shape.folds.length > 0)) settings.set('foldable', true);
			release();
		};
		const unpatches = [
			// The default lock is the call without an orientation.
			Patcher.instead(orientation, 'lockOrientationForiOS', ({ args, original }) => (foldable() && args[0] == null ? undefined : original(...args))),
			// Discord reapplies its default through a module-internal call when a screen's own lock ends.
			Patcher.after(orientation, 'restoreDefaultOrientation', release),
			sensor.current.subscribe(learn),
		];
		learn();
		return () => {
			for (const unpatch of unpatches) unpatch();
			if (foldable()) orientation.lockOrientationForiOS();
		};
	});
}
