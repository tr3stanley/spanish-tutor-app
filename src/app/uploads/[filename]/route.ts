import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const filePath = path.join(process.cwd(), 'uploads', filename);

    const file = await readFile(filePath);

    // Get file extension to set appropriate content type
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';

    switch (ext) {
      case '.mp3':
        contentType = 'audio/mpeg';
        break;
      case '.wav':
        contentType = 'audio/wav';
        break;
      case '.m4a':
        contentType = 'audio/mp4';
        break;
      case '.ogg':
        contentType = 'audio/ogg';
        break;
      default:
        contentType = 'audio/mpeg';
    }

    return new Response(new Uint8Array(file), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
        'Accept-Ranges': 'bytes'
      }
    });

  } catch (error) {
    console.error('Error serving audio file:', error);
    return NextResponse.json(
      { error: 'File not found' },
      { status: 404 }
    );
  }
}