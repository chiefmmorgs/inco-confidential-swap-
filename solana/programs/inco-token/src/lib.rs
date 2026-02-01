use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer as SplTransfer};
use inco_lightning::types::Euint128;

// Use the actual Inco Lightning program ID from their docs
pub const INCO_LIGHTNING_PROGRAM_ID: Pubkey = pubkey!("5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj");

declare_id!("h6T7wsEJWMxN2uEZUc4SipEd8Zmz2DWasCDopindjC5");

/// Confidential SPL Token Program
/// Implements privacy-preserving token operations using Inco Lightning FHE
#[program]
pub mod inco_token {
    use super::*;

    /// Initialize a new confidential token mint
    pub fn initialize_mint(
        ctx: Context<InitializeMint>,
        decimals: u8,
        mint_authority: Pubkey,
        freeze_authority: Option<Pubkey>,
    ) -> Result<()> {
        let mint = &mut ctx.accounts.mint;
        mint.mint_authority = COption::Some(mint_authority);
        mint.supply = Euint128::default();
        mint.decimals = decimals;
        mint.is_initialized = true;
        mint.freeze_authority = freeze_authority.map(COption::Some).unwrap_or(COption::None);
        
        msg!("Initialized confidential mint with {} decimals", decimals);
        Ok(())
    }

    /// Initialize a new confidential token account
    pub fn initialize_account(ctx: Context<InitializeAccount>) -> Result<()> {
        let account = &mut ctx.accounts.account;
        account.mint = ctx.accounts.mint.key();
        account.owner = ctx.accounts.owner.key();
        account.amount = Euint128::default();
        account.delegate = COption::None;
        account.state = AccountState::Initialized;
        account.is_native = COption::None;
        account.delegated_amount = Euint128::default();
        account.close_authority = COption::None;
        
        msg!("Initialized confidential token account");
        Ok(())
    }

    /// Mint confidential tokens - stores encrypted handle directly
    /// The amount should be the encrypted value from @inco/solana-sdk
    pub fn mint_to(
        ctx: Context<IncoMintTo>,
        amount: u128,
    ) -> Result<()> {
        // Store the amount as encrypted value
        let account = &mut ctx.accounts.account;
        account.amount = Euint128::wrap(amount);
        
        // Update supply (simplified)
        let mint = &mut ctx.accounts.mint;
        mint.supply = Euint128::wrap(amount);
        
        msg!("Minted confidential tokens");
        Ok(())
    }

    /// Transfer confidential tokens between accounts
    /// Amount is the encrypted value
    pub fn transfer(
        ctx: Context<IncoTransfer>,
        amount: u128,
    ) -> Result<()> {
        // In production, you'd use Inco's CPI to perform encrypted arithmetic
        // For now, we store the transfer amount as destination balance
        let destination = &mut ctx.accounts.destination;
        destination.amount = Euint128::wrap(amount);
        
        msg!("Transferred confidential tokens");
        Ok(())
    }

    /// Burn confidential tokens
    pub fn burn(
        ctx: Context<IncoBurn>,
        _amount: u128,
    ) -> Result<()> {
        // Reset balance (simplified - real impl would do encrypted subtraction)
        let account = &mut ctx.accounts.account;
        account.amount = Euint128::default();
        
        msg!("Burned confidential tokens");
        Ok(())
    }

    /// Freeze a token account
    pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()> {
        let account = &mut ctx.accounts.account;
        account.state = AccountState::Frozen;
        msg!("Account frozen");
        Ok(())
    }

    /// Thaw a frozen token account
    pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()> {
        let account = &mut ctx.accounts.account;
        account.state = AccountState::Initialized;
        msg!("Account thawed");
        Ok(())
    }

    /// Close a token account
    pub fn close_account(ctx: Context<CloseAccount>) -> Result<()> {
        let account = ctx.accounts.account.to_account_info();
        let dest = ctx.accounts.destination.to_account_info();
        
        let account_lamports = account.lamports();
        **account.try_borrow_mut_lamports()? = 0;
        **dest.try_borrow_mut_lamports()? = dest.lamports().checked_add(account_lamports).unwrap();
        
        msg!("Account closed");
        Ok(())
    }

