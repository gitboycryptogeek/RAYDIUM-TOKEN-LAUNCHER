import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { 
  Raydium, TxVersion, TokenAmount, toToken, Percent,
  ApiV3PoolInfoStandardItem, AmmV4Keys, AmmV5Keys,
  MARKET_STATE_LAYOUT_V3, AMM_V4, OPEN_BOOK_PROGRAM, 
  FEE_DESTINATION_ID, DEVNET_PROGRAM_ID
} from '@raydium-io/raydium-sdk-v2';
import { connection, keypair, CLUSTER } from './config';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { TokenInfo } from './token';
import fs from 'fs';
import path from 'path';

// Database file path for storing local pool data
const DATA_DIR = path.join(__dirname, '../data');
const POOLS_FILE = path.join(DATA_DIR, 'pools.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize Raydium SDK
async function initSdk() {
  return await Raydium.load({
    connection,
    owner: keypair,
    cluster: CLUSTER === 'mainnet' ? 'mainnet' : 'devnet'
  });
}

// Valid AMM program check
const VALID_PROGRAM_ID = new Set([
  AMM_V4.toBase58(),
  DEVNET_PROGRAM_ID.AmmV4.toBase58()
]);

const isValidAmm = (id: string) => VALID_PROGRAM_ID.has(id);

// Helper function to check if a file exists and is not empty
function fileExistsWithData(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch (error) {
    return false;
  }
}

// Helper function to read pools data
function readPoolsData(): any[] {
  if (!fileExistsWithData(POOLS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(POOLS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading pools data:', error);
    return [];
  }
}

// Helper function to write pools data
function writePoolsData(pools: any[]): void {
  try {
    fs.writeFileSync(POOLS_FILE, JSON.stringify(pools, null, 2));
  } catch (error) {
    console.error('Error writing pools data:', error);
  }
}

// Market & Pool Operations
// Enhanced createMarket function with better error handling and retry logic
export async function createMarket(baseMint: string, quoteMint: string, lotSize: number = 1, tickSize: number = 0.01) {
  try {
    console.log(`Creating market for ${baseMint} / ${quoteMint}`);
    const raydium = await initSdk();
    
    // Get token info
    const baseInfo = await raydium.token.getTokenInfo(baseMint);
    const quoteInfo = await raydium.token.getTokenInfo(quoteMint);
    
    console.log(`Base token decimals: ${baseInfo.decimals}, Quote token decimals: ${quoteInfo.decimals}`);
    
    // Check balance first
    const walletBalance = await connection.getBalance(keypair.publicKey);
    console.log(`Wallet balance: ${walletBalance / 1e9} SOL`);
    
    if (walletBalance < 0.1 * 1e9) {
      throw new Error('Insufficient SOL balance. Need at least 0.1 SOL to create a market.');
    }
    
    // Try multiple lot/tick size combinations if needed
    const attempts = [
      { lotSize: 0.01, tickSize: 0.0001 }, // Default for tokens with 9 decimals
      { lotSize: 0.1, tickSize: 0.001 },   // Alternative #1
      { lotSize: 1, tickSize: 0.01 },      // Alternative #2
      { lotSize: 0.001, tickSize: 0.00001 } // Alternative #3
    ];
    
    let lastError = null;
    
    // Try each lot/tick size combination
    for (const attempt of attempts) {
      try {
        console.log(`Trying with lot size: ${attempt.lotSize}, tick size: ${attempt.tickSize}`);
        
        const { execute, extInfo } = await raydium.marketV2.create({
          baseInfo: {
            mint: new PublicKey(baseMint),
            decimals: baseInfo.decimals,
          },
          quoteInfo: {
            mint: new PublicKey(quoteMint),
            decimals: quoteInfo.decimals,
          },
          lotSize: attempt.lotSize,
          tickSize: attempt.tickSize,
          dexProgramId: CLUSTER === 'mainnet' ? OPEN_BOOK_PROGRAM : DEVNET_PROGRAM_ID.OPENBOOK_MARKET,
          txVersion: TxVersion.LEGACY,
        });
        
        // Execute transactions
        console.log('Executing market creation transactions...');
        try {
          const txIds = await execute({ sequentially: true });
          
          console.log('Market created successfully with transactions:', txIds);
          
          return {
            marketId: extInfo.address.marketId.toBase58(),
            baseMint,
            baseName: baseInfo.name || 'Unknown',
            baseSymbol: baseInfo.symbol || 'UNK',
            quoteMint,
            quoteName: quoteInfo.name || 'Unknown',
            quoteSymbol: quoteInfo.symbol || 'UNK',
            transactions: txIds
          };
        } catch (execError) {
          const errorMessage = execError instanceof Error ? execError.message : String(execError);
          console.error(`Execution failed with lot=${attempt.lotSize}, tick=${attempt.tickSize}:`, errorMessage);
          lastError = execError instanceof Error ? execError : new Error(String(execError));
          
          // Continue to next attempt, don't throw here
        }
      } catch (attemptError) {
        const errorMessage = attemptError instanceof Error ? attemptError.message : String(attemptError);
        console.error(`Market creation attempt failed with lot=${attempt.lotSize}, tick=${attempt.tickSize}:`, errorMessage);
        lastError = attemptError instanceof Error ? attemptError : new Error(String(attemptError));
      }
      
      // Short delay before next attempt
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // If we get here, all attempts failed
    console.error('All market creation attempts failed');
    
    let errorMessage = 'Market creation failed after multiple attempts';
    if (lastError instanceof Error) {
      errorMessage += `: ${lastError.message}`;
      
      // Check for specific error types
      if (lastError.message.includes('Custom program error: 0x1')) {
        errorMessage = 'Market creation failed: Insufficient SOL or account already in use';
      } else if (lastError.message.includes('Transaction too large')) {
        errorMessage = 'Market creation failed: Transaction too large';
      }
    }
    
    throw new Error(errorMessage);
  } catch (error) {
    console.error('Error creating market:', error);
    throw error;
  }
}

// This fixes the BN assertion errors in the createPool function
export async function createPool(marketId: string, baseAmount: number, quoteAmount: number) {
  try {
    console.log(`Creating pool for market ${marketId}`);
    const raydium = await initSdk();
    
    // Get market info
    const marketBufferInfo = await connection.getAccountInfo(new PublicKey(marketId));
    if (!marketBufferInfo) {
      throw new Error('Market not found');
    }
    
    const { baseMint, quoteMint } = MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo.data);
    
    // Get token info
    const baseMintInfo = await raydium.token.getTokenInfo(baseMint.toBase58());
    const quoteMintInfo = await raydium.token.getTokenInfo(quoteMint.toBase58());
    
    // Convert amounts to BN safely
    // Fix: Convert to string first to avoid BN.js assertion errors with floating point numbers
    const baseAmountRaw = baseAmount * Math.pow(10, baseMintInfo.decimals);
    const quoteAmountRaw = quoteAmount * Math.pow(10, quoteMintInfo.decimals);
    
    // Ensure we're using integer values for BN
    const baseAmountBN = new BN(Math.floor(baseAmountRaw).toString());
    const quoteAmountBN = new BN(Math.floor(quoteAmountRaw).toString());
    
    console.log(`Base amount: ${baseAmountBN.toString()} (${baseAmount} tokens)`);
    console.log(`Quote amount: ${quoteAmountBN.toString()} (${quoteAmount} tokens)`);
    
    // Create pool
    const { execute, extInfo } = await raydium.liquidity.createPoolV4({
      programId: CLUSTER === 'mainnet' ? AMM_V4 : DEVNET_PROGRAM_ID.AmmV4,
      marketInfo: {
        marketId: new PublicKey(marketId),
        programId: CLUSTER === 'mainnet' ? OPEN_BOOK_PROGRAM : DEVNET_PROGRAM_ID.OPENBOOK_MARKET,
      },
      baseMintInfo: {
        mint: baseMint,
        decimals: baseMintInfo.decimals,
      },
      quoteMintInfo: {
        mint: quoteMint,
        decimals: quoteMintInfo.decimals,
      },
      baseAmount: baseAmountBN,
      quoteAmount: quoteAmountBN,
      startTime: new BN(0),
      ownerInfo: {
        useSOLBalance: true,
      },
      associatedOnly: false,
      txVersion: TxVersion.LEGACY,
      feeDestinationId: CLUSTER === 'mainnet' ? FEE_DESTINATION_ID : DEVNET_PROGRAM_ID.FEE_DESTINATION_ID,
    });
    
    const { txId } = await execute({ sendAndConfirm: true });
    
    // Get additional token info for better UI display
    const poolData = {
      poolId: extInfo.address.ammId.toBase58(),
      txId,
      marketId,
      baseMint: baseMint.toBase58(),
      baseName: baseMintInfo.name || 'Unknown',
      baseSymbol: baseMintInfo.symbol || 'UNK',
      baseDecimals: baseMintInfo.decimals,
      baseAmount: baseAmount,
      quoteMint: quoteMint.toBase58(),
      quoteName: quoteMintInfo.name || 'Unknown',
      quoteSymbol: quoteMintInfo.symbol || 'UNK',
      quoteDecimals: quoteMintInfo.decimals,
      quoteAmount: quoteAmount,
      lpMint: extInfo.address.lpMint.toBase58(),
      createdAt: new Date().toISOString(),
      owner: keypair.publicKey.toBase58(),
      initialPrice: quoteAmount / baseAmount, // Add initial price calculation
    };

    // Save pool data to local file database
    const pools = readPoolsData();
    pools.push(poolData);
    writePoolsData(pools);
    
    return poolData;
  } catch (error) {
    console.error('Error creating pool:', error);
    throw error;
  }
}

// Liquidity Operations
export async function addLiquidity(poolId: string, amountA: number, fixedSide: 'a' | 'b', slippage: number) {
  try {
    console.log(`Adding liquidity to ${poolId}`);
    const raydium = await initSdk();
    
    // Get pool info
    let poolInfo: ApiV3PoolInfoStandardItem;
    let poolKeys: AmmV4Keys | AmmV5Keys | undefined;
    
    if (CLUSTER === 'mainnet') {
      try {
        const data = await raydium.api.fetchPoolById({ ids: poolId });
        poolInfo = data[0] as ApiV3PoolInfoStandardItem;
      } catch (error) {
        console.error('Error fetching pool by ID from API, falling back to RPC:', error);
        const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId });
        poolInfo = data.poolInfo;
        poolKeys = data.poolKeys;
      }
    } else {
      const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId });
      poolInfo = data.poolInfo;
      poolKeys = data.poolKeys;
    }
    
    if (!isValidAmm(poolInfo.programId)) {
      throw new Error('Invalid AMM pool');
    }
    
    // Calculate amounts
    const slippagePercent = new Percent(slippage * 100, 10000);
    const r = raydium.liquidity.computePairAmount({
      poolInfo,
      amount: amountA.toString(),
      baseIn: fixedSide === 'a',
      slippage: slippagePercent,
    });
    
    // Prepare token amounts
    const amountInA = fixedSide === 'a'
      ? new TokenAmount(
          toToken(poolInfo.mintA),
          new Decimal(amountA).mul(10 ** poolInfo.mintA.decimals).toFixed(0)
        )
      : new TokenAmount(
          toToken(poolInfo.mintA),
          new Decimal(r.maxAnotherAmount.toExact()).mul(10 ** poolInfo.mintA.decimals).toFixed(0)
        );
    
    const amountInB = fixedSide === 'b'
      ? new TokenAmount(
          toToken(poolInfo.mintB),
          new Decimal(amountA).mul(10 ** poolInfo.mintB.decimals).toFixed(0)
        )
      : new TokenAmount(
          toToken(poolInfo.mintB),
          new Decimal(r.maxAnotherAmount.toExact()).mul(10 ** poolInfo.mintB.decimals).toFixed(0)
        );
    
    // Execute transaction
    const { execute } = await raydium.liquidity.addLiquidity({
      poolInfo,
      poolKeys,
      amountInA,
      amountInB,
      otherAmountMin: r.minAnotherAmount,
      fixedSide,
      txVersion: TxVersion.LEGACY,
    });
    
    const { txId } = await execute({ sendAndConfirm: true });
    
    return {
      txId,
      poolId,
      tokenA: {
        mint: poolInfo.mintA.address,
        name: poolInfo.mintA.name || 'Unknown',
        symbol: poolInfo.mintA.symbol || 'UNK',
        amount: fixedSide === 'a' ? amountA : parseFloat(r.maxAnotherAmount.toExact())
      },
      tokenB: {
        mint: poolInfo.mintB.address,
        name: poolInfo.mintB.name || 'Unknown',
        symbol: poolInfo.mintB.symbol || 'UNK',
        amount: fixedSide === 'b' ? amountA : parseFloat(r.maxAnotherAmount.toExact())
      }
    };
  } catch (error) {
    console.error('Error adding liquidity:', error);
    throw error;
  }
}

