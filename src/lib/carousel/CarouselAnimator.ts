import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { get, writable } from 'svelte/store';

export class CarouselAnimator {
	private items: HTMLElement[] = [];
	private currentAnimations: Animation[] = [];
	private touchRAF: number | null = null;
	private scrollerWidth: number;
	private currentStates: { transform: string; opacity: string }[] = [];
	public pages = ['/home', '/explore', '/chat'];

	// Public store for current index
	public currentIndex = writable<number>(0);

	// Internal backing value for performance and internal math
	private _currentIndex: number = 0;

	// Touch state
	private touchStartX = 0;
	private touchStartY = 0;
	private touchStartTime = 0;
	private isSwiping = false;
	private isHorizontalGesture = false;
	private virtualXPosition = 0;

	// Progress bars
	private progressContainer: HTMLElement | null = null;
	private progressBars: HTMLElement[] = [];

	constructor(scrollerWidth: number = 1080) {
		this.scrollerWidth = scrollerWidth;
	}

	setItems(items: HTMLElement[]) {
		this.items = items;
		this.cancelAllAnimations();
		this.currentAnimations = new Array(items.length).fill(null);
		this.currentStates = new Array(items.length)
			.fill(null)
			.map(() => ({ transform: '', opacity: '1' }));
		// Rebuild progress bars, as the number of items/pages might have changed
		this.rebuildProgressBars();
		this.updateProgressBars(this._currentIndex * this.scrollerWidth);
	}

	updateScrollerWidth(width: number) {
		this.scrollerWidth = width;
	}

	setCurrentIndex(index: number) {
		this._currentIndex = index;
		this.currentIndex.set(index);
		this.updateProgressBars(this._currentIndex * this.scrollerWidth);
	}

	// Optionally provide a new set of pages
	setPages(pages: string[]) {
		this.pages = pages;
		this.rebuildProgressBars();
		this.updateProgressBars(this._currentIndex * this.scrollerWidth);
	}

	// Pass the container for the progress bars (empty div). Animator builds/controls bars.
	setProgressContainer(container: HTMLElement) {
		this.progressContainer = container;
		this.rebuildProgressBars();
		this.updateProgressBars(this._currentIndex * this.scrollerWidth);
	}

	private rebuildProgressBars() {
		if (!this.progressContainer) return;
		this.progressContainer.innerHTML = '';
		this.progressBars = [];

		const n = this.pages.length || this.items.length || 0;
		for (let i = 0; i < n; i++) {
			const bar = document.createElement('div');
			// Base styling; widths/grow are controlled dynamically
			bar.className = 'h-1 bg-white bg-opacity-30 rounded-full will-change-transform progress-bar';
			// Make them flexible; we’ll set flexGrow dynamically
			bar.style.flexGrow = '1';
			bar.style.flexBasis = '0%';
			this.progressContainer.appendChild(bar);
			this.progressBars.push(bar);
		}
	}

	private updateProgressBars(virtualXPosition: number) {
		if (!this.progressBars.length) return;

		// Distribute widths by flex-grow using the same ratio as content transforms
		for (let i = 0; i < this.progressBars.length; i++) {
			const r = this.getTransformRatio(i, virtualXPosition, this.scrollerWidth); // 1..(1/2)..(1/3)...
			// Make growth feel nice: baseline + ratio
			const grow = 0.5 + r; // min 0.5, up to 1.5 when active
			this.progressBars[i].style.flexGrow = `${grow}`;
			// Slight opacity emphasis on active
			const opacity = 0.3 + r * 0.7; // 0.3..1.0
			this.progressBars[i].style.opacity = opacity.toFixed(3);
			// Optional: subtle scale for crispness
			this.progressBars[i].style.transform = `scaleY(${0.9 + r * 0.1})`;
		}
	}

	moveLeft() {
		if (this._currentIndex > 0) {
			this.moveToIndex(this._currentIndex - 1);
		}
	}

	moveRight() {
		if (this._currentIndex < this.items.length - 1) {
			this.moveToIndex(this._currentIndex + 1);
		}
	}

	moveToIndex(index: number, duration: number = 400, isMobile: boolean = false) {
		if (index < 0 || index >= this.pages.length) return;
		if (this.pages[index] != get(page).url.pathname) {
			this.pages[this._currentIndex] = get(page).url.pathname;
		}
		this.setCurrentIndex(index);
		const targetX = index * this.scrollerWidth;
		this.animateToPosition(targetX, duration, isMobile);
		goto(this.pages[index]);
	}

	// Touch handlers
	handleTouchStart(e: TouchEvent) {
		this.touchStartX = e.touches[0].clientX;
		this.touchStartY = e.touches[0].clientY;
		this.touchStartTime = Date.now();
		this.isSwiping = false;
		this.isHorizontalGesture = false;

		// Cancel any ongoing animations to allow immediate touch control
		this.cancelAllAnimations();

		// Set virtual position based on current index after animations are cancelled
		this.virtualXPosition = this._currentIndex * this.scrollerWidth;
	}

