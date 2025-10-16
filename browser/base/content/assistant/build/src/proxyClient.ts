import { postSigned } from "./awsSignedFetch";

export type WireMsg = { role: "user" | "model"; content: string };

// Authentication check function - checks if user is authenticated via global auth state
async function checkAuthentication(): Promise<boolean> {
  try {
    // Check if the global authentication state indicates user is logged in
    // This will be set by the UI when authentication state changes
    const authState = (window as any).oasisAuthState;
    if (!authState || !authState.isAuthenticated) {
      console.warn('AI Assistant: Unauthenticated access attempt blocked');
      throw new Error('Authentication required: Please sign in to use the AI assistant');
    }
    return true;
  } catch (error) {
    console.error('AI Assistant: Authentication check failed:', error);
    throw error;
  }
}

export async function routeRemote(system: string, messages: WireMsg[], options: string[]) {
  // Check authentication before making API call
  await checkAuthentication();
  
  // Get current user for logging/auditing
  const authState = (window as any).oasisAuthState;
  console.log(`AI Assistant: Authenticated request from user ${authState?.user?.email || 'unknown'}`);
  
  return postSigned("route", { system, messages, options });
}

export async function chatRemote(system: string, messages: WireMsg[]) {
  // Check authentication before making API call
  await checkAuthentication();
  
  // Get current user for logging/auditing
  const authState = (window as any).oasisAuthState;
  console.log(`AI Assistant: Authenticated chat request from user ${authState?.user?.email || 'unknown'}`);
  
  return postSigned("chat", { system, messages });
}
