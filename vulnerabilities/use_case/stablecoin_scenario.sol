// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Stablecoin
 * @dev Fiat-collateralized style stablecoin with an intentional “stale quote” pattern
 *      analogous to TRIBERagequit: a cached rate is updated only on an admin/oracle
 *      sync path, while user-facing minting reads that cache without forcing a refresh.
 *
 *      Pattern (for audit / pipeline demos only — do not deploy as-is):
 *      - `cachedMintQuote` is the only on-chain input to how many tokens a credit unit buys.
 *      - It is updated in `syncMintQuote` (stand-in for requery → recalculate).
 *      - `mintFromCredits` (user) never calls `syncMintQuote`, so if off-chain collateral
 *        or policy moves but the owner forgets to sync, users mint at a stale rate.
 */
contract Stablecoin is ERC20, ERC20Burnable, Ownable {

    /// @notice Raw token amount (6-decimal smallest units) minted per 1 credit unit (same 6-dec scale).
    /// @dev Stale if real collateral ratio / FX moved on-chain or off-chain but sync was not called.
    uint256 public cachedMintQuote;

    /// @notice Verified off-chain collateral credits per user (same scale as token, e.g. micro-dollars).
    mapping(address => uint256) public collateralCredits;

    /**
     * @param initialOwner Administrative owner (issuer).
     * @param initialQuote Initial `cachedMintQuote` (e.g. 1e6 for 1:1 with credits).
     */
    constructor(address initialOwner, uint256 initialQuote)
        ERC20("Stablecoin USD", "SUSD")
        Ownable(initialOwner)
    {
        cachedMintQuote = initialQuote;
    }

    /// @dev Convenience overload: 1:1 initial quote.
    constructor(address initialOwner)
        ERC20("Stablecoin USD", "SUSD")
        Ownable(initialOwner)
    {
        cachedMintQuote = 1e6;
    }

    /**
     * @dev Direct mint — does not use `cachedMintQuote` (issuer-controlled supply).
     */
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    /**
     * @dev Stand-in for “oracle / treasury recomputed fair mint rate”.
     *      Only this path updates `cachedMintQuote` (like requery → recalculate).
     */
    function syncMintQuote(uint256 newQuote) external onlyOwner {
        require(newQuote != 0, "quote");
        cachedMintQuote = newQuote;
    }

    /**
     * @dev Issuer records how much collateral credit a user may draw against (off-chain KYC / deposits).
     */
    function grantCollateralCredits(address user, uint256 amount) external onlyOwner {
        collateralCredits[user] += amount;
    }

    /**
     * @dev User-facing mint: spends credits using `cachedMintQuote` only.
     *      BUG PATTERN: no call to `syncMintQuote` here — if quote is stale, minted amount is wrong
     *      (same class as using stale `token1OutBase` in `ngmi` without `requery`).
     */
    function mintFromCredits(uint256 collateralToSpend) external {
        require(collateralCredits[msg.sender] >= collateralToSpend, "insufficient credits");
        require(collateralToSpend != 0, "zero");
        collateralCredits[msg.sender] -= collateralToSpend;

        uint256 tokenAmount = (collateralToSpend * cachedMintQuote) / 1e6;
        _mint(msg.sender, tokenAmount);
    }

    /**
     * @dev Same 6 decimals as common fiat-backed stablecoins.
     */
    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}
