// client/src/components/TransferForm.jsx // Renamed to .jsx for clarity
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useWeb3 } from '../contexts/Web3Context';
import { ROLES, getRoleName } from '../constants/roles';
import { ethers } from 'ethers';
import styles from '../styles/TransferForm.module.css'; // Use CSS Module import

// --- Import Helpers and Constants ---
import {
    formatAddress,
    formatHash,
    RawMaterialStatus,
    MedicineStatus
} from './BatchDetails'; // Adjust path as needed

// --- Constants ---
const COORD_DECIMALS = 6;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const STATUS_TYPE = { // Define status types for clarity
    INFO: 'info',
    LOADING: 'loading',
    SUCCESS: 'success',
    ERROR: 'error',
};

const VALIDATION_MESSAGES = {
    INVALID_ADDRESS: (field) => `${field}: Please enter a valid Ethereum address (0x...).`,
    INVALID_NUMBER: (field) => `${field}: ${field} must be a valid number.`,
    REQUIRED: (field) => `${field} is required.`,
    WALLET_CONNECT: 'Wallet not connected or contract not loaded.',
    INSUFFICIENT_ROLE: (role) => `You do not have the required ${role} role.`,
    VALIDATING: 'Validating prerequisites...',
    VALIDATION_FAILED: 'Prerequisite validation failed', // Base message
    SENDING: 'Sending transaction...',
    WAITING: (txHash) => `Waiting for confirmation... (Tx: ${formatHash(txHash)})`,
    SUCCESS: (txHash) => `Transfer Initiated Successfully! (Tx: ${formatHash(txHash)})`,
    TX_REVERTED: 'Transaction failed on-chain.',
    PREREQ_OWNERSHIP: 'Access Denied: You are not the current owner/supplier of this batch.',
    PREREQ_RECEIVER_MISMATCH_RM: (expected, actual) => `Receiver Mismatch: Batch intended for ${formatAddress(expected)}, not ${formatAddress(actual)}.`,
    PREREQ_INVALID_STATE: (currentStateName) => `Invalid State: Batch cannot be transferred from its current state (${currentStateName}).`,
    PREREQ_ROLE_STATE_MISMATCH: (roleName, stateName) => `Role/State Mismatch: Your role (${roleName}) cannot transfer from state (${stateName}).`,
    PREREQ_TRANSPORTER_ROLE: (addr) => `Invalid Transporter: Address ${formatAddress(addr)} lacks the required Transporter role.`,
    TRANSFER_FAILED_BASE: 'Transfer Initiation Failed',
    INTERNAL_ERROR: 'An internal error occurred.',
};

// --- Helper Function ---
const isValidCoordinate = (coordString) => {
    if (typeof coordString !== 'string') return false;
    const trimmed = coordString.trim();
    if (trimmed === '') return false; // Coordinates are required
    const num = Number(trimmed);
    return !isNaN(num) && isFinite(num);
};

