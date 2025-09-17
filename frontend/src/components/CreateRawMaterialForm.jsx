// client/src/components/CreateRawMaterialForm.jsx
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useWeb3 } from '../contexts/Web3Context';
import { ethers } from 'ethers';
import styles from '../styles/CreateRawMaterialForm.module.css'; // Import CSS Module
// Import BatchDetails component itself
import BatchDetails from './BatchDetails';
// Import only needed formatters (likely just formatHash for WAITING message)
import { formatHash as formatTxHash, formatAddress } from './BatchDetails'; // Alias to avoid conflict if local defined

// --- Constants ---
const COORD_DECIMALS = 6;
const ADDRESS_REGEX_SOURCE = '^0x[a-fA-F0-9]{40}$';
const MAX_DESC_LENGTH = 31;
const BASE_ERROR_ID = 'create-rm-error-'; // For aria-describedby
const STATUS_TYPE = { IDLE: 'idle', INFO: 'info', ERROR: 'error', SUCCESS: 'success', LOADING: 'loading', VALIDATING: 'validating', SUBMITTING: 'submitting', MINING: 'mining' };

// --- Messages ---
const VALIDATION_MESSAGES = {
    INVALID_ADDRESS: (fieldName) => `${fieldName}: Invalid Ethereum address format (0x...).`,
    INVALID_NUMBER: (fieldName) => `${fieldName}: ${fieldName} must be a valid number.`,
    REQUIRED: (fieldName) => `${fieldName} is required.`,
    POSITIVE_QTY: 'Quantity must be a positive whole number (> 0).',
    DESC_LENGTH: `Description cannot exceed ${MAX_DESC_LENGTH} UTF-8 bytes.`,
    DESC_INVALID_CHARS: "Description contains invalid chars for bytes32.",
    SUBMITTING: 'Submitting transaction...',
    WAITING: (txHash) => `Waiting for confirmation... (Tx: ${formatTxHash(txHash)})`,
    FETCHING_HISTORY: 'Fetching batch creation history...',
    CREATION_FAILED: 'Raw Material Batch Creation Failed',
    WALLET_CONNECT: 'Wallet not connected or contract not loaded.',
    TX_REVERTED_ON_CHAIN: 'Transaction failed on-chain.',
    MANU_ROLE_MISSING: (parentMsg = 'Creation Failed') => `${parentMsg}: Intended Manufacturer lacks required role.`,
    HISTORY_FETCH_FAILED: "Failed to fetch batch history.",
    DETAILS_FETCH_FAILED: "Failed to fetch batch details.",
    SUCCESS_BASE: 'Raw Material Batch Created Successfully!',
    VALIDATION_FAILED_MSG: 'Please fix the errors marked below.',
    FORM_RESET: '', // Message when form resets
};

// --- Helper Functions ---
// Removed local formatHash, aliased import instead
const isValidCoordinate = (coordString) => {
    if (typeof coordString !== 'string') return false;
    const trimmed = coordString.trim();
    // Allow empty if not required, but validate requires non-empty
    // if (trimmed === '') return true;
    if (trimmed === '') return false; // Make coordinates required for validation
    const num = Number(trimmed);
    return !isNaN(num) && isFinite(num);
};
// Keep scaleCoordinate helper
const scaleCoordinate = (coordString) => {
    try {
        // Ensure we handle potentially empty strings passed during validation phase
        const valueToParse = (coordString || '0').trim();
        if (valueToParse === '') return '0'; // Default to 0 if effectively empty
        const scaled = ethers.parseUnits(valueToParse, COORD_DECIMALS);
        return scaled.toString(); // Return as string
    } catch (e) {
        console.error("Error scaling coordinate:", coordString, e);
        return '0'; // Fallback
    }
};


