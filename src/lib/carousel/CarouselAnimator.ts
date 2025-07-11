export class CarouselAnimator {
	private items: HTMLElement[] = [];
	private currentAnimations: Animation[] = [];
	private touchRAF: number | null = null;
	private scrollerWidth: number;
	private currentIndex: number = 0;
	private currentStates: { transform: string; opacity: string }[] = [];

	constructor(scrollerWidth: number) {
		this.scrollerWidth = scrollerWidth;
	}

	setItems(items: HTMLElement[]) {
		this.items = items;
		this.cancelAllAnimations();
		this.currentAnimations = new Array(items.length).fill(null);
		this.currentStates = new Array(items.length)
			.fill(null)
			.map(() => ({ transform: '', opacity: '1' }));
	}

	updateScrollerWidth(width: number) {
		this.scrollerWidth = width;
	}

	setCurrentIndex(index: number) {
		this.currentIndex = index;
	}

	// Capture current animated state for smooth transitions
	private captureCurrentState(index: number): { transform: string; opacity: string } {
		const item = this.items[index];
		if (!item) return { transform: '', opacity: '1' };

		// If animation is running, get the current computed values
		const computedStyle = window.getComputedStyle(item);
		const currentTransform =
			computedStyle.transform !== 'none' ? computedStyle.transform : item.style.transform || '';
		const currentOpacity = computedStyle.opacity || item.style.opacity || '1';

		return { transform: currentTransform, opacity: currentOpacity };
	}

	// Use Web Animations API to animate each carousel item
	animateToPosition(virtualXPosition: number, duration = 400, isMobile: boolean = false) {
		this.items.forEach((item, index) => {
			const ratio = this.getTransformRatio(index, virtualXPosition, this.scrollerWidth);

			// Cancel existing animation for this item and capture current state
			if (this.currentAnimations[index]) {
				// Capture the current animated state before cancelling
				const currentState = this.captureCurrentState(index);
				this.currentStates[index] = currentState;

				// Apply current state to element to maintain position
				item.style.transform = currentState.transform;
				item.style.opacity = currentState.opacity;

				this.currentAnimations[index].cancel();
			}

			// Get current transform and opacity for smooth transitions
			const currentState = this.currentStates[index] || this.captureCurrentState(index);
			const currentTransform =
				currentState.transform ||
				this.getTransformForItem(
					index,
					this.getTransformRatio(index, this.currentIndex * this.scrollerWidth, this.scrollerWidth),
					isMobile
				);
			const currentOpacity = currentState.opacity || '1';

			// Calculate target transform and opacity
			const targetTransform = this.getTransformForItem(index, ratio, isMobile);
			const targetOpacity = isMobile ? '1' : ratio.toString();

			// Only animate if there's a meaningful change
			const needsAnimation =
				currentTransform !== targetTransform || currentOpacity !== targetOpacity;

			if (needsAnimation) {
				// Create new animation for this item with from/to keyframes
				this.currentAnimations[index] = item.animate(
					[
						{
							transform: currentTransform === 'none' ? targetTransform : currentTransform,
							opacity: currentOpacity
						},
						{
							transform: targetTransform,
							opacity: targetOpacity
						}
					],
					{
						duration,
						easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
						fill: 'forwards'
					}
				);
			} else {
				// No animation needed, set final state directly
				item.style.transform = targetTransform;
				item.style.opacity = targetOpacity;
			}

			// Update tracked state when animation completes (only if animation was created)
			if (this.currentAnimations[index]) {
				this.currentAnimations[index].addEventListener('finish', () => {
					this.currentStates[index] = {
						transform: targetTransform,
						opacity: targetOpacity
					};
				});
			} else {
				// Update tracked state immediately if no animation
				this.currentStates[index] = {
					transform: targetTransform,
					opacity: targetOpacity
				};
			}
		});
	}

	// Use RAF for immediate touch response
	trackTouchPosition(virtualXPosition: number, isMobile: boolean = false) {
		if (this.touchRAF) {
			cancelAnimationFrame(this.touchRAF);
		}

		this.touchRAF = requestAnimationFrame(() => {
			this.items.forEach((item, index) => {
				// Calculate continuous position based on virtualXPosition
				const transform = this.getTransformForTouchPosition(index, virtualXPosition, isMobile);
				const ratio = this.getTransformRatio(index, virtualXPosition, this.scrollerWidth);
				const opacity = isMobile ? '1' : ratio.toString();

				item.style.transform = transform;
				item.style.opacity = opacity;

				// Update tracked state
				this.currentStates[index] = { transform, opacity };
			});
			this.touchRAF = null;
		});
	}

	private getTransformForTouchPosition(index: number, virtualXPosition: number, isMobile: boolean) {
		if (isMobile) {
			// For mobile, translate each item based on virtual position
			// Each item is positioned at index * scrollerWidth, offset by virtualXPosition
			const itemBasePosition = index * this.scrollerWidth;
			const translateX = itemBasePosition - virtualXPosition;
			return `translateX(${translateX}px) translateY(0)`;
		}

		// For desktop, calculate continuous position with 3D effects
		const ratio = this.getTransformRatio(index, virtualXPosition, this.scrollerWidth);
		const currentVirtualIndex = virtualXPosition / this.scrollerWidth;
		const direction = index - currentVirtualIndex;

		return `translateX(${direction * 50}vw) translateY(0)
				translateZ(${ratio * 10}px)
				rotateY(${(1 - ratio) * direction * 30}deg)
				scale(${ratio})`;
	}

	private getTransformRatio(index: number, x: number, elementWidth: number) {
		const targetPoint = index * elementWidth;
		const distanceInWidths = Math.abs(x - targetPoint) / elementWidth;
		return 1 / (distanceInWidths + 1);
	}

	private getTransformForItem(index: number, ratio: number, isMobile: boolean) {
		if (isMobile) {
			// Fixed positioning for mobile - each item takes full width
			return `translateX(${(index - this.currentIndex) * 100}vw) translateY(0)`;
		}

		const distance = Math.abs(index - this.currentIndex);
		const direction = index - this.currentIndex;

		// Fixed positioning for desktop - prevent vertical stacking
		return `translateX(${direction * 50}vw) translateY(0)
				translateZ(${ratio * 10}px)
				rotateY(${(1 - ratio) * direction * 30}deg)
				scale(${ratio})`;
	}

	cancelAllAnimations() {
		this.currentAnimations.forEach((animation, index) => {
			if (animation) {
				// Capture current animated state before cancelling
				const currentState = this.captureCurrentState(index);
				this.currentStates[index] = currentState;

				// Apply current state to element to maintain position
				const item = this.items[index];
				if (item) {
					item.style.transform = currentState.transform;
					item.style.opacity = currentState.opacity;
				}

				// Cancel the animation after capturing its current state
				animation.cancel();
			}
		});
		this.currentAnimations = [];

		if (this.touchRAF) {
			cancelAnimationFrame(this.touchRAF);
			this.touchRAF = null;
		}
	}

	// Utility method for progress bars and other external calculations
	static getTransformRatio(index: number, x: number, elementWidth: number) {
		const targetPoint = index * elementWidth;
		const distanceInWidths = Math.abs(x - targetPoint) / elementWidth;
		return 1 / (distanceInWidths + 1);
	}
}
