import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import {
  getViewerConfig,
  isViewerLocked,
  incrementViewerAttempts,
  resetViewerAttempts,
  createViewerSession,
} from '@/lib/viewers';
import { generateSessionToken } from '@/lib/types/viewer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { viewerId, pin } = body;

    if (!viewerId || !pin) {
      return NextResponse.json(
        { error: 'viewerId and pin are required' },
        { status: 400 }
      );
    }

    // Get client IP
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';

    // Check if viewer is locked
    const locked = await isViewerLocked(viewerId, ip);
    if (locked) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Get viewer config
    const config = await getViewerConfig(viewerId);
    if (!config) {
      return NextResponse.json(
        { error: 'Viewer not found' },
        { status: 404 }
      );
    }

    // Validate PIN
    const isValidPin = await bcrypt.compare(pin, config.pin);
    
    if (!isValidPin) {
      // Increment failed attempts
      const attempts = await incrementViewerAttempts(viewerId, ip);
      
      const remainingAttempts = 5 - attempts.count;
      
      if (attempts.lockedUntil) {
        return NextResponse.json(
          { error: 'Too many failed attempts. Account locked for 15 minutes.' },
          { status: 429 }
        );
      }
      
      return NextResponse.json(
        { 
          error: `Invalid PIN. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`,
          remainingAttempts 
        },
        { status: 401 }
      );
    }

    // PIN is valid - reset attempts and create session
    await resetViewerAttempts(viewerId, ip);
    
    const sessionToken = generateSessionToken();
    await createViewerSession(sessionToken, viewerId, config.userId, ip, 3600); // 1 hour

    // Return success with token
    const response = NextResponse.json(
      { 
        success: true,
        message: 'Authentication successful',
        viewerId 
      },
      { status: 200 }
    );

    // Set session cookie
    response.cookies.set('viewer_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600, // 1 hour
      path: '/',
    });

    return response;

  } catch (error) {
    console.error('Viewer auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
