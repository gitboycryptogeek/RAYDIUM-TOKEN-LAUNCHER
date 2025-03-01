import React from 'react';
import './walletConnection.css';
import { useWallet } from '../contexts/walletContext';

const WalletConnection = () => {
  const { publicKey, balance, connected, connecting, connect, disconnect, error } = useWallet();

  // Truncate wallet address for display
  const truncateAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <div className="wallet-connection-compact">
      {error && <div className="wallet-error">{error}</div>}
      
      {!connected ? (
        <button 
          className="connect-wallet-btn"
          onClick={connect}
          disabled={connecting}
        >
          {connecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      ) : (
        <div className="wallet-connected">
          <div className="wallet-address">
            {truncateAddress(publicKey)}
          </div>
          <div className="wallet-balance">
            {balance?.toFixed(4) || '0'} SOL
          </div>
          <button className="disconnect-btn" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
};

export default WalletConnection;