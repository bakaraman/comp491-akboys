/**
 * auth.ts — Firebase Auth middleware for Express
 *
 * Verifies Firebase ID tokens sent in the Authorization header when
 * auth is enabled. When auth is disabled via env, it becomes a no-op
 * so local integration work can continue without blocking.
 *
 * @author AK Boys Team
 * @since 2026-04-03
 */

import type { NextFunction, Request, Response } from 'express';
import { getAuth } from 'firebase-admin/auth';

declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        name?: string;
      };
    }
  }
}

function isAuthEnabled(): boolean {
  return process.env.FIREBASE_AUTH_ENABLED === 'true';
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!isAuthEnabled()) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const idToken = authHeader.slice('Bearer '.length);

  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
    };
    next();
  } catch (err) {
    console.warn('[auth] token verification failed:', err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
