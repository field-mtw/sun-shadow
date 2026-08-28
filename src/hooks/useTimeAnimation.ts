import { useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for animating shadow time playback throughout the day.
 * Uses requestAnimationFrame for smooth animation.
 */
export function useTimeAnimation(
  isPlaying: boolean,
  speed: number,
  currentTime: Date,
  sunrise: Date,
  sunset: Date,
  onTimeChange: (date: Date) => void
) {
  const requestRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);

  const animate = useCallback(
    (frameTime: number) => {
      if (lastFrameTimeRef.current !== null) {
        const deltaMs = frameTime - lastFrameTimeRef.current;
        // Each real millisecond advances simulation by speed * 60 seconds
        const advanceMs = deltaMs * speed * 60;
        const newTime = new Date(currentTime.getTime() + advanceMs);

        // If past sunset, loop back to sunrise
        if (newTime >= sunset) {
          onTimeChange(new Date(sunrise.getTime()));
        } else if (newTime <= sunrise) {
          onTimeChange(new Date(sunrise.getTime()));
        } else {
          onTimeChange(newTime);
        }
      }
      lastFrameTimeRef.current = frameTime;
      requestRef.current = requestAnimationFrame(animate);
    },
    [speed, currentTime, sunrise, sunset, onTimeChange]
  );

  useEffect(() => {
    if (!isPlaying) {
      lastFrameTimeRef.current = null;
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
      return;
    }

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
  }, [isPlaying, animate]);
}