export async function removeLiquidity(poolId: string, lpAmount: number, slippage: number) {
  try {
    console.log(`Removing liquidity from ${poolId}`);
    const raydium = await initSdk();
    
    // Get pool info
    let poolInfo: ApiV3PoolInfoStandardItem;
    let poolKeys: AmmV4Keys | AmmV5Keys | undefined;
    
    if (CLUSTER === 'mainnet') {
      try {
        const data = await raydium.api.fetchPoolById({ ids: poolId });
        poolInfo = data[0] as ApiV3PoolInfoStandardItem;
      } catch (error) {
        console.error('Error fetching pool by ID from API, falling back to RPC:', error);
        const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId });
        poolInfo = data.poolInfo;
        poolKeys = data.poolKeys;
      }
    } else {
      const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId });
      poolInfo = data.poolInfo;
      poolKeys = data.poolKeys;
    }
    
    if (!isValidAmm(poolInfo.programId)) {
      throw new Error('Invalid AMM pool');
    }
    
    // Convert LP amount
    const withdrawLpAmount = new BN(lpAmount * Math.pow(10, poolInfo.lpMint.decimals));
    
    // Calculate expected token amounts
    const [baseRatio, quoteRatio] = [
      new Decimal(poolInfo.mintAmountA).div(poolInfo.lpAmount || 1),
      new Decimal(poolInfo.mintAmountB).div(poolInfo.lpAmount || 1),
    ];
    
    const withdrawAmountDe = new Decimal(withdrawLpAmount.toString()).div(10 ** poolInfo.lpMint.decimals);
    const [withdrawAmountA, withdrawAmountB] = [
      withdrawAmountDe.mul(baseRatio).mul(10 ** (poolInfo?.mintA.decimals || 0)),
      withdrawAmountDe.mul(quoteRatio).mul(10 ** (poolInfo?.mintB.decimals || 0)),
    ];
    
    // Set slippage
    const lpSlippage = slippage / 100;
    
    // Execute transaction
    const { execute } = await raydium.liquidity.removeLiquidity({
      poolInfo,
      poolKeys,
      lpAmount: withdrawLpAmount,
      baseAmountMin: new BN(withdrawAmountA.mul(1 - lpSlippage).toFixed(0)),
      quoteAmountMin: new BN(withdrawAmountB.mul(1 - lpSlippage).toFixed(0)),
      txVersion: TxVersion.LEGACY,
    });
    
    const { txId } = await execute({ sendAndConfirm: true });
    
    return {
      txId,
      poolId,
      lpAmount,
      tokenA: {
        mint: poolInfo.mintA.address,
        name: poolInfo.mintA.name || 'Unknown',
        symbol: poolInfo.mintA.symbol || 'UNK',
        amount: withdrawAmountA.div(10 ** poolInfo.mintA.decimals).toNumber()
      },
      tokenB: {
        mint: poolInfo.mintB.address,
        name: poolInfo.mintB.name || 'Unknown',
        symbol: poolInfo.mintB.symbol || 'UNK',
        amount: withdrawAmountB.div(10 ** poolInfo.mintB.decimals).toNumber()
      }
    };
  } catch (error) {
    console.error('Error removing liquidity:', error);
    throw error;
  }
}

