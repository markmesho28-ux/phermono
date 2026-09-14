import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import initFastTouch from './utils/fastTouch';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element with id "root" was not found.');
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <AuthProvider>
      <DataProvider>
        <App />
      </DataProvider>
    </AuthProvider>
  </React.StrictMode>
);

// Initialize fast-touch handler for elements marked with `.touch-target`.
try {
  initFastTouch();
} catch (err) {
  // best-effort: if initialization fails, don't block the app
  // eslint-disable-next-line no-console
  console.warn('fastTouch init failed', err);
}
