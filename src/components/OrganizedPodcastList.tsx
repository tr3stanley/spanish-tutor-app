'use client';

import Link from 'next/link';
import { useState, useMemo } from 'react';

interface Podcast {
  id: number;
  title: string;
  filename: string;
  language: string;
  created_at: string;
  processed_at?: string;
  lesson_generated: boolean;
  has_lesson: boolean;
}

interface PodcastGroup {
  seriesName: string;
  podcasts: Podcast[];
  language: string;
}

interface OrganizedPodcastListProps {
  podcasts: Podcast[];
  onPodcastDeleted: () => void;
}

export default function OrganizedPodcastList({ podcasts, onPodcastDeleted }: OrganizedPodcastListProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Function to find the longest common substring anywhere in both strings
  const findLongestCommonSubstring = (str1: string, str2: string): string => {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    let longest = '';

    // Check all possible substrings in s1
    for (let i = 0; i < s1.length; i++) {
      for (let j = i + 7; j <= s1.length; j++) { // Start with minimum 7 characters
        const substring = s1.slice(i, j);
        if (s2.includes(substring) && substring.length > longest.length) {
          longest = substring;
        }
      }
    }

    return longest;
  };

  // Function to find all common words/segments that could be meaningful series names
  const findMeaningfulCommonParts = (titles: string[]): string[] => {
    if (titles.length < 2) return [];

    const cleanedTitles = titles.map(title => cleanTitle(title).toLowerCase());
    const commonParts: string[] = [];

    // Find common substrings between all pairs
    for (let i = 0; i < cleanedTitles.length; i++) {
      for (let j = i + 1; j < cleanedTitles.length; j++) {
        const commonSubstring = findLongestCommonSubstring(cleanedTitles[i], cleanedTitles[j]);
        if (commonSubstring.length >= 7) {
          commonParts.push(commonSubstring);
        }
      }
    }

    // Return the longest common part, or first one if multiple
    if (commonParts.length > 0) {
      return commonParts.sort((a, b) => b.length - a.length);
    }

    return [];
  };

  // Function to clean title for better matching
  const cleanTitle = (title: string): string => {
    return title
      // Remove file extensions
      .replace(/\.(mp3|wav|m4a|aac|ogg|flac)$/i, '')
      // Remove extra whitespace and normalize
      .trim()
      .replace(/\s+/g, ' ');
  };

  // Function to find the best series name from a group of titles
  const extractSeriesName = (titles: string[]): string => {
    if (titles.length === 1) {
      return cleanTitle(titles[0]);
    }

    // Find meaningful common parts
    const commonParts = findMeaningfulCommonParts(titles);

    if (commonParts.length > 0) {
      // Use the longest common part as series name
      let seriesName = commonParts[0]
        .replace(/^[-–—_#\s]+/, '') // Remove leading separators
        .replace(/[-–—_#\s]+$/, '') // Remove trailing separators
        .replace(/[-–—_#]/g, ' ') // Convert separators to spaces
        .trim();

      // Capitalize first letter
      return seriesName.charAt(0).toUpperCase() + seriesName.slice(1);
    }

    // Fallback to first title if no good common substring found
    return cleanTitle(titles[0]);
  };

  // Group podcasts by similar names
  const groupedPodcasts = useMemo(() => {
    const groups: PodcastGroup[] = [];

    // For each podcast, try to find an existing group it belongs to
    podcasts.forEach(podcast => {
      const cleanedTitle = cleanTitle(podcast.title);
      let foundGroup = false;

      // Check if this podcast belongs to any existing group
      for (const group of groups) {
        if (group.language !== podcast.language) continue;

        // Check if any podcast in this group has 7+ common letters with current podcast
        const hasCommonSubstring = group.podcasts.some(existingPodcast => {
          const existingTitle = cleanTitle(existingPodcast.title);
          const commonSubstring = findLongestCommonSubstring(existingTitle, cleanedTitle);
          return commonSubstring.length >= 7;
        });

        if (hasCommonSubstring) {
          group.podcasts.push(podcast);
          // Update series name with all titles in the group
          const allTitles = group.podcasts.map(p => p.title);
          group.seriesName = extractSeriesName(allTitles);
          foundGroup = true;
          break;
        }
      }

      // If no existing group found, create a new one
      if (!foundGroup) {
        groups.push({
          seriesName: cleanedTitle,
          podcasts: [podcast],
          language: podcast.language
        });
      }
    });

    // Sort podcasts within each group by creation date (newest first)
    groups.forEach(group => {
      group.podcasts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });

    // Sort groups by most recent episode
    return groups.sort((a, b) => {
      const latestA = new Date(a.podcasts[0].created_at).getTime();
      const latestB = new Date(b.podcasts[0].created_at).getTime();
      return latestB - latestA;
    });
  }, [podcasts]);

  const handleDelete = async (podcastId: number) => {
    if (!confirm('Are you sure you want to delete this podcast? This action cannot be undone.')) {
      return;
    }

    setDeletingId(podcastId);
    try {
      const response = await fetch(`/api/podcasts/${podcastId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onPodcastDeleted();
      } else {
        const error = await response.json();
        alert(`Failed to delete podcast: ${error.error}`);
      }
    } catch (error) {
      alert('Failed to delete podcast. Please try again.');
      console.error('Delete error:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const toggleGroup = (groupKey: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    setExpandedGroups(newExpanded);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusIcon = (podcast: Podcast) => {
    if (podcast.lesson_generated && podcast.has_lesson) {
      return (
        <div className="flex items-center text-green-600">
          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="text-xs">Ready</span>
        </div>
      );
    }

    if (podcast.processed_at && !podcast.lesson_generated) {
      return (
        <div className="flex items-center text-red-600">
          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span className="text-xs">Failed</span>
        </div>
      );
    }

    return (
      <div className="flex items-center text-yellow-600">
        <svg className="animate-spin w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="text-xs">Processing</span>
      </div>
    );
  };

  const getLanguageFlag = (language: string) => {
    return language === 'spanish' ? '🇪🇸' : '🇷🇺';
  };

  if (podcasts.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="mx-auto h-24 w-24 text-gray-300 mb-6">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No podcasts yet</h3>
        <p className="text-gray-500 mb-6">Upload your first Spanish or Russian podcast to get started with AI-powered language learning!</p>
        <div className="flex items-center justify-center space-x-8 text-sm text-gray-400">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Fast transcription</span>
          </div>
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span>AI lessons</span>
          </div>
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span>Smart tutor</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groupedPodcasts.map((group, index) => {
        const groupKey = `${group.seriesName}-${group.language}-${index}`;
        const isExpanded = expandedGroups.has(groupKey);
        const latestEpisode = group.podcasts[0];
        const episodeCount = group.podcasts.length;

        return (
          <div key={groupKey} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Group Header */}
            <div
              className="p-6 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleGroup(groupKey)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <span className="text-2xl">{getLanguageFlag(group.language)}</span>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {group.seriesName}
                    </h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span>{episodeCount} episode{episodeCount > 1 ? 's' : ''}</span>
                      <span>•</span>
                      <span>Latest: {formatDate(latestEpisode.created_at)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  {getStatusIcon(latestEpisode)}
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Episodes List */}
            {isExpanded && (
              <div className="divide-y divide-gray-100">
                {group.podcasts.map((podcast) => (
                  <div key={podcast.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-gray-900 truncate mb-1">
                          {podcast.title}
                        </h4>
                        <div className="flex items-center space-x-3 text-xs text-gray-500">
                          <span>{formatDate(podcast.created_at)}</span>
                          {getStatusIcon(podcast)}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        {podcast.lesson_generated && podcast.has_lesson && (
                          <Link
                            href={`/podcast/${podcast.id}`}
                            className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full hover:bg-blue-200 transition-colors"
                          >
                            Study
                            <svg className="ml-1 w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        )}
                        <button
                          onClick={() => handleDelete(podcast.id)}
                          disabled={deletingId === podcast.id}
                          className="inline-flex items-center p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Delete episode"
                        >
                          {deletingId === podcast.id ? (
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}