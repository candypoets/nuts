// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('motion', () => ({
	animate: vi.fn(() => Promise.resolve())
}));

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
