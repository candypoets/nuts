// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('motion', () => ({
	animate: vi.fn(() => Promise.resolve())
}));

import { animate } from 'motion';
import { PagerAnimator } from './PagerAnimator';

function createSurface(kind: 'modal' | 'sub'): HTMLElement {
	const element = document.createElement('div');
	element.dataset.kind = kind;
	element.className = kind === 'modal' ? 'z-[60]' : 'z-20';
	document.body.appendChild(element);
	return element;
}

function createAnimator(): PagerAnimator {
	const animator = new PagerAnimator({ vw: 10, vh: 10 }, vi.fn());
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
		const animator = createAnimator();
		const sub = createSurface('sub');
		const main = document.createElement('main');
		document.body.appendChild(main);

		animator.registerElement(sub);
		animator.setMainContent(main);

		expect(animate).not.toHaveBeenCalled();
		expect(main.style.transform).toBe('translate3d(-230px, 0px, 0) scale(1) rotateY(0deg)');
		expect(sub.style.transform).toBe('translate3d(0px, 0px, 0) scale(1)');
	});

	it('still animates a sub registered after main content', () => {
		const animator = createAnimator();
		const main = document.createElement('main');
		const sub = createSurface('sub');
		document.body.appendChild(main);
		animator.setMainContent(main);
		vi.clearAllMocks();

		animator.registerElement(sub);

		expect(animate).toHaveBeenCalled();
	});

	it('reapplies the initial depth when viewport dimensions become available', () => {
		const animator = new PagerAnimator({ vw: 0, vh: 0 }, vi.fn());
		animator.setMobileMode(false);
		const sub = createSurface('sub');
		const main = document.createElement('main');
		document.body.appendChild(main);

		animator.registerElement(sub);
		animator.setMainContent(main);
		expect(main.style.transform).toContain('translate3d(-30px, 0px, 0)');

		animator.updateViewport({ vw: 10, vh: 10 });

		expect(animate).not.toHaveBeenCalled();
		expect(main.style.transform).toBe('translate3d(-230px, 0px, 0) scale(1) rotateY(0deg)');
	});
});