    // ========================================================================
    // WRAP/UNWRAP FUNCTIONS FOR RAYDIUM DEX INTEGRATION
    // ========================================================================

    /// Wrap SPL tokens into confidential tokens
    /// Transfers SPL tokens to the program vault and creates encrypted balance
    /// 
    /// Flow:
    /// 1. User's SPL tokens are transferred to the program vault
    /// 2. User receives equivalent confidential tokens (encrypted)
    /// 3. User can now hold/transfer privately
    pub fn wrap(
        ctx: Context<WrapTokens>,
        amount: u64,
        encrypted_amount: u128,
    ) -> Result<()> {
        // Transfer SPL tokens from user to vault
        let cpi_accounts = SplTransfer {
            from: ctx.accounts.user_spl_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Credit the user's confidential account with encrypted amount
        let confidential_account = &mut ctx.accounts.confidential_account;
        confidential_account.amount = Euint128::wrap(encrypted_amount);

        msg!("Wrapped {} SPL tokens into confidential tokens", amount);
        Ok(())
    }

    /// Unwrap confidential tokens back to SPL tokens
    /// Burns confidential balance and transfers SPL tokens from vault
    /// 
    /// Flow:
    /// 1. User's confidential balance is reset
    /// 2. SPL tokens are transferred from vault to user
    /// 3. User can now use tokens on Raydium/Jupiter/etc
    pub fn unwrap(
        ctx: Context<UnwrapTokens>,
        amount: u64,
    ) -> Result<()> {
        // Reset the user's confidential balance
        let confidential_account = &mut ctx.accounts.confidential_account;
        confidential_account.amount = Euint128::default();

        // Transfer SPL tokens from vault to user
        // Using PDA seeds for vault authority
        let seeds = &[
            b"vault",
            ctx.accounts.spl_mint.to_account_info().key.as_ref(),
            &[ctx.bumps.vault],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = SplTransfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.user_spl_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, amount)?;

        msg!("Unwrapped {} confidential tokens to SPL tokens", amount);
        Ok(())
    }

    /// Initialize the vault for a specific SPL token
    /// This creates a PDA-owned token account that holds wrapped tokens
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        msg!("Initialized vault for SPL mint: {}", ctx.accounts.spl_mint.key());
        Ok(())
    }

    // ========================================================================
    // NATIVE SOL WRAP/UNWRAP FUNCTIONS
    // ========================================================================

    /// Wrap native SOL into confidential cSOL
    /// Transfers lamports to a vault PDA and creates encrypted balance
    pub fn wrap_sol(
        ctx: Context<WrapSol>,
        amount: u64,
        encrypted_amount: u128,
    ) -> Result<()> {
        // Transfer SOL from user to vault PDA
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.sol_vault.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.sol_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Credit the user's confidential account with encrypted amount
        let confidential_account = &mut ctx.accounts.confidential_account;
        confidential_account.amount = Euint128::wrap(encrypted_amount);

        msg!("Wrapped {} lamports into confidential cSOL", amount);
        Ok(())
    }

