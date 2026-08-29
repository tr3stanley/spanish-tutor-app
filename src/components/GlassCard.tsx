'use client';

import { CSSProperties, ReactNode, forwardRef } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  style?: CSSProperties;
}

// forwardRef so callers can measure it — the tutor chat sizes itself against
// the visual viewport to keep its composer above the on-screen keyboard.
const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { children, className = '', hover = true, style },
  ref
) {
  return (
    <div
      ref={ref}
      style={style}
      className={`
        glass-card
        ${hover ? 'hover:glass-card-hover' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
});

export default GlassCard;
