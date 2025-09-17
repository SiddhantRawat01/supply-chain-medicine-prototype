import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    // Handle process.env for React Scripts compatibility
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env.PUBLIC_URL': JSON.stringify(''),
  },
  // Handle public directory assets
  publicDir: 'public',
  build: {
    outDir: 'build', // Match CRA output directory
    assetsDir: 'assets',
    sourcemap: true,
  },
  server: {
    port: 3000, // Match default CRA port
    open: true,
  },
})
