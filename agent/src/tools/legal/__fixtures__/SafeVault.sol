// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Permissionless vault demo.
contract SafeVault {
    address public owner;
    mapping(address => uint256) public balances;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient");
        balances[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
    }

    function updateOwner(address nextOwner) external onlyOwner {
        owner = nextOwner;
    }
}

