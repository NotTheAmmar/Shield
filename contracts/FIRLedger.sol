// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title FIRLedger
 * @dev Anchors FIR records to the Ethereum Virtual Machine (EVM).
 */
contract FIRLedger is AccessControl {
    
    struct FIRRecord {
        string sha256Hash;
        uint256 blockTimestamp;
        address registeredBy;
    }

    // Maps UUIDs to their immutable cryptographic records
    mapping(string => FIRRecord) private _firLedger;

    // Events for real-time indexing and watchdog monitors
    event FIRAnchored(string indexed firId, string sha256Hash, address indexed registeredBy);

    // The unique role required to write to the ledger
    bytes32 public constant ANCHOR_ROLE = keccak256("ANCHOR_ROLE");

    constructor() {
        // Grant the contract deployer the default admin role
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Anchors a new FIR record onto the blockchain ledger.
     * @param firId The unique UUID of the FIR.
     * @param sha256Hash The SHA-256 hash of the FIR metadata and content.
     */
    function anchorFIR(string calldata firId, string calldata sha256Hash) external onlyRole(ANCHOR_ROLE) {
        require(bytes(firId).length > 0, "FIR ID cannot be empty");
        require(bytes(sha256Hash).length == 64, "Must be a valid 64-character SHA-256 hex string");
        require(_firLedger[firId].blockTimestamp == 0, "FIR ID already anchored on ledger");

        _firLedger[firId] = FIRRecord({
            sha256Hash: sha256Hash,
            blockTimestamp: block.timestamp,
            registeredBy: msg.sender
        });

        emit FIRAnchored(firId, sha256Hash, msg.sender);
    }

    /**
     * @dev Retrieves the cryptographic record of a given FIR.
     * @param firId The unique UUID of the FIR.
     * @return sha256Hash The anchored SHA-256 hash of the FIR.
     * @return blockTimestamp The blockchain timestamp of registration.
     * @return registeredBy The Ethereum address that anchored this FIR.
     */
    function getFIR(string calldata firId) 
        external 
        view 
        returns (string memory sha256Hash, uint256 blockTimestamp, address registeredBy) 
    {
        FIRRecord memory record = _firLedger[firId];
        require(record.blockTimestamp > 0, "FIR record not found on ledger");
        return (record.sha256Hash, record.blockTimestamp, record.registeredBy);
    }
}
