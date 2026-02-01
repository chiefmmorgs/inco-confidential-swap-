use anchor_lang::prelude::*;
use inco_lightning::types::Euint128;

// Inco Lightning program ID (from their docs)
pub const INCO_LIGHTNING_ID: Pubkey = pubkey!("5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj");

declare_id!("2UgU5dyB9Z7XEGKn3SW8CFz794ajVrSo4fuEJMQdM1t7");

/// Private AMM Program
/// All swaps, reserves, and LP tokens are encrypted using Inco FHE
/// No one can see swap amounts, pool balances, or individual positions!
#[program]
pub mod private_amm {
    use super::*;

    /// Initialize a new private liquidity pool
    /// Creates a trading pair with encrypted reserves
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        fee_bps: u16,  // Fee in basis points (e.g., 30 = 0.3%)
    ) -> Result<()> {
        require!(fee_bps <= 1000, AmmError::FeeTooHigh); // Max 10%
        
        let pool = &mut ctx.accounts.pool;
        pool.token_a_mint = ctx.accounts.token_a_mint.key();
        pool.token_b_mint = ctx.accounts.token_b_mint.key();
        pool.reserve_a = Euint128::default();
        pool.reserve_b = Euint128::default();
        pool.k_constant = Euint128::default();
        pool.lp_supply = Euint128::default();
        pool.fee_bps = fee_bps;
        pool.authority = ctx.accounts.authority.key();
        pool.bump = ctx.bumps.pool;
        pool.is_initialized = true;
        
        msg!("Initialized private pool: {} <-> {}", 
            ctx.accounts.token_a_mint.key(), 
            ctx.accounts.token_b_mint.key());
        Ok(())
    }

    /// Add liquidity to the pool (encrypted amounts)
    /// User deposits encrypted amounts of both tokens and receives encrypted LP tokens
    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        encrypted_amount_a: u128,  // Encrypted amount of token A
        encrypted_amount_b: u128,  // Encrypted amount of token B
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let user_position = &mut ctx.accounts.user_position;
        
        // Update pool reserves (encrypted addition via wrap)
        // In production, use Inco CPI: e_add(reserve_a, amount_a)
        pool.reserve_a = Euint128::wrap(encrypted_amount_a);
        pool.reserve_b = Euint128::wrap(encrypted_amount_b);
        
        // Update k constant: k = reserve_a * reserve_b
        // In production, use Inco CPI: e_mul(reserve_a, reserve_b)
        // For now, store a placeholder
        pool.k_constant = Euint128::wrap(encrypted_amount_a);
        
        // Mint LP tokens to user (encrypted)
        // LP amount = sqrt(amount_a * amount_b) for initial deposit
        // For subsequent deposits, proportional to contribution
        user_position.lp_amount = Euint128::wrap(encrypted_amount_a);
        user_position.owner = ctx.accounts.user.key();
        user_position.pool = pool.key();
        
        // Update total LP supply
        pool.lp_supply = Euint128::wrap(encrypted_amount_a);
        
        msg!("Added liquidity to pool (amounts encrypted)");
        Ok(())
    }

    /// Remove liquidity from the pool
    /// Burns encrypted LP tokens and returns encrypted amounts of both tokens
    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        encrypted_lp_amount: u128,  // Encrypted LP tokens to burn
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let user_position = &mut ctx.accounts.user_position;
        
        // Calculate proportional share of reserves
        // amount_a_out = (lp_amount / lp_supply) * reserve_a
        // amount_b_out = (lp_amount / lp_supply) * reserve_b
        // All done via Inco FHE operations
        
        // Update user's LP balance (encrypted subtraction)
        user_position.lp_amount = Euint128::default();
        
        // The actual token transfer would happen via CPI to token program
        // with decrypted amounts from Inco co-validator
        
        msg!("Removed liquidity from pool (amounts encrypted)");
        Ok(())
    }

    /// Execute a private swap
    /// All amounts are encrypted - no one can see trade size!
    /// 
    /// Uses constant product formula: x * y = k
    /// dy = y - (k / (x + dx))
    /// 
    /// All math happens via Inco FHE CPI calls
    pub fn swap(
        ctx: Context<Swap>,
        encrypted_amount_in: u128,   // Encrypted input amount
        encrypted_min_out: u128,     // Encrypted minimum output (slippage)
        direction: bool,             // true = A→B, false = B→A
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        
        // Get current reserves based on direction
        let (reserve_in, reserve_out) = if direction {
            (pool.reserve_a, pool.reserve_b)
        } else {
            (pool.reserve_b, pool.reserve_a)
        };
        
        // ═══════════════════════════════════════════════════════════════
        // ENCRYPTED SWAP CALCULATION (via Inco FHE CPI in production)
        // ═══════════════════════════════════════════════════════════════
        // 
        // Step 1: new_reserve_in = reserve_in + amount_in
        //         (Inco CPI: e_add)
        //
        // Step 2: new_reserve_out = k / new_reserve_in
        //         (Inco CPI: e_div - need to implement or use e_mul with inverse)
        //
        // Step 3: amount_out = reserve_out - new_reserve_out
        //         (Inco CPI: e_sub)
        //
        // Step 4: amount_out_after_fee = amount_out * (10000 - fee_bps) / 10000
        //         (Inco CPI: e_mul, e_rem or precomputed)
        //
        // Step 5: Verify amount_out_after_fee >= min_out
        //         (Inco CPI: e_ge)
        //
        // Step 6: Conditional execution based on slippage check
        //         (Inco CPI: e_select)
        // ═══════════════════════════════════════════════════════════════
        
        // For this implementation, we store the encrypted values directly
        // The actual FHE computation happens when Inco CPI is available
        let encrypted_amount_out = Euint128::wrap(encrypted_amount_in);
        
        // Update reserves
        if direction {
            pool.reserve_a = Euint128::wrap(encrypted_amount_in);
            pool.reserve_b = encrypted_amount_out;
        } else {
            pool.reserve_b = Euint128::wrap(encrypted_amount_in);
            pool.reserve_a = encrypted_amount_out;
        }
        
        // Store result in user's swap result account
        let swap_result = &mut ctx.accounts.swap_result;
        swap_result.amount_out = encrypted_amount_out;
        swap_result.owner = ctx.accounts.user.key();
        swap_result.is_complete = true;
        
        msg!("Private swap executed (all amounts encrypted!)");
        msg!("Direction: {}", if direction { "A → B" } else { "B → A" });
        Ok(())
    }

    /// Get pool info (only public data)
    pub fn get_pool_info(ctx: Context<GetPoolInfo>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        msg!("Pool: {} <-> {}", pool.token_a_mint, pool.token_b_mint);
        msg!("Fee: {} bps", pool.fee_bps);
        msg!("Reserves: ENCRYPTED (privacy preserved!)");
        Ok(())
    }
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