    /// Unwrap confidential cSOL back to native SOL
    /// Burns confidential balance and transfers lamports from vault to user
    pub fn unwrap_sol(
        ctx: Context<UnwrapSol>,
        amount: u64,
    ) -> Result<()> {
        // Reset the user's confidential balance
        let confidential_account = &mut ctx.accounts.confidential_account;
        confidential_account.amount = Euint128::default();

        // Transfer SOL from vault PDA to user
        // The vault PDA needs to sign
        let bump = ctx.bumps.sol_vault;
        let seeds = &[b"sol_vault".as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        **ctx.accounts.sol_vault.try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.user.try_borrow_mut_lamports()? += amount;

        msg!("Unwrapped {} lamports from confidential cSOL", amount);
        Ok(())
    }

    /// Initialize the SOL vault PDA (program-owned account)
    /// This must be called once to create the vault before any wrap operations
    pub fn initialize_sol_vault(ctx: Context<InitializeSolVault>) -> Result<()> {
        let vault = &mut ctx.accounts.sol_vault;
        vault.bump = ctx.bumps.sol_vault;
        vault.is_initialized = true;
        msg!("Initialized SOL vault PDA");
        Ok(())
    }

    // ========================================================================
    // PER-USER CONFIDENTIAL BALANCE FUNCTIONS
    // These mimic EVM's mapping(address => euint256) balances pattern
    // ========================================================================

    /// Initialize a user's balance account (PDA)
    /// Called automatically on first wrap if account doesn't exist
    pub fn initialize_user_balance(ctx: Context<InitializeUserBalance>) -> Result<()> {
        let user_balance = &mut ctx.accounts.user_balance;
        user_balance.user = ctx.accounts.user.key();
        user_balance.mint = ctx.accounts.mint.key();
        user_balance.encrypted_balance = Euint128::default();
        user_balance.bump = ctx.bumps.user_balance;
        user_balance.is_initialized = true;
        
        msg!("Initialized user balance for {}", ctx.accounts.user.key());
        Ok(())
    }

    /// Wrap SOL into user's confidential balance (per-user PDA)
    /// Locks SOL in vault, credits encrypted amount to user's balance
    pub fn wrap_to_user(
        ctx: Context<WrapToUser>,
        amount: u64,
        encrypted_amount: u128,
    ) -> Result<()> {
        // Transfer SOL from user to vault PDA
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.sol_vault.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.sol_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Credit user's balance with encrypted amount using FHE add
        let user_balance = &mut ctx.accounts.user_balance;
        // For now, just set the balance (in production, use Inco's encrypted add)
        user_balance.encrypted_balance = Euint128::wrap(encrypted_amount);

        msg!("Wrapped {} lamports for user {}", amount, ctx.accounts.user.key());
        Ok(())
    }

    /// Unwrap SOL from user's confidential balance
    /// Burns encrypted amount, returns SOL from vault
    /// Note: Vault must have sufficient lamports from previous wrap operations
    pub fn unwrap_from_user(
        ctx: Context<UnwrapFromUser>,
        amount: u64,
    ) -> Result<()> {
        // Reset user's encrypted balance (burn)
        let user_balance = &mut ctx.accounts.user_balance;
        user_balance.encrypted_balance = Euint128::default();

        // Get account infos for lamport manipulation
        let vault_info = ctx.accounts.sol_vault.to_account_info();
        let user_info = ctx.accounts.user.to_account_info();
        
        // Check vault has sufficient balance
        let vault_balance = vault_info.lamports();
        require!(vault_balance >= amount, CustomError::InsufficientFunds);
        
        // Transfer lamports - this works because the vault is owned by our program
        **vault_info.try_borrow_mut_lamports()? -= amount;
        **user_info.try_borrow_mut_lamports()? += amount;

        msg!("Unwrapped {} lamports for user {}", amount, ctx.accounts.user.key());
        Ok(())
    }

    /// Transfer between users' confidential balances
    /// Private transfer with encrypted amount
    pub fn transfer_to_user(
        ctx: Context<TransferToUser>,
        encrypted_amount: u128,
    ) -> Result<()> {
        // In production: use Inco FHE operations for encrypted arithmetic
        // For now: simple balance transfer
        let source = &mut ctx.accounts.source_balance;
        let dest = &mut ctx.accounts.dest_balance;
        
        // Reset source (simplified - real impl uses FHE subtraction)
        source.encrypted_balance = Euint128::default();
        // Set destination to transferred amount
        dest.encrypted_balance = Euint128::wrap(encrypted_amount);

        msg!("Transferred encrypted amount between users");
        Ok(())
    }

    /// Faucet: Mint free test USDC to user's balance (for demo/testing)
    /// This allows anyone to get test USDC for swap testing
    pub fn faucet_usdc(
        ctx: Context<FaucetUsdc>,
        encrypted_amount: u128,
    ) -> Result<()> {
        let user_balance = &mut ctx.accounts.user_balance;
        
        // Initialize if new account (init_if_needed)
        if !user_balance.is_initialized {
            user_balance.user = ctx.accounts.user.key();
            user_balance.mint = ctx.accounts.mint.key();
            user_balance.bump = ctx.bumps.user_balance;
            user_balance.is_initialized = true;
        }
        
        // Credit user's balance with faucet amount
        // In production, this would have rate limits
        user_balance.encrypted_balance = Euint128::wrap(encrypted_amount);

        msg!("Faucet: Minted test USDC to user {}", ctx.accounts.user.key());
        Ok(())
    }

    /// Wrap USDC (SPL tokens) into user's confidential balance
    /// Transfers SPL tokens to vault, credits encrypted amount to user's balance PDA
    pub fn wrap_usdc_to_user(
        ctx: Context<WrapUsdcToUser>,
        amount: u64,
        encrypted_amount: u128,
    ) -> Result<()> {
        // Transfer SPL tokens from user to vault
        let cpi_accounts = SplTransfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.usdc_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Credit user's balance PDA with encrypted amount
        let user_balance = &mut ctx.accounts.user_balance;
        user_balance.encrypted_balance = Euint128::wrap(encrypted_amount);

        msg!("Wrapped {} USDC into confidential balance for user {}", amount, ctx.accounts.user.key());
        Ok(())
    }

    /// Unwrap USDC from user's confidential balance
    /// Burns encrypted amount, transfers SPL tokens from vault to user
    pub fn unwrap_usdc_from_user(
        ctx: Context<UnwrapUsdcFromUser>,
        amount: u64,
    ) -> Result<()> {
        // Reset user's encrypted balance (burn)
        let user_balance = &mut ctx.accounts.user_balance;
        user_balance.encrypted_balance = Euint128::default();

        // Transfer SPL tokens from vault to user using PDA authority
        let seeds = &[
            b"usdc_vault".as_ref(),
            &[ctx.bumps.usdc_vault],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = SplTransfer {
            from: ctx.accounts.usdc_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.usdc_vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, amount)?;

        msg!("Unwrapped {} USDC from confidential balance for user {}", amount, ctx.accounts.user.key());
        Ok(())
    }

    /// Initialize the USDC vault (program-owned token account)
    pub fn initialize_usdc_vault(ctx: Context<InitializeUsdcVault>) -> Result<()> {
        msg!("Initialized USDC vault for mint: {}", ctx.accounts.usdc_mint.key());
        Ok(())
    }
}

// ============================================================================
// Account Structures
// ============================================================================

/// C-compatible Option type
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum COption<T> {
    None,
    Some(T),
}

impl<T> Default for COption<T> {
    fn default() -> Self {
        COption::None
    }
}

/// Token account state
#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Default)]
pub enum AccountState {
    #[default]
    Uninitialized = 0,
    Initialized = 1,
    Frozen = 2,
}

/// Confidential Mint account
#[account]
pub struct IncoMint {
    pub mint_authority: COption<Pubkey>,
    pub supply: Euint128,
    pub decimals: u8,
    pub is_initialized: bool,
    pub freeze_authority: COption<Pubkey>,
}

impl IncoMint {
    pub const LEN: usize = 36 + 32 + 1 + 1 + 36; // 106 bytes
}

/// Confidential Token account
#[account]
pub struct IncoAccount {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub amount: Euint128,
    pub delegate: COption<Pubkey>,
    pub state: AccountState,
    pub is_native: COption<u64>,
    pub delegated_amount: Euint128,
    pub close_authority: COption<Pubkey>,
}

impl IncoAccount {
    pub const LEN: usize = 32 + 32 + 32 + 36 + 1 + 12 + 32 + 36; // 213 bytes
}

/// Per-user confidential balance account (PDA)
/// Seeds: ["user_balance", user_pubkey, mint_pubkey]
/// This mimics EVM's mapping(address => euint256) balances
#[account]
pub struct UserBalance {
    /// User who owns this balance
    pub user: Pubkey,
    /// Mint this balance is for (cSOL or cUSDC)
    pub mint: Pubkey,
    /// FHE encrypted balance amount
    pub encrypted_balance: Euint128,
    /// Bump seed for PDA derivation
    pub bump: u8,
    /// Whether the account is initialized
    pub is_initialized: bool,
}

impl UserBalance {
    pub const LEN: usize = 32 + 32 + 32 + 1 + 1; // 98 bytes
}

/// SOL Vault account (program-owned PDA)
/// This account is owned by the program, allowing lamport manipulation
/// Seeds: ["sol_vault"]
#[account]
pub struct SolVault {
    /// Bump seed for PDA derivation
    pub bump: u8,
    /// Whether the vault is initialized
    pub is_initialized: bool,
}

impl SolVault {
    pub const LEN: usize = 1 + 1; // 2 bytes (minimal, lamports are in the account itself)
}

// ============================================================================
// Instruction Contexts
// ============================================================================

#[derive(Accounts)]
pub struct InitializeMint<'info> {
    #[account(init, payer = payer, space = 8 + IncoMint::LEN)]
    pub mint: Account<'info, IncoMint>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeAccount<'info> {
    #[account(init, payer = payer, space = 8 + IncoAccount::LEN)]
    pub account: Account<'info, IncoAccount>,
    #[account(constraint = mint.is_initialized @ CustomError::UninitializedState)]
    pub mint: Account<'info, IncoMint>,
    /// CHECK: Owner of the token account
    pub owner: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct IncoMintTo<'info> {
    #[account(mut, constraint = mint.is_initialized @ CustomError::UninitializedState)]
    pub mint: Account<'info, IncoMint>,
    #[account(
        mut,
        constraint = account.state == AccountState::Initialized @ CustomError::UninitializedState,
        constraint = account.mint == mint.key() @ CustomError::MintMismatch,
    )]
    pub account: Account<'info, IncoAccount>,
    #[account(mut)]
    pub mint_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct IncoTransfer<'info> {
    #[account(
        mut,
        constraint = source.state == AccountState::Initialized @ CustomError::UninitializedState,
        constraint = source.state != AccountState::Frozen @ CustomError::AccountFrozen,
    )]
    pub source: Account<'info, IncoAccount>,
    #[account(
        mut,
        constraint = destination.state == AccountState::Initialized @ CustomError::UninitializedState,
        constraint = destination.state != AccountState::Frozen @ CustomError::AccountFrozen,
        constraint = destination.mint == source.mint @ CustomError::MintMismatch,
    )]
    pub destination: Account<'info, IncoAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct IncoBurn<'info> {
    #[account(
        mut,
        constraint = account.state == AccountState::Initialized @ CustomError::UninitializedState,
        constraint = account.state != AccountState::Frozen @ CustomError::AccountFrozen,
        constraint = account.mint == mint.key() @ CustomError::MintMismatch,
    )]
    pub account: Account<'info, IncoAccount>,
    #[account(mut, constraint = mint.is_initialized @ CustomError::UninitializedState)]
    pub mint: Account<'info, IncoMint>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct FreezeAccount<'info> {
    #[account(
        mut,
        constraint = account.state == AccountState::Initialized @ CustomError::UninitializedState,
        constraint = account.mint == mint.key() @ CustomError::MintMismatch,
    )]
    pub account: Account<'info, IncoAccount>,
    #[account(constraint = mint.is_initialized @ CustomError::UninitializedState)]
    pub mint: Account<'info, IncoMint>,
    #[account(mut)]
    pub freeze_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ThawAccount<'info> {
    #[account(
        mut,
        constraint = account.state == AccountState::Frozen @ CustomError::InvalidState,
        constraint = account.mint == mint.key() @ CustomError::MintMismatch,
    )]
    pub account: Account<'info, IncoAccount>,
    #[account(constraint = mint.is_initialized @ CustomError::UninitializedState)]
    pub mint: Account<'info, IncoMint>,
    #[account(mut)]
    pub freeze_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseAccount<'info> {
    #[account(
        mut,
        constraint = account.state == AccountState::Initialized @ CustomError::UninitializedState,
    )]
    pub account: Account<'info, IncoAccount>,
    /// CHECK: Destination for lamports
    #[account(mut)]
    pub destination: AccountInfo<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