// --- Component ---
function CreateRawMaterialForm({ onSuccess, onError }) {
    // --- Hooks ---
    const { contract, account, isLoading: isGlobalLoading, setIsLoading: setGlobalLoading, getRevertReason, networkConfig } = useWeb3();

    // --- State ---
    const [formData, setFormData] = useState({
        description: '', quantity: '', manufacturerAddr: '', latitude: '', longitude: '',
    });
    const [formStatus, setFormStatus] = useState({ message: '', type: STATUS_TYPE.IDLE });
    const [inputErrors, setInputErrors] = useState({});
    const [submitStatus, setSubmitStatus] = useState(STATUS_TYPE.IDLE); // Tracks submission lifecycle

    // History/Details State
    const [batchHistory, setBatchHistory] = useState([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [selectedBatchAddress, setSelectedBatchAddress] = useState(null);
    const [selectedBatchDetails, setSelectedBatchDetails] = useState(null); // Will store RAW details
    const [isDetailsLoading, setIsDetailsLoading] = useState(false);
    const [detailsError, setDetailsError] = useState('');
    const [status, setStatus] = useState({ message: '', type: STATUS_TYPE.INFO });
    // Combined loading indicator
    const isLoading = isGlobalLoading || submitStatus === STATUS_TYPE.SUBMITTING || submitStatus === STATUS_TYPE.MINING || isHistoryLoading || isDetailsLoading;

    // --- Memoization ---
    const rawMaterialTypeHash = useMemo(() => ethers.id("RAW_MATERIAL"), []);
    const batchCreatedEventFilter = useMemo(() => {
        if (!contract || !account || !rawMaterialTypeHash || rawMaterialTypeHash === ethers.ZeroHash) return null;
        // Filter for events created BY the current user for RAW_MATERIAL type
        return contract.filters.BatchCreated(rawMaterialTypeHash, null, account);
    }, [contract, account, rawMaterialTypeHash]);

    // --- Callbacks ---
    const handleInputChange = useCallback((e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    }, []);

    const clearFormFeedback = useCallback(() => {
        setFormStatus({ message: '', type: STATUS_TYPE.IDLE });
        setInputErrors({});
        if (onError) onError(null); // Clear parent error state if applicable
    }, [onError]);

    // Clear feedback on input change
    useEffect(() => {
        // Don't clear SUCCESS messages immediately on typing
        if (formStatus.type !== STATUS_TYPE.SUCCESS) {
             clearFormFeedback();
        }
    }, [formData, clearFormFeedback, formStatus.type]);

    // --- History Fetch ---
    const fetchHistory = useCallback(async () => {
        if (!batchCreatedEventFilter || !account || !contract) return;
        setIsHistoryLoading(true);
        setHistoryError('');
        // setBatchHistory([]); // Clear only if fetch succeeds or explicitly desired
        console.log("[History] Fetching with filter:", batchCreatedEventFilter);
        try {
            const events = await contract.queryFilter(batchCreatedEventFilter);
            console.log("[History] Events received:", events.length);
            const history = events.map(event => {
                try {
                    // Safer access to args
                    const batchAddr = event?.args?.batchAddress;
                    const creator = event?.args?.creator; // Creator is topic 3
                    // Basic validation
                    if (!ethers.isAddress(batchAddr) || !ethers.isAddress(creator)) {
                         console.warn("[History] Invalid address in event:", { batchAddr, creator, event });
                         return null;
                    }
                    // Optional: Double check creator matches account (should be handled by filter)
                    // if (ethers.getAddress(creator) !== account) return null;

                     return { txHash: event.transactionHash, batchAddress: ethers.getAddress(batchAddr) };
                 }
                catch (parseError) {
                    console.error("[History] Error parsing event args:", parseError, event);
                    return null;
                }
            })
            .filter(item => item !== null) // Remove nulls from failed parsing/validation
            .reverse(); // Show newest first

            setBatchHistory(history);
        } catch (err) {
            console.error("[History] Error fetching:", err);
            const reason = getRevertReason(err);
            setHistoryError(VALIDATION_MESSAGES.HISTORY_FETCH_FAILED + (reason ? `: ${reason}` : ''));
        } finally {
            setIsHistoryLoading(false);
        }
    }, [contract, account, batchCreatedEventFilter, getRevertReason]); // Dependencies

    // Fetch history on mount and when account/contract changes
    useEffect(() => {
        if(contract && account) {
            fetchHistory();
        }
    }, [fetchHistory, contract, account]); // Re-fetch if contract/account changes


    // --- View Details (Stores RAW data) ---
    const handleViewDetails = useCallback(async (batchAddress) => {
        if (!contract || !batchAddress) return;

        // Toggle selection off
        if (selectedBatchAddress === batchAddress) {
            setSelectedBatchAddress(null);
            setSelectedBatchDetails(null);
            setDetailsError(''); // Clear any previous error for this row
            return;
        }

        console.log("[Details] Fetching for batch:", batchAddress);
        setSelectedBatchAddress(batchAddress); // Select new row
        setSelectedBatchDetails(null); // Clear previous details immediately
        setIsDetailsLoading(true);
        setDetailsError('');

        try {
            const rawDetailsArray = await contract.getRawMaterialDetails(batchAddress);
            console.log("[Details] Raw details array received:", rawDetailsArray);

            if (!rawDetailsArray || rawDetailsArray.length < 8) { // Adjusted length check if needed
                throw new Error(`Unexpected data structure received. Expected 8 elements, got ${rawDetailsArray?.length || 'undefined'}`);
            }

            // Map RAW data to object
            const rawDetailsObject = {
                type: 'RawMaterial', // Add type hint
                batchAddress: batchAddress, // Store original address
                description: rawDetailsArray[0],      // bytes32 hex
                quantity: rawDetailsArray[1],         // BigInt
                supplier: rawDetailsArray[2],         // address string
                intendedManufacturer: rawDetailsArray[3], // address string
                creationTime: rawDetailsArray[4],     // BigInt timestamp
                statusValue: rawDetailsArray[5],      // BigInt enum number
                currentTransporter: rawDetailsArray[6], // address string
                lastUpdateTime: rawDetailsArray[7]      // BigInt timestamp
            };

            console.log("[Details] Parsed raw details object:", rawDetailsObject);
            // Store the RAW object
            setSelectedBatchDetails(rawDetailsObject);

        } catch (err) {
            console.error("[Details] Error fetching:", err);
            const reason = getRevertReason(err);
            setDetailsError(VALIDATION_MESSAGES.DETAILS_FETCH_FAILED + (reason ? `: ${reason}` : ''));
            setSelectedBatchAddress(null); // Clear selection on error
            setSelectedBatchDetails(null); // Ensure details are cleared
        } finally {
            setIsDetailsLoading(false);
        }
    }, [contract, getRevertReason, selectedBatchAddress]); // Dependencies

    // --- Form Input Validation ---
    const validateInputs = useCallback(() => {
        const errors = {};
        const { description, quantity, manufacturerAddr, latitude, longitude } = formData;

        // Description
        if (!description) errors.description = VALIDATION_MESSAGES.REQUIRED('Description');
        else { try { if (ethers.toUtf8Bytes(description).length > MAX_DESC_LENGTH) errors.description = VALIDATION_MESSAGES.DESC_LENGTH; } catch(e) { errors.description = VALIDATION_MESSAGES.DESC_INVALID_CHARS; }}
        // Quantity
        if (!quantity) errors.quantity = VALIDATION_MESSAGES.REQUIRED('Quantity');
        else { const qtyNum = Number(quantity); if (isNaN(qtyNum) || qtyNum <= 0 || !Number.isInteger(qtyNum)) errors.quantity = VALIDATION_MESSAGES.POSITIVE_QTY; }
        // Manufacturer Address
        if (!manufacturerAddr) errors.manufacturerAddr = VALIDATION_MESSAGES.REQUIRED('Intended Manufacturer Address');
        else if (!ethers.isAddress(manufacturerAddr)) errors.manufacturerAddr = VALIDATION_MESSAGES.INVALID_ADDRESS('Intended Manufacturer Address');
        // Coordinates (Now required)
        if (!latitude) errors.latitude = VALIDATION_MESSAGES.REQUIRED('Latitude');
        else if (!isValidCoordinate(latitude)) errors.latitude = VALIDATION_MESSAGES.INVALID_NUMBER('Latitude');
        if (!longitude) errors.longitude = VALIDATION_MESSAGES.REQUIRED('Longitude');
        else if (!isValidCoordinate(longitude)) errors.longitude = VALIDATION_MESSAGES.INVALID_NUMBER('Longitude');

        setInputErrors(errors);
        return Object.keys(errors).length === 0;
    }, [formData]); // Depends only on formData state


    // --- Form Submission ---
    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();
        // Don't clear SUCCESS message immediately on submit attempt
        if (formStatus.type !== STATUS_TYPE.SUCCESS) {
             clearFormFeedback();
        } else {
            setInputErrors({}); // Clear input errors even if showing success
        }
        setSubmitStatus(STATUS_TYPE.VALIDATING);

        if (!validateInputs()) {
            setFormStatus({ message: VALIDATION_MESSAGES.VALIDATION_FAILED_MSG, type: STATUS_TYPE.ERROR });
            setSubmitStatus(STATUS_TYPE.IDLE);
            return;
        }

        if (!contract || !account) { setFormStatus({ message: VALIDATION_MESSAGES.WALLET_CONNECT, type: STATUS_TYPE.ERROR }); setSubmitStatus(STATUS_TYPE.IDLE); return; }
        if (rawMaterialTypeHash === ethers.ZeroHash) { setFormStatus({ message: "Internal Error: RAW_MATERIAL type hash.", type: STATUS_TYPE.ERROR }); setSubmitStatus(STATUS_TYPE.IDLE); return; }

        // Start global loading for transaction phase
        setGlobalLoading(true);
        setSubmitStatus(STATUS_TYPE.SUBMITTING);
        setFormStatus({ message: VALIDATION_MESSAGES.SUBMITTING, type: STATUS_TYPE.LOADING });

        let currentTxHash = null;
        let newBatchAddress = null;

        try {
            const { description, quantity, manufacturerAddr, latitude, longitude } = formData;
            // Prepare data (encoding description, scaling coords)
            let descriptionBytes32;
            try { descriptionBytes32 = ethers.encodeBytes32String(description); }
            catch (encError) { throw new Error(VALIDATION_MESSAGES.DESC_INVALID_CHARS); } // Throw specific error

            const quantityString = quantity.toString(); // Use string for uint arg
            const latScaledString = scaleCoordinate(latitude); // Use helper
            const lonScaledString = scaleCoordinate(longitude); // Use helper

            console.log("[Submit] Calling createRawMaterial:", { descriptionBytes32, quantityString, manufacturerAddr, latScaledString, lonScaledString });

            const tx = await contract.createRawMaterial(descriptionBytes32, quantityString, manufacturerAddr, latScaledString, lonScaledString);
            currentTxHash = tx.hash;
            console.log("[Submit] Tx submitted:", currentTxHash);

            setSubmitStatus(STATUS_TYPE.MINING);
            setStatus({ message: VALIDATION_MESSAGES.WAITING(currentTxHash), type: STATUS_TYPE.LOADING });

            const receipt = await tx.wait(1);
            console.log("[Submit] Receipt received:", receipt.status);

            if (receipt.status === 0) {
                const reason = await getRevertReason(receipt.hash);
                throw new Error(`${VALIDATION_MESSAGES.TX_REVERTED_ON_CHAIN}${reason ? `: ${reason}` : ''} (Tx: ${formatTxHash(currentTxHash)})`);
            }

            // Event Parsing (Robust Approach)
            try {
                const eventTopic = contract.interface.getEvent("BatchCreated").topicHash;
                const batchCreatedLog = receipt.logs?.find(log =>
                    log.address.toLowerCase() === contract.address.toLowerCase() && // Case-insensitive address check
                    log.topics[0] === eventTopic &&
                    log.topics[1] === rawMaterialTypeHash && // Match RM type hash
                    ethers.getAddress(ethers.dataSlice(log.topics[3], 12)) === account // Match creator (topic 3)
                );

                if (batchCreatedLog && batchCreatedLog.topics.length > 2) {
                     newBatchAddress = ethers.getAddress(ethers.dataSlice(batchCreatedLog.topics[2], 12)); // Batch address (topic 2)
                    console.log("[Submit] Found BatchCreated event, New Address:", newBatchAddress);
                } else {
                    console.warn("[Submit] Matching BatchCreated event NOT FOUND in logs.");
                    // Consider if an error should be shown here or just rely on history refresh
                }
            } catch (eventParseError) {
                 console.error("[Submit] Error parsing event:", eventParseError);
                 // Don't fail the whole submission, but maybe add info to status
                 setFormStatus(prev => ({ ...prev, message: prev.message + " (Event parse failed)" }));
            }

            // Success state
            setSubmitStatus(STATUS_TYPE.SUCCESS); // Or IDLE after success? SUCCESS is fine for status message
            setFormStatus({ message: VALIDATION_MESSAGES.SUCCESS_BASE, type: STATUS_TYPE.SUCCESS });

            // Force history refresh after successful creation
            await fetchHistory(); // Ensure new batch appears

            if (onSuccess) onSuccess(currentTxHash, newBatchAddress); // Callback with results

            // Reset Form
            setFormData({ description: '', quantity: '', manufacturerAddr: '', latitude: '', longitude: '' });
            setInputErrors({});
            // Keep success message displayed until next input change

        } catch (err) {
            console.error("[Submit] Transaction Error:", err);
            const reason = getRevertReason(err) || err.message || "Reason unavailable";
            let userErrorMessage = `${VALIDATION_MESSAGES.CREATION_FAILED}: ${reason}`;

            // --- Refine Specific Errors ---
             if (reason.toLowerCase().includes("manufacturerlacksrole")) { userErrorMessage = VALIDATION_MESSAGES.MANU_ROLE_MISSING(); }
             else if (reason.includes(VALIDATION_MESSAGES.TX_REVERTED_ON_CHAIN)) { userErrorMessage = reason; }
             else if (err.code === 'ACTION_REJECTED') { userErrorMessage = `${VALIDATION_MESSAGES.CREATION_FAILED}: Transaction rejected.`; }
             else if (err.message?.includes('execution reverted')) { userErrorMessage = `${VALIDATION_MESSAGES.CREATION_FAILED}: Reverted. ${reason} (Tx: ${formatTxHash(currentTxHash)})`; }
             else if (err.message === VALIDATION_MESSAGES.DESC_INVALID_CHARS) { // Catch specific encoding error
                 userErrorMessage = `${VALIDATION_MESSAGES.CREATION_FAILED}: ${err.message}`;
                 setInputErrors(prev => ({ ...prev, description: err.message })); // Add error back to input
             }

            setSubmitStatus(STATUS_TYPE.ERROR); // Indicate error state
            setFormStatus({ message: userErrorMessage, type: STATUS_TYPE.ERROR });
            if (onError) onError(userErrorMessage); // Callback

        } finally {
            setGlobalLoading(false); // Ensure global loading is reset
             // Optionally reset submitStatus back to IDLE after success/error display
             // setTimeout(() => setSubmitStatus(STATUS_TYPE.IDLE), 3000); // Example delay
        }
    }, [
        contract, account, formData, // Use formData state
        setGlobalLoading, getRevertReason, onSuccess, onError,
        clearFormFeedback, validateInputs, rawMaterialTypeHash, fetchHistory // Callbacks & memoized values
    ]);


    // --- Render Logic ---
    const explorerBaseUrl = networkConfig?.explorerUrl;
    const isSubmitting = submitStatus === STATUS_TYPE.SUBMITTING || submitStatus === STATUS_TYPE.MINING;

    return (
        // Use container class from CSS Module
        <div className={styles.createRawMaterialContainer}>

            {/* --- Form Section --- */}
            <form onSubmit={handleSubmit} className={`${styles.createRawMaterialForm} ${styles.panel}`} noValidate>
                <h3 className={styles.formTitle}>Create New Raw Material Batch</h3>

                {/* Input Groups */}
                 <div className={styles.formGroup}>
                    <label htmlFor="description" className={styles.formLabel}>Description:</label>
                    <input id="description" name="description" type="text" required
                        value={formData.description} onChange={handleInputChange}
                        placeholder="e.g., Active Pharma Ingredient A" maxLength={MAX_DESC_LENGTH}
                        className={`${styles.formInput} ${inputErrors.description ? styles.formInputError : ''}`}
                        disabled={isLoading} aria-invalid={!!inputErrors.description}
                        aria-describedby={inputErrors.description ? `${BASE_ERROR_ID}description` : `${BASE_ERROR_ID}descHint`}
                    />
                    <small id={`${BASE_ERROR_ID}descHint`} className={styles.formHint}>Max {MAX_DESC_LENGTH} UTF-8 bytes.</small>
                    {inputErrors.description && <p id={`${BASE_ERROR_ID}description`} className={styles.formErrorMessage}>{inputErrors.description}</p>}
                </div>

                 <div className={styles.formGroup}>
                    <label htmlFor="quantity" className={styles.formLabel}>Quantity:</label>
                    <input id="quantity" name="quantity" type="number" required min="1" step="1"
                        value={formData.quantity} onChange={handleInputChange}
                        placeholder="e.g., 1000 (units like kg, L)"
                        className={`${styles.formInput} ${inputErrors.quantity ? styles.formInputError : ''}`}
                        disabled={isLoading} aria-invalid={!!inputErrors.quantity}
                        aria-describedby={inputErrors.quantity ? `${BASE_ERROR_ID}quantity` : undefined}
                    />
                    {inputErrors.quantity && <p id={`${BASE_ERROR_ID}quantity`} className={styles.formErrorMessage}>{inputErrors.quantity}</p>}
                </div>

                 <div className={styles.formGroup}>
                    <label htmlFor="manufacturerAddr" className={styles.formLabel}>Intended Manufacturer Address:</label>
                    <input id="manufacturerAddr" name="manufacturerAddr" type="text" required pattern={ADDRESS_REGEX_SOURCE}
                        title="Enter a valid Ethereum address starting with 0x" placeholder="0x..."
                        value={formData.manufacturerAddr} onChange={handleInputChange}
                        className={`${styles.formInput} ${inputErrors.manufacturerAddr ? styles.formInputError : ''}`}
                        disabled={isLoading} aria-invalid={!!inputErrors.manufacturerAddr}
                        aria-describedby={inputErrors.manufacturerAddr ? `${BASE_ERROR_ID}manufacturerAddr` : undefined}
                    />
                    {inputErrors.manufacturerAddr && <p id={`${BASE_ERROR_ID}manufacturerAddr`} className={styles.formErrorMessage}>{inputErrors.manufacturerAddr}</p>}
                </div>

                {/* Coordinates Row */}
                <div className={styles.formRow}>
                    <div className={`${styles.formGroup} ${styles.formGroupHalf}`}>
                        <label htmlFor="latitude" className={styles.formLabel}>Starting Latitude:</label>
                        <input id="latitude" name="latitude" type="number" step="any" required
                            value={formData.latitude} onChange={handleInputChange} placeholder="e.g., 40.7128"
                            className={`${styles.formInput} ${inputErrors.latitude ? styles.formInputError : ''}`}
                            disabled={isLoading} aria-invalid={!!inputErrors.latitude}
                            aria-describedby={inputErrors.latitude ? `${BASE_ERROR_ID}latitude` : undefined}
                        />
                        {inputErrors.latitude && <p id={`${BASE_ERROR_ID}latitude`} className={styles.formErrorMessage}>{inputErrors.latitude}</p>}
                    </div>
                    <div className={`${styles.formGroup} ${styles.formGroupHalf}`}>
                        <label htmlFor="longitude" className={styles.formLabel}>Starting Longitude:</label>
                        <input id="longitude" name="longitude" type="number" step="any" required
                            value={formData.longitude} onChange={handleInputChange} placeholder="e.g., -74.0060"
                            className={`${styles.formInput} ${inputErrors.longitude ? styles.formInputError : ''}`}
                            disabled={isLoading} aria-invalid={!!inputErrors.longitude}
                            aria-describedby={inputErrors.longitude ? `${BASE_ERROR_ID}longitude` : undefined}
                        />
                        {inputErrors.longitude && <p id={`${BASE_ERROR_ID}longitude`} className={styles.formErrorMessage}>{inputErrors.longitude}</p>}
                    </div>
                </div>

                {/* Submit Button */}
                <button type="submit" className={`${styles.button} ${styles.buttonPrimary} ${styles.createRawMaterialFormButton}`}
                    disabled={isLoading || !contract || !account || submitStatus === STATUS_TYPE.SUBMITTING || submitStatus === STATUS_TYPE.MINING || submitStatus === STATUS_TYPE.VALIDATING}
                >
                    {/* More specific button text based on submitStatus */}
                    {submitStatus === STATUS_TYPE.VALIDATING ? 'Validating...' :
                     submitStatus === STATUS_TYPE.SUBMITTING ? 'Submitting...' :
                     submitStatus === STATUS_TYPE.MINING ? 'Waiting...' :
                     isGlobalLoading ? 'Processing...' : // Catch global loading if submitStatus is idle
                     'Create Raw Material Batch'}
                </button>

                {/* Status Display Area */}
                {formStatus.message && (
                     <p className={`${styles.formStatus} ${styles[`formStatus--${formStatus.type}`]}`}>
                         {formStatus.message}
                     </p>
                 )}
            </form>

            {/* --- History and Details Section --- */}
            <div className={`${styles.historySection} ${styles.panel}`}>
                <h3 className={styles.sectionTitle}>My Raw Material Batch History</h3>

                {/* History Loading/Error Feedback */}
                {isHistoryLoading && <p className={styles.loadingMessage}><span className={styles.spinner}></span> {VALIDATION_MESSAGES.FETCHING_HISTORY}</p>}
                {historyError && !isHistoryLoading && <p className={`${styles.formStatus} ${styles.formStatusError}`}>{historyError}</p>}

                {/* --- MODIFIED History Table Body --- */}
                {!isHistoryLoading && !historyError && batchHistory.length > 0 && (
                    <div className={styles.historyTableContainer}>
                        <table className={styles.historyTable}>
                            <thead>
                                <tr>
                                    {/* Adjust th text if needed */}
                                    <th>Batch Address</th>
                                    <th>Creation Tx Hash</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {batchHistory.map((batch) => (
                                    <React.Fragment key={batch.batchAddress}>
                                        <tr className={styles.historyRow}>
                                            {/* Batch Address Cell - Display FULL address */}
                                            <td>
                                                <div className={styles.addressCell}>
                                                    {/* Directly display the full address */}
                                                    <span className={styles.fullAddress}>
                                                        {batch.batchAddress || 'N/A'}
                                                    </span>
                                                    {explorerBaseUrl && (
                                                        <a href={`${explorerBaseUrl}/address/${batch.batchAddress}`} target="_blank" rel="noopener noreferrer" className={styles.explorerLink} title="View on Explorer">↗</a>
                                                    )}
                                                </div>
                                            </td>
                                            {/* Transaction Hash Cell - Display FULL hash */}
                                            <td>
                                                <div className={styles.txHashCell}>
                                                    {/* Directly display the full hash */}
                                                     <span className={styles.fullAddress}>
                                                        {batch.txHash || 'N/A'}
                                                    </span>
                                                    {explorerBaseUrl && (
                                                         <a href={`${explorerBaseUrl}/tx/${batch.txHash}`} target="_blank" rel="noopener noreferrer" className={styles.explorerLink} title="View Transaction">↗</a>
                                                    )}
                                                </div>
                                            </td>
                                            {/* Actions Cell (remains the same) */}
                                            <td>
                                                <button onClick={() => handleViewDetails(batch.batchAddress)} className={`${styles.button} ${styles.buttonSecondary}`}
                                                    disabled={isDetailsLoading && selectedBatchAddress === batch.batchAddress}
                                                    aria-expanded={selectedBatchAddress === batch.batchAddress}>
                                                    {isDetailsLoading && selectedBatchAddress === batch.batchAddress ? <><span className={styles.spinner}></span> Loading...</> :
                                                     selectedBatchAddress === batch.batchAddress ? 'Hide Details' :
                                                     'View Details'}
                                                </button>
                                            </td>
                                        </tr>
                                        {/* Details Row (remains the same, uses BatchDetails) */}
                                        {selectedBatchAddress === batch.batchAddress && (
                                            <tr className={styles.detailsRow}>
                                                <td colSpan="3">
                                                    <div className={styles.detailsContainer}>
                                                        {isDetailsLoading && <p className={styles.loadingMessage}><span className={styles.spinner}></span> Loading batch details...</p>}
                                                        {detailsError && !isDetailsLoading && <p className={`${styles.formStatus} ${styles.formStatusError}`}>{detailsError}</p>}
                                                        {selectedBatchDetails && !isDetailsLoading && !detailsError && (
                                                            <BatchDetails
                                                                details={selectedBatchDetails} // Pass RAW details object
                                                                history={[]}
                                                            />
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )} {/* End History Table Container */}

                {/* No History Message */}
                {!isHistoryLoading && !historyError && batchHistory.length === 0 && (
                    <p className={styles.noHistoryMessage}>No raw material batches created by your account found.</p>
                )}
            </div> {/* End History Section */}
        </div> // End Container
    );
}

// --- PropTypes and DefaultProps ---
CreateRawMaterialForm.propTypes = { onSuccess: PropTypes.func, onError: PropTypes.func };
CreateRawMaterialForm.defaultProps = {
    onSuccess: (txHash, newBatchAddress) => { console.log("Default onSuccess: Batch created", { txHash, newBatchAddress }); },
    onError: (errorMessage) => { if (errorMessage) console.error("Default onError:", errorMessage); },
};

export default CreateRawMaterialForm;