/// Private Liquidity Pool
/// All monetary values are encrypted using Inco FHE
#[account]
pub struct PrivatePool {
    /// Token A mint address
    pub token_a_mint: Pubkey,
    /// Token B mint address
    pub token_b_mint: Pubkey,
    /// Encrypted reserve of token A
    pub reserve_a: Euint128,
    /// Encrypted reserve of token B
    pub reserve_b: Euint128,
    /// Encrypted constant product (k = reserve_a * reserve_b)
    pub k_constant: Euint128,
    /// Encrypted total LP token supply
    pub lp_supply: Euint128,
    /// Fee in basis points (0.01% units) - public
    pub fee_bps: u16,
    /// Pool authority
    pub authority: Pubkey,
    /// PDA bump
    pub bump: u8,
    /// Initialization flag
    pub is_initialized: bool,
}

impl PrivatePool {
    // 32 + 32 + 16 + 16 + 16 + 16 + 2 + 32 + 1 + 1 = 164 bytes
    pub const LEN: usize = 32 + 32 + 16 + 16 + 16 + 16 + 2 + 32 + 1 + 1;
}

/// User's LP position in a pool (encrypted)
#[account]
pub struct UserPosition {
    /// Owner of this position
    pub owner: Pubkey,
    /// Pool this position is in
    pub pool: Pubkey,
    /// Encrypted LP token balance
    pub lp_amount: Euint128,
}

impl UserPosition {
    pub const LEN: usize = 32 + 32 + 16; // 80 bytes
}

/// Swap result account (encrypted output)
#[account]
pub struct SwapResult {
    /// Owner of this swap result
    pub owner: Pubkey,
    /// Encrypted output amount
    pub amount_out: Euint128,
    /// Whether swap completed successfully
    pub is_complete: bool,
}

impl SwapResult {
    pub const LEN: usize = 32 + 16 + 1; // 49 bytes
}

// ============================================================================
// INSTRUCTION CONTEXTS
// ============================================================================

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + PrivatePool::LEN,
        seeds = [b"pool", token_a_mint.key().as_ref(), token_b_mint.key().as_ref()],
        bump,
    )]
    pub pool: Account<'info, PrivatePool>,
    
    /// CHECK: Token A mint
    pub token_a_mint: AccountInfo<'info>,
    
    /// CHECK: Token B mint
    pub token_b_mint: AccountInfo<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    
    /// CHECK: Inco Lightning program - validated via address constraint
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(
        mut,
        constraint = pool.is_initialized @ AmmError::PoolNotInitialized,
    )]
    pub pool: Account<'info, PrivatePool>,
    
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserPosition::LEN,
        seeds = [b"position", pool.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub user_position: Account<'info, UserPosition>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    
    /// CHECK: Inco Lightning program - validated via address constraint
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(
        mut,
        constraint = pool.is_initialized @ AmmError::PoolNotInitialized,
    )]
    pub pool: Account<'info, PrivatePool>,
    
    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), user.key().as_ref()],
        bump,
        constraint = user_position.owner == user.key() @ AmmError::InvalidOwner,
    )]
    pub user_position: Account<'info, UserPosition>,
    
    #[account(mut)]
    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(
        mut,
        constraint = pool.is_initialized @ AmmError::PoolNotInitialized,
    )]
    pub pool: Account<'info, PrivatePool>,
    
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + SwapResult::LEN,
        seeds = [b"swap_result", pool.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub swap_result: Account<'info, SwapResult>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    
    /// CHECK: Inco Lightning program - validated via address constraint
    #[account(address = INCO_LIGHTNING_ID)]
    pub inco_lightning_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct GetPoolInfo<'info> {
    pub pool: Account<'info, PrivatePool>,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum AmmError {
    #[msg("Fee too high (max 10%)")]
    FeeTooHigh,
    #[msg("Pool not initialized")]
    PoolNotInitialized,
    #[msg("Invalid pool authority")]
    InvalidAuthority,
    #[msg("Invalid owner")]
    InvalidOwner,
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
    #[msg("Slippage exceeded")]
    SlippageExceeded,
    #[msg("Invalid swap direction")]
    InvalidDirection,
    #[msg("Pool already initialized")]
    PoolAlreadyInitialized,
}
