import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const audioUrl = searchParams.get('url');

    if (!audioUrl) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    // Only allow GitHub release URLs for security
    if (!audioUrl.includes('github.com') && !audioUrl.includes('githubusercontent.com')) {
      return NextResponse.json({ error: 'Only GitHub release URLs are allowed' }, { status: 403 });
    }

    console.log('Audio proxy: Fetching', audioUrl);

    // Fetch the audio file from GitHub releases
    const response = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Spanish Tutor App Audio Proxy',
      },
    });

    if (!response.ok) {
      console.error('Audio proxy: Failed to fetch', response.status, response.statusText);
      return NextResponse.json({
        error: `Failed to fetch audio: ${response.status} ${response.statusText}`
      }, { status: response.status });
    }

    // Get the audio data
    const audioData = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'audio/mpeg';

    console.log('Audio proxy: Successfully fetched', audioData.byteLength, 'bytes');

    // Return the audio with proper CORS headers for Safari
    return new NextResponse(audioData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Range',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });

  } catch (error) {
    console.error('Audio proxy error:', error);
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// Handle preflight requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Range',
    },
  });
}