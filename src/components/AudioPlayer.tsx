'use client';

import { useState, useRef, useEffect } from 'react';

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
  onTimeUpdate: (time: number) => void;
  onSeekTo: (time: number) => void;
  onExplanationRequest: (startTime: number, endTime: number) => Promise<string>;
}

export default function AudioPlayer({
  audioSrc,
  transcript,
  onTimeUpdate,
  onExplanationRequest
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isExplaining, setIsExplaining] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [isSeeking, setIsSeeking] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      console.log('timeupdate event:', { time, isSeeking, currentTimeState: currentTime });

      if (!isSeeking) {
        setCurrentTime(time);
        onTimeUpdate(time);
      } else {
        console.log('Blocked timeupdate because isSeeking is true');
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
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
  }, [onTimeUpdate, isSeeking]);

  // Remove this useEffect - it was causing the audio to loop

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = parseFloat(e.target.value);
    console.log('🎯 handleSeek called:', { newTime, duration });

    // Basic validation - only check if within duration
    if (newTime < 0 || newTime > duration) {
      console.log('🚫 Seek position outside valid range:', newTime);
      return;
    }

    setCurrentTime(newTime);

    // Use seeked event to know when seeking is complete
    const handleSeeked = () => {
      console.log('🎯 seeked event fired:', { finalTime: audio.currentTime });
      setIsSeeking(false);
      audio.removeEventListener('seeked', handleSeeked);
    };

    const handleSeeking = () => {
      console.log('🎯 seeking event fired');
    };

    console.log('🎯 Setting isSeeking to true');
    setIsSeeking(true);
    audio.addEventListener('seeked', handleSeeked);
    audio.addEventListener('seeking', handleSeeking);

    // Set the new time directly - no buffering checks
    audio.currentTime = newTime;
    console.log('🎯 Set audio.currentTime to:', newTime, 'actual value:', audio.currentTime);

    onTimeUpdate(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolume = parseFloat(e.target.value);
    audio.volume = newVolume;
    setVolume(newVolume);
  };

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
    <div className="bg-gray-50 rounded-lg p-6">
      <audio ref={audioRef} src={audioSrc} preload="auto" />

      {/* Current Segment Display */}
      {currentSegment && (
        <div className="mb-4 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
          <p className="text-gray-800 italic">&quot;{currentSegment.text}&quot;</p>
          <div className="mt-2 flex justify-between items-center">
            <span className="text-xs text-gray-500">
              {formatTime(currentSegment.start_time)} - {formatTime(currentSegment.end_time)}
            </span>
            <button
              onClick={handleExplainLast30Seconds}
              disabled={isExplaining}
              className="flex items-center px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
          </div>
        </div>
      )}

      {/* AI Explanation Display */}
      {showExplanation && (
        <div className="mb-4 p-4 bg-green-50 rounded-lg border-l-4 border-green-500">
          <div className="flex justify-between items-start mb-2">
            <h4 className="font-medium text-green-800">AI Explanation</h4>
            <button
              onClick={() => setShowExplanation(false)}
              className="text-green-600 hover:text-green-800"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="text-sm text-green-700 whitespace-pre-wrap">{explanation}</div>
        </div>
      )}

      {/* Player Controls */}
      <div className="space-y-4">
        {/* Progress Bar */}
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500 min-w-[40px]">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
          />
          <span className="text-sm text-gray-500 min-w-[40px]">
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
            className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
            </svg>
          </button>

          <button
            onClick={togglePlayPause}
            className="p-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
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
            className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
            </svg>
          </button>
        </div>

        {/* Volume Control */}
        <div className="flex items-center justify-center space-x-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M6 10H4a1 1 0 00-1 1v2a1 1 0 001 1h2l3.5 3.5a1 1 0 001.6-.8V6.3a1 1 0 00-1.6-.8L6 10z" />
          </svg>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={handleVolumeChange}
            className="w-20 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}