// Swap Operations
export async function swap(poolId: string, inputMint: string, amount: number, fixedSide: 'in' | 'out', slippage: number) {
  try {
    console.log(`Swapping on pool ${poolId}`);
    const raydium = await initSdk();
    
    // Get pool info
    let poolInfo: ApiV3PoolInfoStandardItem;
    let poolKeys: AmmV4Keys | undefined;
    let rpcData: any;
    
    if (CLUSTER === 'mainnet') {
      try {
        const data = await raydium.api.fetchPoolById({ ids: poolId });
        poolInfo = data[0] as ApiV3PoolInfoStandardItem;
        if (!isValidAmm(poolInfo.programId)) {
          throw new Error('Invalid AMM pool');
        }
        poolKeys = await raydium.liquidity.getAmmPoolKeys(poolId);
        rpcData = await raydium.liquidity.getRpcPoolInfo(poolId);
      } catch (error) {
        console.error('Error fetching pool from API, falling back to RPC:', error);
        const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId });
        poolInfo = data.poolInfo;
        poolKeys = data.poolKeys;
        rpcData = data.poolRpcData;
      }
    } else {
      const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId });
      poolInfo = data.poolInfo;
      poolKeys = data.poolKeys;
      rpcData = data.poolRpcData;
    }
    
    const [baseReserve, quoteReserve, status] = [
      rpcData.baseReserve,
      rpcData.quoteReserve,
      rpcData.status.toNumber()
    ];
    
    // Check if input mint matches pool
    if (poolInfo.mintA.address !== inputMint && poolInfo.mintB.address !== inputMint) {
      throw new Error('Input mint does not match pool');
    }
    
    const baseIn = inputMint === poolInfo.mintA.address;
    const [mintIn, mintOut] = baseIn
      ? [poolInfo.mintA, poolInfo.mintB]
      : [poolInfo.mintB, poolInfo.mintA];
    
    // Convert amount to smallest units
    const amountBN = new BN(amount * Math.pow(10, mintIn.decimals));
    
    if (fixedSide === 'in') {
      // Fixed input amount
      const out = raydium.liquidity.computeAmountOut({
        poolInfo: {
          ...poolInfo,
          baseReserve,
          quoteReserve,
          status,
          version: 4,
        },
        amountIn: amountBN,
        mintIn: mintIn.address,
        mintOut: mintOut.address,
        slippage: slippage / 100,
      });
      
      // Execute swap
      const { execute } = await raydium.liquidity.swap({
        poolInfo,
        poolKeys,
        amountIn: amountBN,
        amountOut: out.minAmountOut,
        fixedSide: 'in',
        inputMint: mintIn.address,
        txVersion: TxVersion.LEGACY,
      });
      
      const { txId } = await execute({ sendAndConfirm: true });
      
      return {
        txId,
        poolId,
        inputToken: {
          mint: mintIn.address,
          name: mintIn.name || 'Unknown',
          symbol: mintIn.symbol || 'UNK',
          amount: amount
        },
        outputToken: {
          mint: mintOut.address,
          name: mintOut.name || 'Unknown',
          symbol: mintOut.symbol || 'UNK',
          amount: new Decimal(out.amountOut.toString()).div(10 ** mintOut.decimals).toNumber(),
          minAmount: new Decimal(out.minAmountOut.toString()).div(10 ** mintOut.decimals).toNumber()
        }
      };
    } else {
      // Fixed output amount
      const out = raydium.liquidity.computeAmountIn({
        poolInfo: {
          ...poolInfo,
          baseReserve,
          quoteReserve,
          status,
          version: 4,
        },
        amountOut: amountBN,
        mintIn: mintIn.address,
        mintOut: mintOut.address,
        slippage: slippage / 100,
      });
      
      // Execute swap
      const { execute } = await raydium.liquidity.swap({
        poolInfo,
        poolKeys,
        amountIn: out.maxAmountIn,
        amountOut: amountBN,
        fixedSide: 'out',
        inputMint: mintIn.address,
        txVersion: TxVersion.LEGACY,
      });
      
      const { txId } = await execute({ sendAndConfirm: true });
      
      return {
        txId,
        poolId,
        inputToken: {
          mint: mintIn.address,
          name: mintIn.name || 'Unknown',
          symbol: mintIn.symbol || 'UNK',
          amount: new Decimal(out.amountIn.toString()).div(10 ** mintIn.decimals).toNumber(),
          maxAmount: new Decimal(out.maxAmountIn.toString()).div(10 ** mintIn.decimals).toNumber()
        },
        outputToken: {
          mint: mintOut.address,
          name: mintOut.name || 'Unknown',
          symbol: mintOut.symbol || 'UNK',
          amount: amount
        }
      };
    }
  } catch (error) {
    console.error('Error swapping:', error);
    throw error;
  }
}