// ============================================================================
// WRAP/UNWRAP ACCOUNT CONTEXTS FOR RAYDIUM INTEGRATION
// ============================================================================

#[derive(Accounts)]
pub struct WrapTokens<'info> {
    /// User's SPL token account (source of tokens to wrap)
    #[account(
        mut,
        constraint = user_spl_account.owner == user.key() @ CustomError::OwnerMismatch,
        constraint = user_spl_account.mint == spl_mint.key() @ CustomError::MintMismatch,
    )]
    pub user_spl_account: Account<'info, TokenAccount>,
    
    /// Vault PDA that holds wrapped SPL tokens
    #[account(
        mut,
        seeds = [b"vault", spl_mint.key().as_ref()],
        bump,
        constraint = vault.mint == spl_mint.key() @ CustomError::MintMismatch,
    )]
    pub vault: Account<'info, TokenAccount>,
    
    /// User's confidential token account (destination)
    #[account(
        mut,
        constraint = confidential_account.owner == user.key() @ CustomError::OwnerMismatch,
        constraint = confidential_account.state == AccountState::Initialized @ CustomError::UninitializedState,
    )]
    pub confidential_account: Account<'info, IncoAccount>,
    
    /// The SPL token mint
    pub spl_mint: Account<'info, Mint>,
    
    /// User signing the transaction
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// SPL Token program
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UnwrapTokens<'info> {
    /// User's SPL token account (destination for unwrapped tokens)
    #[account(
        mut,
        constraint = user_spl_account.owner == user.key() @ CustomError::OwnerMismatch,
        constraint = user_spl_account.mint == spl_mint.key() @ CustomError::MintMismatch,
    )]
    pub user_spl_account: Account<'info, TokenAccount>,
    
    /// Vault PDA that holds wrapped SPL tokens
    #[account(
        mut,
        seeds = [b"vault", spl_mint.key().as_ref()],
        bump,
        constraint = vault.mint == spl_mint.key() @ CustomError::MintMismatch,
    )]
    pub vault: Account<'info, TokenAccount>,
    
    /// User's confidential token account (source)
    #[account(
        mut,
        constraint = confidential_account.owner == user.key() @ CustomError::OwnerMismatch,
        constraint = confidential_account.state == AccountState::Initialized @ CustomError::UninitializedState,
    )]
    pub confidential_account: Account<'info, IncoAccount>,
    
    /// The SPL token mint
    pub spl_mint: Account<'info, Mint>,
    
    /// User signing the transaction
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// SPL Token program
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    /// The vault PDA token account
    #[account(
        init,
        payer = payer,
        token::mint = spl_mint,
        token::authority = vault,
        seeds = [b"vault", spl_mint.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    
    /// The SPL token mint for this vault
    pub spl_mint: Account<'info, Mint>,
    
    /// Payer for account creation
    #[account(mut)]
    pub payer: Signer<'info>,
    
    /// System program
    pub system_program: Program<'info, System>,
    
    /// SPL Token program
    pub token_program: Program<'info, Token>,
}

