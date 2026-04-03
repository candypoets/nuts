import type { ActionReturn } from 'svelte/action';

export interface SwipeDismissOptions {
	/** Direction of swipe to dismiss: 'vertical', 'horizontal', or 'both' (default: 'vertical') */
	direction?: 'vertical' | 'horizontal' | 'both';
	/** Minimum distance (px) to trigger dismiss (default: 1/3 of viewport dimension) */
	threshold?: number;
	/** Minimum velocity (px/ms) to trigger dismiss (default: 0.5) */
	velocityThreshold?: number;
	/** Minimum distance before checking velocity (default: 50) */
	minDistance?: number;
	/** Minimum movement (px) before declaring axis lock (default: 10) */
	axisLockThreshold?: number;
	/** Angle (degrees) above which gesture is considered vertical (default: 60) */
	verticalAngleDeg?: number;
	/** Called during swipe with progress (0-1) and deltas */
	onSwipe?: (progress: number, deltaX: number, deltaY: number) => void;
	/** Called when dismiss should be triggered - receives final deltaX and deltaY */
	onDismiss?: (deltaX: number, deltaY: number) => void;
	/** Called when swipe is cancelled (below threshold) */
	onCancel?: () => void;
	/** Called when axis is locked (useful for disabling other gesture handlers) */
	onAxisLock?: (axis: 'vertical' | 'horizontal') => void;
	/** Check if swipe should be allowed (e.g., scroll position check) */
	canSwipe?: () => boolean;
}

interface SwipeDismissState {
	touchStartX: number;
	touchStartY: number;
	touchStartTime: number;
	isSwiping: boolean;
	isVerticalGesture: boolean;
	isHorizontalGesture: boolean;
	currentDeltaX: number;
	currentDeltaY: number;
}

const DEFAULT_OPTIONS: Required<SwipeDismissOptions> = {
	direction: 'vertical',
	threshold: 0, // Will be calculated based on viewport
	velocityThreshold: 0.5,
	minDistance: 50,
	axisLockThreshold: 10,
	verticalAngleDeg: 60,
	onSwipe: () => {},
	onDismiss: () => {},
	onCancel: () => {},
	onAxisLock: () => {},
	canSwipe: () => true
};

/**
 * Svelte action for swipe-to-dismiss functionality
 */
