import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import Home from './components/Home';
import TokenCreationForm from './components/tokenCreationForm';
import PendingPoolManagement from './components/pendingPoolManagement';
import { TelegramProvider } from './components/telegramApp';
import TelegramApp from './components/telegramApp';
import TelegramWalletInfo from './components/telegramWalletInfo';
import { TelegramWalletAdapterProvider } from './components/telegramWalletAdapter';


function App() {
  return (
    <TelegramProvider>
      <TelegramApp>
        <TelegramWalletAdapterProvider>
          <BrowserRouter>
            <div className="App">
              <header className="App-header">
                <h1>Solana Token Creator</h1>
                <TelegramWalletInfo />
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
        </TelegramWalletAdapterProvider>
      </TelegramApp>
    </TelegramProvider>
  );
}

export default App;