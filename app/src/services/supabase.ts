import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Replace these with the keys from your Supabase Dashboard!
const supabaseUrl = 'https://pcwmgpziyybcqmrdzvhe.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjd21ncHppeXliY3FtcmR6dmhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTg4OTQsImV4cCI6MjA4NDk5NDg5NH0.43I0rP6zAD4g2LQG2Tyj1JCESVp_6zgAnlcoE42qSpc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});