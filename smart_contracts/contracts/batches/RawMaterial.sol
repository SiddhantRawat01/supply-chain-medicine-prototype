// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Errors } from "../libraries/Errors.sol";

/**
 * @title RawMaterial (Batch Contract)
 * @dev Data container for raw materials. State managed strictly by SupplyChainLogic.
 *      Uses standard naming conventions internally; public interface preserved.
 */
contract RawMaterial {
    // --- Types ---
    enum Status { Created, InTransit, Received, Destroyed }

    // --- State (Immutable data set at creation) ---
    address public immutable batchId; // Address of this contract
    address public immutable supplyChainContract; // Address of the controlling Logic contract
    bytes32 public immutable description;
    uint public immutable quantity;
    address public immutable supplier; // Creator of the batch
    address public immutable intendedManufacturer; // Expected recipient
    uint public immutable creationTime;

    // --- State (Mutable data managed by SupplyChainLogic) ---
    Status public status;
    address public currentTransporter; // Assigned during transit
    uint public lastUpdateTime; // Timestamp of the last state change

    // --- Events (PascalCase - preserved) ---
    event StatusChanged(Status newStatus, uint timestamp);
    event TransporterAssigned(address indexed transporter, uint timestamp);
    event BatchDestroyed(bytes32 reasonCode, uint timestamp);

    // --- Modifiers ---
    modifier onlySupplyChain() {
        if (msg.sender != supplyChainContract) {
            revert Errors.BatchUnauthorizedCaller(msg.sender, supplyChainContract);
        }
        _;
    }

    // --- Constructor ---
    constructor(
        address _supplyChainContract,
        bytes32 _description,
        uint _quantity,
        address _supplier,
        address _intendedManufacturer
    ) {
        // Basic address validation
        if (_supplyChainContract == address(0)) revert Errors.AccessControlZeroAddress(); // Re-use error for invalid address
        if (_supplier == address(0)) revert Errors.AccessControlZeroAddress();
        if (_intendedManufacturer == address(0)) revert Errors.AccessControlZeroAddress();
        // Quantity validation happens in Logic contract

        batchId = address(this);
        supplyChainContract = _supplyChainContract;
        description = _description;
        quantity = _quantity;
        supplier = _supplier;
        intendedManufacturer = _intendedManufacturer;
        creationTime = block.timestamp;

        status = Status.Created; // Initial status
        lastUpdateTime = block.timestamp;
        emit StatusChanged(status, lastUpdateTime);
    }

    // --- State Transitions (Called by SupplyChainLogic only) ---

    /** @dev Sets the batch status to InTransit and assigns a transporter. */
    function setInTransit(address _transporter) external onlySupplyChain {
        // State machine check (Defense-in-depth)
        if (status != Status.Created) {
            revert Errors.BatchInvalidStateForAction(uint8(status), uint8(Status.Created));
        }
        // Transporter address(0) check done in Logic contract

        status = Status.InTransit;
        currentTransporter = _transporter;
        lastUpdateTime = block.timestamp;
        emit TransporterAssigned(_transporter, lastUpdateTime);
        emit StatusChanged(status, lastUpdateTime);
    }

    /** @dev Sets the batch status to Received. */
    function setReceived() external onlySupplyChain {
        // State machine check (Defense-in-depth)
        if (status != Status.InTransit) {
            revert Errors.BatchInvalidStateForAction(uint8(status), uint8(Status.InTransit));
        }

        status = Status.Received;
        currentTransporter = address(0); // Clear transporter upon receipt
        lastUpdateTime = block.timestamp;
        emit StatusChanged(status, lastUpdateTime);
    }

    /** @dev Sets the batch status to Destroyed. */
    function setDestroyed(bytes32 _reasonCode) external onlySupplyChain {
        // Prevent re-destroying (Idempotency)
        if (status == Status.Destroyed) {
            revert Errors.BatchAlreadyDestroyed();
        }

        status = Status.Destroyed;
        currentTransporter = address(0); // Clear transporter
        lastUpdateTime = block.timestamp;
        emit BatchDestroyed(_reasonCode, lastUpdateTime);
        emit StatusChanged(status, lastUpdateTime);
    }

    // --- View Function (Called by SupplyChainLogic via staticcall) ---

    /** @dev Returns the current state details of the batch. */
    function getDetails() external view returns (
        bytes32 _description, uint _quantity, address _supplier, address _intendedManufacturer,
        uint _creationTime, Status _status, address _currentTransporter, uint _lastUpdateTime
    ) {
        return (
            description,
            quantity,
            supplier,
            intendedManufacturer,
            creationTime,
            status,
            currentTransporter,
            lastUpdateTime
        );
    }
}