// Create token with market and pool
export async function createTokenWithPool(tokenInfo: TokenInfo, initialSolAmount: number): Promise<any> {
  try {
    console.log(`Creating market and pool for token ${tokenInfo.name}`);
    
    // Create market with SOL
    const solMint = 'So11111111111111111111111111111111111111112'; // Native SOL mint
    
    try {
      // Step 1: Create the market
      const market = await createMarket(tokenInfo.mint, solMint);
      
      // Step 2: Calculate token amount based on desired price
      // If initialSolAmount is 1 SOL and we want price of 0.1 SOL per token, we need 10 tokens
      // Default to 10% of token supply if not specified
      const tokenPoolAmount = tokenInfo.initialSupply * 0.1;
      
      try {
        // Step 3: Create the pool with proper error handling
        const pool = await createPool(
          market.marketId,
          tokenPoolAmount,
          initialSolAmount
        );
        
        // Step 4: Calculate and display initial price
        const initialPrice = initialSolAmount / tokenPoolAmount;
        console.log(`Initial token price: ${initialPrice} SOL per ${tokenInfo.symbol}`);
        
        return {
          ...tokenInfo,
          market,
          pool,
          initialPrice
        };
      } catch (poolError) {
        console.error('Pool creation failed, but market was created:', poolError);
        return {
          ...tokenInfo,
          market,
          pool: null,
          error: 'Pool creation failed. You can try creating it manually.',
          errorDetails: poolError instanceof Error ? poolError.message : String(poolError)
        };
      }
    } catch (marketError) {
      console.error('Market creation failed:', marketError);
      return {
        ...tokenInfo,
        market: null,
        pool: null,
        error: 'Market creation failed. You can try creating it manually.',
        errorDetails: marketError instanceof Error ? marketError.message : String(marketError)
      };
    }
  } catch (error) {
    console.error('Error creating token with pool:', error);
    throw error;
  }
}