	handleTouchMove(e: TouchEvent, isMobile: boolean = false) {
		if (!this.items.length) return;

		const touchCurrentX = e.touches[0].clientX;
		const touchCurrentY = e.touches[0].clientY;
		const deltaX = touchCurrentX - this.touchStartX;
		const deltaY = touchCurrentY - this.touchStartY;

		// Determine gesture direction only once
		if (!this.isHorizontalGesture && !this.isSwiping) {
			const absDeltaX = Math.abs(deltaX);
			const absDeltaY = Math.abs(deltaY);

			// Need minimum movement to determine direction
			if (absDeltaX > 10 || absDeltaY > 10) {
				this.isHorizontalGesture = absDeltaX > absDeltaY;
				if (!this.isHorizontalGesture) return; // allow vertical scroll
			} else {
				return;
			}
		}

		// Only handle horizontal gestures
		if (this.isHorizontalGesture && Math.abs(deltaX) > 5) {
			this.isSwiping = true;
			e.preventDefault();
			e.stopPropagation();

			// Boundary constraints with rubber-band
			let constrainedDeltaX = deltaX;
			const maxDeltaX = this._currentIndex * this.scrollerWidth;
			const minDeltaX = -(this.pages.length - 1 - this._currentIndex) * this.scrollerWidth;

			if (deltaX > maxDeltaX) {
				constrainedDeltaX = maxDeltaX + (deltaX - maxDeltaX) * 0.3;
			} else if (deltaX < minDeltaX) {
				constrainedDeltaX = minDeltaX + (deltaX - minDeltaX) * 0.3;
			}

			// Update virtual position and use RAF for immediate response
			this.virtualXPosition = this._currentIndex * this.scrollerWidth - constrainedDeltaX;
			this.trackTouchPosition(this.virtualXPosition, isMobile);
			this.updateProgressBars(this.virtualXPosition);
		}
	}

	handleTouchEnd(e: TouchEvent, isMobile: boolean = false) {
		if (!this.items.length) return;

		if (this.isHorizontalGesture) {
			const touchEndX = e.changedTouches[0].clientX;
			const deltaX = touchEndX - this.touchStartX;
			const containerWidth = this.scrollerWidth;
			const velocity = Math.abs(deltaX) / (Date.now() - this.touchStartTime);

			let targetIndex = this._currentIndex;
			const threshold = containerWidth / 3;
			const velocityThreshold = 0.5; // px/ms

			if (this.isSwiping && (Math.abs(deltaX) > threshold || velocity > velocityThreshold)) {
				if (deltaX > 0 && this._currentIndex > 0) {
					targetIndex = this._currentIndex - 1;
				} else if (deltaX < 0 && this._currentIndex < this.pages.length - 1) {
					targetIndex = this._currentIndex + 1;
				}
			}

			this.moveToIndex(targetIndex, 250, isMobile);
			// Progress bars will be updated within animateToPosition via updateProgressBars
		}

		this.isSwiping = false;
		this.isHorizontalGesture = false;
	}

	// Capture current animated state for smooth transitions
	private captureCurrentState(index: number): { transform: string; opacity: string } {
		const item = this.items[index];
		if (!item) return { transform: '', opacity: '1' };

		const computedStyle = window.getComputedStyle(item);
		const currentTransform =
			computedStyle.transform !== 'none' ? computedStyle.transform : item.style.transform || '';
		const currentOpacity = computedStyle.opacity || item.style.opacity || '1';

		return { transform: currentTransform, opacity: currentOpacity };
	}

	// Use Web Animations API to animate each carousel item
	animateToPosition(virtualXPosition: number, duration = 400, isMobile: boolean = false) {
		// Keep progress bars in sync during programmatic animations
		this.updateProgressBars(virtualXPosition);

		this.items.forEach((item, index) => {
			const ratio = this.getTransformRatio(index, virtualXPosition, this.scrollerWidth);

			// Ensure correct stacking: current page on top
			item.style.zIndex = index === this._currentIndex ? '10' : '0';

			// Cancel existing animation for this item and capture current state
			if (this.currentAnimations[index]) {
				const currentState = this.captureCurrentState(index);
				this.currentStates[index] = currentState;

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
					this.getTransformRatio(
						index,
						this._currentIndex * this.scrollerWidth,
						this.scrollerWidth
					),
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
				item.style.transform = targetTransform;
				item.style.opacity = targetOpacity;
			}

			if (this.currentAnimations[index]) {
				this.currentAnimations[index].addEventListener('finish', () => {
					this.currentStates[index] = {
						transform: targetTransform,
						opacity: targetOpacity
					};
				});
			} else {
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
				const transform = this.getTransformForTouchPosition(index, virtualXPosition, isMobile);
				const ratio = this.getTransformRatio(index, virtualXPosition, this.scrollerWidth);
				const opacity = isMobile ? '1' : ratio.toString();

				// While dragging, put the currently nearest page on top
				const nearestIndex = Math.round(virtualXPosition / this.scrollerWidth);
				item.style.zIndex = index === nearestIndex ? '10' : '0';

				item.style.transform = transform;
				item.style.opacity = opacity;

				this.currentStates[index] = { transform, opacity };
			});
			this.touchRAF = null;
		});
	}

	private getTransformForTouchPosition(index: number, virtualXPosition: number, isMobile: boolean) {
		if (isMobile) {
			const itemBasePosition = index * this.scrollerWidth;
			const translateX = itemBasePosition - virtualXPosition;
			return `translateX(${translateX}px) translateY(0)`;
		}

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
			return `translateX(${(index - this._currentIndex) * 100}vw) translateY(0)`;
		}

		const direction = index - this._currentIndex;

		return `translateX(${direction * 50}vw) translateY(0)
				translateZ(${ratio * 10}px)
				rotateY(${(1 - ratio) * direction * 30}deg)
				scale(${ratio})`;
	}

	cancelAllAnimations() {
		this.currentAnimations.forEach((animation, index) => {
			if (animation) {
				const currentState = this.captureCurrentState(index);
				this.currentStates[index] = currentState;

				const item = this.items[index];
				if (item) {
					item.style.transform = currentState.transform;
					item.style.opacity = currentState.opacity;
				}

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
