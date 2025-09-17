// client/src/components/MarkDestroyedForm.jsx // Rename to .jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useWeb3 } from '../contexts/Web3Context';
import { ROLES, getRoleName } from '../constants/roles';
import { ethers } from 'ethers';
import styles from '../styles/MarkDestroyedForm.module.css'; // Import CSS Module
import { formatHash } from './BatchDetails';
// --- Constants ---
const COORD_DECIMALS = 6; // Decimals for coordinate scaling
const REASON_MAX_LENGTH = 31; // Max length for bytes32 string
const ADDRESS_REGEX_SOURCE = '^0x[a-fA-F0-9]{40}$'; // Regex source for pattern attribute

// Ideally, get these from a shared constants file
const RAW_MATERIAL_TYPE_HASH = ethers.id("RAW_MATERIAL");
const MEDICINE_TYPE_HASH = ethers.id("MEDICINE");

const STATUS_TYPE = {
    INFO: 'info',
    LOADING: 'loading',
    SUCCESS: 'success',
    ERROR: 'error',
};

// Define specific status codes for clarity (match Solidity enums)
const STATUS_CODES = {
    RAW_MATERIAL: { DESTROYED: 3 },
    MEDICINE: { CONSUMED_SOLD: 7, DESTROYED: 8 },
};

// --- Validation Messages ---
const VALIDATION_MESSAGES = {
    INVALID_ADDRESS: (field) => `${field}: Please enter a valid Ethereum address (0x...).`,
    INVALID_NUMBER: (field) => `${field}: ${field} must be a valid number.`,
    REQUIRED: (field) => `${field} is required.`,
    REASON_LENGTH: `Reason cannot exceed ${REASON_MAX_LENGTH} characters.`,
    WALLET_CONNECT: 'Wallet not connected or contract not loaded.',
    INSUFFICIENT_ROLE: (roles) => `Requires ${roles} role(s).`,
    VALIDATING: 'Validating prerequisites...',
    VALIDATION_FAILED: 'Prerequisite check failed',
    SENDING: 'Submitting transaction...',
    WAITING: (txHash) => `Waiting for confirmation... (Tx: ${txHash})`,
    SUCCESS: (txHash) => `Batch Marked as Destroyed! (Tx: ${txHash})`,
    TX_REVERTED: 'Transaction failed on-chain.',
    BATCH_NOT_FOUND: 'Batch not found at the specified address.',
    ALREADY_DESTROYED: 'Batch has already been destroyed.',
    ALREADY_FINALIZED: 'Medicine batch has already been consumed/sold or destroyed.',
    OWNERSHIP_MISMATCH_RM: 'Access Denied: You are not the supplier of this Raw Material batch.',
    OWNERSHIP_MISMATCH_MED: 'Access Denied: You are not the current owner of this Medicine batch.',
    CONTEXT_MISMATCH_RM: 'Internal Error: Form configuration incorrect for Raw Material.',
    CONTEXT_MISMATCH_MED: 'Internal Error: Form configuration incorrect for Medicine.',
    UNKNOWN_BATCH_TYPE: 'Unknown batch type found.',
    STATUS_CHECK_ERROR: 'Failed to verify batch status.',
    DESTROY_FAILED_BASE: 'Mark Destroyed Failed',
};


