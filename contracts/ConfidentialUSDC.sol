// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { e, ebool, euint256, inco } from "@inco/lightning/src/Lib.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ConfidentialUSDC
 * @notice Wraps ERC20 USDC into encrypted cUSDC
 */
contract ConfidentialUSDC is Ownable2Step {
    using SafeERC20 for IERC20;

    error InsufficientFees();
    error InsufficientBalance();

    event Wrap(address indexed user, uint256 amount);
    event Unwrap(address indexed user, uint256 amount);
    event Transfer(address indexed from, address indexed to, euint256 amount);

    string public constant name = "Confidential USDC";
    string public constant symbol = "cUSDC";
    uint8 public constant decimals = 6;

    IERC20 public immutable underlyingToken;
    
    euint256 public totalSupply;
    mapping(address => euint256) internal balances;
    mapping(address => mapping(address => euint256)) internal allowances;

    constructor(address _underlyingToken) Ownable(msg.sender) {
        underlyingToken = IERC20(_underlyingToken);
        totalSupply = e.asEuint256(0);
        e.allow(totalSupply, address(this));
    }

    /**
     * @notice Wrap USDC to cUSDC (encrypted)
     * @param amount Amount of USDC to wrap (must approve first)
     */
    function wrap(uint256 amount) external {
        require(amount > 0, "Must wrap > 0");
        
        underlyingToken.safeTransferFrom(msg.sender, address(this), amount);
        
        euint256 eAmount = e.asEuint256(amount);
        
        if (euint256.unwrap(balances[msg.sender]) == bytes32(0)) {
            balances[msg.sender] = eAmount;
        } else {
            balances[msg.sender] = e.add(balances[msg.sender], eAmount);
        }
        
        e.allow(balances[msg.sender], address(this));
        e.allow(balances[msg.sender], msg.sender);
        
        totalSupply = e.add(totalSupply, eAmount);
        e.allow(totalSupply, address(this));
        
        emit Wrap(msg.sender, amount);
    }

    /**
     * @notice Unwrap cUSDC back to USDC
     */
    function unwrap(uint256 amount) external {
        euint256 eAmount = e.asEuint256(amount);
        
        balances[msg.sender] = e.sub(balances[msg.sender], eAmount);
        e.allow(balances[msg.sender], address(this));
        e.allow(balances[msg.sender], msg.sender);
        
        totalSupply = e.sub(totalSupply, eAmount);
        e.allow(totalSupply, address(this));
        
        underlyingToken.safeTransfer(msg.sender, amount);
        
        emit Unwrap(msg.sender, amount);
    }

    /**
     * @notice Transfer with encrypted amount
     */
    function transfer(address to, bytes calldata encryptedAmount) external payable returns (bool) {
        _requireFee(1);
        euint256 amount = e.newEuint256(encryptedAmount, msg.sender);
        e.allow(amount, address(this));
        
        ebool canTransfer = e.ge(balances[msg.sender], amount);
        euint256 transferValue = e.select(canTransfer, amount, e.asEuint256(0));
        
        balances[msg.sender] = e.sub(balances[msg.sender], transferValue);
        e.allow(balances[msg.sender], address(this));
        e.allow(balances[msg.sender], msg.sender);
        
        if (euint256.unwrap(balances[to]) == bytes32(0)) {
            balances[to] = transferValue;
        } else {
            balances[to] = e.add(balances[to], transferValue);
        }
        e.allow(balances[to], address(this));
        e.allow(balances[to], to);
        
        emit Transfer(msg.sender, to, transferValue);
        return true;
    }

    function balanceOf(address wallet) public view returns (euint256) {
        return balances[wallet];
    }

    /**
     * @notice Transfer with euint256 amount (for contract calls)
     */
    function transfer(address to, euint256 amount) external returns (bool) {
        e.allow(amount, address(this));
        
        ebool canTransfer = e.ge(balances[msg.sender], amount);
        euint256 transferValue = e.select(canTransfer, amount, e.asEuint256(0));
        
        balances[msg.sender] = e.sub(balances[msg.sender], transferValue);
        e.allow(balances[msg.sender], address(this));
        e.allow(balances[msg.sender], msg.sender);
        
        if (euint256.unwrap(balances[to]) == bytes32(0)) {
            balances[to] = transferValue;
        } else {
            balances[to] = e.add(balances[to], transferValue);
        }
        e.allow(balances[to], address(this));
        e.allow(balances[to], to);
        
        emit Transfer(msg.sender, to, transferValue);
        return true;
    }

    /**
     * @notice Approve spender with encrypted amount
     */
    function approve(address spender, bytes calldata encryptedAmount) external payable returns (bool) {
        _requireFee(1);
        euint256 amount = e.newEuint256(encryptedAmount, msg.sender);
        _approve(msg.sender, spender, amount);
        return true;
    }

    /**
     * @notice Approve spender with euint256 amount
     */
    function approve(address spender, euint256 amount) external returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function _approve(address owner, address spender, euint256 amount) internal {
        allowances[owner][spender] = amount;
        e.allow(amount, address(this));
        e.allow(amount, owner);
        e.allow(amount, spender);
    }

    function allowance(address owner, address spender) public view returns (euint256) {
        return allowances[owner][spender];
    }

    /**
     * @notice TransferFrom with encrypted amount
     */
    function transferFrom(address from, address to, bytes calldata encryptedAmount) external payable returns (bool) {
        _requireFee(1);
        euint256 amount = e.newEuint256(encryptedAmount, msg.sender);
        return _transferFrom(from, to, amount);
    }

    /**
     * @notice TransferFrom with euint256 amount (for contract calls)
     */
    function transferFrom(address from, address to, euint256 amount) external returns (bool) {
        return _transferFrom(from, to, amount);
    }

    function _transferFrom(address from, address to, euint256 amount) internal returns (bool) {
        e.allow(amount, address(this));
        
        euint256 currentAllowance = allowances[from][msg.sender];
        ebool allowedTransfer = e.ge(currentAllowance, amount);
        ebool hasBalance = e.ge(balances[from], amount);
        ebool isTransferable = e.select(hasBalance, allowedTransfer, e.asEbool(false));
        
        euint256 transferValue = e.select(isTransferable, amount, e.asEuint256(0));
        
        // Update allowance
        allowances[from][msg.sender] = e.select(isTransferable, e.sub(currentAllowance, amount), currentAllowance);
        e.allow(allowances[from][msg.sender], address(this));
        e.allow(allowances[from][msg.sender], from);
        e.allow(allowances[from][msg.sender], msg.sender);
        
        // Update balances
        balances[from] = e.sub(balances[from], transferValue);
        e.allow(balances[from], address(this));
        e.allow(balances[from], from);
        
        if (euint256.unwrap(balances[to]) == bytes32(0)) {
            balances[to] = transferValue;
        } else {
            balances[to] = e.add(balances[to], transferValue);
        }
        e.allow(balances[to], address(this));
        e.allow(balances[to], to);
        
        emit Transfer(from, to, transferValue);
        return true;
    }

    function _requireFee(uint256 cipherTextCount) internal view {
        if (msg.value < inco.getFee() * cipherTextCount) revert InsufficientFees();
    }
}
