import React, { useState } from 'react';
import axios from 'axios';
import { useWallet } from '../components/telegramWalletAdapter';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const PendingPoolManagement = ({ token, onPoolCreated }) => {
  const { publicKey, connected } = useWallet();
  const [formData, setFormData] = useState({
    baseAmount: '10000',
    quoteAmount: '1',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Create CPMM pool directly
  const handleCreatePool = async (e) => {
    e.preventDefault();
    
    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // SOL mint address is always the same
      const solMint = 'So11111111111111111111111111111111111111112';
      
      // Create CPMM pool directly (no market needed)
      const response = await axios.post(`${API_URL}/pool/create`, {
        baseMint: token.mint,
        quoteMint: solMint,
        baseAmount: parseFloat(formData.baseAmount),
        quoteAmount: parseFloat(formData.quoteAmount),
        userWallet: publicKey
      });
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      // Call onPoolCreated callback
      if (onPoolCreated) {
        onPoolCreated(response.data);
      }
    } catch (err) {
      console.error('Error creating pool:', err);
      setError(err.response?.data?.error || err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  // One-click create pool
  const handleCreateAll = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // SOL mint address
      const solMint = 'So11111111111111111111111111111111111111112';
      
      // Create pool with SOL directly
      const response = await axios.post(`${API_URL}/pool/create`, {
        baseMint: token.mint,
        quoteMint: solMint,
        baseAmount: parseFloat(formData.baseAmount),
        quoteAmount: parseFloat(formData.quoteAmount),
        userWallet: publicKey
      });
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      // Call onPoolCreated callback
      if (onPoolCreated) {
        onPoolCreated(response.data);
      }
    } catch (err) {
      console.error('Error creating pool:', err);
      setError(err.response?.data?.error || err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="token-form-container">
      <h2>Create CPMM Pool</h2>
      <div className="token-info">
        <p><strong>Token:</strong> {token.symbol || token.mint}</p>
        <p><strong>Balance:</strong> {token.balance}</p>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      {!connected ? (
        <div className="connect-wallet-prompt">
          <p>Please connect your wallet to create a pool.</p>
        </div>
      ) : (
        <>
          <div className="quick-actions">
            <button 
              className="submit-btn full-width" 
              onClick={handleCreateAll}
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create CPMM Pool'}
            </button>
          </div>
          
          <form onSubmit={handleCreatePool}>
            <h3>Pool Configuration</h3>
            
            <div className="form-group">
              <label htmlFor="baseAmount">{token.symbol || 'Token'} Amount</label>
              <input
                type="number"
                id="baseAmount"
                name="baseAmount"
                value={formData.baseAmount}
                onChange={handleChange}
                min="1"
              />
              <span className="help-text">Amount of tokens to add to the pool</span>
            </div>
            
            <div className="form-group">
              <label htmlFor="quoteAmount">SOL Amount</label>
              <input
                type="number"
                id="quoteAmount"
                name="quoteAmount"
                value={formData.quoteAmount}
                onChange={handleChange}
                min="0.001"
                step="0.001"
              />
              <span className="help-text">Amount of SOL to add to the pool</span>
            </div>
            
            <div className="price-preview">
              <h4>Initial Price Estimate</h4>
              <p>
                {(formData.quoteAmount / formData.baseAmount).toFixed(9)} SOL per {token.symbol || 'token'}
              </p>
            </div>
            
            <div className="form-actions">
              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? 'Creating Pool...' : 'Create Pool'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

export default PendingPoolManagement;