import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import Home from './components/Home';
import TokenCreationForm from './components/tokenCreationForm';
import PendingPoolManagement from './components/pendingPoolManagement';
import { TelegramProvider } from './components/telegramApp';
import TelegramApp from './components/telegramApp';
import { TelegramWalletAdapterProvider } from './components/telegramWalletAdapter';
import { useWallet } from './components/telegramWalletAdapter';
import { Link, useLocation } from 'react-router-dom';

// Navbar Component
const Navbar = () => {
  const { publicKey, balance, connected, connecting, connect, disconnect } = useWallet();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Truncate wallet address for display
  const truncateAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <nav className="modern-navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <span className="logo-icon">🪙</span>
          <span className="logo-text">Solana Token Hub</span>
        </Link>

        <div className="navbar-toggle" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          <span></span>
          <span></span>
          <span></span>
        </div>

        <div className={`navbar-menu ${isMenuOpen ? 'active' : ''}`}>
          <Link to="/" className={`navbar-item ${location.pathname === '/' ? 'active' : ''}`}>
            My Tokens
          </Link>
          <div className="navbar-dropdown">
            <button className="navbar-dropdown-toggle">
              Create <span className="dropdown-arrow">▼</span>
            </button>
            <div className="navbar-dropdown-content">
              <Link to="/create-token" className="dropdown-item">Create Token</Link>
              <Link to="/create-pool" className="dropdown-item">Create Pool</Link>
            </div>
          </div>
        </div>

        <div className="wallet-section">
          {!connected ? (
            <button 
              className="connect-wallet-btn"
              onClick={connect}
              disabled={connecting}
            >
              {connecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          ) : (
            <div className="wallet-info">
              <div className="wallet-address">
                {truncateAddress(publicKey)}
              </div>
              <div className="wallet-balance">
                {balance?.toFixed(4) || '0'} SOL
              </div>
              <button className="disconnect-btn" onClick={disconnect}>
                <span className="disconnect-icon">⏻</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

// Main Modal Component for forms
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
};

function AppContent() {
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);
  const location = useLocation();

  // Open modals based on route
  React.useEffect(() => {
    if (location.pathname === '/create-token') {
      setIsTokenModalOpen(true);
    } else if (location.pathname === '/create-pool') {
      setIsPoolModalOpen(true);
    } else {
      setIsTokenModalOpen(false);
      setIsPoolModalOpen(false);
    }
  }, [location]);

  return (
    <div className="app-container">
      <Navbar />
      
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create-token" element={<Home />} />
          <Route path="/create-pool" element={<Home />} />
          <Route path="/manage-pool/:poolId" element={<Home />} />
          <Route path="/token/:tokenId" element={<Home />} />
        </Routes>
      </main>

      {/* Token Creation Modal */}
      <Modal 
        isOpen={isTokenModalOpen} 
        onClose={() => setIsTokenModalOpen(false)}
        title="Create New Token"
      >
        <TokenCreationForm onSuccess={() => setIsTokenModalOpen(false)} />
      </Modal>

      {/* Pool Creation Modal */}
      <Modal 
        isOpen={isPoolModalOpen} 
        onClose={() => setIsPoolModalOpen(false)}
        title="Create New Pool"
      >
        <PendingPoolManagement onPoolCreated={() => setIsPoolModalOpen(false)} />
      </Modal>

      <footer className="app-footer">
        <p>© 2025 Solana Token Hub - Running on {process.env.REACT_APP_SOLANA_CLUSTER || 'devnet'}</p>
      </footer>
    </div>
  );
}

function App() {
  return (
    <TelegramProvider>
      <TelegramApp>
        <TelegramWalletAdapterProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </TelegramWalletAdapterProvider>
      </TelegramApp>
    </TelegramProvider>
  );
}

export default App;