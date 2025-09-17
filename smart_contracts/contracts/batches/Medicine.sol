// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Errors } from "../libraries/Errors.sol";

/**
 * @title Medicine (Batch Contract)
 * @dev Data container for medicine batches. State managed strictly by SupplyChainLogic.
 *      Uses standard naming conventions internally; public interface preserved.
 */
contract Medicine {
    // --- Types ---
    enum Status {
        Created,        // Initial state after manufacturing
        InTransitToW,   // Moving to Wholesaler
        AtWholesaler,   // Received by Wholesaler
        InTransitToD,   // Moving to Distributor
        AtDistributor,  // Received by Distributor
        InTransitToC,   // Moving to Customer/Pharmacy/Hospital
        AtCustomer,     // Received by end-point/customer
        ConsumedOrSold, // Final state indicating use/sale
        Destroyed       // Final state indicating destruction
    }

    // --- State (Immutable data set at creation) ---
    address public immutable batchId; // Address of this contract
    address public immutable supplyChainContract; // Address of the controlling Logic contract
    bytes32 public immutable description;
    uint public immutable quantity;
    address[] public  rawMaterialBatchIds; // Store immutably if not modified after creation
    address public immutable manufacturer; // Creator of the batch
    uint public immutable creationTime;
    uint public immutable expiryDate;

    // --- State (Mutable data managed by SupplyChainLogic) ---
    Status public status;
    address public currentOwner; // Current holder (Manufacturer -> Wholesaler -> Distributor -> Customer)
    address public currentTransporter; // Assigned during transit phases
    address public currentDestination; // Expected recipient during transit phases
    uint public lastUpdateTime; // Timestamp of the last state change

    // --- Events (PascalCase - preserved) ---
    event StatusChanged(Status newStatus, uint timestamp);
    event OwnershipTransferred(address indexed from, address indexed to, uint timestamp);
    event TransporterAssigned(address indexed transporter, address indexed destination, uint timestamp);
    event BatchDestroyed(bytes32 reasonCode, uint timestamp);
    event BatchFinalized(uint timestamp); // For ConsumedOrSold status

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
        address[] memory _rawMaterialBatchIds,
        address _manufacturer,
        uint _expiryDate
    ) {
        // Basic address validation
        if (_supplyChainContract == address(0)) revert Errors.AccessControlZeroAddress();
        if (_manufacturer == address(0)) revert Errors.AccessControlZeroAddress();
        // Other validation (quantity, expiry, RM IDs) happens in Logic contract

        batchId = address(this);
        supplyChainContract = _supplyChainContract;
        description = _description;
        quantity = _quantity;
        rawMaterialBatchIds = _rawMaterialBatchIds; // Assign immutable array
        manufacturer = _manufacturer;
        creationTime = block.timestamp;
        expiryDate = _expiryDate; // Validation done in Logic

        status = Status.Created; // Initial status
        currentOwner = _manufacturer; // Initial owner
        lastUpdateTime = block.timestamp;

        emit StatusChanged(status, lastUpdateTime);
        // Emit initial ownership (from address(0) conceptually)
        emit OwnershipTransferred(address(0), currentOwner, lastUpdateTime);
    }

    // --- State Transitions (Called by SupplyChainLogic only) ---

    /**
     * @dev Sets the batch status to an "InTransit" state and assigns transporter/destination.
     * @param _nextTransitStatus The target transit status (InTransitToW, InTransitToD, InTransitToC).
     * @param _transporter The address of the transporter.
     * @param _destination The address of the intended receiver.
     */
    function setInTransit(Status _nextTransitStatus, address _transporter, address _destination) external onlySupplyChain {
        // State machine checks (Defense-in-depth)
        bool validPriorState = status == Status.Created || status == Status.AtWholesaler || status == Status.AtDistributor;
        bool validTargetState = _nextTransitStatus == Status.InTransitToW || _nextTransitStatus == Status.InTransitToD || _nextTransitStatus == Status.InTransitToC;

        if (!validPriorState || !validTargetState) {
            revert Errors.MedInvalidStateTransition(uint8(status), uint8(_nextTransitStatus));
        }
        // Further logic checks (e.g., Created -> InTransitToW only) handled in SupplyChainLogic

        status = _nextTransitStatus;
        currentTransporter = _transporter;
        currentDestination = _destination;
        lastUpdateTime = block.timestamp;

        emit TransporterAssigned(_transporter, _destination, lastUpdateTime);
        emit StatusChanged(status, lastUpdateTime);
    }

    /**
     * @dev Sets the batch status to an "At" state upon receipt and updates the owner.
     * @param _nextAtStatus The target received status (AtWholesaler, AtDistributor, AtCustomer).
     * @param _receiver The address of the receiver (becomes the new owner).
     */
    function setReceived(Status _nextAtStatus, address _receiver) external onlySupplyChain {
        // State machine checks (Defense-in-depth)
        bool validPriorState = status == Status.InTransitToW || status == Status.InTransitToD || status == Status.InTransitToC;
        bool validTargetState = _nextAtStatus == Status.AtWholesaler || _nextAtStatus == Status.AtDistributor || _nextAtStatus == Status.AtCustomer;

        if (!validPriorState || !validTargetState) {
             revert Errors.MedInvalidStateTransition(uint8(status), uint8(_nextAtStatus));
        }
         // Further logic checks (e.g., InTransitToW -> AtWholesaler only) handled in SupplyChainLogic

        address previousOwner = currentOwner;

        status = _nextAtStatus;
        currentOwner = _receiver; // Ownership transfer
        currentTransporter = address(0); // Clear transit info
        currentDestination = address(0);
        lastUpdateTime = block.timestamp;

        emit OwnershipTransferred(previousOwner, currentOwner, lastUpdateTime);
        emit StatusChanged(status, lastUpdateTime);
    }

    /** @dev Sets the batch status to ConsumedOrSold (final state). */
    function setConsumedOrSold() external onlySupplyChain {
        // State machine check (Defense-in-depth)
        if (status != Status.AtCustomer) {
            // Using BatchInvalidStateForAction as it's a final action, not a typical transition
            revert Errors.BatchInvalidStateForAction(uint8(status), uint8(Status.ConsumedOrSold));
        }

        status = Status.ConsumedOrSold;
        // Owner remains the customer who consumed/sold it
        lastUpdateTime = block.timestamp;
        emit BatchFinalized(lastUpdateTime);
        emit StatusChanged(status, lastUpdateTime);
    }

    /** @dev Sets the batch status to Destroyed (final state). */
    function setDestroyed(bytes32 _reasonCode) external onlySupplyChain {
        // Prevent action on already finalized states
        if (status == Status.Destroyed || status == Status.ConsumedOrSold) {
             revert Errors.MedAlreadyDestroyedOrFinalized();
        }

        address previousOwner = currentOwner;

        status = Status.Destroyed;
        currentOwner = address(0); // Ownership relinquished
        currentTransporter = address(0);
        currentDestination = address(0);
        lastUpdateTime = block.timestamp;

        emit BatchDestroyed(_reasonCode, lastUpdateTime);
        // Emit ownership transfer to address(0) if there was a previous owner
        if (previousOwner != address(0)) {
            emit OwnershipTransferred(previousOwner, address(0), lastUpdateTime);
        }
        emit StatusChanged(status, lastUpdateTime);
    }

    // --- View Function (Called by SupplyChainLogic via staticcall) ---

    /** @dev Returns the current state details of the batch. */
    function getDetails() external view returns (
        bytes32 _description, uint _quantity, address[] memory _rawMaterialBatchIds,
        address _manufacturer, uint _creationTime, uint _expiryDate, Status _status,
        address _currentOwner, address _currentTransporter, address _currentDestination,
        uint _lastUpdateTime
    ) {
        return (
            description,
            quantity,
            rawMaterialBatchIds,
            manufacturer,
            creationTime,
            expiryDate,
            status,
            currentOwner,
            currentTransporter,
            currentDestination,
            lastUpdateTime
        );
    }
}