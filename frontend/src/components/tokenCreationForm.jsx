import React, { useState } from 'react';
import axios from 'axios';
import './TokenCreationForm.css';
import { useWallet } from '../components/telegramWalletAdapter';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Helper function for delays
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const TokenCreationForm = ({ onSuccess, refreshData }) => {
  const { publicKey, connected } = useWallet();
  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    description: '',
    decimals: '9',
    initialSupply: '1000000000',
    initialLiquidity: '1',
    percentage: '10',
    createPool: true,
  });
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [step, setStep] = useState(1); // 1 = token info, 2 = pool info
  const [tokenResponse, setTokenResponse] = useState(null);
  const [airdropLoading, setAirdropLoading] = useState(false);
  
  // Handle form input changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // Clear any previous error when user makes changes
    if (error) setError('');
  };
  
  // Handle image upload
  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setImage(e.target.files[0]);
    }
  };
  
  // Go to next step
  const handleNextStep = (e) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.name.trim()) {
      setError('Token name is required');
      return;
    }
    
    if (!formData.symbol.trim()) {
      setError('Token symbol is required');
      return;
    }

    if (formData.initialSupply <= 0) {
      setError('Initial supply must be greater than 0');
      return;
    }
    
    setError('');
    setStep(2);
  };
  
  // Go back to previous step
  const handlePrevStep = () => {
    setStep(1);
  };
  
  // Submit form with retry logic for rate limiting
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');
    setTokenResponse(null);
    
    try {
      // Create form data object for file upload
      const data = new FormData();
      data.append('name', formData.name);
      data.append('symbol', formData.symbol.toUpperCase());
      data.append('description', formData.description);
      data.append('decimals', formData.decimals);
      data.append('initialSupply', formData.initialSupply);
      data.append('userWallet', publicKey);
      
      if (formData.createPool) {
        data.append('initialLiquidity', formData.initialLiquidity);
        data.append('percentage', formData.percentage);
      }
      
      if (image) {
        data.append('image', image);
      }
      
      // Determine API endpoint based on whether to create a pool
      const endpoint = formData.createPool ? 
        `${API_URL}/token/create-with-pool` : 
        `${API_URL}/token/create`;
      
      console.log('Submitting token creation to:', endpoint);
      
      // Add retry logic for token creation
      let retries = 3;
      let success = false;
      let response;
      
      while (retries > 0 && !success) {
        try {
          response = await axios.post(endpoint, data, {
            headers: {
              'Content-Type': 'multipart/form-data'
            },
            // Add longer timeout for network issues
            timeout: 120000 // 2 minutes
          });
          
          // If we get here, the request succeeded
          success = true;
        } catch (err) {
          console.warn(`Token creation attempt failed, ${retries-1} retries left`, err);
          retries--;
          
          // Rate limited - wait longer between retries (429 status)
          if (err.response && err.response.status === 429) {
            setError(`Rate limit exceeded. Retrying in 5 seconds... (${retries} attempts left)`);
            await delay(5000); // 5 second delay
          } else {
            // Other errors - shorter delay
            await delay(2000);
          }
          
          if (retries === 0) {
            // Re-throw the error if we're out of retries
            throw err;
          }
        }
      }
      
      console.log('Token creation response:', response.data);
      
      // Check for errors in the response
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      // Store token in local storage for fallback
      try {
        // Get existing tokens
        const existingTokens = localStorage.getItem('localTokens');
        let tokensArray = existingTokens ? JSON.parse(existingTokens) : [];
        
        // Add new token
        const newToken = {
          mint: response.data.mint,
          symbol: response.data.symbol,
          name: response.data.name,
          balance: parseFloat(response.data.initialSupply) || 0,
          decimals: parseInt(response.data.decimals) || 9
        };
        
        // Check if token already exists (by mint)
        const existingIndex = tokensArray.findIndex(t => t.mint === newToken.mint);
        if (existingIndex >= 0) {
          tokensArray[existingIndex] = newToken; // Replace existing
        } else {
          tokensArray.push(newToken); // Add new
        }
        
        // Save back to localStorage
        localStorage.setItem('localTokens', JSON.stringify(tokensArray));
        
        // If pool was created, store it in local pools too
        if (response.data.pool) {
          const existingPools = localStorage.getItem('localPools');
          let poolsArray = existingPools ? JSON.parse(existingPools) : [];
          
          // Add new pool, ensuring it has required properties
          const newPool = {
            ...response.data.pool,
            baseMint: response.data.mint,
            baseSymbol: response.data.symbol,
            baseName: response.data.name,
            baseDecimals: parseInt(response.data.decimals) || 9,
            quoteMint: response.data.pool.quoteMint || 'So11111111111111111111111111111111111111112',
            quoteSymbol: response.data.pool.quoteSymbol || 'SOL',
            quoteName: response.data.pool.quoteName || 'Solana',
            quoteDecimals: 9,
            createdAt: new Date().toISOString()
          };
          
          // Check if pool already exists
          const existingPoolIndex = poolsArray.findIndex(p => 
            p.poolId === newPool.poolId || 
            (p.baseMint === newPool.baseMint && p.quoteMint === newPool.quoteMint)
          );
          
          if (existingPoolIndex >= 0) {
            poolsArray[existingPoolIndex] = newPool; // Replace existing
          } else {
            poolsArray.push(newPool); // Add new
          }
          
          // Save back to localStorage
          localStorage.setItem('localPools', JSON.stringify(poolsArray));
        }
      } catch (e) {
        console.error('Error storing token in local storage:', e);
      }
      
      // Set success message and response data
      setSuccess(`Token ${response.data.symbol} created successfully!`);
      setTokenResponse(response.data);
      
      // Reset form
      setFormData({
        name: '',
        symbol: '',
        description: '',
        decimals: '9',
        initialSupply: '1000000000',
        initialLiquidity: '1',
        percentage: '10',
        createPool: true,
      });
      setImage(null);
      setStep(1);
      
      // Call onSuccess callback
      if (typeof onSuccess === 'function') {
        onSuccess(response.data);
      }
      
      // Refresh data after a short delay to allow blockchain to update
      setTimeout(() => {
        if (typeof refreshData === 'function') {
          refreshData();
        }
      }, 2000);
      
    } catch (err) {
      console.error('Error creating token:', err);
      
      // Handle different types of errors
      if (err.response) {
        // The request was made and the server responded with an error status
        if (err.response.status === 429) {
          setError('Rate limit exceeded. Please wait a moment and try again.');
        } else if (err.response.status === 503 || err.response.status === 504) {
          setError('Server is busy or unavailable. Please try again later.');
        } else {
          setError(err.response.data?.error || `Server error (${err.response.status}): ${err.response.statusText}`);
        }
      } else if (err.request) {
        // The request was made but no response was received
        if (err.code === 'ECONNABORTED') {
          setError('Request timed out. The server might be overloaded, please try again later.');
        } else {
          setError('Network error - please check your connection and try again.');
        }
      } else {
        // Something happened in setting up the request
        setError(err.message || 'An error occurred while creating your token.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Function to handle requesting an airdrop with retry logic
  const requestAirdrop = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet first');
      return;
    }
    
    setAirdropLoading(true);
    setError('');
    setSuccess('');
    
    try {
      // Add retry logic
      let retries = 3;
      let success = false;
      let response;
      
      while (retries > 0 && !success) {
        try {
          response = await axios.post(`${API_URL}/wallet/airdrop`, {
            publicKey,
            amount: 1 // Request 1 SOL
          }, {
            timeout: 60000 // 1 minute timeout
          });
          
          // If we get here, the request succeeded
          success = true;
        } catch (err) {
          console.warn(`Airdrop attempt failed, ${retries-1} retries left`, err);
          retries--;
          
          // Rate limited - wait longer between retries
          if (err.response && err.response.status === 429) {
            await delay(5000); // 5 second delay
          } else {
            // Other errors - shorter delay
            await delay(2000);
          }
          
          if (retries === 0) {
            // Re-throw the error if we're out of retries
            throw err;
          }
        }
      }
      
      if (response.data.success) {
        setSuccess('Successfully requested 1 SOL airdrop. It may take a few seconds to appear in your wallet.');
        
        // Wait 5 seconds before refreshing data
        setTimeout(() => {
          if (typeof refreshData === 'function') {
            refreshData();
          }
        }, 5000);
      } else if (response.data.error) {
        throw new Error(response.data.error);
      } else {
        throw new Error('Unknown error requesting airdrop');
      }
    } catch (err) {
      console.error('Error requesting airdrop:', err);
      
      // Handle different types of errors
      if (err.response) {
        if (err.response.status === 429) {
          setError('Rate limit exceeded. Please wait a moment before requesting another airdrop.');
        } else {
          setError(err.response.data?.error || `Airdrop failed (${err.response.status})`);
        }
      } else if (err.request) {
        setError('Network error while requesting airdrop. Please try again later.');
      } else {
        setError(err.message || 'Failed to request airdrop');
      }
    } finally {
      setAirdropLoading(false);
    }
  };
  
  return (
    <div className="token-form-container">
      <h2>Create New Token</h2>
      
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
      
      {!connected ? (
        <div className="connect-wallet-prompt">
          <p>Please connect your wallet to create tokens.</p>
        </div>
      ) : (
        <>
          {/* Airdrop button for devnet testing */}
          <div className="airdrop-container">
            <button 
              type="button" 
              onClick={requestAirdrop} 
              className="airdrop-btn"
              disabled={airdropLoading || loading}
            >
              {airdropLoading ? 'Requesting...' : 'Request 1 SOL Airdrop (Devnet)'}
            </button>
          </div>
          
          {/* Step indicator */}
          <div className="step-indicator">
            <div className={`step ${step === 1 ? 'active' : ''}`}>1. Token Info</div>
            <div className={`step ${step === 2 ? 'active' : ''}`}>2. Liquidity</div>
          </div>
          
          <form onSubmit={step === 1 ? handleNextStep : handleSubmit}>
            {/* Step 1: Token Information */}
            {step === 1 && (
              <>
                <div className="form-group">
                  <label htmlFor="name">Token Name *</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="My Token"
                    required
                    disabled={loading}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="symbol">Token Symbol *</label>
                  <input
                    type="text"
                    id="symbol"
                    name="symbol"
                    value={formData.symbol}
                    onChange={handleChange}
                    placeholder="MTK"
                    required
                    maxLength="10"
                    disabled={loading}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="A description of your token"
                    rows="3"
                    disabled={loading}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="decimals">Decimals</label>
                  <input
                    type="number"
                    id="decimals"
                    name="decimals"
                    value={formData.decimals}
                    onChange={handleChange}
                    min="0"
                    max="9"
                    disabled={loading}
                  />
                  <span className="help-text">0-9, typically 9 for most tokens</span>
                </div>
                
                <div className="form-group">
                  <label htmlFor="initialSupply">Initial Supply</label>
                  <input
                    type="number"
                    id="initialSupply"
                    name="initialSupply"
                    value={formData.initialSupply}
                    onChange={handleChange}
                    min="1"
                    disabled={loading}
                  />
                  <span className="help-text">Total tokens to create</span>
                </div>
                
                <div className="form-group">
                  <label htmlFor="image">Token Image (Optional)</label>
                  <input
                    type="file"
                    id="image"
                    name="image"
                    onChange={handleImageChange}
                    accept="image/*"
                    disabled={loading}
                  />
                  <span className="help-text">JPG, PNG, or GIF, max 5MB</span>
                </div>
                
                <div className="form-group checkbox-group">
                  <input
                    type="checkbox"
                    id="createPool"
                    name="createPool"
                    checked={formData.createPool}
                    onChange={handleChange}
                    disabled={loading}
                  />
                  <label htmlFor="createPool">Create Pool & Market (Recommended)</label>
                </div>
                
                <div className="form-actions">
                  <button type="submit" className="next-btn" disabled={loading}>
                    {loading ? 'Processing...' : 'Next'}
                  </button>
                </div>
              </>
            )}
            
            {/* Step 2: Pool Information */}
            {step === 2 && (
              <>
                {formData.createPool ? (
                  <>
                    <h3>Pool Configuration</h3>
                    <div className="form-group">
                      <label htmlFor="initialLiquidity">Initial SOL Liquidity</label>
                      <input
                        type="number"
                        id="initialLiquidity"
                        name="initialLiquidity"
                        value={formData.initialLiquidity}
                        onChange={handleChange}
                        min="0.01"
                        step="0.01"
                        disabled={loading}
                      />
                      <span className="help-text">Amount of SOL to add to the pool</span>
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="percentage">Token Percentage for Pool</label>
                      <input
                        type="number"
                        id="percentage"
                        name="percentage"
                        value={formData.percentage}
                        onChange={handleChange}
                        min="1"
                        max="100"
                        disabled={loading}
                      />
                      <span className="help-text">Percentage of token supply to add to the pool</span>
                    </div>
                    
                    <div className="price-preview">
                      <h4>Initial Price Estimate</h4>
                      <p>
                        {((formData.initialLiquidity * 100) / (formData.initialSupply * (formData.percentage / 100))).toFixed(9)} SOL per {formData.symbol || 'token'}
                      </p>
                      <p className="info-text">
                        This will create a liquidity pool with {formData.initialLiquidity} SOL and {(formData.initialSupply * (formData.percentage / 100)).toLocaleString()} {formData.symbol || 'tokens'}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="info-box">
                    <h3>Token Only</h3>
                    <p>You've chosen to create a token without a liquidity pool.</p>
                    <p>You can create a pool later from the token management page.</p>
                  </div>
                )}
                
                <div className="form-actions">
                  <button type="button" onClick={handlePrevStep} className="back-btn" disabled={loading}>Back</button>
                  <button type="submit" disabled={loading} className="submit-btn">
                    {loading ? 'Creating...' : 'Create Token'}
                  </button>
                </div>
              </>
            )}
          </form>

          {/* Show token details if available */}
          {tokenResponse && (
            <div className="token-response">
              <h3>Token Created Successfully</h3>
              <div className="token-info">
                <div className="info-row">
                  <span className="label">Token Name:</span>
                  <span className="value">{tokenResponse.name}</span>
                </div>
                <div className="info-row">
                  <span className="label">Symbol:</span>
                  <span className="value">{tokenResponse.symbol}</span>
                </div>
                <div className="info-row">
                  <span className="label">Mint Address:</span>
                  <span className="value">{tokenResponse.mint}</span>
                </div>
                <div className="info-row">
                  <span className="label">Decimals:</span>
                  <span className="value">{tokenResponse.decimals}</span>
                </div>
                <div className="info-row">
                  <span className="label">Initial Supply:</span>
                  <span className="value">{tokenResponse.initialSupply}</span>
                </div>
                {tokenResponse.pool && (
                  <>
                    <h4>Pool Information</h4>
                    <div className="info-row">
                      <span className="label">Pool ID:</span>
                      <span className="value">{tokenResponse.pool.poolId}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Pool Type:</span>
                      <span className="value">{tokenResponse.pool.isPlaceholder ? 'Placeholder' : tokenResponse.pool.type}</span>
                    </div>
                    {tokenResponse.initialPrice && (
                      <div className="info-row">
                        <span className="label">Initial Price:</span>
                        <span className="value">{tokenResponse.initialPrice.toFixed(9)} SOL</span>
                      </div>
                    )}
                    {tokenResponse.pool.error && (
                      <div className="warning-message">
                        <strong>Note:</strong> {tokenResponse.pool.error}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="form-actions" style={{justifyContent: 'center', marginTop: '20px'}}>
                <button type="button" onClick={refreshData} className="submit-btn">
                  View My Tokens
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TokenCreationForm;