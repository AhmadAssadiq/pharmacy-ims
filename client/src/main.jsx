// The starting point of the React app: loads the translations and the styles,
// then shows <App /> inside the <div id="root"> of index.html.
import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n/setup';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
