export type SwipeCustomEvent = {
	deltaX: number;
	deltaY: number;
	startX: number;
	startY: number;
	currentX: number;
	currentY: number;
};

export function swipe(
	node: HTMLElement,
	options: { thresholdX?: number; thresholdY?: number; direction?: 'left' | 'right' } = {
		direction: 'right'
	}
) {
	const { direction } = options;
	let startX: number | null;
	let startY: number | null;

	function handleTouchStart(event: TouchEvent) {
		console.log('touch start');
		const touch = event.touches[0];
		startX = touch.clientX;
		startY = touch.clientY;
	}

	function handleTouchMove(event: TouchEvent) {
		console.log('touch move');
		if (!startX || !startY) return;

		const touch = event.touches[0];
		const deltaX = touch.clientX - startX;
		const deltaY = touch.clientY - startY;

		const movement = deltaX > 0 ? 'right' : 'left';

		if (movement != direction) return;

		// for an horizontla swipe, make sure deltaX is 2x deltaY
		if (Math.abs(deltaX) < Math.abs(2 * deltaY)) return;
		event.preventDefault();

		node.dispatchEvent(
			new CustomEvent('swipe', {
				detail: {
					startX,
					startY,
					deltaX,
					deltaY,
					currentX: touch.clientX,
					currentY: touch.clientY
				}
			})
		);
	}

	function handleTouchEnd(event: TouchEvent) {
		console.log('touch end');
		if (!startX || !startY) return;

		const touch = event.changedTouches[0];
		const deltaX = touch.clientX - startX;
		const deltaY = touch.clientY - startY;

		const movement = deltaX > 0 ? 'right' : 'left';

		if (movement != direction) return;

		// for an horizontla swipe, make sure deltaX is 2x deltaY
		if (Math.abs(deltaX) < Math.abs(2 * deltaY)) return;

		node.dispatchEvent(
			new CustomEvent('end', {
				detail: { startX, startY, deltaX, deltaY, currentX: touch.clientX, currentY: touch.clientY }
			})
		);

		startX = null;
		startY = null;
	}

	node.addEventListener('touchstart', handleTouchStart);
	node.addEventListener('touchmove', handleTouchMove);
	node.addEventListener('touchend', handleTouchEnd);

	return {
		destroy() {
			node.removeEventListener('touchstart', handleTouchStart);
			node.removeEventListener('touchmove', handleTouchMove);
			node.removeEventListener('touchend', handleTouchEnd);
		}
	};
}