// --- Component ---
function TransferForm({ batchTypeContext, allowedSenderRole, onSuccess, onError }) {
    // --- Hooks ---
    const {
        contract,
        signer,
        account,
        isLoading: isGlobalLoading, // Rename to avoid conflict if using local loading
        setIsLoading: setGlobalLoading, // Rename for clarity
        getRevertReason,
        hasRole,
        fetchWithLoading, // Use if available for reads
    } = useWeb3();

    // --- State ---
    const [formData, setFormData] = useState({
        batchAddress: '',
        transporter: '',
        receiver: '',
        latitude: '',
        longitude: '',
    });
    const [validationErrors, setValidationErrors] = useState({}); // Object to hold field-specific errors
    const [status, setStatus] = useState({ message: '', type: STATUS_TYPE.INFO }); // Unified status/feedback state
    const [isLocalLoading, setIsLocalLoading] = useState(false); // Local loading for validation/submission

    // Combined loading state
    const isLoading = isGlobalLoading || isLocalLoading;

    // --- Memoized Values ---
    const roleName = useMemo(() => getRoleName(allowedSenderRole), [allowedSenderRole]);
    const canInitiate = useMemo(() => hasRole(allowedSenderRole), [hasRole, allowedSenderRole]);

    // --- Effects ---
    // Clear errors when form inputs change
    useEffect(() => {
        setValidationErrors({});
        // Optionally clear general status message on input change, or keep it until next action
        // setStatus({ message: '', type: STATUS_TYPE.INFO });
    }, [formData]);

    // --- Callbacks ---
    const handleInputChange = useCallback((e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    }, []);

    const clearStatus = useCallback(() => {
        setStatus({ message: '', type: STATUS_TYPE.INFO });
        setValidationErrors({});
        if (onError) onError(null); // Clear parent error state too
    }, [onError]);

    // --- Validation Logic ---
    const validateSync = useCallback(() => {
        const errors = {};
        const { batchAddress, transporter, receiver, latitude, longitude } = formData;

        if (!batchAddress) errors.batchAddress = VALIDATION_MESSAGES.REQUIRED('Batch Address');
        else if (!ethers.isAddress(batchAddress)) errors.batchAddress = VALIDATION_MESSAGES.INVALID_ADDRESS('Batch Address');

        if (!transporter) errors.transporter = VALIDATION_MESSAGES.REQUIRED('Transporter Address');
        else if (!ethers.isAddress(transporter)) errors.transporter = VALIDATION_MESSAGES.INVALID_ADDRESS('Transporter Address');

        if (!receiver) errors.receiver = VALIDATION_MESSAGES.REQUIRED('Receiver Address');
        else if (!ethers.isAddress(receiver)) errors.receiver = VALIDATION_MESSAGES.INVALID_ADDRESS('Receiver Address');

        if (!latitude) errors.latitude = VALIDATION_MESSAGES.REQUIRED('Latitude');
        else if (!isValidCoordinate(latitude)) errors.latitude = VALIDATION_MESSAGES.INVALID_NUMBER('Latitude');

        if (!longitude) errors.longitude = VALIDATION_MESSAGES.REQUIRED('Longitude');
        else if (!isValidCoordinate(longitude)) errors.longitude = VALIDATION_MESSAGES.INVALID_NUMBER('Longitude');

        setValidationErrors(errors);
        return Object.keys(errors).length === 0; // Return true if valid
    }, [formData]);

    const validateAsyncPrerequisites = useCallback(async () => {
        if (!contract || !account || !signer) throw new Error(VALIDATION_MESSAGES.WALLET_CONNECT);
        const { batchAddress, receiver, transporter } = formData; // Get current values

        // Use fetchWithLoading if provided by context, otherwise just call directly
        const executeRead = fetchWithLoading ?? ((func) => func());

        try {
            if (batchTypeContext === 'RAW_MATERIAL') {
                const details = await executeRead(() => contract.getRawMaterialDetails(batchAddress));
                const currentStatus = Number(details.status);
                const expectedStatus = 0; // RawMaterialStatus.Created

                if (details.supplier.toLowerCase() !== account.toLowerCase()) {
                    throw new Error(VALIDATION_MESSAGES.PREREQ_OWNERSHIP);
                }
                if (details.intendedManufacturer.toLowerCase() !== receiver.toLowerCase()) {
                    throw new Error(VALIDATION_MESSAGES.PREREQ_RECEIVER_MISMATCH_RM(details.intendedManufacturer, receiver));
                }
                if (currentStatus !== expectedStatus) {
                     throw new Error(VALIDATION_MESSAGES.PREREQ_INVALID_STATE(RawMaterialStatus[currentStatus] ?? `Unknown (${currentStatus})`));
                }

            } else if (batchTypeContext === 'MEDICINE') {
                const details = await executeRead(() => contract.getMedicineDetails(batchAddress));
                const currentStatus = Number(details.status);
                const requiredSenderRolesMap = {
                    0: ROLES.MANUFACTURER_ROLE, // Status: Created
                    2: ROLES.WHOLESALER_ROLE,   // Status: AtWholesaler
                    4: ROLES.DISTRIBUTOR_ROLE,  // Status: AtDistributor
                };
                const requiredRoleForState = requiredSenderRolesMap[currentStatus];
                const currentStateName = MedicineStatus[currentStatus] ?? `Unknown (${currentStatus})`;

                if (details.currentOwner.toLowerCase() !== account.toLowerCase()) {
                    throw new Error(VALIDATION_MESSAGES.PREREQ_OWNERSHIP);
                }
                if (requiredRoleForState === undefined) {
                    throw new Error(VALIDATION_MESSAGES.PREREQ_INVALID_STATE(currentStateName));
                }
                // This check ensures the *current* state *requires* the role this form instance is meant for.
                // It complements the initial `canInitiate` check.
                if (allowedSenderRole !== requiredRoleForState) {
                    throw new Error(VALIDATION_MESSAGES.PREREQ_ROLE_STATE_MISMATCH(roleName, currentStateName));
                }

                // Optional further checks (e.g., receiver role) could go here

            } else {
                throw new Error(VALIDATION_MESSAGES.INTERNAL_ERROR + ": Invalid batchTypeContext.");
            }

            // Optional: Check Transporter Role (Contract enforces fully, but client-side check can improve UX)
             // const transporterHasRole = await executeRead(() => contract.hasRole(ROLES.TRANSPORTER_ROLE, transporter));
             // if (!transporterHasRole) {
             //     throw new Error(VALIDATION_MESSAGES.PREREQ_TRANSPORTER_ROLE(transporter));
             // }

            return true; // Prerequisites met

        } catch (err) {
            console.error(`${batchTypeContext} prerequisite validation error:`, err);
            // Re-throw with a potentially parsed reason for the handleSubmit catch block
            throw new Error(`${VALIDATION_MESSAGES.VALIDATION_FAILED}: ${getRevertReason(err) || err.message}`);
        }
    }, [
        contract, account, signer, formData, batchTypeContext, allowedSenderRole,
        fetchWithLoading, getRevertReason, roleName // Include dependencies
    ]);

    // --- Submit Handler ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        clearStatus(); // Clear previous status/errors

        // 1. Basic Checks
        if (!contract || !account || !signer) {
            setStatus({ message: VALIDATION_MESSAGES.WALLET_CONNECT, type: STATUS_TYPE.ERROR });
            return;
        }
        if (!canInitiate) {
            setStatus({ message: VALIDATION_MESSAGES.INSUFFICIENT_ROLE(roleName), type: STATUS_TYPE.ERROR });
            return;
        }

        // 2. Synchronous Validation
        if (!validateSync()) {
            setStatus({ message: 'Please fix the errors marked below.', type: STATUS_TYPE.ERROR });
            return;
        }

        setIsLocalLoading(true); // Start local loading

        // 3. Asynchronous Prerequisite Validation
        try {
            setStatus({ message: VALIDATION_MESSAGES.VALIDATING, type: STATUS_TYPE.LOADING });
            await validateAsyncPrerequisites(); // Throws error on failure

        } catch (prereqError) {
            setStatus({ message: prereqError.message, type: STATUS_TYPE.ERROR });
            if (onError) onError(prereqError.message);
            setIsLocalLoading(false);
            return;
        }

        // 4. Prepare and Send Transaction
        try {
            setStatus({ message: VALIDATION_MESSAGES.SENDING, type: STATUS_TYPE.LOADING });
            const { batchAddress, transporter, receiver, latitude, longitude } = formData;

            const latScaled = ethers.parseUnits(latitude, COORD_DECIMALS);
            const lonScaled = ethers.parseUnits(longitude, COORD_DECIMALS);

            const tx = await contract.initiateTransfer(batchAddress, transporter, receiver, latScaled, lonScaled);

            setStatus({ message: VALIDATION_MESSAGES.WAITING(tx.hash), type: STATUS_TYPE.LOADING });

            const receipt = await tx.wait(1);

            if (receipt.status === 0) {
                throw new Error(VALIDATION_MESSAGES.TX_REVERTED + ` (Tx: ${formatHash(receipt.hash)})`);
            }

            // Success!
            const successMsg = VALIDATION_MESSAGES.SUCCESS(receipt.hash);
            setStatus({ message: successMsg, type: STATUS_TYPE.SUCCESS });
            if (onSuccess) onSuccess(receipt.hash, batchAddress); // Pass hash and address back

            // Reset form
            setFormData({ batchAddress: '', transporter: '', receiver: '', latitude: '', longitude: '' });
            setValidationErrors({});

        } catch (submitError) {
            console.error("Initiate Transfer Transaction Error:", submitError);
            const reason = getRevertReason(submitError);
            let userErrorMessage = `${VALIDATION_MESSAGES.TRANSFER_FAILED_BASE}: ${reason || submitError.message}`;

            // Refine error message based on known reasons (optional but good UX)
            // Examples:
            // if (reason.includes("TransporterLacksRole")) ...
            // if (reason.includes("InvalidStateForAction")) ...

            setStatus({ message: userErrorMessage, type: STATUS_TYPE.ERROR });
            if (onError) onError(userErrorMessage);

        } finally {
            setIsLocalLoading(false); // Stop local loading
        }
    };

    // --- Render ---
    return (
        <form onSubmit={handleSubmit} className={styles.transferForm} noValidate>
            <h3 className={styles.formTitle}>
                Initiate {batchTypeContext === 'RAW_MATERIAL' ? 'Raw Material' : 'Medicine'} Transfer
            </h3>

            {!canInitiate && (
                <p className={styles.permissionError}>
                    Insufficient permissions. Requires role: {roleName}.
                </p>
            )}

            {/* Use map or explicit fields for better structure */}
            <div className={styles.formGroup}>
                <label htmlFor="batchAddress" className={styles.formLabel}>Batch Address:</label>
                <input
                    id="batchAddress"
                    name="batchAddress" // Add name attribute
                    type="text"
                    value={formData.batchAddress}
                    onChange={handleInputChange}
                    required
                    pattern={ADDRESS_REGEX.source}
                    placeholder="0x..."
                    className={`${styles.formInput} ${validationErrors.batchAddress ? styles['formInput--error'] : ''}`}
                    disabled={!canInitiate || isLoading}
                    aria-invalid={!!validationErrors.batchAddress}
                    aria-describedby={validationErrors.batchAddress ? "batchAddress-error" : undefined}
                />
                {validationErrors.batchAddress && <p id="batchAddress-error" className={styles.inputError}>{validationErrors.batchAddress}</p>}
            </div>

            <div className={styles.formGroup}>
                <label htmlFor="transporter" className={styles.formLabel}>Transporter Address:</label>
                <input
                    id="transporter"
                    name="transporter"
                    type="text"
                    value={formData.transporter}
                    onChange={handleInputChange}
                    required
                    pattern={ADDRESS_REGEX.source}
                    placeholder="0x..."
                    className={`${styles.formInput} ${validationErrors.transporter ? styles['formInput--error'] : ''}`}
                    disabled={!canInitiate || isLoading}
                    aria-invalid={!!validationErrors.transporter}
                    aria-describedby={validationErrors.transporter ? "transporter-error" : undefined}
                />
                {validationErrors.transporter && <p id="transporter-error" className={styles.inputError}>{validationErrors.transporter}</p>}
            </div>

            <div className={styles.formGroup}>
                <label htmlFor="receiver" className={styles.formLabel}>Receiver Address:</label>
                <input
                    id="receiver"
                    name="receiver"
                    type="text"
                    value={formData.receiver}
                    onChange={handleInputChange}
                    required
                    pattern={ADDRESS_REGEX.source}
                    placeholder="0x..."
                     className={`${styles.formInput} ${validationErrors.receiver ? styles['formInput--error'] : ''}`}
                    disabled={!canInitiate || isLoading}
                    aria-invalid={!!validationErrors.receiver}
                    aria-describedby={validationErrors.receiver ? "receiver-error" : "receiver-hint"}
                />
                {validationErrors.receiver && <p id="receiver-error" className={styles.inputError}>{validationErrors.receiver}</p>}
                {batchTypeContext === 'RAW_MATERIAL' && !validationErrors.receiver && (
                    <small id="receiver-hint" className={styles.formHint}>
                        (Must match the batch's Intended Manufacturer)
                    </small>
                )}
            </div>

            <div className={styles.formRow}>
                 <div className={styles.formGroup /* + styles.formGroup--half optional */}>
                     <label htmlFor="latitude" className={styles.formLabel}>Current Latitude:</label>
                     <input
                        id="latitude"
                        name="latitude"
                        type="number"
                        step="any"
                        value={formData.latitude}
                        onChange={handleInputChange}
                        required
                        placeholder="e.g., 40.7128"
                        className={`${styles.formInput} ${validationErrors.latitude ? styles['formInput--error'] : ''}`}
                        disabled={!canInitiate || isLoading}
                        aria-invalid={!!validationErrors.latitude}
                        aria-describedby={validationErrors.latitude ? "latitude-error" : undefined}
                     />
                     {validationErrors.latitude && <p id="latitude-error" className={styles.inputError}>{validationErrors.latitude}</p>}
                 </div>
                 <div className={styles.formGroup /* + styles.formGroup--half optional */}>
                     <label htmlFor="longitude" className={styles.formLabel}>Current Longitude:</label>
                     <input
                        id="longitude"
                        name="longitude"
                        type="number"
                        step="any"
                        value={formData.longitude}
                        onChange={handleInputChange}
                        required
                        placeholder="e.g., -74.0060"
                        className={`${styles.formInput} ${validationErrors.longitude ? styles['formInput--error'] : ''}`}
                        disabled={!canInitiate || isLoading}
                        aria-invalid={!!validationErrors.longitude}
                        aria-describedby={validationErrors.longitude ? "longitude-error" : undefined}
                     />
                     {validationErrors.longitude && <p id="longitude-error" className={styles.inputError}>{validationErrors.longitude}</p>}
                 </div>
            </div>

            <button
                type="submit"
                className={styles.submitButton}
                disabled={isLoading || !contract || !canInitiate}
            >
                {isLoading ? 'Processing...' : `Initiate ${batchTypeContext === 'RAW_MATERIAL' ? 'RM' : 'Med'} Transfer`}
            </button>

            {/* Display unified status message */}
            {status.message && (
                 <p className={`${styles.statusMessage} ${styles[`statusMessage--${status.type}`]}`}>
                     {status.message}
                 </p>
             )}
        </form>
    );
}

// --- PropTypes Definition (Remains the same) ---
TransferForm.propTypes = {
    batchTypeContext: PropTypes.oneOf(['RAW_MATERIAL', 'MEDICINE']).isRequired,
    allowedSenderRole: PropTypes.string.isRequired,
    onSuccess: PropTypes.func,
    onError: PropTypes.func,
};

TransferForm.defaultProps = {
    onSuccess: () => {},
    onError: () => {},
};

export default TransferForm;