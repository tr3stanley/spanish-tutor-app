'use client';

import { useState, useEffect, useRef } from 'react';

interface ScrollingTitleProps {
  text: string;
  className?: string;
  speed?: number; // pixels per second
  pauseDuration?: number; // milliseconds to pause at each end
}

export default function ScrollingTitle({
  text,
  className = '',
  speed = 30,
  pauseDuration = 1000
}: ScrollingTitleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [animationDuration, setAnimationDuration] = useState(0);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const textWidth = textRef.current.scrollWidth;
        const overflowing = textWidth > containerWidth;

        setIsOverflowing(overflowing);

        if (overflowing) {
          // Calculate animation duration based on overflow distance and speed
          const overflowDistance = textWidth - containerWidth;
          const duration = (overflowDistance / speed) * 1000; // Convert to milliseconds
          setAnimationDuration(duration);
        }
      }
    };

    checkOverflow();

    // Recheck on window resize
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [text, speed]);

  if (!isOverflowing) {
    // If text fits, just show it normally
    return (
      <div ref={containerRef} className={`overflow-hidden ${className}`}>
        <div ref={textRef} className="whitespace-nowrap">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`overflow-hidden ${className}`}>
      <div
        ref={textRef}
        className="whitespace-nowrap animate-scroll-text"
        style={{
          '--scroll-distance': `${textRef.current?.scrollWidth || 0}px`,
          '--container-width': `${containerRef.current?.offsetWidth || 0}px`,
          '--animation-duration': `${animationDuration + pauseDuration * 2}ms`,
          '--pause-duration': `${pauseDuration}ms`,
        } as React.CSSProperties}
      >
        {text}
      </div>

      <style jsx>{`
        @keyframes scroll-text {
          0% {
            transform: translateX(0);
          }
          15% {
            transform: translateX(0);
          }
          85% {
            transform: translateX(calc(var(--container-width) - var(--scroll-distance)));
          }
          100% {
            transform: translateX(calc(var(--container-width) - var(--scroll-distance)));
          }
        }

        .animate-scroll-text {
          animation: scroll-text var(--animation-duration) infinite;
          animation-timing-function: ease-in-out;
        }

        /* Pause scrolling on hover */
        .animate-scroll-text:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}