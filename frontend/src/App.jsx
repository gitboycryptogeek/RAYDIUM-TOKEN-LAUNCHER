import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import Home from './components/Home';
import TokenCreationForm from './components/tokenCreationForm';
import PendingPoolManagement from './components/pendingPoolManagement';
import { WalletProvider } from './contexts/walletContext';
import WalletConnection from './components/WalletConnection';

function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <div className="App">
          <header className="App-header">
            <h1>Solana Token Creator</h1>
            <WalletConnection />
          </header>
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/create-token" element={<TokenCreationForm />} />
              <Route path="/manage-pools" element={<PendingPoolManagement />} />
            </Routes>
          </main>
          <footer>
            <p>© 2025 Solana Token Creator - Running on {process.env.REACT_APP_SOLANA_CLUSTER || 'devnet'}</p>
          </footer>
        </div>
      </BrowserRouter>
    </WalletProvider>
  );
}

export default App;