import { createClient } from '@supabase/supabase-js';
import type { Express, RequestHandler } from 'express';
import { storage } from './storage';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Export supabase client for use in other modules
export { supabase };

export async function setupAuth(app: Express) {
  // No special setup needed for Supabase auth
  // Authentication will be handled via JWT verification middleware
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Sync user with our database
    // NOTE: Do NOT set role here - it's managed by Stripe subscription sync
    await storage.upsertUser({
      id: user.id,
      email: user.email || '',
      firstName: user.user_metadata?.first_name || user.email?.split('@')[0] || '',
      lastName: user.user_metadata?.last_name || '',
      profileImageUrl: user.user_metadata?.profile_image_url || user.user_metadata?.avatar_url || null,
    });

    // Attach user to request object with Replit-compatible format
    (req as any).user = {
      claims: {
        sub: user.id,
        email: user.email,
        first_name: user.user_metadata?.first_name,
        last_name: user.user_metadata?.last_name,
        profile_image_url: user.user_metadata?.profile_image_url || user.user_metadata?.avatar_url,
      }
    } as any;

    return next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ message: 'Unauthorized' });
  }
};
