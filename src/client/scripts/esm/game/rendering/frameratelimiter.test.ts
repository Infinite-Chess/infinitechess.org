import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import frameratelimiter from './frameratelimiter.js';
import gameloader from '../chess/gameloader.js';

// Mock gameloader
vi.mock('../chess/gameloader.js', () => ({
	default: {
		areInAGame: vi.fn(),
	},
}));

describe('frameratelimiter', () => {
	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks();
		// Mock requestAnimationFrame
		vi.stubGlobal(
			'requestAnimationFrame',
			vi.fn((cb: FrameRequestCallback) => {
				// Execute immediately for testing purposes
				cb(performance.now());
				return 0;
			}),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('requestFrame', () => {
		it('should call requestAnimationFrame immediately when in a game', () => {
			// Mock being in a game
			vi.mocked(gameloader.areInAGame).mockReturnValue(true);

			const callback = vi.fn();
			frameratelimiter.requestFrame(callback);

			// Should call requestAnimationFrame
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
			// Callback should be called
			expect(callback).toHaveBeenCalled();
		});

		it('should throttle when not in a game', () => {
			// Mock not being in a game
			vi.mocked(gameloader.areInAGame).mockReturnValue(false);

			const callback = vi.fn();

			// Mock requestAnimationFrame to track calls
			let rafCallback: FrameRequestCallback | null = null;
			vi.stubGlobal(
				'requestAnimationFrame',
				vi.fn((cb: FrameRequestCallback) => {
					rafCallback = cb;
					return 0;
				}),
			);

			frameratelimiter.requestFrame(callback);

			// Should call requestAnimationFrame initially
			expect(requestAnimationFrame).toHaveBeenCalled();

			// The callback shouldn't be called immediately (throttled)
			// We'll need to manually invoke the RAF callback with proper timestamps
			if (rafCallback) {
				// First call with timestamp 0
				rafCallback(0);

				// If less than ~33ms has passed, should schedule another check
				// If more than ~33ms has passed, should execute
				rafCallback(50); // 50ms > 33ms threshold for 30fps
			}

			// After sufficient time, callback should be executed
			expect(callback).toHaveBeenCalled();
		});

		it('should allow multiple frames when in a game without throttling', () => {
			// Mock being in a game
			vi.mocked(gameloader.areInAGame).mockReturnValue(true);

			const callback = vi.fn();

			// Call multiple times rapidly
			frameratelimiter.requestFrame(callback);
			frameratelimiter.requestFrame(callback);
			frameratelimiter.requestFrame(callback);

			// All should be scheduled immediately without throttling
			expect(requestAnimationFrame).toHaveBeenCalledTimes(3);
		});
	});
});
