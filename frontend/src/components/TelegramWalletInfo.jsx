import React, { useEffect, useCallback } from 'react';  // Add useCallback
import { useTelegram } from './telegramApp';
import './walletConnection.css';

const TelegramWalletInfo = () => {
  const { 
    user, 
    walletInfo, 
    loading, 
    createWallet, 
    requestAirdrop, 
    telegramApi,
    WebApp
  } = useTelegram();

  // Wrap handleCreateWallet in useCallback to stabilize its reference
  const handleCreateWallet = useCallback(async () => {
    if (loading) return;
    telegramApi.mainButton.hide();
    
    try {
      const result = await createWallet();
      if (result) {
        telegramApi.showAlert('Wallet created successfully!');
      }
    } catch (error) {
      telegramApi.showAlert('Failed to create wallet. Please try again.');
    }
  }, [loading, createWallet, telegramApi]);

  // Setup main button for wallet creation if needed
  useEffect(() => {
    if (!loading && !walletInfo && WebApp && user) {
      telegramApi.mainButton.show('CREATE WALLET');
      telegramApi.mainButton.onClick(handleCreateWallet);
      
      return () => {
        telegramApi.mainButton.hide();
        telegramApi.mainButton.onClick(null);
      };
    }
  }, [walletInfo, loading, WebApp, user, handleCreateWallet, telegramApi.mainButton]);

  // Handle airdrop
  const handleRequestAirdrop = async () => {
    if (loading) return;
    
    try {
      const result = await requestAirdrop();
      if (result) {
        telegramApi.showAlert('Airdrop of 1 SOL successful!');
      }
    } catch (error) {
      telegramApi.showAlert('Airdrop failed. Please try again later.');
    }
  };

  // Truncate wallet address for display
  const truncateAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  if (loading) {
    return (
      <div className="wallet-connection-compact">
        <div className="loading-indicator">Loading wallet info...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="wallet-connection-compact">
        <div className="wallet-error">Telegram user not found</div>
      </div>
    );
  }

  return (
    <div className="wallet-connection-compact">
      {!walletInfo ? (
        <button
          className="connect-wallet-btn"
          onClick={handleCreateWallet}
          disabled={loading}
        >
          {loading ? 'Creating...' : 'Create Wallet'}
        </button>
      ) : (
        <div className="wallet-connected">
          <div className="wallet-address">
            {truncateAddress(walletInfo.publicKey)}
          </div>
          <div className="wallet-balance">
            {walletInfo.balance?.toFixed(4) || '0'} SOL
          </div>
          {walletInfo.cluster === 'devnet' && (
            <button 
              className="airdrop-button" 
              onClick={handleRequestAirdrop} 
              disabled={loading}
            >
              Get 1 SOL
            </button>
          )}
        </div>
      )}
      <div className="telegram-user-info">
        {user && <span>@{user.username || user.firstName}</span>}
      </div>
    </div>
  );
};

export default TelegramWalletInfo;