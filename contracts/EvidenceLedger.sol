// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title EvidenceLedger
 * @dev Anchors digital evidence cryptographic hashes to the Ethereum Virtual Machine (EVM).
 */
contract EvidenceLedger is AccessControl {
    
    struct EvidenceRecord {
        string sha256Hash;
        string firId; // Cryptographic linkage to parent FIR
        uint256 blockTimestamp;
        address registeredBy;
    }

    // Maps UUIDs to their immutable cryptographic records
    mapping(string => EvidenceRecord) private _evidenceLedger;

    // Events for real-time indexing and watchdog monitors
    event EvidenceAnchored(string indexed evidenceId, string indexed firId, string sha256Hash, address indexed registeredBy);

    // The unique role required to write to the ledger
    bytes32 public constant ANCHOR_ROLE = keccak256("ANCHOR_ROLE");

    constructor() {
        // Grant the contract deployer the default admin role
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Anchors a new evidence record onto the blockchain ledger and links it to an FIR.
     * @param evidenceId The unique UUID of the evidence file.
     * @param firId The UUID of the parent FIR this evidence belongs to.
     * @param sha256Hash The SHA-256 hash of the evidence content.
     */
    function anchorEvidence(string calldata evidenceId, string calldata firId, string calldata sha256Hash) external onlyRole(ANCHOR_ROLE) {
        require(bytes(evidenceId).length > 0, "Evidence ID cannot be empty");
        require(bytes(firId).length > 0, "FIR ID cannot be empty");
        require(bytes(sha256Hash).length == 64, "Must be a valid 64-character SHA-256 hex string");
        require(_evidenceLedger[evidenceId].blockTimestamp == 0, "Evidence ID already anchored on ledger");

        _evidenceLedger[evidenceId] = EvidenceRecord({
            sha256Hash: sha256Hash,
            firId: firId,
            blockTimestamp: block.timestamp,
            registeredBy: msg.sender
        });

        emit EvidenceAnchored(evidenceId, firId, sha256Hash, msg.sender);
    }

    /**
     * @dev Retrieves the cryptographic record of a given evidence.
     * @param evidenceId The unique UUID of the evidence file.
     * @return sha256Hash The anchored SHA-256 hash of the evidence.
     * @return firId The UUID of the linked FIR.
     * @return blockTimestamp The blockchain timestamp of registration.
     * @return registeredBy The Ethereum address that anchored this evidence.
     */
    function getEvidence(string calldata evidenceId) 
        external 
        view 
        returns (string memory sha256Hash, string memory firId, uint256 blockTimestamp, address registeredBy) 
    {
        EvidenceRecord memory record = _evidenceLedger[evidenceId];
        require(record.blockTimestamp > 0, "Evidence record not found on ledger");
        return (record.sha256Hash, record.firId, record.blockTimestamp, record.registeredBy);
    }
}
