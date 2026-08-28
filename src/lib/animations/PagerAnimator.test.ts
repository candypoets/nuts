// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('motion', () => ({
	animate: vi.fn(() => Promise.resolve())
}));

import { animate } from 'motion';
import { PagerAnimator } from './PagerAnimator';

function createSurface(kind: 'modal' | 'sub', width?: number): HTMLElement {
	const element = document.createElement('div');
	element.dataset.kind = kind;
	element.className = kind === 'modal' ? 'z-[60]' : 'z-20';
	if (width !== undefined) {
		vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
			width,
			height: 1000,
			top: 0,
			right: width,
			bottom: 1000,
			left: 0,
			x: 0,
			y: 0,
			toJSON: () => ({})
		});
	}
	document.body.appendChild(element);
	return element;
}

function createAnimator(vw = 10): PagerAnimator {
	const animator = new PagerAnimator({ vw, vh: 10 }, vi.fn(), undefined, {
		duration: 0.2,
		in: {
			sub: { x: [800, 0], opacity: [0.5, 1] }
		},
		out: {
			sub: { x: 800, opacity: 0.3 }
		}
	});
	animator.setMobileMode(false);
	return animator;
}

describe('PagerAnimator stacking order', () => {
	beforeEach(() => {
		document.body.replaceChildren();
		vi.clearAllMocks();
	});

	it('places a sub opened after a modal above the modal', () => {
		const animator = createAnimator();
		const modal = createSurface('modal');
		const sub = createSurface('sub');

		animator.registerElement(modal);
		animator.registerElement(sub);

		expect(Number(sub.style.zIndex)).toBeGreaterThan(Number(modal.style.zIndex));
	});

	it('places a modal opened after a sub above the sub', () => {
		const animator = createAnimator();
		const sub = createSurface('sub');
		const modal = createSurface('modal');

		animator.registerElement(sub);
		animator.registerElement(modal);

		expect(Number(modal.style.zIndex)).toBeGreaterThan(Number(sub.style.zIndex));
	});

	it('reindexes the remaining stack after an element is removed', () => {
		const animator = createAnimator();
		const first = createSurface('modal');
		const removed = createSurface('sub');
		const last = createSurface('modal');

		animator.registerElement(first);
		animator.registerElement(removed);
		animator.registerElement(last);
		animator.removeElement(removed);

		expect(first.style.zIndex).toBe('60');
		expect(last.style.zIndex).toBe('61');
	});
});

describe('PagerAnimator initial deep-link state', () => {
	beforeEach(() => {
		document.body.replaceChildren();
		vi.clearAllMocks();
	});

	it('applies an existing sub depth immediately when main content mounts', () => {
		const animator = createAnimator(20);
		const sub = createSurface('sub', 800);
		const main = document.createElement('main');
		document.body.appendChild(main);

		animator.registerElement(sub);
		animator.setMainContent(main);

		expect(animate).not.toHaveBeenCalled();
		expect(main.style.transform).toBe('translate3d(-400px, 0px, 0) scale(1) rotateY(0deg)');
		expect(sub.style.transform).toBe('translate3d(400px, 0px, 0) scale(1)');
	});

	it('stacks earlier pushed screens on the right without moving them onto the main feed', () => {
		const animator = createAnimator(20);
		const firstSub = createSurface('sub', 800);
		const activeSub = createSurface('sub', 800);
		const main = document.createElement('main');
		document.body.appendChild(main);

		animator.registerElement(firstSub);
		animator.registerElement(activeSub);
		animator.setMainContent(main);

		expect(main.style.transform).toBe('translate3d(-400px, 0px, 0) scale(1) rotateY(0deg)');
		expect(firstSub.style.transform).toBe('translate3d(370px, 0px, 0) scale(0.95)');
		expect(activeSub.style.transform).toBe('translate3d(400px, 0px, 0) scale(1)');
	});

	it('still animates a sub registered after main content', () => {
		const animator = createAnimator(20);
		const main = document.createElement('main');
		const sub = createSurface('sub', 800);
		document.body.appendChild(main);
		animator.setMainContent(main);
		vi.clearAllMocks();

		animator.registerElement(sub);

		expect(animate).toHaveBeenCalledWith(
			sub,
			{ x: [1400, 400], opacity: [0.5, 1] },
			expect.objectContaining({ easing: 'ease-out' })
		);
	});

	it('animates a pushed sub back beyond the right edge', () => {
		const animator = createAnimator(20);
		const main = document.createElement('main');
		const sub = createSurface('sub', 800);
		document.body.appendChild(main);
		animator.setMainContent(main);
		animator.registerElement(sub);
		vi.clearAllMocks();

		animator.unregisterElement(sub, true);

		expect(animate).toHaveBeenCalledWith(
			sub,
			{ x: [400, 1400], opacity: [1, 0.3] },
			expect.objectContaining({ easing: 'ease-in' })
		);
	});

	it('reapplies the pair layout when viewport dimensions become available', () => {
		const animator = new PagerAnimator({ vw: 0, vh: 0 }, vi.fn());
		animator.setMobileMode(false);
		const sub = createSurface('sub', 800);
		const main = document.createElement('main');
		document.body.appendChild(main);

		animator.registerElement(sub);
		animator.setMainContent(main);
		expect(main.style.transform).toBe('translate3d(0px, 0px, 0) scale(1) rotateY(0deg)');

		animator.updateViewport({ vw: 20, vh: 10 });

		expect(animate).not.toHaveBeenCalled();
		expect(main.style.transform).toBe('translate3d(-400px, 0px, 0) scale(1) rotateY(0deg)');
		expect(sub.style.transform).toBe('translate3d(400px, 0px, 0) scale(1)');
	});

	it('does not increase the pair width on an ultrawide viewport', () => {
		const animator = createAnimator(20);
		const sub = createSurface('sub', 800);
		const main = document.createElement('main');
		document.body.appendChild(main);

		animator.registerElement(sub);
		animator.setMainContent(main);
		animator.updateViewport({ vw: 40, vh: 22 });

		expect(main.style.transform).toBe('translate3d(-400px, 0px, 0) scale(1) rotateY(0deg)');
		expect(sub.style.transform).toBe('translate3d(400px, 0px, 0) scale(1)');
	});

	it('overlaps the panels only by the width missing from a smaller viewport', () => {
		const animator = createAnimator(12);
		const sub = createSurface('sub', 800);
		const main = document.createElement('main');
		document.body.appendChild(main);

		animator.registerElement(sub);
		animator.setMainContent(main);

		// The panels overlap by the missing width plus two 16px viewport gutters.
		expect(main.style.transform).toBe('translate3d(-184px, 0px, 0) scale(1) rotateY(0deg)');
		expect(sub.style.transform).toBe('translate3d(184px, 0px, 0) scale(1)');
	});
});
