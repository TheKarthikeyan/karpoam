import { NextRequest, NextResponse } from 'next/server';
import {
  generateCSRFToken,
  setCSRFTokenCookie,
  validateCSRFToken
} from '@/lib/csrf-protection';
import { withSecurity } from '@/lib/security-middleware';

/**
 * Endpoint to get a CSRF token for authenticated sessions
 */
async function handler(request: NextRequest) {
  const existingToken = request.cookies.get('csrf-token')?.value ?? null;
  const token = existingToken && validateCSRFToken(existingToken, existingToken)
    ? existingToken
    : generateCSRFToken();
  const response = NextResponse.json({ success: true });

  // Set token in both cookie and header
  if (token !== existingToken) {
    setCSRFTokenCookie(response, token);
  }
  response.headers.set('X-CSRF-Token', token);

  return response;
}

// KARPOAM: Allow unauthenticated access when DISABLE_RATE_LIMITS=true
// CSRF tokens are less critical without auth but frontend may still request them
export const GET = withSecurity(handler, {
  requireAuth: process.env.DISABLE_RATE_LIMITS !== 'true',
  allowedMethods: ['GET']
});