// --- Component ---
function MarkDestroyedForm({
    allowedDestroyerRoles = [],
    batchTypeContext, // 'RAW_MATERIAL', 'MEDICINE', or 'ANY'
    onSuccess,
    onError
}) {
    // --- Hooks ---
    const {
        contract,
        account,
        isLoading: isGlobalLoading,
        setIsLoading: setGlobalLoading,
        getRevertReason,
        hasRole,
        fetchWithLoading, // Use if available
    } = useWeb3();

    // --- State ---
    const [formData, setFormData] = useState({
        batchAddress: '',
        reason: '',
        latitude: '',
        longitude: '',
    });
    const [validationErrors, setValidationErrors] = useState({});
    const [status, setStatus] = useState({ message: '', type: STATUS_TYPE.INFO });
    const [isLocalLoading, setIsLocalLoading] = useState(false);

    const isLoading = isGlobalLoading || isLocalLoading;

    // --- Memoized Values ---
    const canDestroy = useMemo(() => allowedDestroyerRoles.some(role => hasRole(role)), [allowedDestroyerRoles, hasRole]);
    const allowedRoleNames = useMemo(() => allowedDestroyerRoles.map(role => getRoleName(role)).join(' or '), [allowedDestroyerRoles]);

    // --- Effects ---
    // Clear errors on input change
    useEffect(() => {
        setValidationErrors({});
    }, [formData]);

    // --- Callbacks ---
    const handleInputChange = useCallback((e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    }, []);

    const clearStatus = useCallback(() => {
        setStatus({ message: '', type: STATUS_TYPE.INFO });
        setValidationErrors({});
        if (onError) onError(null);
    }, [onError]);

    // --- Validation ---
    const validateSync = useCallback(() => {
        const errors = {};
        const { batchAddress, reason, latitude, longitude } = formData;

        if (!batchAddress) errors.batchAddress = VALIDATION_MESSAGES.REQUIRED('Batch Address');
        else if (!ethers.isAddress(batchAddress)) errors.batchAddress = VALIDATION_MESSAGES.INVALID_ADDRESS('Batch Address');

        if (!reason) errors.reason = VALIDATION_MESSAGES.REQUIRED('Reason');
        else if (new TextEncoder().encode(reason).length > REASON_MAX_LENGTH) { // Check byte length for bytes32
             errors.reason = VALIDATION_MESSAGES.REASON_LENGTH;
        }

        if (!latitude) errors.latitude = VALIDATION_MESSAGES.REQUIRED('Latitude');
        else if (isNaN(Number(latitude)) || !isFinite(Number(latitude))) errors.latitude = VALIDATION_MESSAGES.INVALID_NUMBER('Latitude');

        if (!longitude) errors.longitude = VALIDATION_MESSAGES.REQUIRED('Longitude');
        else if (isNaN(Number(longitude)) || !isFinite(Number(longitude))) errors.longitude = VALIDATION_MESSAGES.INVALID_NUMBER('Longitude');

        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    }, [formData]);

    const validateAsyncPrerequisites = useCallback(async () => {
        if (!contract || !account) throw new Error(VALIDATION_MESSAGES.WALLET_CONNECT);
        const { batchAddress } = formData; // Get current address

        const executeRead = fetchWithLoading ?? ((func) => func());
        const isAdmin = hasRole(ROLES.ADMIN_ROLE); // Check if user is admin

        try {
            // --- Fetch Batch Type ---
            const type = await executeRead(() => contract.batchType(batchAddress));
            if (type === ethers.ZeroHash) throw new Error(VALIDATION_MESSAGES.BATCH_NOT_FOUND);

            // --- Type-Specific Checks ---
            if (type === RAW_MATERIAL_TYPE_HASH) {
                // Context check
                if (!isAdmin && batchTypeContext !== 'RAW_MATERIAL' && batchTypeContext !== 'ANY') {
                    throw new Error(VALIDATION_MESSAGES.CONTEXT_MISMATCH_RM);
                }
                // Fetch details
                const details = await executeRead(() => contract.getRawMaterialDetails(batchAddress));
                const currentStatus = Number(details.status);

                // Status check
                if (currentStatus === STATUS_CODES.RAW_MATERIAL.DESTROYED) {
                    throw new Error(VALIDATION_MESSAGES.ALREADY_DESTROYED);
                }
                // Ownership check (only if not Admin)
                if (!isAdmin && details.supplier.toLowerCase() !== account.toLowerCase()) {
                    throw new Error(VALIDATION_MESSAGES.OWNERSHIP_MISMATCH_RM);
                }

            } else if (type === MEDICINE_TYPE_HASH) {
                 // Context check
                 if (!isAdmin && batchTypeContext !== 'MEDICINE' && batchTypeContext !== 'ANY') {
                     throw new Error(VALIDATION_MESSAGES.CONTEXT_MISMATCH_MED);
                 }
                 // Fetch details
                 const details = await executeRead(() => contract.getMedicineDetails(batchAddress));
                 const currentStatus = Number(details.status);

                 // Status check
                 if (currentStatus === STATUS_CODES.MEDICINE.CONSUMED_SOLD || currentStatus === STATUS_CODES.MEDICINE.DESTROYED) {
                     throw new Error(VALIDATION_MESSAGES.ALREADY_FINALIZED);
                 }
                 // Ownership check (only if not Admin)
                 if (!isAdmin && details.currentOwner.toLowerCase() !== account.toLowerCase()) {
                     throw new Error(VALIDATION_MESSAGES.OWNERSHIP_MISMATCH_MED);
                 }

            } else {
                 // Handle truly unknown types detected by the contract
                 console.warn("Unknown batch type hash received from contract:", type);
                 throw new Error(VALIDATION_MESSAGES.UNKNOWN_BATCH_TYPE);
            }

            return true; // Validation passed

        } catch (err) {
            console.error("Destroy prerequisite validation error:", err);
            // If it's already one of our validation messages, use it, otherwise parse revert/general error
            const knownError = Object.values(VALIDATION_MESSAGES).includes(err.message);
            const message = knownError ? err.message : `${VALIDATION_MESSAGES.VALIDATION_FAILED}: ${getRevertReason(err) || err.message}`;
            throw new Error(message);
        }
    }, [contract, account, formData, batchTypeContext, hasRole, fetchWithLoading, getRevertReason]);

    // --- Submit Handler ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        clearStatus();

        if (!contract || !account) {
            setStatus({ message: VALIDATION_MESSAGES.WALLET_CONNECT, type: STATUS_TYPE.ERROR }); return;
        }
        if (!canDestroy) {
            setStatus({ message: VALIDATION_MESSAGES.INSUFFICIENT_ROLE(allowedRoleNames), type: STATUS_TYPE.ERROR }); return;
        }
        if (!validateSync()) {
            setStatus({ message: 'Please fix the errors marked below.', type: STATUS_TYPE.ERROR }); return;
        }

        setIsLocalLoading(true);

        try {
            setStatus({ message: VALIDATION_MESSAGES.VALIDATING, type: STATUS_TYPE.LOADING });
            await validateAsyncPrerequisites(); // Check owner/status etc.

            setStatus({ message: VALIDATION_MESSAGES.SENDING, type: STATUS_TYPE.LOADING });
            const { batchAddress, reason, latitude, longitude } = formData;

            // Prepare data
            const reasonBytes32 = ethers.encodeBytes32String(reason.slice(0, REASON_MAX_LENGTH));
            // Use parseUnits for coordinates - assumes they need scaling like in TransferForm
            const latScaled = ethers.parseUnits(latitude, COORD_DECIMALS);
            const lonScaled = ethers.parseUnits(longitude, COORD_DECIMALS);

            const tx = await contract.markBatchDestroyed(batchAddress, reasonBytes32, latScaled, lonScaled);
            const shortHash = formatHash(tx.hash); // Get short hash for message

            setStatus({ message: VALIDATION_MESSAGES.WAITING(shortHash), type: STATUS_TYPE.LOADING });

            const receipt = await tx.wait(1);
            const finalShortHash = formatHash(receipt.hash); // Use final hash

            if (receipt.status === 0) {
                throw new Error(VALIDATION_MESSAGES.TX_REVERTED + ` (Tx: ${finalShortHash})`);
            }

            const successMsg = VALIDATION_MESSAGES.SUCCESS(finalShortHash);
            setStatus({ message: successMsg, type: STATUS_TYPE.SUCCESS });
            if (onSuccess) onSuccess(receipt.hash, batchAddress); // Pass hash and address

            // Reset form
            setFormData({ batchAddress: '', reason: '', latitude: '', longitude: '' });
            setValidationErrors({});

        } catch (submitError) {
            console.error("Mark Destroyed Error:", submitError);
            const reasonText = getRevertReason(submitError);
            let userErrorMessage = submitError.message; // Start with the caught message

            // Try to refine known contract reverts
             if (reasonText) {
                 if (reasonText.includes("RequiresAdminOrOwner") || reasonText.includes("RequiresAdminOrSupplier") || reasonText.includes("UnauthorizedActor")) {
                     userErrorMessage = `${VALIDATION_MESSAGES.DESTROY_FAILED_BASE}: Authorization error (requires Admin or specific Owner/Supplier).`;
                 } else if (reasonText.includes("Batch_AlreadyDestroyed") || reasonText.includes("Med_AlreadyDestroyedOrFinalized")) {
                     userErrorMessage = `${VALIDATION_MESSAGES.DESTROY_FAILED_BASE}: Batch already destroyed or finalized.`;
                 } else {
                     userErrorMessage = `${VALIDATION_MESSAGES.DESTROY_FAILED_BASE}: ${reasonText}`;
                 }
             } else if (submitError.message.startsWith(VALIDATION_MESSAGES.VALIDATION_FAILED)) {
                 userErrorMessage = submitError.message; // Keep the specific validation failure message
             } else if (submitError.message.startsWith(VALIDATION_MESSAGES.TX_REVERTED)) {
                userErrorMessage = submitError.message; // Keep the tx reverted message
             }

            setStatus({ message: userErrorMessage, type: STATUS_TYPE.ERROR });
            if (onError) onError(userErrorMessage);

        } finally {
            setIsLocalLoading(false);
        }
    };

    // --- Render ---
    return (
        <form onSubmit={handleSubmit} className={styles.formContainer} noValidate>
            <h3 className={styles.title}>Mark Batch as Destroyed</h3>

            {!canDestroy && (
                <div className={`${styles.alert} ${styles['alert--error']}`}>
                     <svg className={styles.alertIcon} viewBox="0 0 24 24" fill="currentColor">
                         <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" />
                     </svg>
                     <div className={styles.alertContent}>
                        <h4>Authorization Required</h4>
                        <p>Requires {allowedRoleNames} role(s).</p>
                    </div>
                </div>
            )}

            <div className={styles.formGrid}>
                {/* Batch Address */}
                <div className={styles.inputGroup}>
                    <label htmlFor="batchAddress" className={styles.label}>
                        Batch Address <span className={styles.required}>*</span>
                    </label>
                    <input
                        id="batchAddress" name="batchAddress" type="text" required
                        value={formData.batchAddress} onChange={handleInputChange}
                        pattern={ADDRESS_REGEX_SOURCE} placeholder="0x... (Batch contract address)"
                        className={`${styles.input} ${validationErrors.batchAddress ? styles['input--error'] : ''}`}
                        disabled={!canDestroy || isLoading} aria-invalid={!!validationErrors.batchAddress}
                        aria-describedby={validationErrors.batchAddress ? "batchAddress-error" : undefined}
                    />
                    {validationErrors.batchAddress && <p id="batchAddress-error" className={styles.inputError}>{validationErrors.batchAddress}</p>}
                </div>

                {/* Reason */}
                <div className={styles.inputGroup}>
                    <label htmlFor="reason" className={styles.label}>
                        Destruction Reason <span className={styles.required}>*</span>
                    </label>
                    <input
                        id="reason" name="reason" type="text" required
                        value={formData.reason} onChange={handleInputChange}
                        maxLength={REASON_MAX_LENGTH} placeholder={`Max ${REASON_MAX_LENGTH} chars`}
                        className={`${styles.input} ${validationErrors.reason ? styles['input--error'] : ''}`}
                        disabled={!canDestroy || isLoading} aria-invalid={!!validationErrors.reason}
                        aria-describedby={validationErrors.reason ? "reason-error" : undefined}
                    />
                    {validationErrors.reason && <p id="reason-error" className={styles.inputError}>{validationErrors.reason}</p>}
                </div>

                {/* Geo Coordinates */}
                <div className={styles.geoGroup}>
                    <div className={styles.inputGroup}>
                        <label htmlFor="latitude" className={styles.label}>
                            Latitude <span className={styles.required}>*</span>
                        </label>
                        <input
                            id="latitude" name="latitude" type="number" step="any" required
                            value={formData.latitude} onChange={handleInputChange}
                            placeholder="e.g., 40.7128"
                            className={`${styles.input} ${validationErrors.latitude ? styles['input--error'] : ''}`}
                            disabled={!canDestroy || isLoading} aria-invalid={!!validationErrors.latitude}
                            aria-describedby={validationErrors.latitude ? "latitude-error" : undefined}
                        />
                        {validationErrors.latitude && <p id="latitude-error" className={styles.inputError}>{validationErrors.latitude}</p>}
                    </div>
                    <div className={styles.inputGroup}>
                        <label htmlFor="longitude" className={styles.label}>
                            Longitude <span className={styles.required}>*</span>
                        </label>
                        <input
                            id="longitude" name="longitude" type="number" step="any" required
                            value={formData.longitude} onChange={handleInputChange}
                            placeholder="e.g., -74.0060"
                            className={`${styles.input} ${validationErrors.longitude ? styles['input--error'] : ''}`}
                            disabled={!canDestroy || isLoading} aria-invalid={!!validationErrors.longitude}
                            aria-describedby={validationErrors.longitude ? "longitude-error" : undefined}
                        />
                        {validationErrors.longitude && <p id="longitude-error" className={styles.inputError}>{validationErrors.longitude}</p>}
                    </div>
                </div>
            </div> {/* End formGrid */}

            {/* Actions */}
            <div className={styles.actions}>
                <button
                    type="submit"
                    disabled={isLoading || !contract || !account || !canDestroy}
                    className={styles.submitButton}
                >
                    {isLoading ? (
                        <span className={styles.loading}>
                            <span className={styles.spinner}></span>
                            Processing...
                        </span>
                    ) : (
                        'Mark Destroyed'
                    )}
                </button>
            </div>

            {/* Status Messages */}
            {status.message && (
                 <div className={`${styles.alert} ${styles[`alert--${status.type}`]}`}>
                     {/* Choose appropriate icon based on type */}
                     <svg className={styles.alertIcon} viewBox="0 0 24 24" fill="currentColor">
                         {status.type === 'error' && <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" />}
                         {status.type === 'success' && <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm4.28 6.22a.75.75 0 00-1.06-1.06L11 11.94l-1.72-1.72a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25z" clipRule="evenodd" />}
                         {(status.type === 'info' || status.type === 'loading') && <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 9a.75.75 0 00-1.5 0v5.25a.75.75 0 001.5 0V9zm-1.5 6.75a.75.75 0 100 1.5.75.75 0 000-1.5z" clipRule="evenodd" />}
                     </svg>
                     <div className={styles.alertContent}>
                        <p>{status.message}</p>
                    </div>
                </div>
             )}
        </form>
    );
}

// --- PropTypes ---
MarkDestroyedForm.propTypes = {
    allowedDestroyerRoles: PropTypes.arrayOf(PropTypes.string).isRequired,
    batchTypeContext: PropTypes.oneOf(['RAW_MATERIAL', 'MEDICINE', 'ANY']).isRequired,
    onSuccess: PropTypes.func,
    onError: PropTypes.func,
};

MarkDestroyedForm.defaultProps = {
    onSuccess: () => {},
    onError: () => {},
};

export default MarkDestroyedForm;