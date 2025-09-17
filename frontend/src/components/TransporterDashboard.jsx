// client/src/components/TransporterDashboard.jsx // Rename to .jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { ethers } from 'ethers';
// Import BatchDetails component itself
import BatchDetails from './BatchDetails';
// ONLY import formatters needed directly in THIS dashboard (e.g., status messages)
import { formatAddress, formatHash } from './BatchDetails';
import { ROLES } from '../constants/roles'; // Import ROLES if checking transporter role
import styles from '../styles/TransporterDashboard.module.css'; // Import CSS Module

const ADDRESS_REGEX_SOURCE = '^0x[a-fA-F0-9]{40}$';
const STATUS_TYPE = { IDLE: 'idle', INFO: 'info', ERROR: 'error', SUCCESS: 'success', LOADING: 'loading' };

// Type Hashes (Ideally from shared constants)
const RAW_MATERIAL_TYPE_HASH = ethers.id("RAW_MATERIAL");
const MEDICINE_TYPE_HASH = ethers.id("MEDICINE");

function TransporterDashboard() {
    // --- Hooks ---
    const {
        contract, account,
        isLoading: isGlobalLoading, // Use global loading state
        setIsLoading: setGlobalLoading, // Setter for global loading
        getRevertReason, hasRole, fetchWithLoading // Added hasRole
    } = useWeb3();

    // --- State ---
    const [batchAddressInput, setBatchAddressInput] = useState('');
    // Store RAW data now
    const [batchData, setBatchData] = useState({ details: null, history: [] });
    // Unified status object
    const [status, setStatus] = useState({ message: '', type: STATUS_TYPE.IDLE });
    // Dedicated loading state for the audit action
    const [isAuditing, setIsAuditing] = useState(false);

    // --- Memoized Values ---
    // Check if the user has the transporter role (optional, for UI hints)
    const isTransporter = useMemo(() => hasRole(ROLES.TRANSPORTER_ROLE), [hasRole]);

    // --- Callbacks ---
    const clearState = useCallback(() => {
        setBatchAddressInput('');
        setBatchData({ details: null, history: [] });
        setStatus({ message: '', type: STATUS_TYPE.IDLE });
        setIsAuditing(false);
        // Optionally clear global errors if they were set by this component
        // setError(null);
    }, []); // Add setError if used

    const handleInputChange = useCallback((event) => {
        setBatchAddressInput(event.target.value);
        // Clear previous results and status when input changes
        if (batchData.details) setBatchData({ details: null, history: [] });
        if (status.type !== STATUS_TYPE.IDLE) setStatus({ message: '', type: STATUS_TYPE.IDLE });
    }, [batchData.details, status.type]);


    /** Fetches and stores RAW batch details and history */
    const handleAuditBatch = useCallback(async (event) => {
        event.preventDefault();
        setStatus({ message: '', type: STATUS_TYPE.IDLE }); // Clear previous status
        setBatchData({ details: null, history: [] }); // Clear previous data

        if (!contract || !account) {
            setStatus({ message: "Wallet not connected or contract not loaded.", type: STATUS_TYPE.ERROR });
            return;
        }
        if (!ethers.isAddress(batchAddressInput)) {
            setStatus({ message: "Invalid Ethereum address format.", type: STATUS_TYPE.ERROR });
            return;
        }

        setIsAuditing(true); // Start audit-specific loading
        // Don't use setGlobalLoading here, audit is just a read operation
        setStatus({ message: `Auditing batch ${formatAddress(batchAddressInput)}...`, type: STATUS_TYPE.LOADING });

        const executeRead = fetchWithLoading ?? ((func) => func());

        try {
            const typeHash = await executeRead(() => contract.batchType(batchAddressInput));
            if (typeHash === ethers.ZeroHash) {
                 throw new Error(`Batch address ${formatAddress(batchAddressInput)} not found or not registered.`);
            }

            let detailsPromise;
            let batchDisplayType = '';

            if (typeHash === RAW_MATERIAL_TYPE_HASH) {
                batchDisplayType = 'RawMaterial';
                detailsPromise = executeRead(() => contract.getRawMaterialDetails(batchAddressInput));
            } else if (typeHash === MEDICINE_TYPE_HASH) {
                batchDisplayType = 'Medicine';
                detailsPromise = executeRead(() => contract.getMedicineDetails(batchAddressInput));
            } else {
                throw new Error(`Unrecognized batch type hash: ${typeHash}`);
            }

            // Fetch details and history concurrently
             const [rawDetailsResult, rawHistoryResult] = await Promise.all([
                 detailsPromise,
                 executeRead(() => contract.getTransactionHistory(batchAddressInput))
             ]);

            // --- Store RAW data ---
             let rawDetailsObject = {};
             if (batchDisplayType === 'RawMaterial') {
                 rawDetailsObject = { type: batchDisplayType, batchAddress: batchAddressInput, description: rawDetailsResult[0], quantity: rawDetailsResult[1], supplier: rawDetailsResult[2], intendedManufacturer: rawDetailsResult[3], creationTime: rawDetailsResult[4], statusValue: rawDetailsResult[5], currentTransporter: rawDetailsResult[6], lastUpdateTime: rawDetailsResult[7] };
             } else if (batchDisplayType === 'Medicine') {
                 rawDetailsObject = { type: batchDisplayType, batchAddress: batchAddressInput, description: rawDetailsResult[0], quantity: rawDetailsResult[1], rawMaterialBatchIds: rawDetailsResult[2], manufacturer: rawDetailsResult[3], creationTime: rawDetailsResult[4], expiryDate: rawDetailsResult[5], statusValue: rawDetailsResult[6], currentOwner: rawDetailsResult[7], currentTransporter: rawDetailsResult[8], currentDestination: rawDetailsResult[9], lastUpdateTime: rawDetailsResult[10] };
             }
            const rawHistoryLogs = rawHistoryResult; // History is already in desired format

            // --- Update State with RAW data ---
            setBatchData({ details: rawDetailsObject, history: rawHistoryLogs });

            // Provide informational message, check transporter status
            let infoMsg = `Displaying details for ${batchDisplayType} batch.`;
            const currentTransporter = rawDetailsObject.currentTransporter; // Access raw address
            if (currentTransporter && currentTransporter !== ethers.ZeroAddress && currentTransporter.toLowerCase() === account.toLowerCase()) {
                 infoMsg += " You are the currently assigned transporter.";
            } else if (currentTransporter && currentTransporter !== ethers.ZeroAddress) {
                 infoMsg += ` Assigned Transporter: ${formatAddress(currentTransporter)}.`; // Format only for display here
            }
            setStatus({ message: infoMsg, type: STATUS_TYPE.SUCCESS }); // Use SUCCESS type if data loaded

        } catch (err) {
            console.error("Error auditing batch:", err);
            const reason = getRevertReason(err);
            let specificError = `Audit failed: ${reason || err.message}`;
            if (err.message?.includes("Batch address not found")) {
                 specificError = `Error: Batch address ${formatAddress(batchAddressInput)} not found or invalid.`;
            }
            setStatus({ message: specificError, type: STATUS_TYPE.ERROR });
            setBatchData({ details: null, history: [] }); // Clear data on error
        } finally {
            setIsAuditing(false); // Stop audit-specific loading
        }
    }, [contract, account, batchAddressInput, getRevertReason, fetchWithLoading]); // Dependencies


    // Effect to clear state if account changes
    useEffect(() => {
        clearState();
    }, [account, clearState]);

    // --- Render Logic ---
    if (!account) {
        return <p className={styles.message + ' ' + styles.infoMessage}>Please connect your wallet.</p>;
    }

    // Optional: Check if the user even has the Transporter role
    // if (!isTransporter) {
    //     return <p className={styles.message + ' ' + styles.errorMessage}>Access Denied: Requires Transporter role.</p>;
    // }

    return (
        <div className={styles.dashboardContainer}>
            <h2 className={styles.title}>Transporter Dashboard</h2>
            <p className={styles.description}>Audit batch details and history by entering the batch address.</p>

            <div className={styles.panel}>
                <h3 className={styles.panelTitle}>Audit Batch</h3>
                <form onSubmit={handleAuditBatch} className={styles.auditForm}>
                    <div className={styles.formGroup}>
                        <label htmlFor="batchAddress" className={styles.formLabel}>Batch Address:</label>
                        <input
                            id="batchAddress"
                            className={styles.formInput}
                            type="text"
                            value={batchAddressInput}
                            onChange={handleInputChange}
                            placeholder="0x..."
                            required
                            pattern={ADDRESS_REGEX_SOURCE}
                            title="Enter a valid Ethereum address (0x...)"
                            disabled={isAuditing || isGlobalLoading} // Disable if auditing or global loading active
                        />
                    </div>
                    <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`}
                        // Disable if auditing, global loading, no contract, or invalid address input
                        disabled={isAuditing || isGlobalLoading || !contract || !ethers.isAddress(batchAddressInput)}>
                        {isAuditing ? <><span className={styles.spinner}></span>Auditing...</> : 'Audit Batch'}
                    </button>
                </form>

                 {/* Display Status/Error Message */}
                 {status.message && status.type !== STATUS_TYPE.IDLE && (
                    <p className={`${styles.message} ${styles[`${status.type}Message`]}`}>
                        {status.message}
                    </p>
                 )}
            </div>

            {/* Display Batch Details and History using the reusable component */}
            <div className={styles.detailsSection}>
                {/* Show Loading state specific to audit */}
                {isAuditing && (
                    <p className={styles.message + ' ' + styles.loadingMessage}>
                        <span className={styles.spinner}></span> Loading batch data...
                    </p>
                )}

                {/* Pass the RAW details and history if available and not loading */}
                {!isAuditing && batchData.details && (
                    <BatchDetails
                        details={batchData.details} // Pass RAW details object
                        history={batchData.history} // Pass RAW history array
                    />
                 )}

                 {/* Placeholder/Info Messages */}
                 {!isAuditing && !batchData.details && batchAddressInput && ethers.isAddress(batchAddressInput) && status.type !== STATUS_TYPE.LOADING && status.type !== STATUS_TYPE.IDLE && status.type !== STATUS_TYPE.INFO && (
                      <p className={`${styles.message} ${status.type === STATUS_TYPE.ERROR ? styles.errorMessage : styles.infoMessage}`}>
                        {status.type === STATUS_TYPE.ERROR
                            ? status.message // Show specific error
                            : "No data found for this batch address." // Only show if search succeeded without data
                        }
                      </p>
                 )}
                 {!isAuditing && !batchData.details && !batchAddressInput && (
                    <p className={styles.message + ' ' + styles.infoMessage}>
                        Enter a batch address above to view its details and history.
                    </p>
                 )}
            </div>
        </div>
    );
}

export default TransporterDashboard;