// ============================================================================
// NATIVE SOL WRAP/UNWRAP ACCOUNT CONTEXTS
// ============================================================================

#[derive(Accounts)]
pub struct WrapSol<'info> {
    /// SOL vault PDA that holds wrapped SOL
    /// CHECK: This is a PDA owned by system program that holds SOL
    #[account(
        mut,
        seeds = [b"sol_vault"],
        bump,
    )]
    pub sol_vault: AccountInfo<'info>,
    
    /// User's confidential token account (destination for cSOL)
    #[account(
        mut,
        constraint = confidential_account.owner == user.key() @ CustomError::OwnerMismatch,
        constraint = confidential_account.state == AccountState::Initialized @ CustomError::UninitializedState,
    )]
    pub confidential_account: Account<'info, IncoAccount>,
    
    /// User signing the transaction (source of SOL)
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// System program for SOL transfers
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnwrapSol<'info> {
    /// SOL vault PDA that holds wrapped SOL
    /// CHECK: This is a PDA owned by this program that holds SOL
    #[account(
        mut,
        seeds = [b"sol_vault"],
        bump,
    )]
    pub sol_vault: AccountInfo<'info>,
    
    /// User's confidential token account (source of cSOL to burn)
    #[account(
        mut,
        constraint = confidential_account.owner == user.key() @ CustomError::OwnerMismatch,
        constraint = confidential_account.state == AccountState::Initialized @ CustomError::UninitializedState,
    )]
    pub confidential_account: Account<'info, IncoAccount>,
    
    /// User receiving SOL back
    /// CHECK: This is the user's wallet
    #[account(mut)]
    pub user: AccountInfo<'info>,
    
    /// System program
    pub system_program: Program<'info, System>,
}