// Pool Info with validation
export async function getPoolInfo(poolId: string) {
  try {
    // Validate poolId is a valid base58 string
    if (!poolId || poolId.trim() === '' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(poolId)) {
      console.log(`Invalid pool ID format: ${poolId}`);
      return null; // Return null for invalid pool IDs
    }
    
    const raydium = await initSdk();
    
    if (CLUSTER === 'mainnet') {
      try {
        const data = await raydium.api.fetchPoolById({ ids: poolId });
        return data[0];
      } catch (error) {
        console.error('Error fetching pool from API, falling back to RPC:', error);
        try {
          const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId });
          return {
            ...data.poolInfo,
            poolKeys: data.poolKeys,
            lpBalance: await getLpBalance(poolId, keypair.publicKey.toBase58())
          };
        } catch (rpcError) {
          console.error('RPC fallback also failed:', rpcError);
          
          // Check local database for the pool
          const pools = readPoolsData();
          const localPool = pools.find(p => p.poolId === poolId);
          if (localPool) {
            return {
              ...localPool,
              lpBalance: await getLpBalance(poolId, keypair.publicKey.toBase58())
            };
          }
          
          return null;
        }
      }
    } else {
      try {
        const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId });
        return {
          ...data.poolInfo,
          poolKeys: data.poolKeys,
          lpBalance: await getLpBalance(poolId, keypair.publicKey.toBase58())
        };
      } catch (error) {
        console.error('Error getting pool info from RPC:', error);
        
        // Check local database for the pool
        const pools = readPoolsData();
        const localPool = pools.find(p => p.poolId === poolId);
        if (localPool) {
          return {
            ...localPool,
            lpBalance: await getLpBalance(poolId, keypair.publicKey.toBase58())
          };
        }
        
        return null;
      }
    }
  } catch (error) {
    console.error('Error getting pool info:', error);
    return null;
  }
}

