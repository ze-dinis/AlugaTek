// React Native provides these globals but ships no type declarations for them,
// and the project's tsconfig deliberately excludes the DOM lib.
declare function requestIdleCallback(
  callback: (deadline: {timeRemaining: () => number; didTimeout: boolean}) => void,
  options?: {timeout: number},
): number;

declare function cancelIdleCallback(handle: number): void;
