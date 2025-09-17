// client/src/components/CreateMedicineForm.jsx
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useWeb3 } from '../contexts/Web3Context';
import { ethers } from 'ethers';
import styles from '../styles/CreateMedicineForm.module.css'; // Import CSS Module

// --- Import Helpers and Constants ---
// Assume these are correctly exported from BatchDetails or a shared location
import {
    formatAddress,
    formatHash,
    RawMaterialStatus // Only needed if used in messages, but RM status codes are used below
} from './BatchDetails';

// --- Constants ---
const COORD_DECIMALS = 6;
const MAX_DESC_LENGTH = 31;
const ADDRESS_REGEX_SOURCE = '^0x[a-fA-F0-9]{40}$';

// Type Hashes (Ideally from shared constants)
const RAW_MATERIAL_TYPE_HASH = ethers.id("RAW_MATERIAL");
const MEDICINE_TYPE_HASH = ethers.id("MEDICINE");

// Status Codes (Match Solidity Enums)
const RM_STATUS_RECEIVED = 2;

const STATUS_TYPE = { INFO: 'info', LOADING: 'loading', SUCCESS: 'success', ERROR: 'error' };

// --- Validation Messages ---
const VALIDATION_MESSAGES = {
    INVALID_ADDRESS: (fieldName) => `${fieldName}: Invalid Ethereum address format (0x...).`,
    REQUIRED: (fieldName) => `${fieldName} is required.`,
    POSITIVE_QTY: 'Quantity must be a positive whole number.',
    DESC_LENGTH: `Description cannot exceed ${MAX_DESC_LENGTH} characters.`,
    FUTURE_DATE: 'Expiry date must be in the future.',
    INVALID_DATE: 'Invalid date/time selected.',
    NO_RM_IDS: 'At least one Raw Material batch address is required.',
    RM_ID_FORMAT: (ids) => `Invalid format in Raw Material IDs: ${ids}. Use comma-separated 0x addresses.`,
    WALLET_CONNECT: 'Please connect your wallet.',
    RM_VALIDATING: 'Validating Raw Material batches...',
    RM_VALIDATION_FAILED: 'Raw Material validation failed', // Base message
    RM_VALIDATION_SUCCESS: 'Raw Material batches are valid.',
    RM_NOT_FOUND: (addr) => `RM Batch ${formatAddress(addr)} not found.`,
    RM_WRONG_TYPE: (addr) => `Address ${formatAddress(addr)} is not a Raw Material batch.`,
    RM_WRONG_STATUS: (addr, statusName) => `RM Batch ${formatAddress(addr)} is not 'Received' (Status: ${statusName}).`,
    RM_WRONG_MANUFACTURER: (addr) => `You are not the intended manufacturer for RM ${formatAddress(addr)}.`,
    RM_FETCH_ERROR: (addr, reason) => `Failed to validate ${formatAddress(addr)}: ${reason}`,
    SUBMITTING: 'Submitting transaction...',
    WAITING: (txHash) => `Waiting for confirmation... (Tx: ${formatHash(txHash)})`,
    TX_REVERTED_ON_CHAIN: 'Transaction failed on-chain.',
    EVENT_PARSE_ERROR: "Batch created, but couldn't extract new address from logs.",
    CREATION_FAILED: 'Medicine Batch Creation Failed', // General error
    SUCCESS_BASE: 'Medicine Batch Created Successfully!',
    SUCCESS_WITH_ADDR: (addr, txHash) => `Medicine Batch ${formatAddress(addr)} Created! (Tx: ${formatHash(txHash)})`,
    COORD_REQUIRED: (fieldName) => `${fieldName} is required.`,
    COORD_INVALID: (fieldName) => `${fieldName} must be a valid number.`,
    FIX_ERRORS_BELOW: 'Please fix the errors marked below.',
};

// --- Helper Function (Consider moving to utils) ---
const isValidCoordinate = (coordString) => {
    if (typeof coordString !== 'string') return false;
    const trimmed = coordString.trim();
    if (trimmed === '') return false;
    const num = Number(trimmed);
    return !isNaN(num) && isFinite(num);
};

