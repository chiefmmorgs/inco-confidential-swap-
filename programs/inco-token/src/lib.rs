use anchor_lang::prelude::*;
use inco_lightning::types::Euint128;

// Use the actual Inco Lightning program ID from their docs
pub const INCO_LIGHTNING_PROGRAM_ID: Pubkey = pubkey!("5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj");

declare_id!("5EcrUvQYrDrxJ2pB6jeqiV3PHkChioR86nf4Kt1uHAF8");

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
