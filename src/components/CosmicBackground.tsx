'use client';

import { useEffect, useRef } from 'react';

interface CosmicBackgroundProps {
  particleCount?: number;
  className?: string;
}

export default function CosmicBackground({
  particleCount = 20,
  className = ''
}: CosmicBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear existing particles
    container.innerHTML = '';

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'cosmic-particle';

      const size = Math.random() * 3 + 1;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;

      const hue = Math.floor(Math.random() * 60) + 240; // Purple to blue range
      particle.style.background = `hsla(${hue}, 80%, 60%, ${Math.random() * 0.3 + 0.1})`;

      const startX = Math.random() * 100;
      const startY = Math.random() * 100;
      particle.style.left = `${startX}%`;
      particle.style.top = `${startY}%`;

      const tx = (Math.random() - 0.5) * 150;
      const ty = (Math.random() - 0.5) * 150;
      particle.style.setProperty('--tx', `${tx}px`);
      particle.style.setProperty('--ty', `${ty}px`);

      const duration = Math.random() * 20 + 10;
      particle.style.animationDuration = `${duration}s`;
      particle.style.animationDelay = `${Math.random() * 5}s`;

      container.appendChild(particle);
    }
  }, [particleCount]);

  return (
    <div
      ref={containerRef}
      className={`cosmic-background ${className}`}
    />
  );
}