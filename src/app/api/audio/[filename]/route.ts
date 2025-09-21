import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
import { join } from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const audioPath = join(process.cwd(), 'uploads', filename);

    // Check if file exists
    let stats;
    try {
      stats = statSync(audioPath);
    } catch (error) {
      return new NextResponse('File not found', { status: 404 });
    }

    const fileSize = stats.size;
    const range = request.headers.get('range');

    // If no range header, serve the entire file
    if (!range) {
      const stream = createReadStream(audioPath);
      return new NextResponse(stream as any, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': fileSize.toString(),
          'Accept-Ranges': 'bytes',
        },
      });
    }

    // Parse range header (e.g., "bytes=0-1023")
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    // Create read stream for the requested range
    const stream = createReadStream(audioPath, { start, end });

    return new NextResponse(stream as any, {
      status: 206, // Partial Content
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': chunkSize.toString(),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
      },
    });

  } catch (error) {
    console.error('Error serving audio file:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}