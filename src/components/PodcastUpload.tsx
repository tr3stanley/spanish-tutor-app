'use client';

import { useState } from 'react';

interface PodcastUploadProps {
  onUploadSuccess: () => void;
}

export default function PodcastUpload({ onUploadSuccess }: PodcastUploadProps) {
  const [uploadMethod, setUploadMethod] = useState<'file' | 'url'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<'spanish' | 'russian'>('spanish');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [isLoadingCollection, setIsLoadingCollection] = useState(false);
  const [collectionFiles, setCollectionFiles] = useState<Array<{name: string, title: string, size: string}>>([]);
  const [isCollection, setIsCollection] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);

      // Auto-generate title from filename if not set
      if (!title) {
        const filename = selectedFile.name.replace(/\.[^/.]+$/, "");
        setTitle(filename);
      }
    }
  };

  const checkForCollection = async (url: string) => {
    if (!url.includes('archive.org')) return;

    setIsLoadingCollection(true);
    try {
      const response = await fetch(`/api/archive-metadata?url=${encodeURIComponent(url)}`);
      if (response.ok) {
        const metadata = await response.json();
        if (metadata.files && metadata.files.length > 1) {
          setCollectionFiles(metadata.files);
          setIsCollection(true);
          if (!title) {
            setTitle(metadata.title);
          }
        } else {
          setIsCollection(false);
          setCollectionFiles([]);
        }
      }
    } catch (error) {
      console.error('Failed to check collection:', error);
    }
    setIsLoadingCollection(false);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setAudioUrl(url);

    // Reset collection state
    setIsCollection(false);
    setCollectionFiles([]);

    // Check for collection if it's an Archive.org URL
    if (url && (url.includes('archive.org/details/') || url.includes('archive.org/download/'))) {
      checkForCollection(url);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate based on upload method
    if (uploadMethod === 'file' && (!file || !title)) {
      setMessage('Please select a file and enter a title');
      return;
    }

    if (uploadMethod === 'url' && (!audioUrl || !title)) {
      setMessage('Please enter a URL and title');
      return;
    }

    setUploading(true);
    setMessage('');

    try {
      let response;

      if (uploadMethod === 'file') {
        // File upload
        const formData = new FormData();
        formData.append('file', file!);
        formData.append('title', title);
        formData.append('language', language);

        response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
      } else if (isCollection && collectionFiles.length > 0) {
        // Collection upload
        let identifier = '';
        if (audioUrl.includes('/details/')) {
          identifier = audioUrl.split('/details/')[1]?.split('/')[0]?.split('?')[0];
        } else if (audioUrl.includes('/download/')) {
          identifier = audioUrl.split('/download/')[1]?.split('/')[0]?.split('?')[0];
        }

        const files = collectionFiles.map(file => ({
          name: file.name,
          title: file.title,
          url: `https://archive.org/download/${identifier}/${file.name}`
        }));

        response = await fetch('/api/upload-collection', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            files,
            language,
            baseTitle: title,
          }),
        });
      } else {
        // Single URL upload
        response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            audioUrl,
            title,
            language,
          }),
        });
      }

      const result = await response.json();

      if (response.ok) {
        const successMessage = result.count
          ? `${result.count} podcast(s) added successfully! Processing with Whisper...`
          : 'Podcast added successfully! Processing with Whisper...';
        setMessage(successMessage);
        setFile(null);
        setAudioUrl('');
        setTitle('');
        setCollectionFiles([]);
        setIsCollection(false);
        onUploadSuccess();

        // Reset form
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        setMessage(`Error: ${result.error}`);
      }
    } catch (error) {
      setMessage('Upload failed. Please try again.');
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Upload Method Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            type="button"
            onClick={() => setUploadMethod('file')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              uploadMethod === 'file'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-800 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            File Upload
          </button>
          <button
            type="button"
            onClick={() => setUploadMethod('url')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              uploadMethod === 'url'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-800 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            URL Upload
          </button>
        </nav>
      </div>

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-900 mb-2">
          Podcast Title
        </label>
        <input
          type="text"
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter podcast title..."
          required
        />
      </div>

      <div>
        <label htmlFor="language" className="block text-sm font-medium text-gray-900 mb-2">
          Language
        </label>
        <select
          id="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value as 'spanish' | 'russian')}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="spanish">Spanish</option>
          <option value="russian">Russian</option>
        </select>
      </div>

      {uploadMethod === 'file' ? (
        <div>
          <label htmlFor="file-upload" className="block text-sm font-medium text-gray-900 mb-2">
            Audio File
          </label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-gray-400 transition-colors">
            <div className="space-y-1 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 48 48"
              >
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="flex text-sm text-gray-800">
                <label
                  htmlFor="file-upload"
                  className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                >
                  <span>Upload a file</span>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    className="sr-only"
                    accept="audio/*"
                    onChange={handleFileChange}
                  />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-700">MP3, WAV, M4A up to 100MB</p>
              {file && (
                <p className="text-sm text-green-600 font-medium">{file.name}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor="audio-url" className="block text-sm font-medium text-gray-900 mb-2">
            Audio URL
          </label>
          <input
            type="url"
            id="audio-url"
            value={audioUrl}
            onChange={handleUrlChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://archive.org/details/... or https://archive.org/download/..."
            required={uploadMethod === 'url'}
          />
          <p className="mt-1 text-xs text-gray-700">
            Direct link to audio file or Archive.org collection URL
          </p>

          {isLoadingCollection && (
            <div className="mt-2 p-2 bg-blue-50 rounded text-sm text-blue-600">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-600 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Checking for collection...
            </div>
          )}

          {isCollection && collectionFiles.length > 0 && (
            <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-sm font-medium text-green-800 mb-2">
                📁 Collection detected ({collectionFiles.length} audio files)
              </p>
              <div className="max-h-32 overflow-y-auto">
                {collectionFiles.slice(0, 5).map((file, index) => (
                  <div key={index} className="text-xs text-green-700 mb-1">
                    • {file.title} ({file.size})
                  </div>
                ))}
                {collectionFiles.length > 5 && (
                  <div className="text-xs text-green-600">
                    ... and {collectionFiles.length - 5} more files
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={uploading || !title || (uploadMethod === 'file' && !file) || (uploadMethod === 'url' && !audioUrl)}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {uploading ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing with Whisper...
          </>
        ) : isCollection && collectionFiles.length > 0 ? (
          `Upload Collection (${collectionFiles.length} files)`
        ) : (
          'Upload & Process with Whisper'
        )}
      </button>

      {message && (
        <div className={`p-3 rounded-md ${message.includes('Error') || message.includes('failed') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {message}
        </div>
      )}
    </form>
  );
}