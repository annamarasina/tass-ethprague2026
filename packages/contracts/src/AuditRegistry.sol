// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AuditRegistry {
    address public immutable authorizedAgent;

    struct Certificate {
        bytes32 codeHash;
        uint256 totalScore;
        string reportUri;
        uint256 issuedAt;
    }

    mapping(address subject => Certificate[]) public certificates;

    event CertificateIssued(
        address indexed subject,
        bytes32 indexed codeHash,
        uint256 totalScore,
        string reportUri,
        uint256 issuedAt,
        bytes32 certificateHash
    );

    error NotAuthorized();
    error InvalidAuthorizedAgent();

    constructor(address _authorizedAgent) {
        if (_authorizedAgent == address(0)) revert InvalidAuthorizedAgent();
        authorizedAgent = _authorizedAgent;
    }

    function issueCertificate(
        address subject,
        bytes32 codeHash,
        uint256 totalScore,
        string calldata reportUri
    ) external returns (bytes32 certificateHash) {
        if (msg.sender != authorizedAgent) revert NotAuthorized();

        uint256 issuedAt = block.timestamp;

        certificateHash = keccak256(abi.encode(subject, codeHash, totalScore, reportUri, issuedAt));

        certificates[subject].push(
            Certificate({codeHash: codeHash, totalScore: totalScore, reportUri: reportUri, issuedAt: issuedAt})
        );

        emit CertificateIssued(subject, codeHash, totalScore, reportUri, issuedAt, certificateHash);
    }

    function certificateCount(address subject) external view returns (uint256) {
        return certificates[subject].length;
    }
}

