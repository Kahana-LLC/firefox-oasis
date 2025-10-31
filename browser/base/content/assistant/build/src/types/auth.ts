// TypeScript interfaces for authentication
import { User, Session, AuthError } from '@supabase/supabase-js';

export interface UserProfile {
    user_id: string;
    name?: string;
    email: string;
    created_at: string;
    last_login?: string;
    status: 'active' | 'suspended';
}

export interface UserSession {
    session_id: string;
    user_id: string;
    started_at: string;
    ended_at?: string;
    device_info?: {
        platform: string;
        version: string;
        userAgent?: string;
    };
}

export interface AuthState {
    user: User | null;
    session: Session | null;
    isAuthenticated: boolean;
}

