"use client";

import { useEffect } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Client component that handles OAuth implicit flow redirect.
 * Detects tokens in URL hash and redirects to dashboard if authenticated.
 * This is needed because implicit flow returns tokens in the URL hash (e.g., /#access_token=...)
 */
export default function AuthRedirect() {
  useEffect(() => {
    const handleAuthRedirect = async () => {
      if (!isSupabaseConfigured()) return;

      // Check if we have hash params (implicit flow tokens)
      const hash = window.location.hash;
      if (hash && hash.includes("access_token")) {
        console.log("Detected OAuth tokens in URL hash, processing...");
        
        // Parse the hash to extract the access token
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        
        if (accessToken) {
          // Manually set the session if auto-detection doesn't work
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || "",
          });
          
          if (data.session) {
            console.log("Session set successfully, checking password...");
            // Clear the hash from URL before redirecting
            window.history.replaceState(null, "", window.location.pathname);

            const provider = data.session.user?.app_metadata?.provider;
            const isOAuth = provider && provider !== "email";
            const passwordSet = data.session.user?.user_metadata?.password_set === true;

            if (!isOAuth && !passwordSet) {
              window.location.href = "/set-password";
            } else {
              window.location.href = "/dashboard";
            }
            return;
          }
          
          if (error) {
            console.error("Error setting session:", error);
          }
        }
      }

      // Check for existing session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const provider = session.user.app_metadata?.provider;
        const isOAuth = provider && provider !== "email";
        const passwordSet = session.user.user_metadata?.password_set === true;

        if (!isOAuth && !passwordSet) {
          window.location.href = "/set-password";
        } else {
          console.log("Session found, redirecting to dashboard...");
          window.location.href = "/dashboard";
        }
      }
    };

    handleAuthRedirect();

    // Also listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth state changed:", event);
      if (event === "SIGNED_IN" && session?.user) {
        const provider = session.user.app_metadata?.provider;
        const isOAuth = provider && provider !== "email";
        const passwordSet = session.user.user_metadata?.password_set === true;

        if (!isOAuth && !passwordSet) {
          window.location.href = "/set-password";
        } else {
          window.location.href = "/dashboard";
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // This component renders nothing - it just handles the redirect
  return null;
}