// ============================================================================
// PER-USER BALANCE INSTRUCTION CONTEXTS
// ============================================================================

#[derive(Accounts)]
#[instruction()]
pub struct InitializeUserBalance<'info> {
    /// User's balance PDA
    #[account(
        init,
        payer = user,
        space = 8 + UserBalance::LEN,
        seeds = [b"user_balance", user.key().as_ref(), mint.key().as_ref()],
        bump,
    )]
    pub user_balance: Account<'info, UserBalance>,
    
    /// The mint (cSOL or cUSDC)
    pub mint: Account<'info, IncoMint>,
    
    /// User paying for and owning this balance
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// System program
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeSolVault<'info> {
    /// The SOL vault PDA (program-owned account)
    #[account(
        init,
        payer = payer,
        space = 8 + SolVault::LEN,
        seeds = [b"sol_vault_v2"],
        bump,
    )]
    pub sol_vault: Account<'info, SolVault>,
    
    /// Payer for the vault account
    #[account(mut)]
    pub payer: Signer<'info>,
    
    /// System program
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, encrypted_amount: u128)]
pub struct WrapToUser<'info> {
    /// SOL vault PDA (program-owned)
    #[account(
        mut,
        seeds = [b"sol_vault_v2"],
        bump,
    )]
    pub sol_vault: Account<'info, SolVault>,
    
    /// User's balance PDA
    #[account(
        mut,
        seeds = [b"user_balance", user.key().as_ref(), mint.key().as_ref()],
        bump = user_balance.bump,
        constraint = user_balance.is_initialized @ CustomError::UninitializedState,
    )]
    pub user_balance: Account<'info, UserBalance>,
    
    /// The mint (cSOL)
    pub mint: Account<'info, IncoMint>,
    
    /// User wrapping SOL
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// System program
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct UnwrapFromUser<'info> {
    /// SOL vault PDA (program-owned)
    #[account(
        mut,
        seeds = [b"sol_vault_v2"],
        bump,
    )]
    pub sol_vault: Account<'info, SolVault>,
    
    /// User's balance PDA
    #[account(
        mut,
        seeds = [b"user_balance", user.key().as_ref(), mint.key().as_ref()],
        bump = user_balance.bump,
        constraint = user_balance.is_initialized @ CustomError::UninitializedState,
    )]
    pub user_balance: Account<'info, UserBalance>,
    
    /// The mint (cSOL)
    pub mint: Account<'info, IncoMint>,
    
    /// User receiving SOL
    /// CHECK: User's wallet
    #[account(mut)]
    pub user: AccountInfo<'info>,
    
    /// Authority (must own the balance)
    #[account(
        constraint = authority.key() == user_balance.user @ CustomError::OwnerMismatch,
    )]
    pub authority: Signer<'info>,
    
    /// System program
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(encrypted_amount: u128)]
pub struct TransferToUser<'info> {
    /// Source user's balance PDA
    #[account(
        mut,
        seeds = [b"user_balance", source_user.key().as_ref(), mint.key().as_ref()],
        bump = source_balance.bump,
        constraint = source_balance.is_initialized @ CustomError::UninitializedState,
    )]
    pub source_balance: Account<'info, UserBalance>,
    
    /// Destination user's balance PDA
    #[account(
        mut,
        seeds = [b"user_balance", dest_user.key().as_ref(), mint.key().as_ref()],
        bump = dest_balance.bump,
        constraint = dest_balance.is_initialized @ CustomError::UninitializedState,
    )]
    pub dest_balance: Account<'info, UserBalance>,
    
    /// The mint
    pub mint: Account<'info, IncoMint>,
    
    /// Source user (authority)
    pub source_user: Signer<'info>,
    
    /// Destination user
    /// CHECK: Just need the pubkey
    pub dest_user: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(encrypted_amount: u128)]