// --- Component Definition ---
function CreateMedicineForm({ latitude: propLatitude, longitude: propLongitude, onSuccess, onError }) {
    // --- Hooks ---
    const {
        contract,
        account,
        isLoading: isGlobalLoading,
        setIsLoading: setGlobalLoading,
        getRevertReason,
        fetchWithLoading, // Use if available
    } = useWeb3();

    // --- State ---
    const [formData, setFormData] = useState({
        description: '',
        quantity: '',
        rawMaterialIdsInput: '', // Raw text input
        expiryDate: '', // datetime-local string
        latitude: '',
        longitude: '',
    });
    const [validationErrors, setValidationErrors] = useState({}); // Field-specific sync errors
    const [rmValidationErrors, setRmValidationErrors] = useState([]); // Specific errors from RM async validation
    const [status, setStatus] = useState({ message: '', type: STATUS_TYPE.INFO });
    const [isLocalLoading, setIsLocalLoading] = useState(false); // For async validation

    const isLoading = isGlobalLoading || isLocalLoading;

    // --- Effects ---
    // Initialize internal coordinate state from props if provided and state is empty
    useEffect(() => {
        setFormData(prev => ({
            ...prev,
            latitude: (propLatitude !== undefined && propLatitude !== null && prev.latitude === '') ? String(propLatitude) : prev.latitude,
            longitude: (propLongitude !== undefined && propLongitude !== null && prev.longitude === '') ? String(propLongitude) : prev.longitude,
        }));
    }, [propLatitude, propLongitude]); // Depend only on props

    // Clear feedback on input change
    useEffect(() => {
        setValidationErrors({});
        setRmValidationErrors([]);
        // Optionally clear general status message, or keep it
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
        setRmValidationErrors([]);
        if (onError) onError(null);
    }, [onError]);

    // --- Synchronous Input Validation ---
    const validateSync = useCallback(() => {
        const errors = {};
        const { description, quantity, rawMaterialIdsInput, expiryDate, latitude, longitude } = formData;

        // Description
        if (!description) errors.description = VALIDATION_MESSAGES.REQUIRED('Description');
        else if (new TextEncoder().encode(description).length > MAX_DESC_LENGTH) errors.description = VALIDATION_MESSAGES.DESC_LENGTH;

        // Quantity
        const qtyNum = parseInt(quantity, 10);
        if (!quantity || isNaN(qtyNum) || qtyNum <= 0 || !Number.isInteger(qtyNum)) errors.quantity = VALIDATION_MESSAGES.POSITIVE_QTY;

        // Raw Material IDs Input (Format Check Only)
        const rmAddresses = rawMaterialIdsInput.split(',').map(a => a.trim()).filter(Boolean);
        if (rmAddresses.length === 0) errors.rawMaterialIdsInput = VALIDATION_MESSAGES.NO_RM_IDS;
        else {
            const invalidAddrs = rmAddresses.filter(addr => !ethers.isAddress(addr));
            if (invalidAddrs.length > 0) {
                errors.rawMaterialIdsInput = VALIDATION_MESSAGES.RM_ID_FORMAT(invalidAddrs.slice(0, 2).join(', ') + (invalidAddrs.length > 2 ? '...' : ''));
            }
        }

        // Expiry Date
        if (!expiryDate) errors.expiryDate = VALIDATION_MESSAGES.REQUIRED('Expiry Date');
        else {
            try {
                const expiryTimestamp = Math.floor(new Date(expiryDate).getTime() / 1000);
                if (isNaN(expiryTimestamp)) {
                    errors.expiryDate = VALIDATION_MESSAGES.INVALID_DATE;
                } else if (expiryTimestamp <= Math.floor(Date.now() / 1000)) {
                    errors.expiryDate = VALIDATION_MESSAGES.FUTURE_DATE;
                }
            } catch { errors.expiryDate = VALIDATION_MESSAGES.INVALID_DATE; }
        }

        // Coordinates
        if (!latitude) errors.latitude = VALIDATION_MESSAGES.COORD_REQUIRED('Latitude');
        else if (!isValidCoordinate(latitude)) errors.latitude = VALIDATION_MESSAGES.COORD_INVALID('Latitude');
        if (!longitude) errors.longitude = VALIDATION_MESSAGES.COORD_REQUIRED('Longitude');
        else if (!isValidCoordinate(longitude)) errors.longitude = VALIDATION_MESSAGES.COORD_INVALID('Longitude');

        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    }, [formData]);

    // --- Asynchronous Raw Material Validation ---
    const validateRawMaterialsAsync = useCallback(async (rmAddresses) => {
        if (!contract || !account ) throw new Error(VALIDATION_MESSAGES.WALLET_CONNECT);
        setRmValidationErrors([]); // Clear previous errors

        const executeRead = fetchWithLoading ?? ((func) => func());
        let allValid = true;
        const detailedErrors = [];

        const validationPromises = rmAddresses.map(async (rmAddr) => {
            try {
                const type = await executeRead(() => contract.batchType(rmAddr));
                if (type === ethers.ZeroHash) throw new Error(VALIDATION_MESSAGES.RM_NOT_FOUND(rmAddr));
                if (type !== RAW_MATERIAL_TYPE_HASH) throw new Error(VALIDATION_MESSAGES.RM_WRONG_TYPE(rmAddr));

                const details = await executeRead(() => contract.getRawMaterialDetails(rmAddr));
                const statusValue = Number(details[5]); // Status index
                const intendedManufacturer = details[3]; // Intended Manufacturer index

                if (statusValue !== RM_STATUS_RECEIVED) {
                     // Look up status name for better error message
                     const statusName = RawMaterialStatus[statusValue] ?? `Unknown (${statusValue})`;
                     throw new Error(VALIDATION_MESSAGES.RM_WRONG_STATUS(rmAddr, statusName));
                }
                if (intendedManufacturer.toLowerCase() !== account.toLowerCase()) {
                    throw new Error(VALIDATION_MESSAGES.RM_WRONG_MANUFACTURER(rmAddr));
                }
                return true; // Indicate success for this address
            } catch (err) {
                allValid = false; // Mark overall validation as failed
                const reason = getRevertReason(err) || err.message;
                 // Try to use specific validation message if it matches, otherwise format a generic fetch error
                 const knownError = Object.values(VALIDATION_MESSAGES).some(msgTmpl => typeof msgTmpl === 'function' ? msgTmpl(rmAddr).startsWith(reason.split(':')[0]) : msgTmpl === reason);
                 detailedErrors.push(knownError ? reason : VALIDATION_MESSAGES.RM_FETCH_ERROR(rmAddr, reason));
                 return false; // Indicate failure for this address
            }
        });

        await Promise.all(validationPromises); // Wait for all checks to complete

        setRmValidationErrors(detailedErrors); // Set the specific errors found

        if (!allValid) {
            throw new Error(VALIDATION_MESSAGES.RM_VALIDATION_FAILED); // Throw general failure error
        }

        return true; // All RMs validated successfully
    }, [contract, account, fetchWithLoading, getRevertReason]); // Dependencies

    // --- Submit Handler ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        clearStatus();

        if (!contract || !account) {
            setStatus({ message: VALIDATION_MESSAGES.WALLET_CONNECT, type: STATUS_TYPE.ERROR }); return;
        }
        if (!validateSync()) {
            setStatus({ message: VALIDATION_MESSAGES.FIX_ERRORS_BELOW, type: STATUS_TYPE.ERROR }); return;
        }

        const uniqueRmAddresses = [...new Set(formData.rawMaterialIdsInput.split(',').map(a => a.trim()).filter(ethers.isAddress))];
        // Re-check if any valid addresses remain after filtering
        if (uniqueRmAddresses.length === 0) {
             setValidationErrors(prev => ({...prev, rawMaterialIdsInput: VALIDATION_MESSAGES.NO_RM_IDS }));
             setStatus({ message: VALIDATION_MESSAGES.FIX_ERRORS_BELOW, type: STATUS_TYPE.ERROR });
             return;
        }

        setIsLocalLoading(true); // Start async validation loading

        // --- Async RM Validation ---
        try {
            setStatus({ message: VALIDATION_MESSAGES.RM_VALIDATING, type: STATUS_TYPE.LOADING });
            await validateRawMaterialsAsync(uniqueRmAddresses);
            setStatus({ message: VALIDATION_MESSAGES.RM_VALIDATION_SUCCESS, type: STATUS_TYPE.SUCCESS }); // Indicate RM success briefly
        } catch (rmValError) {
            // rmValError.message already contains the base failure message
            setStatus({ message: rmValError.message, type: STATUS_TYPE.ERROR });
            if (onError) onError(rmValError.message); // Pass RM failure to parent
            setIsLocalLoading(false);
            return; // Stop submission
        }

        // --- Prepare and Send Transaction ---
        setGlobalLoading(true); // Use global loading now for tx submission
        setIsLocalLoading(false); // Turn off local loading
        setStatus({ message: VALIDATION_MESSAGES.SUBMITTING, type: STATUS_TYPE.LOADING });

        try {
            const { description, quantity, expiryDate, latitude, longitude } = formData;
            const descriptionBytes32 = ethers.encodeBytes32String(description.slice(0, MAX_DESC_LENGTH));
            const quantityString = quantity.toString(); // Ethers v6 prefers string/BigInt for uint
            const expiryTimestamp = Math.floor(new Date(expiryDate).getTime() / 1000).toString(); // String for uint arg
            // Use parseUnits for coordinate scaling
            const latScaled = ethers.parseUnits(latitude, COORD_DECIMALS);
            const lonScaled = ethers.parseUnits(longitude, COORD_DECIMALS);

            const tx = await contract.createMedicine(
                descriptionBytes32,
                quantityString,
                uniqueRmAddresses,
                expiryTimestamp,
                latScaled, // Pass BigInt directly
                lonScaled  // Pass BigInt directly
            );

            setStatus({ message: VALIDATION_MESSAGES.WAITING(tx.hash), type: STATUS_TYPE.LOADING });

            const receipt = await tx.wait(1);
            const finalShortTxHash = formatHash(receipt.hash);

            console.log(`using recipt ${receipt.hash}`)
            console.log(`using recipt with format ${formatHash(receipt.hash)}`)
            console.log(`using tx ${tx.hash}`)
            console.log(`using tx with format ${formatHash(tx.hash)}`)

            if (receipt.status === 0) {
                throw new Error(`${VALIDATION_MESSAGES.TX_REVERTED_ON_CHAIN} (Tx: ${finalShortTxHash})`);
            }

            // --- Parse Event for New Address ---
            let newBatchAddress = null;
            let finalSuccessMessage = VALIDATION_MESSAGES.SUCCESS_BASE + ` (Tx: ${finalShortTxHash})`;
            try {
                const eventTopic = ethers.id("BatchCreated(bytes32,address,address,uint256)");
                const batchCreatedLog = receipt.logs?.find(log =>
                    log.topics[0] === eventTopic && log.topics[1] === MEDICINE_TYPE_HASH
                );
                if (batchCreatedLog && batchCreatedLog.topics.length > 2) {
                    newBatchAddress = ethers.getAddress(ethers.dataSlice(batchCreatedLog.topics[2], 12));
                    finalSuccessMessage = VALIDATION_MESSAGES.SUCCESS_WITH_ADDR(newBatchAddress, receipt.hash);
                } else {
                    console.warn("BatchCreated event for Medicine not found in logs.");
                     finalSuccessMessage = VALIDATION_MESSAGES.SUCCESS_BASE + `, but ${VALIDATION_MESSAGES.EVENT_PARSE_ERROR} (Tx: ${finalShortTxHash})`;
                }
            } catch (eventError) {
                console.error("Error parsing BatchCreated event:", eventError);
                 finalSuccessMessage = VALIDATION_MESSAGES.SUCCESS_BASE + `, but ${VALIDATION_MESSAGES.EVENT_PARSE_ERROR} (Tx: ${finalShortTxHash})`;
            }

            setStatus({ message: finalSuccessMessage, type: STATUS_TYPE.SUCCESS });
            if (onSuccess) onSuccess(receipt.hash, newBatchAddress); // Pass new address if found

            // Reset form
            setFormData({ description: '', quantity: '', rawMaterialIdsInput: '', expiryDate: '', latitude: formData.latitude, longitude: formData.longitude }); // Keep coords?
            setValidationErrors({});
            setRmValidationErrors([]);

        } catch (submitError) {
            console.error("Create Medicine Transaction Error:", submitError);
            const reason = getRevertReason(submitError);
            let userErrorMessage = `${VALIDATION_MESSAGES.CREATION_FAILED}: ${reason || submitError.message}`;

            // --- Optional: Refine specific contract errors ---
            // if (reason?.includes("RawMaterialNotReceived")) ...
            // if (reason?.includes("RawMaterialWrongManufacturer")) ...

            setStatus({ message: userErrorMessage, type: STATUS_TYPE.ERROR });
            if (onError) onError(userErrorMessage);

        } finally {
            setGlobalLoading(false); // Turn off global loading
        }
    };


    // --- Render ---
    const errorIdBase = 'create-med-error-'; // Base for aria-describedby

    return (
        <form onSubmit={handleSubmit} className={styles.formPanel} noValidate>
            <h3 className={styles.formTitle}>Create New Medicine Batch</h3>

            {/* Description */}
            <div className={styles.formGroup}>
                <label htmlFor="description" className={styles.formLabel}>Description:</label>
                <input
                    id="description" name="description" type="text" required maxLength={MAX_DESC_LENGTH}
                    value={formData.description} onChange={handleInputChange}
                    placeholder="e.g., Paracetamol 500mg Tablets"
                    className={`${styles.formInput} ${validationErrors.description ? styles['formInput--error'] : ''}`}
                    disabled={isLoading} aria-invalid={!!validationErrors.description}
                    aria-describedby={validationErrors.description ? `${errorIdBase}description` : undefined}
                />
                 <small className={styles.formHint}>Max {MAX_DESC_LENGTH} chars.</small>
                {validationErrors.description && <p id={`${errorIdBase}description`} className={styles.inputError}>{validationErrors.description}</p>}
            </div>

            {/* Quantity */}
            <div className={styles.formGroup}>
                <label htmlFor="quantity" className={styles.formLabel}>Quantity:</label>
                <input
                    id="quantity" name="quantity" type="number" required min="1" step="1"
                    value={formData.quantity} onChange={handleInputChange}
                    placeholder="e.g., 500 (units, boxes)"
                    className={`${styles.formInput} ${validationErrors.quantity ? styles['formInput--error'] : ''}`}
                    disabled={isLoading} aria-invalid={!!validationErrors.quantity}
                    aria-describedby={validationErrors.quantity ? `${errorIdBase}quantity` : undefined}
                />
                {validationErrors.quantity && <p id={`${errorIdBase}quantity`} className={styles.inputError}>{validationErrors.quantity}</p>}
            </div>

            {/* Raw Material IDs */}
            <div className={styles.formGroup}>
                <label htmlFor="rawMaterialIdsInput" className={styles.formLabel}>Raw Material Batches:</label>
                <textarea
                    id="rawMaterialIdsInput" name="rawMaterialIdsInput" rows="4" required
                    value={formData.rawMaterialIdsInput} onChange={handleInputChange}
                    placeholder="Enter comma-separated Raw Material batch addresses (0x...)"
                     className={`${styles.formTextarea} ${(validationErrors.rawMaterialIdsInput || rmValidationErrors.length > 0) ? styles['formTextarea--error'] : ''}`}
                    disabled={isLoading}
                    aria-invalid={!!validationErrors.rawMaterialIdsInput || rmValidationErrors.length > 0}
                    aria-describedby={validationErrors.rawMaterialIdsInput ? `${errorIdBase}rawMaterialIdsInput` : rmValidationErrors.length > 0 ? `${errorIdBase}rmValidation` : undefined}
                />
                 <small className={styles.formHint}>Separate multiple valid addresses with commas.</small>
                 {validationErrors.rawMaterialIdsInput && <p id={`${errorIdBase}rawMaterialIdsInput`} className={styles.inputError}>{validationErrors.rawMaterialIdsInput}</p>}
                 {rmValidationErrors.length > 0 && !validationErrors.rawMaterialIdsInput && ( // Show list only if format is OK but async validation failed
                    <ul id={`${errorIdBase}rmValidation`} className={styles.errorList}>
                        {rmValidationErrors.map((err, index) => <li key={index}>{err}</li>)}
                    </ul>
                 )}
            </div>

            {/* Expiry Date */}
            <div className={styles.formGroup}>
                <label htmlFor="expiryDate" className={styles.formLabel}>Expiry Date & Time:</label>
                <input
                    id="expiryDate" name="expiryDate" type="datetime-local" required
                    value={formData.expiryDate} onChange={handleInputChange}
                    min={new Date().toISOString().slice(0, 16)} // Set minimum to now
                    className={`${styles.formInput} ${validationErrors.expiryDate ? styles['formInput--error'] : ''}`}
                    disabled={isLoading} aria-invalid={!!validationErrors.expiryDate}
                    aria-describedby={validationErrors.expiryDate ? `${errorIdBase}expiryDate` : undefined}
                />
                {validationErrors.expiryDate && <p id={`${errorIdBase}expiryDate`} className={styles.inputError}>{validationErrors.expiryDate}</p>}
            </div>

            {/* Coordinates */}
            <div className={styles.formRow}>
                 <div className={styles.formGroup}>
                     <label htmlFor="latitude" className={styles.formLabel}>
                         Latitude: <span className={styles.coordinateHint}>(e.g., 40.7128)</span>
                     </label>
                     <input
                        id="latitude" name="latitude" type="number" step="any" required
                        value={formData.latitude} onChange={handleInputChange}
                        placeholder="Enter latitude"
                        className={`${styles.formInput} ${validationErrors.latitude ? styles['formInput--error'] : ''}`}
                        disabled={isLoading} aria-invalid={!!validationErrors.latitude}
                        aria-describedby={validationErrors.latitude ? `${errorIdBase}latitude` : undefined}
                     />
                     {validationErrors.latitude && <p id={`${errorIdBase}latitude`} className={styles.inputError}>{validationErrors.latitude}</p>}
                 </div>
                 <div className={styles.formGroup}>
                     <label htmlFor="longitude" className={styles.formLabel}>
                         Longitude: <span className={styles.coordinateHint}>(e.g., -74.0060)</span>
                     </label>
                     <input
                        id="longitude" name="longitude" type="number" step="any" required
                        value={formData.longitude} onChange={handleInputChange}
                        placeholder="Enter longitude"
                        className={`${styles.formInput} ${validationErrors.longitude ? styles['formInput--error'] : ''}`}
                        disabled={isLoading} aria-invalid={!!validationErrors.longitude}
                        aria-describedby={validationErrors.longitude ? `${errorIdBase}longitude` : undefined}
                     />
                     {validationErrors.longitude && <p id={`${errorIdBase}longitude`} className={styles.inputError}>{validationErrors.longitude}</p>}
                 </div>
            </div>

            {/* Submit Button */}
             <button type="submit" className={styles.submitButton} disabled={isLoading || !contract || !account}>
                {isLoading ? (
                    <span className={styles.loading}><span className={styles.spinner}></span>Creating...</span>
                 ) : 'Create Medicine Batch'}
            </button>

            {/* Status Message */}
            {status.message && (
                 <p className={`${styles.statusMessage} ${styles[`statusMessage--${status.type}`]}`}>
                     {status.message}
                 </p>
             )}
        </form>
    );
}

// --- PropTypes ---
CreateMedicineForm.propTypes = {
    latitude: PropTypes.string, // Prop receives initial value
    longitude: PropTypes.string, // Prop receives initial value
    onSuccess: PropTypes.func,
    onError: PropTypes.func,
};

CreateMedicineForm.defaultProps = {
    latitude: '', // Default internal state takes care of this if prop is undefined/null
    longitude: '',
    onSuccess: () => {},
    onError: () => {},
};

export default CreateMedicineForm;