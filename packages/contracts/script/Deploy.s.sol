// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AuditRegistry} from "../src/AuditRegistry.sol";

interface Vm {
    function envAddress(string calldata name) external view returns (address value);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract Deploy {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (AuditRegistry registry) {
        address authorizedAgent = vm.envAddress("AGENT_ADDRESS");

        vm.startBroadcast();
        registry = new AuditRegistry(authorizedAgent);
        vm.stopBroadcast();
    }
}

