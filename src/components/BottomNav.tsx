'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getBrowserSupabase } from '@/lib/supabase-browser';

interface BottomNavProps {
  onUploadClick?: () => void;
}

const TABS = [
  {
    href: '/',
    label: 'Library',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    ),
  },
  {
    href: '/tutor',
    label: 'Instructor',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
    ),
  },
  {
    href: '/review',
    label: 'Review',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    ),
  },
  {
    href: '/music',
    label: 'Music',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
    ),
  },
];

// Mobile-only tab bar. The daily loop lives here; occasional actions (upload,
// sign out) go in the More sheet so they don't take thumb space.
export default function BottomNav({ onUploadClick }: BottomNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    getBrowserSupabase().auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
    });
  }, []);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const signOut = async () => {
    await getBrowserSupabase().auth.signOut();
    window.location.href = '/login';
  };

  return (
    <>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute left-0 right-0 bottom-0 glass-card border-t border-white/20 rounded-t-2xl p-4 space-y-2"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-white/25 rounded-full mx-auto mb-3" />
            {onUploadClick && (
              <button
                onClick={() => { setMoreOpen(false); onUploadClick(); }}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-white bg-white/10 hover:bg-white/20 transition-colors"
              >
                <span className="text-lg">＋</span>
                <span className="font-medium">Upload Podcast</span>
              </button>
            )}
            <button
              onClick={signOut}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-white/10 transition-colors"
            >
              <span className="text-lg">⎋</span>
              <span className="font-medium">Sign out</span>
            </button>
            {email && <p className="text-xs text-gray-500 text-center pt-1">{email}</p>}
          </div>
        </div>
      )}

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-card border-t border-white/20"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch">
          {TABS.map(tab => {
            const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center justify-center py-2 transition-colors ${
                  active ? 'text-purple-300' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">{tab.icon}</svg>
                <span className="text-[10px] mt-0.5 font-medium">{tab.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(o => !o)}
            aria-label="More options"
            className={`flex-1 flex flex-col items-center justify-center py-2 transition-colors ${
              moreOpen ? 'text-purple-300' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="text-[10px] mt-0.5 font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
