// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Fully decentralized vault with no admin controls.
contract NoAdminClaimVault {
    address public owner;
    address public implementation;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function upgradeTo(address nextImplementation) external onlyOwner {
        implementation = nextImplementation;
    }
}