// Get all pools for a specific token
export async function getPoolsByToken(mintAddress: string): Promise<any[]> {
  try {
    console.log(`Fetching pools for token ${mintAddress}`);
    
    // For mainnet, we can use the Raydium API
    if (CLUSTER === 'mainnet') {
      const raydium = await initSdk();
      try {
        // Use only the correct method that exists in the API
        const pools = await raydium.api.fetchPoolByMints({
          mint1: mintAddress
        });
        
        // Make sure we return an array, even if the API returns something else
        return Array.isArray(pools) ? pools : [];
      } catch (e) {
        console.error('Error fetching from Raydium API:', e);
        // Fall back to local pool data if API fails
      }
    }
    
    // For devnet or as a fallback, use our local pool data
    const pools = readPoolsData();
    const filteredPools = pools.filter(pool => 
      pool.baseMint === mintAddress || pool.quoteMint === mintAddress
    );
    
    console.log(`Found ${filteredPools.length} pools locally for token ${mintAddress}`);
    return filteredPools;
  } catch (error) {
    console.error('Error getting pools for token:', error);
    return [];
  }
}

// Get all pools created by the user
export async function getUserPools(): Promise<any[]> {
  try {
    const userWallet = keypair.publicKey.toBase58();
    const pools = readPoolsData();
    
    // Filter pools by owner
    const userPools = pools.filter(pool => pool.owner === userWallet);
    console.log(`Found ${userPools.length} pools created by ${userWallet}`);
    return userPools;
  } catch (error) {
    console.error('Error getting user pools:', error);
    return [];
  }
}

