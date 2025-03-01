import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer, { FileFilterCallback } from 'multer';
import fs from 'fs';
import path from 'path';
import { 
  createPool, 
  addLiquidity, 
  removeLiquidity, 
  swap, 
  getPoolInfo,
  getUserTokens,
  createTokenWithPool,
  getPoolsByToken,
  getUserPools,
  createPlaceholderPool,
  readPoolsData,
  writePoolsData
} from './raydium';
import { createToken, getTokenBalance, getTokenMetadata } from './token';
import { keypair, CLUSTER, connection } from './config';
import RateLimit from 'express-rate-limit';
import { requestAirdrop } from './config';
import { PublicKey } from '@solana/web3.js';
// Add error handling utility function
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Configure multer for file uploads (for token images)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const apiLimiter = RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Serve static files from public directory if it exists
if (fs.existsSync(path.join(__dirname, '../public'))) {
  app.use(express.static(path.join(__dirname, '../public')));
}

// API Routes

// Wallet info
app.get('/api/wallet', async (req: Request, res: Response) => {
  try {
    const userWallet = req.query.publicKey as string;
    
    if (!userWallet) {
      return res.status(400).json({ 
        error: 'Connected wallet public key is required',
        isConnected: false
      });
    }
    
    try {
      const publicKey = new PublicKey(userWallet);
      const balance = await connection.getBalance(publicKey);
      
      res.json({
        publicKey: userWallet,
        cluster: CLUSTER,
        balance: balance / 1e9 // Convert lamports to SOL
      });
    } catch (error) {
      console.error('Error getting balance for connected wallet:', error);
      res.status(400).json({ 
        error: 'Invalid wallet public key'
      });
    }
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Token Operations
app.post('/api/token/create', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const { name, symbol, description, decimals, initialSupply } = req.body;
    
    // Validate inputs
    if (!name || !symbol) {
      return res.status(400).json({ error: 'Token name and symbol are required' });
    }
    
    // Get image buffer if it exists
    const image = req.file ? req.file.buffer : undefined;
    
    const result = await createToken({
      name,
      symbol,
      description,
      decimals: parseInt(decimals) || 9,
      initialSupply: parseInt(initialSupply) || 1000000000,
      image
    });
    
    // Create a placeholder pool for the token
    // This allows the UI to show the token even without a real pool
    try {
      await createPlaceholderPool(result);
    } catch (placeholderError) {
      console.warn('Could not create placeholder pool:', placeholderError);
      // Continue anyway, this is not critical
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error creating token:', error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Create token with market and pool in one operation
app.post('/api/token/create-with-pool', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const { 
      name, 
      symbol, 
      description, 
      decimals, 
      initialSupply, 
      initialLiquidity,
      percentage 
    } = req.body;
    
    console.log('Received request to create token with pool:');
    console.log({ name, symbol, decimals, initialSupply, initialLiquidity, percentage });
    
    // Validate inputs
    if (!name || !symbol) {
      return res.status(400).json({ error: 'Token name and symbol are required' });
    }
    
    // Parse numeric values with fallbacks
    const parsedDecimals = parseInt(decimals) || 9;
    const parsedSupply = parseInt(initialSupply) || 1000000000;
    const parsedLiquidity = parseFloat(initialLiquidity) || 1;
    const poolPercentage = parseFloat(percentage) || 10;
    
    // Get image buffer if it exists
    const image = req.file ? req.file.buffer : undefined;
    
    try {
      // Step 1: Create the token
      console.log(`Creating token: ${name} (${symbol})`);
      const tokenResult = await createToken({
        name,
        symbol,
        description,
        decimals: parsedDecimals,
        initialSupply: parsedSupply,
        image
      });
      
      console.log('Token created:', tokenResult);
      
      try {
        // Wait a moment to ensure the token is properly registered on the blockchain
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Step 2: Create CPMM pool directly (no market needed)
        console.log(`Creating pool with ${parsedLiquidity} SOL for token ${tokenResult.mint}`);
        const result = await createTokenWithPool(tokenResult, parsedLiquidity);
        
        console.log('Pool creation result:', result);
        
        // Return successful result
        return res.json(result);
      } catch (poolError) {
        console.error('Error creating CPMM pool:', poolError);
        
        // Create a placeholder pool and return the token
        try {
          const placeholderPool = {
            poolId: `placeholder-${tokenResult.mint.slice(0, 8)}`,
            txId: '',
            type: "CPMM",
            baseMint: tokenResult.mint,
            baseName: tokenResult.name || 'Unknown',
            baseSymbol: tokenResult.symbol || 'UNK',
            baseDecimals: tokenResult.decimals,
            baseAmount: 0,
            quoteMint: 'So11111111111111111111111111111111111111112',
            quoteName: 'Solana',
            quoteSymbol: 'SOL',
            quoteDecimals: 9,
            quoteAmount: 0,
            lpMint: '',
            createdAt: new Date().toISOString(),
            owner: keypair.publicKey.toBase58(),
            initialPrice: 0,
            isPlaceholder: true
          };
          
          // Save placeholder pool to local database
          const pools = readPoolsData();
          pools.push(placeholderPool);
          writePoolsData(pools);
          
          return res.status(202).json({
            ...tokenResult,
            pool: placeholderPool,
            error: CLUSTER === 'devnet' 
              ? 'On devnet, only placeholder pools can be created. For real pools, use mainnet.'
              : 'CPMM Pool creation failed. You can try creating it manually.',
            errorDetails: getErrorMessage(poolError)
          });
        } catch (placeholderError) {
          // Just return the token if placeholder creation also fails
          return res.status(202).json({
            ...tokenResult,
            pool: null,
            error: 'CPMM Pool creation failed. You can create a pool manually.',
            errorDetails: getErrorMessage(poolError)
          });
        }
      }
    } catch (tokenError) {
      console.error('Error creating token:', tokenError);
      return res.status(500).json({ 
        error: getErrorMessage(tokenError),
        step: 'token_creation'
      });
    }
  } catch (error) {
    console.error('Error in token/create-with-pool endpoint:', error);
    return res.status(500).json({ 
      error: getErrorMessage(error),
      step: 'token_creation'
    });
  }
});

app.get('/api/token/balance/:mintAddress', async (req: Request, res: Response) => {
  try {
    const { mintAddress } = req.params;
    const owner = req.query.owner as string | undefined;
    
    const result = await getTokenBalance(
      mintAddress,
      owner
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.get('/api/token/metadata/:mintAddress', async (req: Request, res: Response) => {
  try {
    const { mintAddress } = req.params;
    const result = await getTokenMetadata(mintAddress);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

app.get('/api/token/list', async (req: Request, res: Response) => {
  try {
    const owner = req.query.publicKey as string;
    
    if (!owner) {
      return res.status(400).json({ 
        error: 'Wallet public key is required'
      });
    }
    
    const tokens = await getUserTokens(owner);
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});


// Pool Operations
app.post('/api/pool/create', async (req: Request, res: Response) => {
  try {
    const { baseMint, quoteMint, baseAmount, quoteAmount } = req.body;
    
    if (!baseMint || !quoteMint) {
      return res.status(400).json({ error: 'Base mint and quote mint are required' });
    }
    
    if (!baseAmount || !quoteAmount) {
      return res.status(400).json({ error: 'Base amount and quote amount are required' });
    }
    
    const result = await createPool(
      baseMint,
      quoteMint, 
      parseFloat(baseAmount), 
      parseFloat(quoteAmount)
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});


app.get('/api/pool/:poolId', async (req: Request, res: Response) => {
  try {
    const { poolId } = req.params;
    
    if (!poolId) {
      return res.status(400).json({ error: 'Pool ID is required' });
    }
    
    const result = await getPoolInfo(poolId);
    
    if (result === null) {
      return res.status(404).json({ error: 'Pool not found or invalid pool ID' });
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Get all pools for a specific token
app.get('/api/pool/token/:mintAddress', async (req: Request, res: Response) => {
  try {
    const { mintAddress } = req.params;
    
    if (!mintAddress) {
      return res.status(400).json({ error: 'Mint address is required' });
    }
    
    const pools = await getPoolsByToken(mintAddress);
    res.json(pools);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Get all pools created by the user
app.get('/api/pool/list', async (req: Request, res: Response) => {
  try {
    const pools = await getUserPools();
    res.json(pools);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Liquidity Operations
app.post('/api/liquidity/add', async (req: Request, res: Response) => {
  try {
    const { poolId, amount, fixedSide, slippage } = req.body;
    
    if (!poolId) {
      return res.status(400).json({ error: 'Pool ID is required' });
    }
    
    if (amount === undefined) {
      return res.status(400).json({ error: 'Amount is required' });
    }
    
    // Check if pool exists
    const poolInfo = await getPoolInfo(poolId);
    if (poolInfo === null) {
      return res.status(404).json({ error: 'Pool not found or invalid pool ID' });
    }
    
    // Check if it's a placeholder pool
    if (poolInfo.isPlaceholder) {
      return res.status(400).json({ 
        error: 'This is a placeholder pool. You need to create a real pool first.'
      });
    }
    
    const result = await addLiquidity(
      poolId, 
      parseFloat(amount), 
      fixedSide as 'a' | 'b', 
      parseFloat(slippage) || 1
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Remove liquidity from a CPMM pool
app.post('/api/liquidity/remove', async (req: Request, res: Response) => {
  try {
    const { poolId, lpAmount, slippage } = req.body;
    
    if (!poolId) {
      return res.status(400).json({ error: 'Pool ID is required' });
    }
    
    if (lpAmount === undefined) {
      return res.status(400).json({ error: 'LP amount is required' });
    }
    
    // Check if pool exists
    const poolInfo = await getPoolInfo(poolId);
    if (poolInfo === null) {
      return res.status(404).json({ error: 'Pool not found or invalid pool ID' });
    }
    
    // Check if it's a placeholder pool
    if (poolInfo.isPlaceholder) {
      return res.status(400).json({ 
        error: 'This is a placeholder pool. You need to create a real pool first.'
      });
    }
    
    const result = await removeLiquidity(
      poolId, 
      parseFloat(lpAmount), 
      parseFloat(slippage) || 1
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Swap tokens using a CPMM pool
app.post('/api/swap', async (req: Request, res: Response) => {
  try {
    const { poolId, inputMint, amount, fixedSide, slippage } = req.body;
    
    if (!poolId) {
      return res.status(400).json({ error: 'Pool ID is required' });
    }
    
    if (!inputMint) {
      return res.status(400).json({ error: 'Input mint is required' });
    }
    
    if (amount === undefined) {
      return res.status(400).json({ error: 'Amount is required' });
    }
    
    // Check if pool exists
    const poolInfo = await getPoolInfo(poolId);
    if (poolInfo === null) {
      return res.status(404).json({ error: 'Pool not found or invalid pool ID' });
    }
    
    // Check if it's a placeholder pool
    if (poolInfo.isPlaceholder) {
      return res.status(400).json({ 
        error: 'This is a placeholder pool. You need to create a real pool first.'
      });
    }
    
    const result = await swap(
      poolId, 
      inputMint, 
      parseFloat(amount), 
      fixedSide as 'in' | 'out', 
      parseFloat(slippage) || 1
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});


app.post('/api/wallet/airdrop', async (req: Request, res: Response) => {
  try {
    const { publicKey, amount } = req.body;
    
    if (!publicKey) {
      return res.status(400).json({ error: 'Public key is required' });
    }
    
    if (CLUSTER !== 'devnet') {
      return res.status(400).json({ error: 'Airdrops only available on devnet' });
    }
    
    const signature = await requestAirdrop(publicKey, parseFloat(amount) || 1);
    
    res.json({
      success: true,
      signature,
      publicKey,
      amount: parseFloat(amount) || 1
    });
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Create placeholder pool for a token
app.post('/api/pool/placeholder', async (req: Request, res: Response) => {
  try {
    const { mint, name, symbol, decimals } = req.body;
    
    if (!mint) {
      return res.status(400).json({ error: 'Token mint address is required' });
    }
    
    const tokenInfo = {
      mint,
      name: name || 'Unknown Token',
      symbol: symbol || 'UNK',
      decimals: parseInt(decimals) || 9,
      initialSupply: 0,
      tokenAccount: ''
    };
    
    const placeholderPool = await createPlaceholderPool(tokenInfo);
    res.json(placeholderPool);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Default route for SPA
app.get('*', (req: Request, res: Response) => {
  if (fs.existsSync(path.join(__dirname, '../public/index.html'))) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.get('/api/wallet/info', async (req: Request, res: Response) => {
  try {
    const userWallet = req.query.publicKey as string;
    
    if (!userWallet) {
      return res.status(400).json({ 
        error: 'Connected wallet public key is required',
        isConnected: false
      });
    }
    
    try {
      const publicKey = new PublicKey(userWallet);
      const balance = await connection.getBalance(publicKey);
      
      res.json({
        publicKey: userWallet,
        cluster: CLUSTER,
        balance: balance / 1e9, // Convert lamports to SOL
        isConnected: true
      });
    } catch (error) {
      console.error('Error getting balance for connected wallet:', error);
      res.status(400).json({ 
        error: 'Invalid wallet public key',
        isConnected: false
      });
    }
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Error handler middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: getErrorMessage(err) });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Wallet: ${keypair.publicKey.toBase58()}`);
  console.log(`Cluster: ${CLUSTER}`);
});