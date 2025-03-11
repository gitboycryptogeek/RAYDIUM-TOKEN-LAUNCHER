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
  const [imagePreview, setImagePreview] = useState(null);
  
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
      const selectedImage = e.target.files[0];
      setImage(selectedImage);
      
      // Create a preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(selectedImage);
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
            timeout: 120000 // 2 minutes
          });
          
          // If we get here, the request succeeded
          success = true;
        } catch (err) {
          console.warn(`Token creation attempt failed, ${retries-1} retries left`, err);
          retries--;
          
          if (err.response && err.response.status === 429) {
            setError(`Rate limit exceeded. Retrying in 5 seconds... (${retries} attempts left)`);
            await delay(5000); // 5 second delay
          } else {
            await delay(2000);
          }
          
          if (retries === 0) {
            throw err;
          }
        }
      }
      
      console.log('Token creation response:', response.data);
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      // Store token in local storage for fallback
      try {
        const existingTokens = localStorage.getItem('localTokens');
        let tokensArray = existingTokens ? JSON.parse(existingTokens) : [];
        
        const newToken = {
          mint: response.data.mint,
          symbol: response.data.symbol,
          name: response.data.name,
          balance: parseFloat(response.data.initialSupply) || 0,
          decimals: parseInt(response.data.decimals) || 9
        };
        
        const existingIndex = tokensArray.findIndex(t => t.mint === newToken.mint);
        if (existingIndex >= 0) {
          tokensArray[existingIndex] = newToken;
        } else {
          tokensArray.push(newToken);
        }
        
        localStorage.setItem('localTokens', JSON.stringify(tokensArray));
        
        if (response.data.pool) {
          const existingPools = localStorage.getItem('localPools');
          let poolsArray = existingPools ? JSON.parse(existingPools) : [];
          
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
          
          const existingPoolIndex = poolsArray.findIndex(p => 
            p.poolId === newPool.poolId || 
            (p.baseMint === newPool.baseMint && p.quoteMint === newPool.quoteMint)
          );
          
          if (existingPoolIndex >= 0) {
            poolsArray[existingPoolIndex] = newPool;
          } else {
            poolsArray.push(newPool);
          }
          
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
      setImagePreview(null);
      setStep(1);
      
      // Call onSuccess callback
      if (typeof onSuccess === 'function') {
        onSuccess(response.data);
      }
      
      // Refresh data after a short delay
      setTimeout(() => {
        if (typeof refreshData === 'function') {
          refreshData();
        }
      }, 2000);
      
    } catch (err) {
      console.error('Error creating token:', err);
      
      // Handle different types of errors
      if (err.response) {
        if (err.response.status === 429) {
          setError('Rate limit exceeded. Please wait a moment and try again.');
        } else if (err.response.status === 503 || err.response.status === 504) {
          setError('Server is busy or unavailable. Please try again later.');
        } else {
          setError(err.response.data?.error || `Server error (${err.response.status}): ${err.response.statusText}`);
        }
      } else if (err.request) {
        if (err.code === 'ECONNABORTED') {
          setError('Request timed out. The server might be overloaded, please try again later.');
        } else {
          setError('Network error - please check your connection and try again.');
        }
      } else {
        setError(err.message || 'An error occurred while creating your token.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Request airdrop function
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
            amount: 1
          }, {
            timeout: 60000
          });
          
          success = true;
        } catch (err) {
          console.warn(`Airdrop attempt failed, ${retries-1} retries left`, err);
          retries--;
          
          if (err.response && err.response.status === 429) {
            await delay(5000);
          } else {
            await delay(2000);
          }
          
          if (retries === 0) {
            throw err;
          }
        }
      }
      
      if (response.data.success) {
        setSuccess('Successfully requested 1 SOL airdrop. It may take a few seconds to appear in your wallet.');
        
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
    <div className="modern-form-container">
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
      
      {!connected ? (
        <div className="connect-wallet-prompt">
          <div className="icon-wrapper">
            <i className="wallet-icon">💼</i>
          </div>
          <h3>Wallet Not Connected</h3>
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
          <div className="steps-container">
            <div className={`step-item ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
              <div className="step-number">1</div>
              <div className="step-label">Token Info</div>
            </div>
            <div className="step-connector"></div>
            <div className={`step-item ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
              <div className="step-number">2</div>
              <div className="step-label">Liquidity</div>
            </div>
          </div>
          
          <form onSubmit={step === 1 ? handleNextStep : handleSubmit} className="modern-form">
            {/* Step 1: Token Information */}
            {step === 1 && (
              <div className="form-step">
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
                    className="modern-input"
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
                    className="modern-input"
                  />
                  <small className="input-help">3-5 characters recommended (e.g. BTC, ETH, SOL)</small>
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
                    className="modern-textarea"
                  />
                </div>
                
                <div className="form-row">
                  <div className="form-group half-width">
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
                      className="modern-input"
                    />
                    <small className="input-help">0-9, typically 9 for most tokens</small>
                  </div>
                  
                  <div className="form-group half-width">
                    <label htmlFor="initialSupply">Initial Supply</label>
                    <input
                      type="number"
                      id="initialSupply"
                      name="initialSupply"
                      value={formData.initialSupply}
                      onChange={handleChange}
                      min="1"
                      disabled={loading}
                      className="modern-input"
                    />
                    <small className="input-help">Total tokens to create</small>
                  </div>
                </div>
                
                <div className="form-group">
                  <label htmlFor="image">Token Image (Optional)</label>
                  <div className="image-upload-container">
                    <div 
                      className="image-upload-area"
                      onClick={() => document.getElementById('image').click()}
                    >
                      {imagePreview ? (
                        <img src={imagePreview} alt="Token Preview" className="image-preview" />
                      ) : (
                        <>
                          <div className="upload-icon">📷</div>
                          <p>Click to upload an image</p>
                        </>
                      )}
                      <input
                        type="file"
                        id="image"
                        name="image"
                        onChange={handleImageChange}
                        accept="image/*"
                        disabled={loading}
                        hidden
                      />
                    </div>
                  </div>
                  <small className="input-help">JPG, PNG, or GIF, max 5MB</small>
                </div>
                
                <div className="form-group checkbox-group">
                  <div className="toggle-switch-container">
                    <label className="switch">
                      <input
                        type="checkbox"
                        id="createPool"
                        name="createPool"
                        checked={formData.createPool}
                        onChange={handleChange}
                        disabled={loading}
                      />
                      <span className="slider round"></span>
                    </label>
                    <label htmlFor="createPool" className="toggle-label">Create Pool & Market (Recommended)</label>
                  </div>
                </div>
                
                <div className="form-actions">
                  <button type="submit" className="action-button primary next-btn" disabled={loading}>
                    {loading ? 'Processing...' : 'Next Step'}
                  </button>
                </div>
              </div>
            )}
            
            {/* Step 2: Pool Information */}
            {step === 2 && (
              <div className="form-step">
                {formData.createPool ? (
                  <>
                    <h3>Pool Configuration</h3>
                    <div className="form-row">
                      <div className="form-group half-width">
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
                          className="modern-input"
                        />
                        <small className="input-help">Amount of SOL to add to the pool</small>
                      </div>
                      
                      <div className="form-group half-width">
                        <label htmlFor="percentage">Token Percentage for Pool</label>
                        <div className="slider-container">
                          <input
                            type="range"
                            id="percentage"
                            name="percentage"
                            value={formData.percentage}
                            onChange={handleChange}
                            min="1"
                            max="100"
                            disabled={loading}
                            className="modern-slider"
                          />
                          <span className="slider-value">{formData.percentage}%</span>
                        </div>
                        <small className="input-help">Percentage of token supply to add to the pool</small>
                      </div>
                    </div>
                    
                    <div className="price-preview">
                      <h4>Initial Price Estimate</h4>
                      <div className="price-display">
                        {((formData.initialLiquidity * 100) / (formData.initialSupply * (formData.percentage / 100))).toFixed(9)} SOL per {formData.symbol || 'token'}
                      </div>
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
                  <button type="button" onClick={handlePrevStep} className="action-button secondary back-btn" disabled={loading}>Back</button>
                  <button type="submit" disabled={loading} className="action-button primary submit-btn">
                    {loading ? 'Creating...' : 'Create Token'}
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* Show token details if available */}
          {tokenResponse && (
            <div className="token-response">
              <div className="success-icon">✓</div>
              <h3>Token Created Successfully</h3>
              <div className="token-info-card">
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
                  <span className="value token-address">{tokenResponse.mint}</span>
                </div>
                <div className="info-row">
                  <span className="label">Decimals:</span>
                  <span className="value">{tokenResponse.decimals}</span>
                </div>
                <div className="info-row">
                  <span className="label">Initial Supply:</span>
                  <span className="value">{parseInt(tokenResponse.initialSupply).toLocaleString()}</span>
                </div>
                {tokenResponse.pool && (
                  <>
                    <h4>Pool Information</h4>
                    <div className="info-row">
                      <span className="label">Pool ID:</span>
                      <span className="value pool-address">{tokenResponse.pool.poolId}</span>
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
              <div className="form-actions center">
                <button type="button" onClick={refreshData} className="action-button primary">
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