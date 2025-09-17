/**
 * @title Errors
 * @dev Centralized library for custom error definitions used across the supply chain system.
 * @notice Using bytes32 for context/reasons and uint8 for enums where applicable for gas efficiency.
 */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// NOTE: Importing batch contracts solely for enum types isn't strictly necessary
// as we only use uint8 representations in errors, but kept for clarity if preferred.
// If removed, ensure uint8 is used consistently where enum values were passed.
// import {RawMaterial} from "../batches/RawMaterial.sol";
// import {Medicine} from "../batches/Medicine.sol";

/**
 * @title Errors
 * @dev Centralized library for custom error definitions.
 *      Uses standard PascalCase naming conventions.
 */
library Errors {
    // --- Access Control Errors (PascalCase) ---
    error AccessControlImmutableRole(); // Role cannot be granted/revoked (ADMIN, CUSTOMER) or admin cannot be changed (ADMIN)
    error InitializationRejected(); // Contract already initialized
    // error AccessControlBadAdminRole(bytes32 role); // Attempted to set an invalid role as admin (e.g., CUSTOMER_ROLE) - Replaced by AccessControlInvalidAdminRole
    error AccessControlMissingRole(address account, bytes32 role); // Caller or target lacks the required role
    error AccessControlInvalidAdminRole(address account, bytes32 role); // Account lacks the required admin role for the action OR attempt to set invalid admin role
    error AccessControlOwnerOnly(); // Action requires the contract owner
    error AccessControlZeroAddress(); // Operation involved address(0) where invalid
    // error AccessControlCannotRevokeAdmin(); // Included in AccessControlImmutableRole
    // error AccessControlCannotGrantRoleToSelf(); // Granting/revoking roles is based on admin, not self-granting restriction
    // error AccessControlAlreadyInitialized(); // Covered by InitializationRejected
    // error AccessControlCannotManageAdminRole(); // Covered by AccessControlImmutableRole
    error AccessControlCannotManageCustomerRole(); // Covered by AccessControlImmutableRole

    // --- Supply Chain Core Errors (PascalCase) ---
    // error SCTransferExpired(); // Not currently used in provided logic
    error SCInvalidAddress(bytes32 context); // An address argument was invalid (e.g., address(0))
    // error SCInvalidBatch(address batchAddress ); // Covered by SCBatchTypeUnknownOrActionFailed or specific validation errors
    // error SCRecallFailed( address batchAddress ); // Not currently used in provided logic
    error SCRoleCheckFailed(address target, bytes32 role, bytes32 reason); // A role check failed for a specific reason code
    error SCBatchCreationFailed(bytes32 batchType); // Deployment of a batch contract failed
    error SCRawMaterialValidationFailed(address rmAddress, bytes32 reason); // Validation of an input Raw Material batch failed
    error SCUnauthorizedActor(address actor, bytes32 reason); // Caller is not authorized for the action (e.g., not owner, not supplier)
    error SCInvalidStateForAction(address batchAddress, uint8 currentStatus, bytes32 action); // Batch is in the wrong state for the requested action
    error SCReceiverMismatch(address batchAddress, address expected, address actual); // The receiving address does not match the expected destination
    error SCInvalidReceiverRole(address receiver, bytes32 requiredRole); // The receiver has an invalid role for the current stage (e.g., Manufacturer trying to receive at Wholesaler stage)
    error SCBatchTypeUnknownOrActionFailed(address batchAddress, bytes32 action); // Batch address type is unknown or action is inappropriate for type
    error SCArgumentError(bytes32 reason); // A function argument failed validation (e.g., quantity <= 0, expiry date in past)
    error SCExternalCallFailed(address target, bytes32 action, bytes errorData); // An external call (to batch contract, etc.) failed
    error SCHistoryUnavailable(address batchAddress); // Transaction history requested for non-existent batch (Checked in Proxy)
    // error SCDelegateCallFailed(bytes32 context); // Specific context covered by Proxy errors

    // --- Supply Chain Proxy Errors (PascalCase) ---
    error ProxyInitializationFailed(bytes errorData); // Logic contract initialization via delegatecall failed
    error ProxyDelegateCallFailed(bytes errorData); // Generic delegatecall from proxy to logic failed
    error ProxyStaticCallFailed(bytes errorData); // Generic staticcall from proxy to logic failed
    error ProxyInvalidLogicAddress(); // Provided logic address was address(0)
    error ProxyVoidReturnExpected(); // A delegatecall expected no return data but received some
    error ProxyOwnerMismatchPostInit(); // Owner in storage doesn't match deployer after initialization delegatecall
    error ProxyUnauthorizedUpgrade(); // Caller attempting upgrade lacks ADMIN_ROLE

    // --- Batch Contract Errors (PascalCase) ---
    error BatchUnauthorizedCaller(address caller, address expected); // Caller is not the allowed SupplyChain contract
    error BatchInvalidStateForAction(uint8 currentStatus, uint8 requiredStatus); // Batch is not in the required status for the action (internal check)
    error BatchAlreadyDestroyed(); // Action attempted on an already destroyed RawMaterial batch
    error MedInvalidStateTransition(uint8 currentStatus, uint8 targetStatus); // Invalid state transition attempted in Medicine batch
    error MedAlreadyDestroyedOrFinalized(); // Action attempted on a Medicine batch that is already Destroyed or ConsumedOrSold

    // --- Constants (SCREAMING_SNAKE_CASE - can be kept for referencing reason codes) ---
    // Constants defining context/reason strings for errors (used as bytes32 arguments)
    // bytes32 internal constant CTX_LOGIC_CONTRACT = keccak256("logicContractAddress"); // Example if needed internally
    // ... other constants from original SupplyChainLogic can be kept if needed for reason codes ...
}