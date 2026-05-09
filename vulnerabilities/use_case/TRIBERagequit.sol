//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./IERC20.sol";
import "./IOracle.sol";

/// @title Contract to exchange TRIBE with FEI post-merger
/// @author elee
contract TribeRagequit {
    address public constant party0Timelock =
        0x8ace03Fc45139fDDba944c6A4082b604041d19FC; // rgt timelock
    address public constant party1Timelock =
        0xd51dbA7a94e1adEa403553A8235C302cEbF41a3c; // tribe timelock

    address public constant party1Core =
        0x8d5ED43dCa8C2F7dFB20CF7b53CC7E593635d7b9; // tribe core

    uint256 public constant scalar = 1e9;

    uint256 public expirationBlock = 0;

    bool public party0Accepted = false; // rgt timelock accepted
    bool public party1Accepted = false; // tribe timelock accepted

    uint256 public token0InBase = 2**256 - 1;
    uint256 public token1OutBase = 0;

    uint256 public preMergeCirculatingTribe = 711206739862133000000000000;
    address public constant oracleAddress =
        0xd1866289B4Bd22D453fFF676760961e0898EE9BF; // oracle with caching
    int256 public minProtocolEquity = 0;

    IERC20 public constant token0 =
        IERC20(0xc7283b66Eb1EB5FB86327f08e1B5816b0720212B); // TRIBE

    IERC20 public constant token1 =
        IERC20(0x956F47F50A910163D8BF957Cf5846D573E7f87CA); // FEI
    IOracle public constant oracle = IOracle(oracleAddress);

    bool public init = false;

    mapping(address => uint256) public claimed;

    event Exchange(address indexed from, uint256 amountIn, uint256 amountOut);

    bytes32 public merkleRoot =
        0x0000000000000000000000000000000000000000000000000000000000000000;

    /// @dev TODO: hardcode root once final merkle root is calculated
    constructor(bytes32 root) {
        merkleRoot = root;
    }

    /// @notice ragequit held TRIBE with FEI
    /// @dev not gonna make it
    /// @param multiplier the amount to scale the base exchange amounts by
    /// @param key the amount of scaled TRIBE allocated to the caller in the merkle drop
    /// @param merkleProof a proof proving that the caller may redeem up to `key` amount of tribe
    function ngmi(
        uint256 multiplier,
        uint256 key,
        bytes32[] memory merkleProof
    ) public {
        require(isExpired() == false, "Redemption period is over");
        require(isEnabled() == true, "Proposals are not both passed");
        require(minProtocolEquity > 0, "no equity");
        address thisSender = msg.sender;
        require(
            verifyClaim(thisSender, key, merkleProof) == true,
            "invalid proof"
        );
        require(
            (claimed[thisSender] + multiplier) <= key,
            "already ragequit all you tokens"
        );
        claimed[thisSender] = claimed[thisSender] + multiplier;
        uint256 token0TakenTotal = token0InBase * multiplier;
        uint256 token1GivenTotal = token1OutBase * multiplier;
        takeFrom(thisSender, token0TakenTotal);
        giveTo(thisSender, token1GivenTotal);
        emit Exchange(thisSender, token0TakenTotal, token1GivenTotal);
    }

    /// @notice tells whether or not the contract is expired.
    /// @dev note that a expirationBlock of 0 means that no block is set, therefore not expired
    /// @return boolean true if we have passed the expiration block, else false
    function isExpired() public view returns (bool) {
        if (expirationBlock != 0) {
            return (block.number > expirationBlock);
        }
        return false;
    }

    /// @notice recalculate the exchange amount using the existing minProtocolEquity
    /// @return the new token1OutBase (unused)
    function recalculate() public returns (uint256) {
        if (minProtocolEquity > 0) {
            token0InBase = scalar;
            token1OutBase =
                (scalar * uint256(minProtocolEquity)) /
                preMergeCirculatingTribe;
        } else {
            token1OutBase = 0;
        }
        return token1OutBase;
    }

    /// @notice query for the current minProtocolEquity. Update the value and call recalculate() if new low
    /// @return the new minProtocolEquity (unused)
    function requery() public returns (int256) {
        (
            uint256 _pcvValue, //  pcv value
            uint256 _userFei, // user fei
            int256 newProtocolEquity,
            bool validity
        ) = oracle.pcvStats();
        if (minProtocolEquity == 0) {
            if (init == false) {
                minProtocolEquity = newProtocolEquity;
                recalculate();
                init = true;
                return minProtocolEquity;
            }
        }
        if (minProtocolEquity > newProtocolEquity) {
            minProtocolEquity = newProtocolEquity;
            recalculate();
            return minProtocolEquity;
        }
        return minProtocolEquity;
    }

    /// @notice validate the proof of a merkle drop claim
    /// @param claimer the address attempting to claim
    /// @param key the amount of scaled TRIBE allocated the claimer claims that they have credit over
    /// @param merkleProof a proof proving that claimer may redeem up to `key` amount of tribe
    /// @return boolean true if the proof is valid, false if the proof is invalid
    function verifyClaim(
        address claimer,
        uint256 key,
        bytes32[] memory merkleProof
    ) private view returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(claimer, key));
        return verifyProof(merkleProof, merkleRoot, leaf);
    }

    //end

    //merkle logic: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/c9bdb1f0ae168e00a942270f2b85d6a7d3293550/contracts/utils/cryptography/MerkleProof.sol
    //MIT: OpenZeppelin Contracts v4.3.2 (utils/cryptography/MerkleProof.sol)
    function verifyProof(
        bytes32[] memory proof,
        bytes32 root,
        bytes32 leaf
    ) internal pure returns (bool) {
        return processProof(proof, leaf) == root;
    }

    function processProof(bytes32[] memory proof, bytes32 leaf)
        internal
        pure
        returns (bytes32)
    {
        bytes32 computedHash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                computedHash = keccak256(
                    abi.encodePacked(computedHash, proofElement)
                );
            } else {
                computedHash = keccak256(
                    abi.encodePacked(proofElement, computedHash)
                );
            }
        }
        return computedHash;
    }

    //end

    /// @notice function which ultimately mints the FEI
    /// @param target the address of which to mint FEI to
    /// @param amount the amount of FEI to mint to the target address
    function giveTo(address target, uint256 amount) internal {
        token1.mint(target, amount);
    }

    /// @notice function which ultimately transfers the TRIBE
    /// @param target the address of which to transfer TRIBE from
    /// @param amount the amount of TRIBE to transfer from the target address
    function takeFrom(address target, uint256 amount) internal {
        bool check = token0.transferFrom(target, party1Core, amount);
        require(check, "erc20 transfer failed");
    }

    /// @notice tells whether or not both parties have accepted the deal
    /// @return boolean true if both parties have accepted, else false
    function isEnabled() public view returns (bool) {
        return party0Accepted && party1Accepted;
    }

    /// @notice function for the rari timelock to accept the deal
    function party0Accept() public {
        require(
            msg.sender == party0Timelock,
            "Only the timelock for party 0 may call this function"
        );
        party0Accepted = true;
        if (isEnabled()) {
            _startCountdown();
        }
    }

    /// @notice function for the tribe timelock to accept the deal
    function party1Accept() public {
        require(
            msg.sender == party1Timelock,
            "Only the timelock for party 1 may call this function"
        );
        party1Accepted = true;
        if (isEnabled()) {
            _startCountdown();
        }
    }

    function _startCountdown() internal {
        if (expirationBlock == 0) {
            expirationBlock = block.number + 6400 * 3; // approx. 3 days in blocks
        }
    }
}
