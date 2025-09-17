// logic/SupplyChainLogic.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Errors} from "../libraries/Errors.sol";
import {AccessControlWithOwner} from "../access/AccessControlWithOwner.sol"; // Base contract for state/logic
import {RawMaterial} from "../batches/RawMaterial.sol"; // Batch types
import {Medicine} from "../batches/Medicine.sol";

/**
 * @title SupplyChainLogic
 * @dev Implements core supply chain actions and state management. Inherits AccessControlWithOwner.
 *      Designed to be called via delegatecall from SupplyChainProxy.
 *      Initialization is handled by the inherited _initializeOwner function.
 */
contract SupplyChainLogic is AccessControlWithOwner {

    // --- State Variables ---
    struct TxnLog {
        uint index; // Index within the batch's log array
        address actor; // Address performing the action
        address involvedParty; // e.g., Transporter, Receiver, Manufacturer
        bytes32 eventCode; // Hash identifying the type of event (e.g., LOG_RM_CREATED)
        int256 latitude; // Location data
        int256 longitude; // Location data
        uint timestamp; // Block timestamp of the log entry
        bytes32 dataHash; // Hash of relevant event data (e.g., quantity, description hash)
        bytes32 previousLogHash; // Hash of the previous log entry for integrity
    }

    // Mapping: Batch Contract Address => Array of Transaction Logs
    mapping(address => TxnLog[]) public batchLogs;
    // Mapping: Batch Contract Address => Hash of the most recent log entry
    mapping(address => bytes32) public lastLogHashForBatch;
    // Mapping: Batch Contract Address => Type identifier (TYPE_RAW_MATERIAL or TYPE_MEDICINE)
    mapping(address => bytes32) public batchType;

    // --- Constants ---
    // Using bytes32 constants for context/reasons/types/actions/logs for gas efficiency and clarity
    bytes32 private constant CTX_INTENDED_MANUFACTURER = keccak256("intendedManufacturer");
    bytes32 private constant CTX_TRANSPORTER = keccak256("transporter");
    bytes32 private constant CTX_RECEIVER = keccak256("receiver");
    bytes32 private constant CTX_BATCH_ADDRESS = keccak256("batchAddress");
    bytes32 private constant CTX_RM_BATCH_ID_ARRAY = keccak256("rawMaterialBatchIdInArray");

    bytes32 private constant ARG_QUANTITY_POSITIVE = keccak256("QuantityMustBePositive");
    bytes32 private constant ARG_EXPIRY_FUTURE = keccak256("ExpiryDateMustBeInFuture");
    bytes32 private constant ARG_RM_ARRAY_EMPTY = keccak256("RequiresAtLeastOneRawMaterial");
    bytes32 private constant ARG_UNKNOWN_ROLE_NAME = keccak256("UnknownRoleNameProvided");

    bytes32 private constant REASON_MANUFACTURER_ROLE_MISSING = keccak256("IntendedManufacturerLacksRole");
    bytes32 private constant REASON_TRANSPORTER_ROLE_MISSING = keccak256("TransporterLacksRole");
    bytes32 private constant REASON_RECEIVER_ROLE_INVALID = keccak256("ReceiverRoleInvalidForStage");
    bytes32 private constant REASON_NOT_SUPPLIER = keccak256("CallerIsNotSupplier");
    bytes32 private constant REASON_NOT_OWNER = keccak256("CallerIsNotCurrentOwner");
    bytes32 private constant REASON_NOT_ADMIN_OR_SUPPLIER = keccak256("RequiresAdminOrSupplier");
    bytes32 private constant REASON_NOT_ADMIN_OR_OWNER = keccak256("RequiresAdminOrOwner");
    bytes32 private constant REASON_RM_NOT_RECEIVED = keccak256("RawMaterialNotReceived");
    bytes32 private constant REASON_RM_WRONG_MANUFACTURER = keccak256("RawMaterialWrongManufacturer");
    // bytes32 private constant REASON_RM_INVALID_CONTRACT = keccak256("RawMaterialInvalidContract"); // Covered by SCExternalCallFailed
    bytes32 private constant REASON_RM_NOT_RM_TYPE = keccak256("AddressIsNotRawMaterialBatch");

    bytes32 private constant ACTION_INITIATE_TRANSFER = keccak256("initiateTransfer");
    bytes32 private constant ACTION_RECEIVE_PACKAGE = keccak256("receivePackage");
    bytes32 private constant ACTION_FINALIZE_BATCH = keccak256("finalizeMedicineBatch");
    bytes32 private constant ACTION_DESTROY_BATCH = keccak256("markBatchDestroyed");
    bytes32 private constant ACTION_GET_RM_DETAILS = keccak256("getRawMaterialDetails");
    bytes32 private constant ACTION_GET_MED_DETAILS = keccak256("getMedicineDetails");

    bytes32 public constant TYPE_RAW_MATERIAL = keccak256("RAW_MATERIAL"); // Public for external reference
    bytes32 public constant TYPE_MEDICINE = keccak256("MEDICINE");       // Public for external reference

    bytes32 private constant LOG_RM_CREATED = keccak256("RawMaterial Created");
    bytes32 private constant LOG_MED_CREATED = keccak256("Medicine Created");
    bytes32 private constant LOG_RM_TRANSFER = keccak256("RawMaterial Transfer Initiated");
    bytes32 private constant LOG_MED_TRANSFER = keccak256("Medicine Transfer Initiated");
    bytes32 private constant LOG_RM_RECEIVED = keccak256("RawMaterial Received");
    bytes32 private constant LOG_MED_RECEIVED = keccak256("Medicine Received");
    bytes32 private constant LOG_MED_FINALIZED = keccak256("Medicine Consumed/Sold");
    bytes32 private constant LOG_RM_DESTROYED = keccak256("RawMaterial Destroyed");
    bytes32 private constant LOG_MED_DESTROYED = keccak256("Medicine Destroyed");


    // --- Events (Inherits Access Control Events: OwnershipTransferred, RoleAdminChanged, RoleGranted, RoleRevoked) ---
    event BatchCreated(bytes32 indexed batchType, address indexed batchAddress, address indexed creator, uint timestamp);
    event TransferInitiated(address indexed batchAddress, address indexed initiator, address indexed transporter, address receiver, uint timestamp);
    event PackageReceived(address indexed batchAddress, address indexed receiver, address indexed sender, uint timestamp); // sender is previous holder
    event BatchFinalized(address indexed batchAddress, address indexed finalOwner, uint timestamp); // For medicine consumed/sold
    event BatchDestroyed(address indexed batchAddress, address indexed actor, bytes32 reasonCode, uint timestamp);
    event LogEntryCreated(address indexed batchAddress, uint indexed index, address indexed actor, bytes32 eventCode, uint timestamp, bytes32 currentLogHash);

    // --- Initialization ---
    /**
     * @dev Public initializer called ONLY ONCE by Proxy constructor via delegatecall.
     *      Delegates *entirely* to the inherited _initializeOwner function.
     * @param deployer The address to become the initial owner and admin.
     */
    function initialize(address deployer) external {
        // This function's SOLE purpose is to be the target of the proxy's
        // initialization delegatecall. It calls the internal function which
        // handles setting owner and default role admins.
        _initializeOwner(deployer);
        // Owner implicitly gets ADMIN_ROLE via _hasRole logic.
    }

    // --- Batch Creation Functions ---

    /**
     * @dev Creates a new RawMaterial batch contract. Requires SUPPLIER_ROLE.
     * Validates inputs and intended manufacturer role.
     */
    function createRawMaterial(
        bytes32 _description,
        uint _quantity,
        address _intendedManufacturer,
        int256 _latitude,
        int256 _longitude
    ) external returns (address batchAddress) {
        _checkSenderRole(SUPPLIER_ROLE); // Check msg.sender has SUPPLIER_ROLE

        // Input validation
        if (_intendedManufacturer == address(0)) revert Errors.SCInvalidAddress(CTX_INTENDED_MANUFACTURER);
        if (_quantity == 0) revert Errors.SCArgumentError(ARG_QUANTITY_POSITIVE);

        // Role validation for other parties
        if (!_hasRole(MANUFACTURER_ROLE, _intendedManufacturer)) {
             revert Errors.SCRoleCheckFailed(_intendedManufacturer, MANUFACTURER_ROLE, REASON_MANUFACTURER_ROLE_MISSING);
        }

        // Deployment
        RawMaterial batch = new RawMaterial(address(this), _description, _quantity, msg.sender, _intendedManufacturer);
        batchAddress = address(batch);
        if (batchAddress == address(0)) revert Errors.SCBatchCreationFailed(TYPE_RAW_MATERIAL); // Should not happen if constructor succeeds

        // State Update & Logging
        batchType[batchAddress] = TYPE_RAW_MATERIAL;
        bytes32 dataHash = keccak256(abi.encode(_description, _quantity, _intendedManufacturer)); // Hash key creation data
        _logTransaction(batchAddress, msg.sender, _intendedManufacturer, LOG_RM_CREATED, _latitude, _longitude, dataHash);
        emit BatchCreated(TYPE_RAW_MATERIAL, batchAddress, msg.sender, block.timestamp);
    }

    /**
     * @dev Creates a new Medicine batch contract. Requires MANUFACTURER_ROLE.
     * Validates inputs, expiry date, and input raw material batches.
     */
    function createMedicine(
        bytes32 _description,
        uint _quantity,
        address[] calldata _rawMaterialBatchIds,
        uint _expiryDate,
        int256 _latitude,
        int256 _longitude
    ) external returns (address batchAddress) {
        _checkSenderRole(MANUFACTURER_ROLE); // Check msg.sender has MANUFACTURER_ROLE

        // Input validation
        if (_rawMaterialBatchIds.length == 0) revert Errors.SCArgumentError(ARG_RM_ARRAY_EMPTY);
        if (_quantity == 0) revert Errors.SCArgumentError(ARG_QUANTITY_POSITIVE);
        if (_expiryDate <= block.timestamp) revert Errors.SCArgumentError(ARG_EXPIRY_FUTURE);

        // Raw Material Input Validation (Loop is necessary)
        for (uint i = 0; i < _rawMaterialBatchIds.length; i++) {
             address rmAddr = _rawMaterialBatchIds[i];
             if (rmAddr == address(0)) revert Errors.SCInvalidAddress(CTX_RM_BATCH_ID_ARRAY);

             // 1. Check if known batch and correct type in this contract's state
             if(batchType[rmAddr] != TYPE_RAW_MATERIAL) revert Errors.SCRawMaterialValidationFailed(rmAddr, REASON_RM_NOT_RM_TYPE);

             // 2. Call the RM batch contract to verify its state (status=Received, intendedManufacturer=caller)
             try RawMaterial(rmAddr).getDetails() returns (
                 bytes32, uint, address, address intendedM, uint, RawMaterial.Status status, address, uint
             ) {
                 // Check status returned by the RM batch contract
                 if (status != RawMaterial.Status.Received) revert Errors.SCRawMaterialValidationFailed(rmAddr, REASON_RM_NOT_RECEIVED);
                 // Check if this manufacturer was the intended recipient of the RM batch
                 if (intendedM != msg.sender) revert Errors.SCRawMaterialValidationFailed(rmAddr, REASON_RM_WRONG_MANUFACTURER);
             } catch (bytes memory lowLevelData) {
                 // If the call fails (e.g., invalid contract address, revert in getDetails), catch it
                 revert Errors.SCExternalCallFailed(rmAddr, ACTION_GET_RM_DETAILS, lowLevelData);
             }
             // Note: We don't need to re-check supplier/manufacturer roles here, just the state of the input batch.
        }

        // Deployment
        // Pass 'this' as the controlling contract address
        Medicine batch = new Medicine(address(this), _description, _quantity, _rawMaterialBatchIds, msg.sender, _expiryDate);
        batchAddress = address(batch);
        if (batchAddress == address(0)) revert Errors.SCBatchCreationFailed(TYPE_MEDICINE); // Should not happen

        // State Update & Logging
        batchType[batchAddress] = TYPE_MEDICINE;
        // Hash key creation data including the input RM IDs array
        bytes32 dataHash = keccak256(abi.encode(_description, _quantity, _rawMaterialBatchIds, _expiryDate));
        // Involved party is address(0) as it's creation by the manufacturer
        _logTransaction(batchAddress, msg.sender, address(0), LOG_MED_CREATED, _latitude, _longitude, dataHash);
        emit BatchCreated(TYPE_MEDICINE, batchAddress, msg.sender, block.timestamp);
    }

    // --- Batch Lifecycle Functions ---

    /**
     * @dev Initiates the transfer of a batch (RawMaterial or Medicine) to a new stage.
     * Requires specific roles depending on the batch type and current state.
     */
    function initiateTransfer(
        address _batchAddress,
        address _transporter,
        address _receiver,
        int256 _latitude,
        int256 _longitude
    ) external {
        address sender = msg.sender; // Cache msg.sender

        // Argument Validation
        if (_batchAddress == address(0)) revert Errors.SCInvalidAddress(CTX_BATCH_ADDRESS);
        if (_transporter == address(0)) revert Errors.SCInvalidAddress(CTX_TRANSPORTER);
        if (_receiver == address(0)) revert Errors.SCInvalidAddress(CTX_RECEIVER);

        // Role Validation for involved parties (Transporter must have role)
        if (!_hasRole(TRANSPORTER_ROLE, _transporter)) {
            revert Errors.SCRoleCheckFailed(_transporter, TRANSPORTER_ROLE, REASON_TRANSPORTER_ROLE_MISSING);
        }

        // Determine batch type
        bytes32 _type = batchType[_batchAddress];
        if (_type == bytes32(0)) revert Errors.SCBatchTypeUnknownOrActionFailed(_batchAddress, ACTION_INITIATE_TRANSFER);

        bytes32 eventDataHash = keccak256(abi.encode(_transporter, _receiver)); // Hash key transfer details
        bytes32 logCode; // To be set based on type

        // --- Raw Material Transfer Logic ---
        if (_type == TYPE_RAW_MATERIAL) {
            RawMaterial rm = RawMaterial(_batchAddress); // Interface to batch contract

            // Authorization: Only the original supplier can initiate transfer
            // We read supplier directly from the batch contract for definitive check
            address supplier;
            address intendedManufacturer;
            RawMaterial.Status currentStatus;
            try rm.getDetails() returns (bytes32, uint, address s, address iM, uint, RawMaterial.Status st, address, uint) {
                supplier = s;
                intendedManufacturer = iM;
                currentStatus = st; // Check status from batch contract state
            } catch (bytes memory lowLevelData) {
                revert Errors.SCExternalCallFailed(_batchAddress, ACTION_GET_RM_DETAILS, lowLevelData);
            }

            if (supplier != sender) revert Errors.SCUnauthorizedActor(sender, REASON_NOT_SUPPLIER);

            // State Check: Must be in 'Created' state to initiate transfer
            if (currentStatus != RawMaterial.Status.Created) {
                 revert Errors.SCInvalidStateForAction(_batchAddress, uint8(currentStatus), ACTION_INITIATE_TRANSFER);
            }

            // Receiver Validation: Must match the intended manufacturer stored in the batch
            if (intendedManufacturer != _receiver) revert Errors.SCReceiverMismatch(_batchAddress, intendedManufacturer, _receiver);

            // Role Validation: Receiver must have the MANUFACTURER_ROLE
            if (!_hasRole(MANUFACTURER_ROLE, _receiver)) {
                revert Errors.SCRoleCheckFailed(_receiver, MANUFACTURER_ROLE, REASON_MANUFACTURER_ROLE_MISSING);
            }

            // External Call: Update batch contract state
            try rm.setInTransit(_transporter) {
                logCode = LOG_RM_TRANSFER;
            } catch (bytes memory lowLevelData) {
                revert Errors.SCExternalCallFailed(_batchAddress, ACTION_INITIATE_TRANSFER, lowLevelData);
            }

        // --- Medicine Transfer Logic ---
        } else if (_type == TYPE_MEDICINE) {
            Medicine med = Medicine(_batchAddress); // Interface to batch contract

            // Authorization & State Check: Read current owner and status from batch contract
            address currentOwner;
            Medicine.Status currentStatus;
            try med.getDetails() returns (bytes32, uint, address[] memory, address, uint, uint, Medicine.Status st, address co, address, address, uint) {
                 currentOwner = co;
                 currentStatus = st;
            } catch (bytes memory lowLevelData) {
                 revert Errors.SCExternalCallFailed(_batchAddress, ACTION_GET_MED_DETAILS, lowLevelData);
            }

            if (currentOwner != sender) revert Errors.SCUnauthorizedActor(sender, REASON_NOT_OWNER);

            Medicine.Status nextTransitStatus; // The target status enum value
            bytes32 requiredSenderRole; // Role required by the sender for this stage
            bytes32 requiredReceiverRole; // Role required by the receiver for this stage

            // Determine roles and next state based on current status
            if (currentStatus == Medicine.Status.Created) {
                requiredSenderRole = MANUFACTURER_ROLE;
                // Manufacturer can send to Wholesaler or Distributor
                if (_hasRole(WHOLESALER_ROLE, _receiver)) {
                    requiredReceiverRole = WHOLESALER_ROLE;
                    nextTransitStatus = Medicine.Status.InTransitToW;
                } else if (_hasRole(DISTRIBUTOR_ROLE, _receiver)) {
                    requiredReceiverRole = DISTRIBUTOR_ROLE;
                    nextTransitStatus = Medicine.Status.InTransitToD;
                } else {
                    revert Errors.SCInvalidReceiverRole(_receiver, bytes32(0)); // No specific role, but needs W or D
                }
            } else if (currentStatus == Medicine.Status.AtWholesaler) {
                 requiredSenderRole = WHOLESALER_ROLE;
                 // Wholesaler must send to Distributor
                 if (!_hasRole(DISTRIBUTOR_ROLE, _receiver)) revert Errors.SCRoleCheckFailed(_receiver, DISTRIBUTOR_ROLE, REASON_RECEIVER_ROLE_INVALID);
                 requiredReceiverRole = DISTRIBUTOR_ROLE;
                 nextTransitStatus = Medicine.Status.InTransitToD;
            } else if (currentStatus == Medicine.Status.AtDistributor) {
                  requiredSenderRole = DISTRIBUTOR_ROLE;
                  // Distributor must send to Customer (anyone, CUSTOMER_ROLE always true)
                  if (!_hasRole(CUSTOMER_ROLE, _receiver)) revert Errors.SCRoleCheckFailed(_receiver, CUSTOMER_ROLE, REASON_RECEIVER_ROLE_INVALID); // Should always pass
                  requiredReceiverRole = CUSTOMER_ROLE;
                 nextTransitStatus = Medicine.Status.InTransitToC;
            } else {
                // Cannot initiate transfer from other states (InTransit, AtCustomer, Finalized, Destroyed)
                revert Errors.SCInvalidStateForAction(_batchAddress, uint8(currentStatus), ACTION_INITIATE_TRANSFER);
            }

            // Check Sender's Role (already checked ownership, now check role for the stage)
             _checkSenderRole(requiredSenderRole);
             // Receiver role was checked above implicitly or explicitly

            // External Call: Update batch contract state
            try med.setInTransit(nextTransitStatus, _transporter, _receiver) {
                logCode = LOG_MED_TRANSFER;
            } catch (bytes memory lowLevelData) {
                revert Errors.SCExternalCallFailed(_batchAddress, ACTION_INITIATE_TRANSFER, lowLevelData);
            }
        }
        // Else case for unknown type already handled

        // Logging & Event Emission (Common to both types)
        _logTransaction(_batchAddress, sender, _transporter, logCode, _latitude, _longitude, eventDataHash);
        emit TransferInitiated(_batchAddress, sender, _transporter, _receiver, block.timestamp);
    }


    /**
     * @dev Confirms receipt of a package. Called by the receiver.
     * Requires specific roles depending on the batch type and current state.
     */
    function receivePackage(
         address _batchAddress,
         int256 _latitude,
         int256 _longitude
    ) external {
        address sender = msg.sender; // Cache msg.sender (the receiver)

        // Argument/Type Validation
        if (_batchAddress == address(0)) revert Errors.SCInvalidAddress(CTX_BATCH_ADDRESS);
        bytes32 _type = batchType[_batchAddress];
        if (_type == bytes32(0)) revert Errors.SCBatchTypeUnknownOrActionFailed(_batchAddress, ACTION_RECEIVE_PACKAGE);

        bytes32 eventDataHash = keccak256(abi.encode("RECEIVE", sender)); // Hash key receipt details
        bytes32 logCode; // To be set based on type
        address previousHolder = address(0); // To store who sent it
        address transporter = address(0); // To store who transported it

        // --- Raw Material Receipt Logic ---
        if (_type == TYPE_RAW_MATERIAL) {
            RawMaterial rm = RawMaterial(_batchAddress);

            // Validation: Read expected receiver (intendedManufacturer) and current state from batch
            address intendedManufacturer;
            address currentTransporter;
            RawMaterial.Status currentStatus;
            address supplier; // Needed for event
            try rm.getDetails() returns (bytes32, uint, address s, address iM, uint, RawMaterial.Status st, address ct, uint) {
                 intendedManufacturer = iM;
                 currentStatus = st;
                 currentTransporter = ct;
                 supplier = s;
            } catch (bytes memory lowLevelData) {
                 revert Errors.SCExternalCallFailed(_batchAddress, ACTION_GET_RM_DETAILS, lowLevelData);
            }

            // Authorization: Caller must be the intended manufacturer
            if (intendedManufacturer != sender) revert Errors.SCReceiverMismatch(_batchAddress, intendedManufacturer, sender);

            // Role Check: Caller (receiver) must have MANUFACTURER_ROLE
            _checkSenderRole(MANUFACTURER_ROLE);

            // State Check: Must be InTransit to be received
            if (currentStatus != RawMaterial.Status.InTransit) {
                 revert Errors.SCInvalidStateForAction(_batchAddress, uint8(currentStatus), ACTION_RECEIVE_PACKAGE);
            }

            // Set log/event details
            previousHolder = supplier; // RM comes from supplier
            transporter = currentTransporter;

            // External Call: Update batch state
            try rm.setReceived() {
                logCode = LOG_RM_RECEIVED;
            } catch (bytes memory lowLevelData) {
                revert Errors.SCExternalCallFailed(_batchAddress, ACTION_RECEIVE_PACKAGE, lowLevelData);
            }

        // --- Medicine Receipt Logic ---
        } else if (_type == TYPE_MEDICINE) {
            Medicine med = Medicine(_batchAddress);

             // Validation: Read expected destination, current owner, transporter, status from batch
            address currentDestination;
            address currentOwner;
            address currentTransporter;
            Medicine.Status currentStatus;
             try med.getDetails() returns (bytes32, uint, address[] memory, address, uint, uint, Medicine.Status st, address co, address ct, address cd, uint) {
                 currentDestination = cd;
                 currentOwner = co;
                 currentTransporter = ct;
                 currentStatus = st;
            } catch (bytes memory lowLevelData) {
                 revert Errors.SCExternalCallFailed(_batchAddress, ACTION_GET_MED_DETAILS, lowLevelData);
            }

             // Authorization: Caller must be the current destination
             if (currentDestination != sender) revert Errors.SCReceiverMismatch(_batchAddress, currentDestination, sender);

            // State & Role Mapping
            Medicine.Status nextStatus; // Target status after receipt
            bytes32 requiredReceiverRole; // Role the sender (receiver) must have

            if (currentStatus == Medicine.Status.InTransitToW) {
                nextStatus = Medicine.Status.AtWholesaler;
                requiredReceiverRole = WHOLESALER_ROLE;
            } else if (currentStatus == Medicine.Status.InTransitToD) {
                nextStatus = Medicine.Status.AtDistributor;
                requiredReceiverRole = DISTRIBUTOR_ROLE;
            } else if (currentStatus == Medicine.Status.InTransitToC) {
                nextStatus = Medicine.Status.AtCustomer;
                requiredReceiverRole = CUSTOMER_ROLE;
            } else {
                // Cannot receive if not in a valid transit state
                revert Errors.SCInvalidStateForAction(_batchAddress, uint8(currentStatus), ACTION_RECEIVE_PACKAGE);
            }

            // Role Check: Caller (receiver) must have the required role for this stage
            _checkSenderRole(requiredReceiverRole);

            // Set log/event details
            previousHolder = currentOwner; // Medicine comes from the previous owner
            transporter = currentTransporter;

            // External Call: Update batch state (transfers ownership internally)
            try med.setReceived(nextStatus, sender) {
                logCode = LOG_MED_RECEIVED;
            } catch (bytes memory lowLevelData) {
                revert Errors.SCExternalCallFailed(_batchAddress, ACTION_RECEIVE_PACKAGE, lowLevelData);
            }
        }
        // Else case for unknown type already handled

        // Logging & Event Emission (Common to both types)
        // Involved party is the transporter who delivered it
        _logTransaction(_batchAddress, sender, transporter, logCode, _latitude, _longitude, eventDataHash);
        emit PackageReceived(_batchAddress, sender, previousHolder, block.timestamp);
    }

    /**
     * @dev Marks a Medicine batch as consumed or sold by the final customer.
     * Requires CUSTOMER_ROLE.
     */
    function finalizeMedicineBatch(
        address _batchAddress,
        int256 _latitude,
        int256 _longitude
    ) external {
        // Role Check: Only Customer can finalize
        // Note: _hasRole(CUSTOMER_ROLE, sender) is always true for non-zero address,
        // so this check primarily ensures sender isn't address(0) if needed,
        // but authorization relies on ownership check below.
        // _checkSenderRole(CUSTOMER_ROLE); // Technically correct but redundant due to owner check

        // Argument/Type Validation
        if (_batchAddress == address(0)) revert Errors.SCInvalidAddress(CTX_BATCH_ADDRESS);
        if (batchType[_batchAddress] != TYPE_MEDICINE) revert Errors.SCBatchTypeUnknownOrActionFailed(_batchAddress, ACTION_FINALIZE_BATCH);

        Medicine med = Medicine(_batchAddress);

        // Authorization & State Check: Read owner and status
        address currentOwner;
        Medicine.Status currentStatus;
        try med.getDetails() returns (bytes32, uint, address[] memory, address, uint, uint, Medicine.Status st, address co, address, address, uint) {
             currentOwner = co;
             currentStatus = st;
        } catch (bytes memory lowLevelData) {
             revert Errors.SCExternalCallFailed(_batchAddress, ACTION_GET_MED_DETAILS, lowLevelData);
        }

        // Caller must be the current owner (implicitly the customer at this stage)
        if (currentOwner != msg.sender) revert Errors.SCUnauthorizedActor(msg.sender, REASON_NOT_OWNER);

        // Batch must be in 'AtCustomer' state to be finalized
        if (currentStatus != Medicine.Status.AtCustomer) {
             revert Errors.SCInvalidStateForAction(_batchAddress, uint8(currentStatus), ACTION_FINALIZE_BATCH);
        }

        // External Call: Update batch state
        try med.setConsumedOrSold() {
             // Log and Emit on success
             bytes32 dataHash = keccak256(abi.encode("FINALIZED", msg.sender));
             // Involved party is address(0) as it's a terminal action by the owner
             _logTransaction(_batchAddress, msg.sender, address(0), LOG_MED_FINALIZED, _latitude, _longitude, dataHash);
             emit BatchFinalized(_batchAddress, msg.sender, block.timestamp);
        } catch (bytes memory lowLevelData) {
            revert Errors.SCExternalCallFailed(_batchAddress, ACTION_FINALIZE_BATCH, lowLevelData);
        }
    }

    /**
     * @dev Marks a batch (RawMaterial or Medicine) as destroyed.
     * Can be called by the Admin or the current owner/supplier of the batch.
     */
    function markBatchDestroyed(
        address _batchAddress,
        bytes32 _reasonCode, // Reason for destruction
        int256 _latitude,
        int256 _longitude
    ) external {
        address sender = msg.sender; // Cache sender

        // Argument/Type Validation
        if (_batchAddress == address(0)) revert Errors.SCInvalidAddress(CTX_BATCH_ADDRESS);
        bytes32 _type = batchType[_batchAddress];
        if (_type == bytes32(0)) revert Errors.SCBatchTypeUnknownOrActionFailed(_batchAddress, ACTION_DESTROY_BATCH);

        // Authorization Check: Sender must be Admin OR the appropriate batch owner/supplier
        bool isAdmin = _hasRole(ADMIN_ROLE, sender);
        bool isAuthorized = isAdmin; // Start with admin authorization

        bytes32 logCode; // To be set based on type

        // --- Raw Material Destruction ---
        if (_type == TYPE_RAW_MATERIAL) {
            RawMaterial rm = RawMaterial(_batchAddress);
            if (!isAuthorized) {
                // If not admin, check if sender is the supplier
                 address supplier;
                 try rm.getDetails() returns (bytes32, uint, address s, address, uint, RawMaterial.Status, address, uint) { supplier = s; }
                 catch (bytes memory lowLevelData) { revert Errors.SCExternalCallFailed(_batchAddress, ACTION_GET_RM_DETAILS, lowLevelData); }

                 if (supplier == sender) {
                     isAuthorized = true;
                 } else {
                     revert Errors.SCUnauthorizedActor(sender, REASON_NOT_ADMIN_OR_SUPPLIER);
                 }
            }
            // If authorized, proceed to call setDestroyed
            try rm.setDestroyed(_reasonCode) { logCode = LOG_RM_DESTROYED; }
            catch (bytes memory lowLevelData) { revert Errors.SCExternalCallFailed(_batchAddress, ACTION_DESTROY_BATCH, lowLevelData); }

        // --- Medicine Destruction ---
        } else if (_type == TYPE_MEDICINE) {
            Medicine med = Medicine(_batchAddress);
            if (!isAuthorized) {
                // If not admin, check if sender is the current owner
                address currentOwner;
                try med.getDetails() returns (bytes32, uint, address[] memory, address, uint, uint, Medicine.Status, address co, address, address, uint) { currentOwner = co; }
                catch (bytes memory lowLevelData) { revert Errors.SCExternalCallFailed(_batchAddress, ACTION_GET_MED_DETAILS, lowLevelData); }

                if (currentOwner == sender) {
                    isAuthorized = true;
                } else {
                     revert Errors.SCUnauthorizedActor(sender, REASON_NOT_ADMIN_OR_OWNER);
                }
            }
             // If authorized, proceed to call setDestroyed
            try med.setDestroyed(_reasonCode) { logCode = LOG_MED_DESTROYED; }
            catch (bytes memory lowLevelData) { revert Errors.SCExternalCallFailed(_batchAddress, ACTION_DESTROY_BATCH, lowLevelData); }
        }
        // Else case for unknown type already handled

        // Logging & Event Emission (Common to both types)
        bytes32 dataHash = keccak256(abi.encode("DESTROYED", _reasonCode));
        // Involved party is address(0) as it's a terminal action
        _logTransaction(_batchAddress, sender, address(0), logCode, _latitude, _longitude, dataHash);
        emit BatchDestroyed(_batchAddress, sender, _reasonCode, block.timestamp);
    }


    // --- Role Management Wrappers (Public Interface using inherited internal functions) ---

    /** @dev Grants a role. Requires caller to have the role's admin role (or be owner if admin is ADMIN_ROLE). */
    function grantRole(bytes32 role, address account) external {
        _grantRole(role, account, msg.sender); // Delegate to internal function with sender context
    }

    /** @dev Revokes a role. Requires caller to have the role's admin role (or be owner if admin is ADMIN_ROLE). */
    function revokeRole(bytes32 role, address account) external {
        _revokeRole(role, account, msg.sender); // Delegate to internal function with sender context
    }

    /** @dev Sets the admin role for a given role. Requires caller to be the owner. */
    function setRoleAdmin(bytes32 role, bytes32 adminRole) external {
        _setRoleAdmin(role, adminRole, msg.sender); // Delegate to internal function with sender context
    }

    /** @dev Transfers ownership. Requires caller to be the owner. */
    function transferOwnership(address newOwner) external {
        _transferOwnership(newOwner, msg.sender); // Delegate to internal function with sender context
    }


    // --- Public Access Control View Functions (using inherited internal views) ---

    /** @notice Returns true if `account` has been granted `role`. */
    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _hasRole(role, account); // Delegate to internal view
    }

    /** @notice Returns the admin role that controls `role`. Defaults to ADMIN_ROLE. */
    function getRoleAdmin(bytes32 role) external view returns (bytes32) {
        return _getRoleAdmin(role); // Delegate to internal view
    }


    // --- Internal Logging Function ---

    /**
     * @dev Internal function to record a transaction log entry for a batch.
     * Calculates the log hash based on previous hash and current data.
     */
    function _logTransaction(
        address _batchAddress,
        address _actor,
        address _involvedParty,
        bytes32 _eventCode,
        int256 _latitude,
        int256 _longitude,
        bytes32 _dataHash
    ) internal {
         bytes32 previousHash = lastLogHashForBatch[_batchAddress]; // Get hash of previous log
         TxnLog[] storage logs = batchLogs[_batchAddress]; // Get storage pointer to logs array
         uint currentIndex = logs.length; // Index for the new log

         // Calculate hash of the current log entry (use encodePacked for efficiency)
         bytes32 currentLogHash = keccak256(abi.encodePacked(
             currentIndex,
             _actor,
             _involvedParty,
             _eventCode,
             _latitude,
             _longitude,
             block.timestamp,
             _dataHash,
             previousHash // Include previous hash in current hash calculation
         ));

         // Add the new log entry to the array
         logs.push(TxnLog({
             index: currentIndex,
             actor: _actor,
             involvedParty: _involvedParty,
             eventCode: _eventCode,
             latitude: _latitude,
             longitude: _longitude,
             timestamp: block.timestamp,
             dataHash: _dataHash,
             previousLogHash: previousHash
         }));

         // Update the last log hash for the batch
         lastLogHashForBatch[_batchAddress] = currentLogHash;

         // Emit event
         emit LogEntryCreated(_batchAddress, currentIndex, _actor, _eventCode, block.timestamp, currentLogHash);
    }


    // --- Internal View Functions for Batch Details (Called by Proxy via staticcall) ---
    // These functions perform external staticcalls to the batch contracts.

    /** @dev Internal view to get details from a RawMaterial batch contract. */
    function getRawMaterialDetails(address _batchAddress)
        external
        view
        returns (
            bytes32 description, uint quantity, address supplier, address intendedManufacturer,
            uint creationTime, RawMaterial.Status status, address currentTransporter, uint lastUpdateTime
        )
    {
        // Use low-level staticcall with try/catch for robustness against reverts in the target contract
        (bool success, bytes memory data) = _batchAddress.staticcall(
            abi.encodeWithSelector(RawMaterial.getDetails.selector)
        );

        if(!success) {
             // If the staticcall failed, revert with details
             revert Errors.SCExternalCallFailed(_batchAddress, ACTION_GET_RM_DETAILS, data);
        }

        // Decode the returned data according to the RawMaterial.getDetails() signature
        (description, quantity, supplier, intendedManufacturer, creationTime, status, currentTransporter, lastUpdateTime) =
             abi.decode(data, (bytes32, uint, address, address, uint, RawMaterial.Status, address, uint));
        // Return values are implicitly returned
    }

    /** @dev Internal view to get details from a Medicine batch contract. */
    function getMedicineDetails(address _batchAddress)
        external
        view
        returns (
            bytes32 description, uint quantity, address[] memory rawMaterialBatchIds, address manufacturer,
            uint creationTime, uint expiryDate, Medicine.Status status, address currentOwner,
            address currentTransporter, address currentDestination, uint lastUpdateTime
        )
    {
        (bool success, bytes memory data) = _batchAddress.staticcall(
            abi.encodeWithSelector(Medicine.getDetails.selector)
        );

         if(!success) {
             revert Errors.SCExternalCallFailed(_batchAddress, ACTION_GET_MED_DETAILS, data);
         }

         // Decode the returned data according to the Medicine.getDetails() signature
         (description, quantity, rawMaterialBatchIds, manufacturer, creationTime, expiryDate, status, currentOwner, currentTransporter, currentDestination, lastUpdateTime) =
              abi.decode(data, (bytes32, uint, address[], address, uint, uint, Medicine.Status, address, address, address, uint));
         // Return values are implicitly returned
     }

    /** @dev Internal view to get the transaction history for a batch. */
    function getTransactionHistory(address _batchAddress) external view returns (TxnLog[] memory) {
        // Note: Proxy should ideally check if batchType[_batchAddress] != bytes32(0) before calling this
        // to avoid returning an empty array for non-existent batches, although returning empty is harmless.
        return batchLogs[_batchAddress];
    }


    // --- Utility Function ---

     /**
      * @dev Gets the role identifier hash from a role name string.
      * Reverts if the provided role name is not one of the known roles.
      * Useful for off-chain interaction or testing.
      */
     function getRoleIdentifier(string calldata _roleName) external pure returns (bytes32) {
        bytes32 roleHash = keccak256(abi.encodePacked(_roleName));

        // Explicitly check against *all* known public roles defined in AccessControlWithOwner
        if (roleHash == ADMIN_ROLE ||
            roleHash == SUPPLIER_ROLE ||
            roleHash == TRANSPORTER_ROLE ||
            roleHash == MANUFACTURER_ROLE ||
            roleHash == WHOLESALER_ROLE ||
            roleHash == DISTRIBUTOR_ROLE ||
            roleHash == CUSTOMER_ROLE)
        {
            return roleHash;
        }

        // If the hash doesn't match any known role, revert.
        revert Errors.SCArgumentError(ARG_UNKNOWN_ROLE_NAME);
    }

    // Note: The public `owner` variable is inherited directly from AccessControlWithOwner and stored in this contract's context.
    // Note: Public mappings `batchLogs`, `lastLogHashForBatch`, `batchType` have implicit getters generated by the compiler.
}