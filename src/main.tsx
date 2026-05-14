import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { client } from './appwrite';

// Ping the Appwrite backend server to verify the setup
client.ping()
  .then(() => console.log("✅ Appwrite connection verified"))
  .catch(err => console.error("❌ Appwrite ping failed:", err));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
