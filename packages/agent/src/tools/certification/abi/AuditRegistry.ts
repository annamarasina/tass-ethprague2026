export const auditRegistryAbi = [
  {
    type: "function",
    name: "issueCertificate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "subject", type: "address" },
      { name: "codeHash", type: "bytes32" },
      { name: "totalScore", type: "uint256" },
      { name: "reportUri", type: "string" },
    ],
    outputs: [{ name: "certificateHash", type: "bytes32" }],
  },
  {
    type: "function",
    name: "authorizedAgent",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "CertificateIssued",
    inputs: [
      { name: "subject", type: "address", indexed: true },
      { name: "codeHash", type: "bytes32", indexed: true },
      { name: "totalScore", type: "uint256", indexed: false },
      { name: "reportUri", type: "string", indexed: false },
      { name: "issuedAt", type: "uint256", indexed: false },
      { name: "certificateHash", type: "bytes32", indexed: false },
    ],
  },
] as const;

