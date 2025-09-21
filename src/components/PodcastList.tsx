'use client';

import Link from 'next/link';
import { useState } from 'react';

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

interface PodcastListProps {
  podcasts: Podcast[];
  onPodcastDeleted: () => void;
}

export default function PodcastList({ podcasts, onPodcastDeleted }: PodcastListProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null);

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

  if (podcasts.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </div>
        <p className="text-gray-500">No podcasts uploaded yet</p>
        <p className="text-sm text-gray-400 mt-1">Upload your first podcast to get started!</p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusIcon = (podcast: Podcast) => {
    if (podcast.lesson_generated && podcast.has_lesson) {
      return (
        <div className="flex items-center text-green-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="text-sm">Ready</span>
        </div>
      );
    }

    if (podcast.processed_at && !podcast.lesson_generated) {
      return (
        <div className="flex items-center text-red-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span className="text-sm">Failed</span>
        </div>
      );
    }

    return (
      <div className="flex items-center text-yellow-600">
        <svg className="animate-spin w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="text-sm">Processing</span>
      </div>
    );
  };

  const getLanguageFlag = (language: string) => {
    return language === 'spanish' ? '🇪🇸' : '🇷🇺';
  };

  return (
    <div className="space-y-3">
      {podcasts.map((podcast) => (
        <div
          key={podcast.id}
          className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-lg">{getLanguageFlag(podcast.language)}</span>
                <h3 className="text-lg font-medium text-gray-900 truncate">
                  {podcast.title}
                </h3>
              </div>
              <p className="text-sm text-gray-500 mb-2">
                Uploaded {formatDate(podcast.created_at)}
              </p>
              <div className="flex items-center justify-between">
                {getStatusIcon(podcast)}
                <div className="flex items-center space-x-2">
                  {podcast.lesson_generated && podcast.has_lesson && (
                    <Link
                      href={`/podcast/${podcast.id}`}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
                    >
                      Study Lesson
                      <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  )}
                  <button
                    onClick={() => handleDelete(podcast.id)}
                    disabled={deletingId === podcast.id}
                    className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                    title="Delete podcast"
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
          </div>
        </div>
      ))}
    </div>
  );
}