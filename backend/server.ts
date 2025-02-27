import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer, { FileFilterCallback } from 'multer';
import fs from 'fs';
import path from 'path';
import { 
  createMarket, 
  createPool, 
  addLiquidity, 
  removeLiquidity, 
  swap, 
  getPoolInfo,
  getUserTokens,
  createTokenWithPool,
  getPoolsByToken,
  getUserPools,
  createPlaceholderPool
} from './raydium';
import { createToken, getTokenBalance, getTokenMetadata } from './token';
import { keypair, CLUSTER, connection } from './config';
import RateLimit from 'express-rate-limit';

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
    const balance = await connection.getBalance(keypair.publicKey);
    res.json({
      publicKey: keypair.publicKey.toBase58(),
      cluster: CLUSTER,
      balance: balance / 1e9 // Convert lamports to SOL
    });
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
    
    // Step 1: Create the token
    const tokenResult = await createToken({
      name,
      symbol,
      description,
      decimals: parsedDecimals,
      initialSupply: parsedSupply,
      image
    });
    
    // Calculate token amount for pool based on percentage
    const tokenPoolAmount = parsedSupply * (poolPercentage / 100);
    
    try {
      // Step 2: Create market and pool
      const result = await createTokenWithPool(tokenResult, parsedLiquidity);
      
      // If market/pool creation failed but token was created
      if (!result.market || !result.pool) {
        // Create a placeholder pool for navigation in the UI
        try {
          await createPlaceholderPool(tokenResult);
        } catch (placeholderError) {
          console.warn('Could not create placeholder pool:', placeholderError);
          // Continue anyway, not critical
        }
      }
      
      res.json(result);
    } catch (marketPoolError) {
      console.error('Error creating market/pool:', marketPoolError);
      
      // Create a placeholder pool and return the token
      try {
        const placeholderPool = await createPlaceholderPool(tokenResult);
        
        res.status(202).json({
          ...tokenResult,
          market: null,
          pool: placeholderPool,
          error: 'Market/pool creation failed. You can create them manually.',
          errorDetails: getErrorMessage(marketPoolError)
        });
      } catch (placeholderError) {
        // Just return the token if placeholder creation also fails
        res.status(202).json({
          ...tokenResult,
          market: null,
          pool: null,
          error: 'Market/pool creation failed. You can create them manually.',
          errorDetails: getErrorMessage(marketPoolError)
        });
      }
    }
  } catch (error) {
    console.error('Error in token creation process:', error);
    res.status(500).json({ 
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
    const owner = req.query.owner as string || keypair.publicKey.toBase58();
    const tokens = await getUserTokens(owner);
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Market Operations
app.post('/api/market/create', async (req: Request, res: Response) => {
  try {
    const { baseMint, quoteMint, lotSize, tickSize } = req.body;
    
    if (!baseMint || !quoteMint) {
      return res.status(400).json({ error: 'Base mint and quote mint are required' });
    }
    
    const result = await createMarket(
      baseMint, 
      quoteMint, 
      parseFloat(lotSize) || 1, 
      parseFloat(tickSize) || 0.01
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Pool Operations
app.post('/api/pool/create', async (req: Request, res: Response) => {
  try {
    const { marketId, baseAmount, quoteAmount } = req.body;
    
    if (!marketId) {
      return res.status(400).json({ error: 'Market ID is required' });
    }
    
    if (!baseAmount || !quoteAmount) {
      return res.status(400).json({ error: 'Base amount and quote amount are required' });
    }
    
    const result = await createPool(
      marketId, 
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

// Swap Operations
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