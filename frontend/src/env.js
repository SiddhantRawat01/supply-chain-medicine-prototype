// Environment variable handling for Vite compatibility

// Vite uses import.meta.env instead of process.env
// This file provides compatibility layer for both approaches

// Create a unified env object that works with both Vite and React Scripts patterns
const env = {
  // Add commonly used environment variables here
  NODE_ENV: import.meta.env.MODE || process.env.NODE_ENV,
  BASE_URL: import.meta.env.BASE_URL || process.env.PUBLIC_URL || '',
  
  // Add any custom environment variables with VITE_ prefix
  // Vite exposes env vars with VITE_ prefix as import.meta.env.VITE_*
  // This makes them available through the same pattern as React Scripts
  ...Object.fromEntries(
    Object.entries(import.meta.env).map(([key, value]) => {
      // Convert VITE_* to REACT_APP_* for compatibility
      if (key.startsWith('VITE_')) {
        const newKey = key.replace('VITE_', 'REACT_APP_');
        return [newKey, value];
      }
      return [key, value];
    })
  ),
};

export default env;