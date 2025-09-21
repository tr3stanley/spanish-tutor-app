'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

interface Podcast {
  id: number;
  title: string;
  filename: string;
  language: string;
  created_at: string;
  processed_at?: string;
  lesson_generated: boolean;
  has_lesson: boolean;
  folder_id?: number;
  folder_name?: string;
  listened?: boolean;
}

interface Folder {
  id: number;
  name: string;
  created_at: string;
}

interface FolderPodcastListProps {
  podcasts: Podcast[];
  onPodcastDeleted: () => void;
}

export default function FolderPodcastList({ podcasts, onPodcastDeleted }: FolderPodcastListProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [showUnfiled, setShowUnfiled] = useState(true);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [selectedPodcasts, setSelectedPodcasts] = useState<Set<number>>(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);

  useEffect(() => {
    fetchFolders();
  }, []);

  const fetchFolders = async () => {
    try {
      const response = await fetch('/api/folders');
      const data = await response.json();
      setFolders(data.folders);
    } catch (error) {
      console.error('Error fetching folders:', error);
    } finally {
      setLoading(false);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });

      if (response.ok) {
        await fetchFolders();
        setNewFolderName('');
        setShowNewFolderInput(false);
      } else {
        const error = await response.json();
        alert(error.error);
      }
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  const toggleFolder = (folderId: number) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const togglePodcastSelection = (podcastId: number) => {
    const newSelected = new Set(selectedPodcasts);
    if (newSelected.has(podcastId)) {
      newSelected.delete(podcastId);
    } else {
      newSelected.add(podcastId);
    }
    setSelectedPodcasts(newSelected);
  };

  const moveSelectedPodcasts = async (folderId: number | null) => {
    try {
      await Promise.all(
        Array.from(selectedPodcasts).map(podcastId =>
          fetch(`/api/podcasts/${podcastId}/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_id: folderId }),
          })
        )
      );

      setSelectedPodcasts(new Set());
      setShowMoveModal(false);
      onPodcastDeleted(); // Refresh the list
    } catch (error) {
      console.error('Error moving podcasts:', error);
    }
  };

  const toggleListened = async (podcast: Podcast) => {
    try {
      await fetch(`/api/podcasts/${podcast.id}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listened: !podcast.listened }),
      });

      onPodcastDeleted(); // Refresh the list
    } catch (error) {
      console.error('Error updating listened status:', error);
    }
  };

  const deletePodcast = async (id: number) => {
    if (!confirm('Are you sure you want to delete this podcast?')) return;

    try {
      const response = await fetch(`/api/podcasts/${id}`, { method: 'DELETE' });
      if (response.ok) {
        onPodcastDeleted();
      }
    } catch (error) {
      console.error('Error deleting podcast:', error);
    }
  };

  const groupedPodcasts = podcasts.reduce((acc, podcast) => {
    const folderId = podcast.folder_id || 'unfiled';
    if (!acc[folderId]) {
      acc[folderId] = [];
    }
    acc[folderId].push(podcast);
    return acc;
  }, {} as Record<string | number, Podcast[]>);

  const unfiledPodcasts = groupedPodcasts['unfiled'] || [];

  if (loading) {
    return <div className="text-center py-8">Loading folders...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Folder Management Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowNewFolderInput(!showNewFolderInput)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            New Folder
          </button>

          {selectedPodcasts.size > 0 && (
            <button
              onClick={() => setShowMoveModal(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              Move Selected ({selectedPodcasts.size})
            </button>
          )}
        </div>

        {selectedPodcasts.size > 0 && (
          <button
            onClick={() => setSelectedPodcasts(new Set())}
            className="text-gray-500 hover:text-gray-700"
          >
            Clear Selection
          </button>
        )}
      </div>

      {/* New Folder Input */}
      {showNewFolderInput && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center space-x-3">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onKeyPress={(e) => e.key === 'Enter' && createFolder()}
            />
            <button
              onClick={createFolder}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowNewFolderInput(false);
                setNewFolderName('');
              }}
              className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Folders */}
      {folders.map((folder) => {
        const folderPodcasts = groupedPodcasts[folder.id] || [];
        const isExpanded = expandedFolders.has(folder.id);

        return (
          <div key={folder.id} className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div
              className="p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50"
              onClick={() => toggleFolder(folder.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <svg
                    className={`w-5 h-5 text-gray-500 transition-transform ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-900">{folder.name}</h3>
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-sm">
                    {folderPodcasts.length}
                  </span>
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="p-4">
                {folderPodcasts.length === 0 ? (
                  <p className="text-gray-500 italic">No podcasts in this folder</p>
                ) : (
                  <div className="space-y-3">
                    {folderPodcasts.map((podcast) => (
                      <PodcastItem
                        key={podcast.id}
                        podcast={podcast}
                        isSelected={selectedPodcasts.has(podcast.id)}
                        onSelect={() => togglePodcastSelection(podcast.id)}
                        onToggleListened={() => toggleListened(podcast)}
                        onDelete={() => deletePodcast(podcast.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Unfiled Podcasts */}
      {unfiledPodcasts.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div
            className="p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50"
            onClick={() => setShowUnfiled(!showUnfiled)}
          >
            <div className="flex items-center space-x-3">
              <svg
                className={`w-5 h-5 text-gray-500 transition-transform ${
                  showUnfiled ? 'rotate-90' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900">Unfiled</h3>
              <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-sm">
                {unfiledPodcasts.length}
              </span>
            </div>
          </div>

          {showUnfiled && (
            <div className="p-4">
              <div className="space-y-3">
                {unfiledPodcasts.map((podcast) => (
                  <PodcastItem
                    key={podcast.id}
                    podcast={podcast}
                    isSelected={selectedPodcasts.has(podcast.id)}
                    onSelect={() => togglePodcastSelection(podcast.id)}
                    onToggleListened={() => toggleListened(podcast)}
                    onDelete={() => deletePodcast(podcast.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Move Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Move {selectedPodcasts.size} podcast(s) to:</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <button
                  onClick={() => moveSelectedPodcasts(null)}
                  className="w-full text-left p-3 rounded-lg hover:bg-gray-100 border border-gray-200"
                >
                  📂 Unfiled
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => moveSelectedPodcasts(folder.id)}
                    className="w-full text-left p-3 rounded-lg hover:bg-gray-100 border border-gray-200"
                  >
                    📁 {folder.name}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setShowMoveModal(false)}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PodcastItem({
  podcast,
  isSelected,
  onSelect,
  onToggleListened,
  onDelete
}: {
  podcast: Podcast;
  isSelected: boolean;
  onSelect: () => void;
  onToggleListened: () => void;
  onDelete: () => void;
}) {
  const languageFlag = podcast.language === 'spanish' ? '🇪🇸' : '🇷🇺';

  return (
    <div className={`flex items-center p-3 rounded-lg border ${
      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
    }`}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onSelect}
        className="mr-3"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2 mb-1">
          <span className="text-sm">{languageFlag}</span>
          <Link
            href={`/podcast/${podcast.id}`}
            className="font-medium text-gray-900 hover:text-blue-600 truncate"
          >
            {podcast.title}
          </Link>
          {podcast.listened && (
            <span className="text-green-600 text-sm">✓ Listened</span>
          )}
        </div>

        <div className="flex items-center space-x-4 text-sm text-gray-500">
          <span>{new Date(podcast.created_at).toLocaleDateString()}</span>
          {podcast.has_lesson ? (
            <span className="text-green-600 font-medium">✓ Ready</span>
          ) : (
            <span className="text-yellow-600">⏳ Processing</span>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2 ml-4">
        <button
          onClick={onToggleListened}
          className={`p-2 rounded-lg transition-colors ${
            podcast.listened
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          title={podcast.listened ? 'Mark as unlistened' : 'Mark as listened'}
        >
          {podcast.listened ? '✓' : '○'}
        </button>

        <button
          onClick={onDelete}
          className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
          title="Delete podcast"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}