export function swipeDismiss(
	node: HTMLElement,
	options: SwipeDismissOptions = {}
): ActionReturn<SwipeDismissOptions> {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	
	const state: SwipeDismissState = {
		touchStartX: 0,
		touchStartY: 0,
		touchStartTime: 0,
		isSwiping: false,
		isVerticalGesture: false,
		isHorizontalGesture: false,
		currentDeltaX: 0,
		currentDeltaY: 0
	};

	function getThreshold(): number {
		if (opts.threshold > 0) return opts.threshold;
		// Default: 1/3 of viewport height for vertical, width for horizontal
		if (typeof window === 'undefined') return 200;
		return opts.direction === 'horizontal' 
			? window.innerWidth / 3 
			: window.innerHeight / 3;
	}

	function calculateProgress(deltaX: number, deltaY: number): number {
		const threshold = getThreshold();
		const absX = Math.abs(deltaX);
		const absY = Math.abs(deltaY);
		
		if (opts.direction === 'horizontal') {
			return Math.min(absX / threshold, 1);
		} else if (opts.direction === 'vertical') {
			return Math.min(absY / threshold, 1);
		} else {
			// 'both' - use the larger delta
			const maxDelta = Math.max(absX, absY);
			return Math.min(maxDelta / threshold, 1);
		}
	}

	function shouldTriggerDismiss(deltaX: number, deltaY: number, deltaTime: number): boolean {
		const threshold = getThreshold();
		const absX = Math.abs(deltaX);
		const absY = Math.abs(deltaY);
		
		// Distance threshold
		let distanceMet = false;
		if (opts.direction === 'horizontal') {
			distanceMet = absX > threshold;
		} else if (opts.direction === 'vertical') {
			distanceMet = absY > threshold;
		} else {
			distanceMet = Math.max(absX, absY) > threshold;
		}
		
		// Velocity threshold
		const velocityX = absX / deltaTime;
		const velocityY = absY / deltaTime;
		let velocityMet = false;
		
		if (opts.direction === 'horizontal') {
			velocityMet = velocityX > opts.velocityThreshold && absX > opts.minDistance;
		} else if (opts.direction === 'vertical') {
			velocityMet = velocityY > opts.velocityThreshold && absY > opts.minDistance;
		} else {
			velocityMet = (velocityX > opts.velocityThreshold || velocityY > opts.velocityThreshold) && 
				(Math.max(absX, absY) > opts.minDistance);
		}
		
		return distanceMet || velocityMet;
	}

	function handleTouchStart(e: TouchEvent) {
		const t = e.touches[0];
		state.touchStartX = t.clientX;
		state.touchStartY = t.clientY;
		state.touchStartTime = Date.now();
		state.isSwiping = false;
		state.isVerticalGesture = false;
		state.isHorizontalGesture = false;
		state.currentDeltaX = 0;
		state.currentDeltaY = 0;
	}

	function handleTouchMove(e: TouchEvent) {
		// Check if swipe is allowed (e.g., scroll position check)
		if (!opts.canSwipe()) {
			return;
		}

		const t = e.touches[0];
		const dx = t.clientX - state.touchStartX;
		const dy = t.clientY - state.touchStartY;
		const absX = Math.abs(dx);
		const absY = Math.abs(dy);

		// Decide axis lock once sufficient movement occurs
		if (!state.isVerticalGesture && !state.isHorizontalGesture) {
			if (absX < opts.axisLockThreshold && absY < opts.axisLockThreshold) {
				return; // not enough movement yet
			}
			const angleDeg = Math.atan2(absY, absX) * (180 / Math.PI);
			if (angleDeg >= opts.verticalAngleDeg) {
				state.isVerticalGesture = true;
				opts.onAxisLock('vertical');
			} else if (angleDeg <= 180 - opts.verticalAngleDeg) {
				// ~<=30° from horizontal axis -> treat as horizontal
				state.isHorizontalGesture = true;
				opts.onAxisLock('horizontal');
			} else {
				// ambiguous band, wait for more movement
				return;
			}
		}

		// Check if gesture matches our configured direction
		const isVerticalAllowed = opts.direction === 'vertical' || opts.direction === 'both';
		const isHorizontalAllowed = opts.direction === 'horizontal' || opts.direction === 'both';

		if (state.isVerticalGesture && !isVerticalAllowed) {
			return; // Vertical gesture but we only handle horizontal
		}
		if (state.isHorizontalGesture && !isHorizontalAllowed) {
			return; // Horizontal gesture but we only handle vertical
		}

		// Valid swipe for our direction
		state.isSwiping = true;
		state.currentDeltaX = dx;
		state.currentDeltaY = dy;

		e.preventDefault();
		e.stopPropagation();

		const progress = calculateProgress(dx, dy);
		opts.onSwipe(progress, dx, dy);
	}

	function handleTouchEnd(e: TouchEvent) {
		if (!state.isSwiping) {
			// Reset state even if we weren't swiping
			state.isVerticalGesture = false;
			state.isHorizontalGesture = false;
			return;
		}

		const touchEndTime = Date.now();
		const deltaTime = touchEndTime - state.touchStartTime;

		const shouldDismiss = shouldTriggerDismiss(
			state.currentDeltaX,
			state.currentDeltaY,
			deltaTime
		);

		if (shouldDismiss) {
			opts.onDismiss(state.currentDeltaX, state.currentDeltaY);
		} else {
			opts.onCancel();
		}

		// Reset state
		state.isSwiping = false;
		state.isVerticalGesture = false;
		state.isHorizontalGesture = false;
		state.currentDeltaX = 0;
		state.currentDeltaY = 0;
	}

	// Use regular bubbling listeners
	node.addEventListener('touchstart', handleTouchStart, { passive: true });
	node.addEventListener('touchmove', handleTouchMove, { passive: false });
	node.addEventListener('touchend', handleTouchEnd, { passive: true });

	return {
		update(newOptions: SwipeDismissOptions) {
			Object.assign(opts, newOptions);
		},
		destroy() {
			node.removeEventListener('touchstart', handleTouchStart);
			node.removeEventListener('touchmove', handleTouchMove);
			node.removeEventListener('touchend', handleTouchEnd);
		}
	};
}
