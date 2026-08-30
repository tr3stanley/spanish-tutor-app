'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { offlineStorage } from '@/lib/offline-storage';
import { offlineCleanup } from '@/lib/offline-cleanup';

interface Transcript {
  id: number;
  text: string;
  start_time: number;
  end_time: number;
}

interface AudioPlayerProps {
  podcastId: number;
  audioSrc: string;
  transcript: Transcript[];
  title?: string;
  onTimeUpdate: (time: number) => void;
  onSeekTo: (time: number) => void;
  onExplanationRequest: (startTime: number, endTime: number) => Promise<string>;
}

export default function AudioPlayer({
  podcastId,
  audioSrc,
  transcript,
  title = `Episode ${podcastId}`,
  onTimeUpdate,
  onExplanationRequest
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translation, setTranslation] = useState('');
  const [isSeeking, setIsSeeking] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [liked, setLiked] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const savedPositionRef = useRef<number | null>(null);
  const lastSavedRef = useRef(0);
  const listenedSinceSaveRef = useRef(0);
  const markedListenedRef = useRef(false);

  // Offline storage states
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [offlineAudioUrl, setOfflineAudioUrl] = useState<string | null>(null);
  const [actualAudioSrc, setActualAudioSrc] = useState<string>('');

  // Determine final audio source (offline > proxy > direct)
  useEffect(() => {
    const checkOfflineStatus = async () => {
      try {
        const downloaded = await offlineStorage.isEpisodeDownloaded(podcastId);
        setIsDownloaded(downloaded);

        if (downloaded) {
          const offlineUrl = await offlineStorage.getOfflineAudioUrl(podcastId);
          setOfflineAudioUrl(offlineUrl);
          setActualAudioSrc(offlineUrl || audioSrc);
        } else {
          // Use proxy for Safari + GitHub URLs, direct for everything else
          const isSafari = typeof navigator !== 'undefined' && /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
          const proxiedSrc = isSafari && audioSrc.includes('github.com')
            ? `/api/audio-proxy-edge?url=${encodeURIComponent(audioSrc)}&t=${Date.now()}`
            : audioSrc;
          setActualAudioSrc(proxiedSrc);
        }
      } catch (error) {
        console.error('Failed to check offline status:', error);
        // Fallback to online source
        const isSafari = typeof navigator !== 'undefined' && /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
        const proxiedSrc = isSafari && audioSrc.includes('github.com')
          ? `/api/audio-proxy-edge?url=${encodeURIComponent(audioSrc)}&t=${Date.now()}`
          : audioSrc;
        setActualAudioSrc(proxiedSrc);
      }
    };

    checkOfflineStatus();
  }, [podcastId, audioSrc]);

  const saveProgress = useCallback(async (time: number, extra: Record<string, unknown> = {}) => {
    try {
      const listenedDelta = Math.round(listenedSinceSaveRef.current);
      listenedSinceSaveRef.current = 0;
      await fetch(`/api/podcasts/${podcastId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_seconds: Math.floor(time), listened_delta: listenedDelta, ...extra }),
      });
    } catch (e) {
      console.error('Failed to save progress:', e);
    }
  }, [podcastId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      console.log('timeupdate event:', { time, isSeeking, currentTimeState: currentTime });

      if (!isSeeking) {
        setCurrentTime(time);
        onTimeUpdate(time);
      }

      // Accumulate real listening time and checkpoint every 15s
      if (!audio.paused) {
        const delta = time - lastSavedRef.current;
        if (delta > 0 && delta < 5) listenedSinceSaveRef.current += delta;
        if (Math.abs(time - lastSavedRef.current) >= 15) {
          lastSavedRef.current = time;
          saveProgress(time);
        } else if (delta < 0 || delta >= 5) {
          lastSavedRef.current = time; // seeked; re-baseline without counting it
        }
      }

      // Finishing 90% counts as listened
      if (!markedListenedRef.current && audio.duration && time > audio.duration * 0.9) {
        markedListenedRef.current = true;
        saveProgress(time, { listened: true });
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      const pos = savedPositionRef.current;
      if (pos && pos > 10 && pos < audio.duration - 15) {
        audio.currentTime = pos;
        setCurrentTime(pos);
        lastSavedRef.current = pos;
        savedPositionRef.current = null;
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [onTimeUpdate, isSeeking, saveProgress]);

  // Load saved position and liked state for this episode
  useEffect(() => {
    let cancelled = false;
    markedListenedRef.current = false;
    savedPositionRef.current = null;
    (async () => {
      try {
        const res = await fetch(`/api/podcasts/${podcastId}/progress`);
        const data = await res.json();
        if (cancelled) return;
        setLiked(!!data.liked);
        const pos = Number(data.position_seconds || 0);
        // Ignore a position at the very end — that's a finished episode, not a bookmark.
        if (pos > 10) {
          savedPositionRef.current = pos;
          const audio = audioRef.current;
          if (audio && audio.readyState >= 1 && audio.duration && pos < audio.duration - 15) {
            audio.currentTime = pos;
            setCurrentTime(pos);
          }
        }
      } catch (e) {
        console.error('Failed to load playback progress:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [podcastId]);



  // Save on the way out so a closed tab doesn't lose the position
  useEffect(() => {
    const flush = () => {
      const audio = audioRef.current;
      if (audio && audio.currentTime > 5) {
        navigator.sendBeacon?.(
          `/api/podcasts/${podcastId}/progress`,
          new Blob([JSON.stringify({ position_seconds: Math.floor(audio.currentTime) })], { type: 'application/json' })
        );
      }
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [podcastId]);

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    try {
      await fetch(`/api/podcasts/${podcastId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liked: next }),
      });
    } catch (e) {
      console.error('Failed to save like:', e);
      setLiked(!next);
    }
  };

  // Update playback speed when it changes
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Close speed menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSpeedMenu && !(event.target as Element).closest('.speed-control')) {
        setShowSpeedMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSpeedMenu]);

  // Safari debugging and audio loading
  useEffect(() => {
    if (audioRef.current && actualAudioSrc && actualAudioSrc !== '') {
      const audio = audioRef.current;
      const userIsSafari = typeof navigator !== 'undefined' && /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

      const handleLoadStart = () => console.log('Audio Debug: Load start');
      const handleLoadedData = () => console.log('Audio Debug: Loaded data');
      const handleCanPlay = () => console.log('Audio Debug: Can play');
      const handleError = (e: Event) => {
        const target = e.target as HTMLAudioElement;
        const errorInfo = {
          errorCode: target.error?.code || 'unknown',
          errorMessage: target.error?.message || 'No error message',
          currentSrc: target.src || 'empty',
          originalSrc: audioSrc || 'empty',
          actualSrc: actualAudioSrc || 'empty',
          isOffline: isDownloaded,
          networkState: target.networkState,
          readyState: target.readyState,
          hasActualSrc: Boolean(actualAudioSrc),
          mediaError: target.error ? {
            code: target.error.code,
            message: target.error.message
          } : null
        };

        // Only log if we have a meaningful source to debug
        if (actualAudioSrc) {
          console.error('Audio Debug: Load error', errorInfo);
        }
      };
      const handleAbort = () => console.log('Audio Debug: Load aborted');
      const handleStalled = () => console.log('Audio Debug: Load stalled');
      const handleSuspend = () => console.log('Audio Debug: Load suspended');

      audio.addEventListener('loadstart', handleLoadStart);
      audio.addEventListener('loadeddata', handleLoadedData);
      audio.addEventListener('canplay', handleCanPlay);
      audio.addEventListener('error', handleError);
      audio.addEventListener('abort', handleAbort);
      audio.addEventListener('stalled', handleStalled);
      audio.addEventListener('suspend', handleSuspend);

      console.log('Audio Debug: Loading audio', {
        originalSrc: audioSrc,
        actualSrc: actualAudioSrc,
        isOffline: isDownloaded,
        userAgent: navigator.userAgent,
        isSafari: userIsSafari
      });

      audio.load();

      return () => {
        audio.removeEventListener('loadstart', handleLoadStart);
        audio.removeEventListener('loadeddata', handleLoadedData);
        audio.removeEventListener('canplay', handleCanPlay);
        audio.removeEventListener('error', handleError);
        audio.removeEventListener('abort', handleAbort);
        audio.removeEventListener('stalled', handleStalled);
        audio.removeEventListener('suspend', handleSuspend);
      };
    }
  }, [actualAudioSrc, audioSrc, isDownloaded]);

  // Download episode for offline use
  const handleDownload = async () => {
    if (isDownloading || isDownloaded) return;

    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      const success = await offlineStorage.downloadEpisode(
        podcastId,
        title,
        audioSrc,
        (progress) => setDownloadProgress(progress)
      );

      if (success) {
        setIsDownloaded(true);
        // Update audio source to use offline version
        const offlineUrl = await offlineStorage.getOfflineAudioUrl(podcastId);
        if (offlineUrl) {
          setOfflineAudioUrl(offlineUrl);
          setActualAudioSrc(offlineUrl);
        }
      }
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  // Remove offline episode
  const handleRemoveOffline = async () => {
    try {
      await offlineStorage.removeEpisode(podcastId);
      setIsDownloaded(false);
      setOfflineAudioUrl(null);

      // Reset to online source
      const isSafari = typeof navigator !== 'undefined' && /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
      const proxiedSrc = isSafari && audioSrc.includes('github.com')
        ? `/api/audio-proxy-edge?url=${encodeURIComponent(audioSrc)}&t=${Date.now()}`
        : audioSrc;
      setActualAudioSrc(proxiedSrc);
    } catch (error) {
      console.error('Failed to remove offline episode:', error);
    }
  };

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        console.log('Safari Debug: Attempting to play audio', {
          readyState: audio.readyState,
          networkState: audio.networkState,
          src: audio.src,
          canPlayType: audio.canPlayType('audio/mpeg')
        });

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          await playPromise;
          console.log('Safari Debug: Play promise resolved successfully');
        }
        setIsPlaying(true);
      } catch (error) {
        console.error('Safari Debug: Play failed', {
          error,
          message: (error as Error).message,
          name: (error as Error).name,
          readyState: audio.readyState,
          networkState: audio.networkState
        });
        setIsPlaying(false);
      }
    }
  };

  const progressPercent = duration
    ? Math.min(100, Math.max(0, ((scrubbing ? scrubTime : currentTime) / duration) * 100))
    : 0;

  const seekTo = (time: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const clamped = Math.min(Math.max(0, time), duration);
    setCurrentTime(clamped);
    lastSavedRef.current = clamped;
    audio.currentTime = clamped;
    onTimeUpdate(clamped);
    saveProgress(clamped);
  };

  const timeFromPointer = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !duration) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  // Preview while dragging, commit on release — seeking on every move makes
  // mobile playback stutter and fights the browser's buffering.
  const handleScrubStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setScrubbing(true);
    setScrubTime(timeFromPointer(e.clientX));
  };

  const handleScrubMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    setScrubTime(timeFromPointer(e.clientX));
  };

  const handleScrubEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    const target = timeFromPointer(e.clientX);
    setScrubbing(false);
    seekTo(target);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolume = parseFloat(e.target.value);
    audio.volume = newVolume;
    setVolume(newVolume);
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  };

  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];

  const handleExplainLast30Seconds = async () => {
    const endTime = currentTime;
    const startTime = Math.max(0, currentTime - 30);

    setIsExplaining(true);
    setShowExplanation(false);

    try {
      const explanationText = await onExplanationRequest(startTime, endTime);
      setExplanation(explanationText);
      setShowExplanation(true);
    } catch (error) {
      console.error('Error getting explanation:', error);
      setExplanation('Sorry, there was an error generating the explanation. Please try again.');
      setShowExplanation(true);
    } finally {
      setIsExplaining(false);
    }
  };

  const nearestSegment = () => {
    if (!transcript || transcript.length === 0) return null;
    let best = transcript[0];
    let bestGap = Infinity;
    for (const seg of transcript) {
      const gap = currentTime < seg.start_time
        ? seg.start_time - currentTime
        : (currentTime > seg.end_time ? currentTime - seg.end_time : 0);
      if (gap < bestGap) { bestGap = gap; best = seg; }
    }
    return bestGap <= 30 ? best : null;
  };

  const handleTranslateCurrentSegment = async () => {
    // Whisper leaves gaps between segments, so exact-time lookup often finds
    // nothing. Fall back to the nearest line rather than silently doing nothing.
    const currentSegment = getCurrentSegment() || nearestSegment();
    if (!currentSegment) {
      setTranslation('No transcript line to translate at this point in the episode.');
      setShowTranslation(true);
      return;
    }

    setIsTranslating(true);
    // Keep any previous translation on screen until the new one arrives —
    // clearing it made the panel collapse and re-expand on every use.

    try {
      const response = await fetch(`/api/podcasts/${podcastId}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: currentSegment.text }),
      });

      const result = await response.json();

      if (response.ok) {
        setTranslation(result.translation);
        setShowTranslation(true);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error getting translation:', error);
      setTranslation('Sorry, there was an error generating the translation. Please try again.');
      setShowTranslation(true);
    } finally {
      setIsTranslating(false);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getCurrentSegment = () => {
    return transcript.find(
      segment => currentTime >= segment.start_time && currentTime <= segment.end_time
    );
  };

  const currentSegment = getCurrentSegment();

  return (
    <div className="bg-white/5 rounded-lg p-6 border border-white/10">
<audio
        ref={audioRef}
        src={actualAudioSrc || undefined}
        preload="metadata"
        playsInline
      />

      {/* Offline Download Controls */}
      <div className="mb-4 flex items-center justify-between p-3 glass-card rounded-lg">
        <div className="flex items-center space-x-2">
          {isDownloaded ? (
            <>
              <div className="w-3 h-3 bg-green-400 rounded-full"></div>
              <span className="text-sm text-green-700 font-medium">Downloaded for offline use</span>
            </>
          ) : (
            <>
              <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
              <span className="text-sm text-gray-300">Stream online</span>
            </>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {isDownloading ? (
            <div className="flex items-center space-x-2">
              <div className="w-32 bg-white/10 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-purple-400 to-blue-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                ></div>
              </div>
              <span className="text-xs text-gray-300">{Math.round(downloadProgress)}%</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              {isDownloaded ? (
                <button
                  onClick={handleRemoveOffline}
                  className="px-3 py-1 text-xs bg-red-400/20 text-red-300 rounded hover:bg-red-400/30 transition-all"
                >
                  Remove
                </button>
              ) : (
                <button
                  onClick={handleDownload}
                  className="cosmic-button px-3 py-1 text-xs rounded transition-all"
                >
                  Download
                </button>
              )}
              <button
                onClick={toggleLike}
                title={liked ? 'Remove from liked' : 'Like this episode'}
                aria-pressed={liked}
                className={`p-2 rounded-full transition-all ${
                  liked ? 'bg-pink-500/25 text-pink-300' : 'bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
                }`}
              >
                <svg className="w-5 h-5" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>

              <button
                onClick={() => offlineCleanup.markEpisodeAsListened(podcastId)}
                className="px-3 py-1 text-xs bg-green-400/20 text-green-300 rounded hover:bg-green-400/30 transition-all"
                title="Mark as listened (auto-removes download after 24h)"
              >
                ✓ Listened
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Current Segment Display */}
      {currentSegment && (
        <div className="mb-4 p-4 bg-blue-400/10 rounded-lg border-l-4 border-blue-400">
          <p className="text-white italic">&quot;{currentSegment.text}&quot;</p>
          <div className="mt-2 flex justify-between items-center">
            <span className="text-xs text-gray-300">
              {formatTime(currentSegment.start_time)} - {formatTime(currentSegment.end_time)}
            </span>
            <div className="flex space-x-2">
              <button
                onClick={handleExplainLast30Seconds}
                disabled={isExplaining}
                className="flex items-center px-3 py-1 text-xs font-medium text-blue-300 bg-blue-400/20 rounded-md hover:bg-blue-400/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isExplaining ? (
                  <>
                    <svg className="animate-spin w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Explain
                  </>
                )}
              </button>
              <button
                onClick={handleTranslateCurrentSegment}
                disabled={isTranslating}
                className="flex items-center px-3 py-1 text-xs font-medium text-purple-100 bg-purple-500/30 border border-purple-400/40 rounded-md hover:bg-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isTranslating ? (
                  <>
                    <svg className="animate-spin w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Translating...
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                    </svg>
                    Translate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player Controls — kept ABOVE the explanation/translation panels so
          those can appear and disappear without displacing the scrub bar. */}
      <div className="space-y-4">
        {/* Progress Bar — pointer-driven so it drags properly on touch.
            The hit area is padded well beyond the visible track. */}
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-300 min-w-[44px] tabular-nums">
            {formatTime(scrubbing ? scrubTime : currentTime)}
          </span>
          <div
            ref={trackRef}
            onPointerDown={handleScrubStart}
            onPointerMove={handleScrubMove}
            onPointerUp={handleScrubEnd}
            onPointerCancel={handleScrubEnd}
            className="relative flex-1 py-4 -my-4 cursor-pointer touch-none select-none"
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.floor(duration) || 0}
            aria-valuenow={Math.floor(scrubbing ? scrubTime : currentTime)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              e.preventDefault();
              seekTo((scrubbing ? scrubTime : currentTime) + (e.key === 'ArrowRight' ? 5 : -5));
            }}
          >
            <div className={`relative w-full rounded-full bg-white/15 overflow-hidden transition-all ${scrubbing ? 'h-3' : 'h-2'}`}>
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-400 to-blue-400 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white shadow-lg transition-all ${
                scrubbing ? 'w-6 h-6 ring-4 ring-purple-400/40' : 'w-4 h-4'
              }`}
              style={{ left: `${progressPercent}%` }}
            />
          </div>
          <span className="text-sm text-gray-300 min-w-[44px] tabular-nums">
            {formatTime(duration)}
          </span>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-center space-x-4">
          <button
            onClick={() => {
              const audio = audioRef.current;
              if (audio) {
                const newTime = Math.max(0, currentTime - 15);
                console.log('⏪ Skip back button:', { from: currentTime, to: newTime });
                setCurrentTime(newTime);

                const handleSeeked = () => {
                  console.log('⏪ Skip back seeked:', { finalTime: audio.currentTime });
                  setIsSeeking(false);
                  audio.removeEventListener('seeked', handleSeeked);
                };

                setIsSeeking(true);
                audio.addEventListener('seeked', handleSeeked);
                audio.currentTime = newTime;
                onTimeUpdate(newTime);
              }
            }}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all text-gray-300 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
            </svg>
          </button>

          <button
            onClick={togglePlayPause}
            className="cosmic-button p-3 rounded-full transition-all"
          >
            {isPlaying ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => {
              const audio = audioRef.current;
              if (audio) {
                const newTime = Math.min(duration, currentTime + 15);
                setCurrentTime(newTime);

                const handleSeeked = () => {
                  setIsSeeking(false);
                  audio.removeEventListener('seeked', handleSeeked);
                };

                setIsSeeking(true);
                audio.addEventListener('seeked', handleSeeked);
                audio.currentTime = newTime;
                onTimeUpdate(newTime);
              }
            }}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all text-gray-300 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
            </svg>
          </button>
        </div>

        {/* Volume and Speed Controls */}
        <div className="flex items-center justify-center space-x-6">
          {/* Volume Control */}
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M6 10H4a1 1 0 00-1 1v2a1 1 0 001 1h2l3.5 3.5a1 1 0 001.6-.8V6.3a1 1 0 00-1.6-.8L6 10z" />
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className="w-20 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Speed Control */}
          <div className="relative speed-control">
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className="flex items-center space-x-1 px-3 py-1 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">{playbackSpeed}x</span>
            </button>

            {/* Speed Menu */}
            {showSpeedMenu && (
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 glass-card rounded-lg shadow-lg py-1 z-10">
                {speedOptions.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => handleSpeedChange(speed)}
                    className={`block w-full px-4 py-2 text-sm text-left text-gray-300 hover:text-white hover:bg-white/10 transition-all ${
                      speed === playbackSpeed ? 'bg-purple-400/20 text-purple-300 font-medium' : 'text-gray-300'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* AI Explanation Display */}
      {showExplanation && (
        <div className="mb-4 p-4 bg-green-400/10 rounded-lg border-l-4 border-green-400">
          <div className="flex justify-between items-start mb-2">
            <h4 className="font-medium text-green-300">AI Explanation</h4>
            <button
              onClick={() => setShowExplanation(false)}
              className="text-green-300 hover:text-green-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="text-sm text-green-100 whitespace-pre-wrap">{explanation}</div>
        </div>
      )}

      {/* Translation Display */}
      {showTranslation && (
        <div className="mb-4 p-4 bg-purple-400/10 rounded-lg border-l-4 border-purple-400">
          <div className="flex justify-between items-start mb-2">
            <h4 className="font-medium text-purple-300">Translation</h4>
            <button
              onClick={() => setShowTranslation(false)}
              className="text-purple-300 hover:text-purple-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="text-sm text-purple-100 whitespace-pre-wrap">{translation}</div>
        </div>
      )}
    </div>

  );
}