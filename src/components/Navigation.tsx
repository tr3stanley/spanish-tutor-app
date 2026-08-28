'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import BottomNav from '@/components/BottomNav';

interface NavigationProps {
  onUploadClick?: () => void;
}

export default function Navigation({ onUploadClick }: NavigationProps) {
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    getBrowserSupabase().auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user?.email ?? null);
    });
  }, []);

  const signOut = async () => {
    await getBrowserSupabase().auth.signOut();
    window.location.href = '/login';
  };

  return (
    <nav className="glass-card border-b border-white/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Brand */}
          <Link href="/" className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-blue-400 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Podcast Tutor</h1>
                <p className="text-xs text-gray-300 -mt-1">Spanish & Russian</p>
              </div>
            </div>
          </Link>

          {/* Navigation Items — mobile uses the bottom tab bar instead */}
          <div className="hidden md:flex items-center space-x-4">
            <Link
              href="/tutor"
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                pathname === '/tutor' ? 'text-white bg-white/10' : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>🎓</span>
              <span className="font-medium">Instructor</span>
            </Link>
            <Link
              href="/review"
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                pathname === '/review' ? 'text-white bg-white/10' : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>🃏</span>
              <span className="font-medium">Review</span>
            </Link>
            <Link
              href="/music"
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                pathname === '/music' ? 'text-white bg-white/10' : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>🎵</span>
              <span className="font-medium">Music</span>
            </Link>
            {!isHomePage && (
              <Link
                href="/"
                className="flex items-center space-x-2 px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span className="font-medium">Home</span>
              </Link>
            )}

            {/* Upload Button */}
            <button
              onClick={onUploadClick}
              className="cosmic-button flex items-center space-x-2 px-4 py-2 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-purple-400/50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="font-medium">Upload Podcast</span>
            </button>

            {userEmail && (
              <button
                onClick={signOut}
                title={`Signed in as ${userEmail}`}
                className="flex items-center space-x-2 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="font-medium text-sm">Sign out</span>
              </button>
            )}
          </div>
        </div>
      </div>
      <BottomNav onUploadClick={onUploadClick} />
    </nav>
  );
}