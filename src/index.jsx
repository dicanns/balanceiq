import { init } from '@sentry/electron/renderer';
import { createRoot } from 'react-dom/client';
import React from 'react';
import App from './App.jsx';

init({
  dsn: import.meta.env.VITE_SENTRY_DSN || '',
});

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding:40,fontFamily:'monospace',background:'#0c0e14',color:'#f87171',minHeight:'100vh'}}>
          <h2 style={{color:'#f97316',marginBottom:16}}>BalanceIQ — Render Error</h2>
          <pre style={{whiteSpace:'pre-wrap',fontSize:13,lineHeight:1.6}}>
            {this.state.error?.message}\n\n{this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><App /></ErrorBoundary>);
