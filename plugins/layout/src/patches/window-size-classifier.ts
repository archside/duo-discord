import type { WindowClass } from '../../../../src/shared/columns.ts';
import { Patcher } from '../modules.ts';

type Classifier = { default: () => WindowClass; getWindowSizeClassifier: () => WindowClass };
type BaseDimensions = { default: () => { width: number }; getBaseAppContainerDimensions: () => { width: number } };

export function hasClassifierShape(classifier: any, base: any): boolean {
	return (
		typeof classifier?.default === 'function' &&
		typeof classifier?.getWindowSizeClassifier === 'function' &&
		typeof base?.default === 'function' &&
		typeof base?.getBaseAppContainerDimensions === 'function'
	);
}

// Rewrites Discord's window class through `decide`, keeping every caller (chat layout,
// drawer width, chat width) consistent because they all read the class.
//
// The hook variant must not call hooks of its own: removing a hook from a mounted
// component on disable would crash React. The classifier hook already calls
// useBaseAppContainerDimensions for its window, so that call's result is captured on
// the way through and read back when the classifier returns, within the same render.
export function patchWindowSizeClassifier(
	classifier: Classifier,
	base: BaseDimensions,
	decide: (stock: WindowClass, width: number) => WindowClass,
): () => void {
	let width: number | undefined;

	const unpatches = [
		Patcher.before(classifier, 'default', () => {
			width = undefined;
		}),
		Patcher.after(base, 'default', ({ result }) => {
			width = result?.width;
			return result;
		}),
		Patcher.after(classifier, 'default', ({ result }) => (result == null || width === undefined ? result : decide(result, width))),
		Patcher.after(classifier, 'getWindowSizeClassifier', ({ result }) =>
			result == null ? result : decide(result, base.getBaseAppContainerDimensions().width),
		),
	];

	return () => {
		for (const unpatch of unpatches) unpatch();
	};
}