pub struct FaucetUsdc<'info> {
    /// User's USDC balance PDA - will be created if doesn't exist
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserBalance::LEN,
        seeds = [b"user_balance", user.key().as_ref(), mint.key().as_ref()],
        bump,
    )]
    pub user_balance: Account<'info, UserBalance>,
    
    /// The USDC mint
    pub mint: Account<'info, IncoMint>,
    
    /// User receiving faucet tokens
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// System program
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeUsdcVault<'info> {
    /// The USDC vault token account (PDA-owned)
    #[account(
        init,
        payer = payer,
        seeds = [b"usdc_vault"],
        bump,
        token::mint = usdc_mint,
        token::authority = usdc_vault,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,
    
    /// The USDC SPL mint
    pub usdc_mint: Account<'info, Mint>,
    
    /// Payer for vault account
    #[account(mut)]
    pub payer: Signer<'info>,
    
    /// System program
    pub system_program: Program<'info, System>,
    
    /// Token program
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(amount: u64, encrypted_amount: u128)]
pub struct WrapUsdcToUser<'info> {
    /// USDC vault token account (receives tokens)
    #[account(
        mut,
        seeds = [b"usdc_vault"],
        bump,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,
    
    /// User's USDC token account (source)
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    /// User's balance PDA
    #[account(
        mut,
        seeds = [b"user_balance", user.key().as_ref(), mint.key().as_ref()],
        bump = user_balance.bump,
        constraint = user_balance.is_initialized @ CustomError::UninitializedState,
    )]
    pub user_balance: Account<'info, UserBalance>,
    
    /// The cUSDC (Inco) mint
    pub mint: Account<'info, IncoMint>,
    
    /// User wrapping tokens
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// Token program
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct UnwrapUsdcFromUser<'info> {
    /// USDC vault token account (source)
    #[account(
        mut,
        seeds = [b"usdc_vault"],
        bump,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,
    
    /// User's USDC token account (receives tokens)
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    /// User's balance PDA
    #[account(
        mut,
        seeds = [b"user_balance", user.key().as_ref(), mint.key().as_ref()],
        bump = user_balance.bump,
        constraint = user_balance.is_initialized @ CustomError::UninitializedState,
    )]
    pub user_balance: Account<'info, UserBalance>,
    
    /// The cUSDC (Inco) mint
    pub mint: Account<'info, IncoMint>,
    
    /// User (authority for their balance)
    pub user: Signer<'info>,
    
    /// Token program
    pub token_program: Program<'info, Token>,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum CustomError {
    #[msg("State is uninitialized")]
    UninitializedState,
    #[msg("Account not associated with this Mint")]
    MintMismatch,
    #[msg("The account is frozen")]
    AccountFrozen,
    #[msg("Invalid state")]
    InvalidState,
    #[msg("Owner does not match")]
    OwnerMismatch,
    #[msg("Insufficient funds")]
    InsufficientFunds,
}

