// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AuditRegistry} from "../src/AuditRegistry.sol";

interface Vm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }

    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory entries);
    function warp(uint256 newTimestamp) external;
}

contract UnauthorizedCaller {
    function issueCertificate(
        AuditRegistry registry,
        address subject,
        bytes32 codeHash,
        uint256 totalScore,
        string calldata reportUri
    ) external returns (bytes32) {
        return registry.issueCertificate(subject, codeHash, totalScore, reportUri);
    }
}

contract AuditRegistryTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event CertificateIssued(
        address indexed subject,
        bytes32 indexed codeHash,
        uint256 totalScore,
        string reportUri,
        uint256 issuedAt,
        bytes32 certificateHash
    );

    AuditRegistry internal registry;
    address internal authorizedAgent = address(this);
    address internal subject = address(0xBEEF);
    bytes32 internal codeHash = keccak256("safe source");
    uint256 internal totalScore = 92;
    string internal reportUri = "local://preflight-audits/demo.json";

    function setUp() external {
        registry = new AuditRegistry(authorizedAgent);
    }

    function testConstructorStoresAuthorizedAgent() external view {
        require(registry.authorizedAgent() == authorizedAgent, "authorized agent mismatch");
    }

    function testConstructorRejectsZeroAuthorizedAgent() external {
        try new AuditRegistry(address(0)) {
            revert("zero agent accepted");
        } catch (bytes memory reason) {
            require(_selector(reason) == AuditRegistry.InvalidAuthorizedAgent.selector, "wrong error selector");
        }
    }

    function testIssueCertificateStoresFieldsAndReturnsHash() external {
        vm.warp(1_717_171_717);

        bytes32 certificateHash = registry.issueCertificate(subject, codeHash, totalScore, reportUri);

        (
            bytes32 storedCodeHash,
            uint256 storedTotalScore,
            string memory storedReportUri,
            uint256 storedIssuedAt
        ) = registry.certificates(subject, 0);

        require(registry.certificateCount(subject) == 1, "certificate count mismatch");
        require(storedCodeHash == codeHash, "code hash mismatch");
        require(storedTotalScore == totalScore, "total score mismatch");
        require(_stringEq(storedReportUri, reportUri), "report uri mismatch");
        require(storedIssuedAt == 1_717_171_717, "issuedAt mismatch");
        require(
            certificateHash == keccak256(abi.encode(subject, codeHash, totalScore, reportUri, storedIssuedAt)),
            "certificate hash mismatch"
        );
    }

    function testIssueCertificateEmitsEvent() external {
        vm.warp(1_717_171_717);
        vm.recordLogs();

        bytes32 certificateHash = registry.issueCertificate(subject, codeHash, totalScore, reportUri);
        Vm.Log[] memory entries = vm.getRecordedLogs();

        require(entries.length == 1, "unexpected log count");
        require(entries[0].emitter == address(registry), "wrong emitter");
        require(entries[0].topics.length == 3, "wrong topic count");
        require(entries[0].topics[0] == CertificateIssued.selector, "wrong event selector");
        require(entries[0].topics[1] == bytes32(uint256(uint160(subject))), "wrong subject topic");
        require(entries[0].topics[2] == codeHash, "wrong code hash topic");

        (uint256 emittedScore, string memory emittedUri, uint256 emittedIssuedAt, bytes32 emittedHash) =
            abi.decode(entries[0].data, (uint256, string, uint256, bytes32));

        require(emittedScore == totalScore, "emitted score mismatch");
        require(_stringEq(emittedUri, reportUri), "emitted uri mismatch");
        require(emittedIssuedAt == 1_717_171_717, "emitted issuedAt mismatch");
        require(emittedHash == certificateHash, "emitted hash mismatch");
    }

    function testUnauthorizedCallerReverts() external {
        UnauthorizedCaller caller = new UnauthorizedCaller();

        try caller.issueCertificate(registry, subject, codeHash, totalScore, reportUri) {
            revert("unauthorized issue accepted");
        } catch (bytes memory reason) {
            require(_selector(reason) == AuditRegistry.NotAuthorized.selector, "wrong error selector");
        }

        require(registry.certificateCount(subject) == 0, "unauthorized certificate stored");
    }

    function _selector(bytes memory reason) internal pure returns (bytes4 selector) {
        if (reason.length >= 4) {
            assembly {
                selector := mload(add(reason, 32))
            }
        }
    }

    function _stringEq(string memory left, string memory right) internal pure returns (bool) {
        return keccak256(bytes(left)) == keccak256(bytes(right));
    }
}

