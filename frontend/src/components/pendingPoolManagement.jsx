import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useWallet } from '../components/telegramWalletAdapter';
import { useNavigate, useParams } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const PendingPoolManagement = ({ token, onPoolCreated }) => {
  const { publicKey, connected } = useWallet();
  const [formData, setFormData] = useState({
    baseAmount: '10000',
    quoteAmount: '1',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [availableTokens, setAvailableTokens] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const navigate = useNavigate();
  const { tokenId } = useParams();
  
  // Memoize fetchUserTokens with useCallback
  const fetchUserTokens = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/token/list`, {
        params: { publicKey }
      });
      
      if (response.data && Array.isArray(response.data)) {
        setAvailableTokens(response.data);
        
        // If we have a tokenId param, select that token
        if (tokenId) {
          const foundToken = response.data.find(t => t.mint === tokenId);
          if (foundToken) {
            setSelectedToken(foundToken);
          }
        } else if (response.data.length > 0) {
          // Otherwise select the first token
          setSelectedToken(response.data[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching tokens:', error);
      setError('Failed to fetch your tokens. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [publicKey, tokenId]);
  
  // Fetch tokens if no token provided
  useEffect(() => {
    if (!token && connected && publicKey) {
      fetchUserTokens();
    } else if (token) {
      setSelectedToken(token);
    }
  }, [token, connected, publicKey, fetchUserTokens]);
  
  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear any error when user makes changes
    if (error) setError('');
  };
  
  // Handle token selection change
  const handleTokenChange = (e) => {
    const tokenMint = e.target.value;
    const token = availableTokens.find(t => t.mint === tokenMint);
    setSelectedToken(token);
  };
  
  // Create CPMM pool directly
  const handleCreatePool = async (e) => {
    e.preventDefault();
    
    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }
    
    if (!selectedToken) {
      setError('Please select a token first');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      // SOL mint address is always the same
      const solMint = 'So11111111111111111111111111111111111111112';
      
      // Create CPMM pool directly (no market needed)
      const response = await axios.post(`${API_URL}/pool/create`, {
        baseMint: selectedToken.mint,
        quoteMint: solMint,
        baseAmount: parseFloat(formData.baseAmount),
        quoteAmount: parseFloat(formData.quoteAmount),
        userWallet: publicKey
      });
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      setSuccess('Pool created successfully!');
      
      // Save to local storage
      try {
        const existingPools = localStorage.getItem('localPools');
        let poolsArray = existingPools ? JSON.parse(existingPools) : [];
        
        // Add pool to localStorage
        poolsArray.push(response.data);
        localStorage.setItem('localPools', JSON.stringify(poolsArray));
      } catch (e) {
        console.error('Error saving pool to localStorage:', e);
      }
      
      // Call onPoolCreated callback
      if (onPoolCreated) {
        onPoolCreated(response.data);
      }
      
      // Redirect after success
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (err) {
      console.error('Error creating pool:', err);
      setError(err.response?.data?.error || err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  // One-click create pool
  const handleQuickCreatePool = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }
    
    if (!selectedToken) {
      setError('Please select a token first');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      // SOL mint address
      const solMint = 'So11111111111111111111111111111111111111112';
      
      // Create pool with SOL directly
      const response = await axios.post(`${API_URL}/pool/create`, {
        baseMint: selectedToken.mint,
        quoteMint: solMint,
        baseAmount: parseFloat(formData.baseAmount),
        quoteAmount: parseFloat(formData.quoteAmount),
        userWallet: publicKey
      });
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      setSuccess('Pool created successfully!');
      
      // Save to local storage
      try {
        const existingPools = localStorage.getItem('localPools');
        let poolsArray = existingPools ? JSON.parse(existingPools) : [];
        
        // Add pool to localStorage
        poolsArray.push(response.data);
        localStorage.setItem('localPools', JSON.stringify(poolsArray));
      } catch (e) {
        console.error('Error saving pool to localStorage:', e);
      }
      
      // Call onPoolCreated callback
      if (onPoolCreated) {
        onPoolCreated(response.data);
      }
      
      // Redirect after success
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (err) {
      console.error('Error creating pool:', err);
      setError(err.response?.data?.error || err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  if (loading && !selectedToken && !availableTokens.length) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading your tokens...</p>
      </div>
    );
  }
  
  return (
    <div className="pool-creation-container">
      <h2>Create Liquidity Pool</h2>
      
      {error && <div className="error-alert">{error}</div>}
      {success && <div className="success-alert">{success}</div>}
      
      {!connected ? (
        <div className="connect-prompt">
          <div className="icon-wrapper">
            <i className="wallet-icon">💼</i>
          </div>
          <h3>Wallet Not Connected</h3>
          <p>Please connect your wallet to create a pool.</p>
        </div>
      ) : (
        <>
          {availableTokens.length === 0 && !selectedToken ? (
            <div className="no-tokens-message">
              <p>You don't have any tokens to create a pool for.</p>
              <button 
                className="action-button primary"
                onClick={() => navigate('/create-token')}
              >
                Create a Token First
              </button>
            </div>
          ) : (
            <div className="pool-form-wrapper">
              {/* Token selection if multiple tokens available */}
              {!token && availableTokens.length > 0 && (
                <div className="form-group">
                  <label htmlFor="tokenSelect">Select Token</label>
                  <select 
                    id="tokenSelect" 
                    value={selectedToken?.mint || ''} 
                    onChange={handleTokenChange}
                    className="modern-select"
                  >
                    <option value="" disabled>Select a token</option>
                    {availableTokens.map(token => (
                      <option key={token.mint} value={token.mint}>
                        {token.symbol || token.mint.slice(0, 8)} ({token.balance.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Display selected token info */}
              {selectedToken && (
                <div className="selected-token-card">
                  <div className="token-icon-large">
                    {selectedToken.symbol ? selectedToken.symbol.charAt(0) : '#'}
                  </div>
                  <div className="token-details-large">
                    <h3>{selectedToken.symbol || selectedToken.mint.slice(0, 8)}</h3>
                    <p className="token-info">Balance: {selectedToken.balance.toFixed(6)}</p>
                    <p className="token-info token-address">{selectedToken.mint}</p>
                  </div>
                </div>
              )}
              
              {/* Quick action */}
              {selectedToken && (
                <div className="quick-action-card">
                  <h3>Quick Create</h3>
                  <p>Create a pool with our recommended settings:</p>
                  <ul className="recommendation-list">
                    <li><strong>{formData.baseAmount}</strong> {selectedToken.symbol || 'tokens'}</li>
                    <li><strong>{formData.quoteAmount}</strong> SOL</li>
                    <li>Initial price: <strong>{(formData.quoteAmount / formData.baseAmount).toFixed(9)}</strong> SOL per token</li>
                  </ul>
                  <button 
                    className="action-button primary full-width"
                    onClick={handleQuickCreatePool}
                    disabled={loading}
                  >
                    {loading ? 'Creating...' : 'Create Pool with These Settings'}
                  </button>
                </div>
              )}
              
              {/* Advanced pool configuration */}
              {selectedToken && (
                <form onSubmit={handleCreatePool} className="advanced-form">
                  <h3>Advanced Configuration</h3>
                  
                  <div className="form-row">
                    <div className="form-group half-width">
                      <label htmlFor="baseAmount">{selectedToken.symbol || 'Token'} Amount</label>
                      <input
                        type="number"
                        id="baseAmount"
                        name="baseAmount"
                        value={formData.baseAmount}
                        onChange={handleChange}
                        min="1"
                        className="modern-input"
                      />
                      <small className="input-help">Amount of tokens to add to the pool</small>
                    </div>
                    
                    <div className="form-group half-width">
                      <label htmlFor="quoteAmount">SOL Amount</label>
                      <input
                        type="number"
                        id="quoteAmount"
                        name="quoteAmount"
                        value={formData.quoteAmount}
                        onChange={handleChange}
                        min="0.001"
                        step="0.001"
                        className="modern-input"
                      />
                      <small className="input-help">Amount of SOL to add to the pool</small>
                    </div>
                  </div>
                  
                  <div className="price-preview">
                    <h4>Initial Price Estimate</h4>
                    <div className="price-display">
                      {(formData.quoteAmount / formData.baseAmount).toFixed(9)} SOL per {selectedToken.symbol || 'token'}
                    </div>
                  </div>
                  
                  <div className="form-actions">
                    <button 
                      type="button" 
                      className="action-button secondary"
                      onClick={() => navigate('/')}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="action-button primary"
                      disabled={loading}
                    >
                      {loading ? 'Creating Pool...' : 'Create Pool'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PendingPoolManagement;