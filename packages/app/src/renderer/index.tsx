import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRoot } from '../app/app-root';
import '../styles/global.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Renderer root container not found.');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>,
);