// Utility to get LP token balance for a user
async function getLpBalance(poolId: string, ownerAddress: string) {
  try {
    // Skip for invalid pool IDs
    if (!poolId || poolId.trim() === '' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(poolId)) {
      return { lpMint: '', balance: 0 };
    }
    
    const raydium = await initSdk();
    
    let lpMint: string;
    
    if (CLUSTER === 'mainnet') {
      try {
        const data = await raydium.api.fetchPoolById({ ids: poolId });
        const poolData = data[0];
        if ('lpMint' in poolData) {
          lpMint = poolData.lpMint.address;
        } else {
          throw new Error('Pool type not supported');
        }
      } catch (error) {
        console.error('Error fetching pool from API, falling back to RPC:', error);
        try {
          const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId });
          lpMint = data.poolInfo.lpMint.address;
        } catch (rpcError) {
          console.error('Error getting LP mint from RPC:', rpcError);
          
          // Check local pools data
          const pools = readPoolsData();
          const pool = pools.find(p => p.poolId === poolId);
          if (pool && pool.lpMint) {
            lpMint = pool.lpMint;
          } else {
            return { lpMint: '', balance: 0 };
          }
        }
      }
    } else {
      try {
        const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId });
        lpMint = data.poolInfo.lpMint.address;
      } catch (error) {
        console.error('Error getting pool info from RPC:', error);
        
        // Check local pools data
        const pools = readPoolsData();
        const pool = pools.find(p => p.poolId === poolId);
        if (pool && pool.lpMint) {
          lpMint = pool.lpMint;
        } else {
          return { lpMint: '', balance: 0 };
        }
      }
    }
    
    // Find associated token account
    try {
      const owner = new PublicKey(ownerAddress);
      const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_PROGRAM_ID
      });
      
      // Find LP token account
      const lpAccount = accounts.value.find(
        account => account.account.data.parsed.info.mint === lpMint
      );
      
      if (!lpAccount) {
        return {
          lpMint,
          balance: 0
        };
      }
      
      return {
        lpMint,
        balance: parseFloat(lpAccount.account.data.parsed.info.tokenAmount.uiAmount)
      };
    } catch (error) {
      console.error('Error getting token accounts:', error);
      return { lpMint: lpMint || '', balance: 0 };
    }
  } catch (error) {
    console.error('Error getting LP balance:', error);
    return { lpMint: '', balance: 0 };
  }
}

// Get user's token balances
export async function getUserTokens(ownerAddress: string) {
  try {
    const owner = new PublicKey(ownerAddress);
    const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_PROGRAM_ID
    });
    
    // Filter out tokens with zero balance
    return accounts.value
      .filter(account => {
        const tokenAmount = account.account.data.parsed.info.tokenAmount;
        return parseFloat(tokenAmount.uiAmount) > 0;
      })
      .map(account => {
        const { mint, tokenAmount } = account.account.data.parsed.info;
        return {
          mint,
          balance: parseFloat(tokenAmount.uiAmount),
          decimals: tokenAmount.decimals
        };
      });
  } catch (error) {
    console.error('Error getting user tokens:', error);
    return [];
  }
}

// Create a placeholder pool for tokens without actual pools
export async function createPlaceholderPool(tokenInfo: TokenInfo) {
  try {
    const solMint = 'So11111111111111111111111111111111111111112';
    
    const placeholderPool = {
      poolId: `placeholder-${tokenInfo.mint.slice(0, 8)}`,
      txId: '',
      marketId: 'pending',
      baseMint: tokenInfo.mint,
      baseName: tokenInfo.name || 'Unknown',
      baseSymbol: tokenInfo.symbol || 'UNK',
      baseDecimals: tokenInfo.decimals,
      baseAmount: 0,
      quoteMint: solMint,
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
    
    // Add to local database
    const pools = readPoolsData();
    
    // Check if a placeholder already exists for this token
    const existingPlaceholder = pools.find(p => 
      p.baseMint === tokenInfo.mint && (p.isPlaceholder || p.poolId.startsWith('placeholder-'))
    );
    
    if (!existingPlaceholder) {
      pools.push(placeholderPool);
      writePoolsData(pools);
    }
    
    return existingPlaceholder || placeholderPool;
  } catch (error) {
    console.error('Error creating placeholder pool:', error);
    throw error;
  }
}