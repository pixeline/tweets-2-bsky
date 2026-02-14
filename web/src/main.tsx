import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { setupBrowserDebugLogging } from './lib/debug-logger';

setupBrowserDebugLogging();

createRoot(document.getElementById('root')!).render(<App />);
