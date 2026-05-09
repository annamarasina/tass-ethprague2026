// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title UnsafeVault
/// @notice Demo contract that intentionally triggers the blocked mock path.
contract UnsafeVault {
    address public owner;
    address public implementation;
    mapping(address => uint256) public balances;

    event Upgraded(address indexed implementation);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address initialImplementation) {
        owner = msg.sender;
        implementation = initialImplementation;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function unsafeUpgrade(address nextImplementation) external onlyOwner {
        implementation = nextImplementation;
        emit Upgraded(nextImplementation);
    }

    function criticalStorageCollisionDemo(address nextOwner) external onlyOwner {
        owner = nextOwner;
    }
}

