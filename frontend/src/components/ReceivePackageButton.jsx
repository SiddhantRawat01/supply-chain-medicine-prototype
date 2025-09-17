// client/src/components/ReceivePackageButton.jsx
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useWeb3 } from '../contexts/Web3Context';
import { ROLES, getRoleName } from '../constants/roles';
import { ethers } from 'ethers';
import styles from '../styles/ReceivePackageButton.module.css'; // Import CSS Module

// --- Import Shared Helpers & Constants ---
import {
    formatAddress,
    formatHash,
    RawMaterialStatus,
    MedicineStatus
} from './BatchDetails'; // Adjust path as needed

// --- Constants ---
const COORD_DECIMALS = 6;

// Type Hashes
const RAW_MATERIAL_TYPE_HASH = ethers.id("RAW_MATERIAL");
const MEDICINE_TYPE_HASH = ethers.id("MEDICINE");

// Status Codes
const RM_STATUS_IN_TRANSIT = 1;
const MED_STATUS_IN_TRANSIT = [1, 3, 5];

const STATUS_TYPE = {
    IDLE: 'idle', INFO: 'info', LOADING: 'loading', SUCCESS: 'success', ERROR: 'error',
};

const VALIDATION_MESSAGES = {
    INVALID_ADDRESS: 'Valid Batch Address required.',
    INVALID_LOCATION: 'Valid Latitude & Longitude required.',
    WALLET_CONNECT: 'Wallet not connected.',
    INSUFFICIENT_ROLE: (roleName) => `Requires ${roleName} role.`,
    VALIDATING: 'Validating prerequisites...',
    VALIDATION_FAILED: 'Prerequisite check failed',
    SENDING: 'Submitting transaction...',
    WAITING: (txHash) => `Waiting for confirmation... (Tx: ${formatHash(txHash)})`,
    SUCCESS: (txHash) => `Package Received Successfully! (Tx: ${formatHash(txHash)})`,
    PREREQ_EXECUTION_ERROR: 'Error during prerequisite check.',
    TX_REVERTED_ON_CHAIN: 'Transaction failed on-chain.',
    BATCH_NOT_FOUND: 'Batch not found.',
    RECEIVER_MISMATCH: "Receive Failed: You are not the intended destination.",
    INVALID_STATE: (stateName) => `Receive Failed: Batch is not 'In Transit' (Current: ${stateName}).`,
    UNKNOWN_BATCH_TYPE: 'Unknown batch type.',
    MISSING_ROLE_ON_CHAIN: (roleName) => `Receive Failed: Account lacks required ${roleName} role on-chain.`,
    RECEIVE_FAILED_BASE: 'Receive Failed',
};

// --- Component ---
function ReceivePackageButton({
    batchAddress,
    expectedReceiverRole,
    latitude,
    longitude,
    onSuccess,
    onError,
}) {
    // --- Hooks ---
    const {
        contract,
        account,
        signer,
        isLoading: isGlobalLoading,
        setIsLoading: setGlobalLoading,
        getRevertReason,
        hasRole,
        fetchWithLoading,
    } = useWeb3();

    // --- State ---
    const [status, setStatus] = useState({ message: '', type: STATUS_TYPE.IDLE });
    const [isProcessing, setIsProcessing] = useState(false); // Local loading ONLY for async validation

    // --- Memoized Values ---
    const hasRequiredRole = useMemo(() => {
        const result = hasRole(expectedReceiverRole);
        // console.log(`[ReceiveButton Memo] Checking role ${expectedReceiverRole}: ${result}`); // Optional inner log
        return result;
    }, [hasRole, expectedReceiverRole]);

    const isValidAddress = useMemo(() => {
        const result = ethers.isAddress(batchAddress);
        // console.log(`[ReceiveButton Memo] Checking address ${batchAddress}: ${result}`); // Optional inner log
        return result;
    }, [batchAddress]);

    const hasValidLocation = useMemo(() => {
        const latStr = String(latitude ?? '').trim();
        const lonStr = String(longitude ?? '').trim();
        if (latStr === '' || lonStr === '') return false;
        const latNum = parseFloat(latStr);
        const lonNum = parseFloat(lonStr);
        const result = !isNaN(latNum) && isFinite(latNum) && !isNaN(lonNum) && isFinite(lonNum);
        // console.log(`[ReceiveButton Memo] Checking location (${latitude}, ${longitude}): ${result}`); // Optional inner log
        return result;
    }, [latitude, longitude]);

    const receiverRoleName = useMemo(() => getRoleName(expectedReceiverRole), [expectedReceiverRole]);

    // --- Button Disabled Logic ---
    const isDisabled = isProcessing || isGlobalLoading || !contract || !account || !signer || !hasRequiredRole || !isValidAddress || !hasValidLocation;

    // --- Callbacks ---
    const clearStatus = useCallback(() => {
        setStatus({ message: '', type: STATUS_TYPE.IDLE });
        if (onError) onError(null);
    }, [onError]);

    // Clear status only on component mount
    useEffect(() => {
        clearStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Runs once on mount

    /** Asynchronous prerequisite validation */
    const validateReceiptPrerequisitesAsync = useCallback(async () => {
        // (Logic remains the same as previous version - includes try/catch and specific checks)
         if (!contract || !account || !signer || !isValidAddress) {
             throw new Error(VALIDATION_MESSAGES.WALLET_CONNECT);
         }
         const executeRead = fetchWithLoading ?? ((func) => func());
         try {
             const fetchedBatchType = await executeRead(() => contract.batchType(batchAddress));
             if (fetchedBatchType === ethers.ZeroHash) throw new Error(VALIDATION_MESSAGES.BATCH_NOT_FOUND);
             let details, currentStatus, destinationAddress, currentStateName = 'Unknown';
             if (fetchedBatchType === RAW_MATERIAL_TYPE_HASH) {
                 details = await executeRead(() => contract.getRawMaterialDetails(batchAddress));
                 destinationAddress = details[3]; currentStatus = Number(details[5]);
                 currentStateName = RawMaterialStatus[currentStatus] ?? `Unknown (${currentStatus})`;
                 if (currentStatus !== RM_STATUS_IN_TRANSIT) throw new Error(VALIDATION_MESSAGES.INVALID_STATE(currentStateName));
             } else if (fetchedBatchType === MEDICINE_TYPE_HASH) {
                 details = await executeRead(() => contract.getMedicineDetails(batchAddress));
                 destinationAddress = details[9]; currentStatus = Number(details[6]);
                 currentStateName = MedicineStatus[currentStatus] ?? `Unknown (${currentStatus})`;
                 if (!MED_STATUS_IN_TRANSIT.includes(currentStatus)) throw new Error(VALIDATION_MESSAGES.INVALID_STATE(currentStateName));
             } else { throw new Error(VALIDATION_MESSAGES.UNKNOWN_BATCH_TYPE); }
             if (destinationAddress.toLowerCase() !== account.toLowerCase()) throw new Error(VALIDATION_MESSAGES.RECEIVER_MISMATCH);
             return true;
         } catch (err) {
             console.error("Receipt prerequisite validation raw error:", err);
             const knownError = Object.values(VALIDATION_MESSAGES).some(msgTmpl => typeof msgTmpl === 'function' ? msgTmpl('role').startsWith(err.message?.split(':')[0]) : msgTmpl === err.message );
             const message = knownError ? err.message : `${VALIDATION_MESSAGES.VALIDATION_FAILED}: ${getRevertReason(err) || err.message || VALIDATION_MESSAGES.PREREQ_EXECUTION_ERROR}`;
             throw new Error(message);
         }
    }, [ contract, account, signer, batchAddress, isValidAddress, fetchWithLoading, getRevertReason ]);

    /** Button click handler */
    const handleReceive = useCallback(async () => {
        console.log("[handleReceive] Clicked!"); // Log click event
        clearStatus();

        // --- Re-check conditions just in case ---
        if (!contract || !account || !signer) { setStatus({ message: VALIDATION_MESSAGES.WALLET_CONNECT, type: STATUS_TYPE.ERROR }); return; }
        if (!hasRequiredRole) { setStatus({ message: VALIDATION_MESSAGES.INSUFFICIENT_ROLE(receiverRoleName), type: STATUS_TYPE.ERROR }); return; }
        if (!isValidAddress) { setStatus({ message: VALIDATION_MESSAGES.INVALID_ADDRESS, type: STATUS_TYPE.ERROR }); return; }
        if (!hasValidLocation) { setStatus({ message: VALIDATION_MESSAGES.INVALID_LOCATION, type: STATUS_TYPE.ERROR }); return; }

         setIsProcessing(true);
        setStatus({ message: VALIDATION_MESSAGES.VALIDATING, type: STATUS_TYPE.LOADING });

        // Async Prerequisite Validation
        try {
            await validateReceiptPrerequisitesAsync();
        } catch (prereqError) {
            setStatus({ message: prereqError.message, type: STATUS_TYPE.ERROR });
            if (onError) onError(prereqError.message);
            setIsProcessing(false);
            return;
        }

        // Validation passed, proceed to transaction
        setIsProcessing(false);
        setGlobalLoading(true);
        setStatus({ message: VALIDATION_MESSAGES.SENDING, type: STATUS_TYPE.LOADING });

        let tx = null; // <-- Declare tx variable here to access in catch
        let receipt = null; // <-- Declare receipt variable here

        try {
            const latScaled = ethers.parseUnits(String(latitude), COORD_DECIMALS);
            const lonScaled = ethers.parseUnits(String(longitude), COORD_DECIMALS);

            // Assign tx here
            tx = await contract.receivePackage(batchAddress, latScaled, lonScaled);

            setStatus({ message: VALIDATION_MESSAGES.WAITING(tx.hash), type: STATUS_TYPE.LOADING });
            console.log("[handleReceive] Tx submitted:", tx.hash);

            // Assign receipt here
            receipt = await tx.wait(1);
            const confirmedTxHash = receipt?.hash;
            console.log("[handleReceive] Receipt received. Confirmed Tx Hash:", confirmedTxHash);

            if (!receipt || receipt.status === 0) {
                const onChainReason = receipt ? await getRevertReason(receipt.hash) : 'Receipt unavailable';
                console.error("[handleReceive] Tx REVERTED or Receipt missing:", onChainReason);
                throw new Error(`${VALIDATION_MESSAGES.TX_REVERTED_ON_CHAIN}${onChainReason ? ': ' + onChainReason : ''} (Tx: ${formatHash(confirmedTxHash)})`);
            }

            // --- Success Path ---
             if (!confirmedTxHash || typeof confirmedTxHash !== 'string' || !confirmedTxHash.startsWith('0x') || confirmedTxHash.length !== 66) {
                 console.error("[handleReceive] Invalid confirmedTxHash detected:", confirmedTxHash);
                 setStatus({ message: `${VALIDATION_MESSAGES.SUCCESS('')} (Error retrieving Tx Hash)`, type: STATUS_TYPE.SUCCESS });
             } else {
                 const successMsg = VALIDATION_MESSAGES.SUCCESS(confirmedTxHash);
                 setStatus({ message: successMsg, type: STATUS_TYPE.SUCCESS });
             }
             if (onSuccess) onSuccess(batchAddress, confirmedTxHash || 'Unavailable');


        } catch (submitError) {
            console.error("[handleReceive] Submit/Wait Error (Raw):", submitError);
            const reason = getRevertReason(submitError);
            // *** CORRECTED ERROR MESSAGE GENERATION ***
            // Use tx?.hash if available, otherwise indicate hash is unavailable or use a generic message
            const txHashForError = tx?.hash;
            let baseErrorMessage = `${VALIDATION_MESSAGES.RECEIVE_FAILED_BASE}: ${reason || submitError.message}`;
            let userErrorMessage = baseErrorMessage;

            // Refine specific known contract reverts (don't reference receipt here)
            if (reason?.includes("ReceiverMismatch")) userErrorMessage = VALIDATION_MESSAGES.RECEIVER_MISMATCH;
            else if (reason?.includes("InvalidStateForAction")) userErrorMessage = VALIDATION_MESSAGES.INVALID_STATE('details unavailable');
            else if (reason?.includes("AccessControlMissingRole")) userErrorMessage = VALIDATION_MESSAGES.MISSING_ROLE_ON_CHAIN(receiverRoleName);
            // Check if the error message *itself* already contains the formatted TX reverted string
            else if (submitError.message?.includes(VALIDATION_MESSAGES.TX_REVERTED_ON_CHAIN)) {
                 userErrorMessage = submitError.message; // Use the specific revert message from the try block's throw
            }
            // Add tx hash info if available
            else if (txHashForError) {
                userErrorMessage = `${baseErrorMessage} (Tx: ${formatHash(txHashForError)})`;
            }

            console.error("[handleReceive] Setting Error Status:", userErrorMessage);
            setStatus({ message: userErrorMessage, type: STATUS_TYPE.ERROR });
            if (onError) onError(userErrorMessage); // Pass the refined message

        } finally {
            setGlobalLoading(false);
        }
    }, [ /* ... all dependencies ... */
        contract, account, signer, hasRequiredRole, receiverRoleName, batchAddress, isValidAddress, hasValidLocation, latitude, longitude,
        validateReceiptPrerequisitesAsync, setGlobalLoading, getRevertReason, onSuccess, onError, clearStatus
    ]);

    // --- Determine Button Tooltip ---
    const getButtonTitle = () => {
        // (Logic remains the same)
        if (!contract || !account || !signer) return VALIDATION_MESSAGES.WALLET_CONNECT;
        if (!hasRequiredRole) return VALIDATION_MESSAGES.INSUFFICIENT_ROLE(receiverRoleName);
        if (!isValidAddress) return VALIDATION_MESSAGES.INVALID_ADDRESS;
        if (!hasValidLocation) return VALIDATION_MESSAGES.INVALID_LOCATION;
        return `Confirm receipt of batch ${isValidAddress ? formatAddress(batchAddress) : ''}`;
    };


    // --- ***** ADD DEBUG LOGS BEFORE RENDER ***** ---
    console.log(`%c --- ReceiveButton Render Check (${batchAddress}) ---`, 'color: blue; font-weight: bold;');
    console.log(`Props Received: batchAddress=${batchAddress}, role=${expectedReceiverRole}, lat=${latitude}, lon=${longitude}`);
    console.log(`Context State: contract=${!!contract}, account=${account}, signer=${!!signer}, isGlobalLoading=${isGlobalLoading}`);
    console.log(`Button State: isProcessing=${isProcessing}`);
    console.log(`Validation Checks: hasRequiredRole=${hasRequiredRole} (for ${receiverRoleName}), isValidAddress=${isValidAddress}, hasValidLocation=${hasValidLocation}`);
    console.log(`>>> FINAL isDisabled = ${isDisabled}`);
    console.log(`%c -----------------------------------------`, 'color: blue; font-weight: bold;');
    // --- ***** END DEBUG LOGS ***** ---

    // --- Render ---
    return (
        <div className={styles.actionContainer}>
            <button
                type="button"
                onClick={handleReceive}
                disabled={isDisabled} // Directly use the calculated isDisabled state
                title={getButtonTitle()}
                className={`${styles.button} ${styles.receiveButton}`}
            >
                {isProcessing || isGlobalLoading ? (
                    <span className={styles.loadingIndicator}>
                        <span className={styles.spinner}></span>
                        Processing...
                    </span>
                 ) : 'Confirm Package Received'}
            </button>

            {/* Display Status/Error Message */}
            {status.message && status.type !== STATUS_TYPE.IDLE && (
                 <p className={`${styles.statusMessage} ${styles[`statusMessage--${status.type}`]}`}>
                     {status.message}
                 </p>
             )}
        </div>
    );
}

// --- PropTypes --- (Keep as is)
ReceivePackageButton.propTypes = {
    batchAddress: PropTypes.string.isRequired,
    expectedReceiverRole: PropTypes.string.isRequired,
    latitude: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    longitude: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    onSuccess: PropTypes.func,
    onError: PropTypes.func,
};

// --- Default Props --- (Keep as is)
ReceivePackageButton.defaultProps = {
    onSuccess: () => {},
    onError: () => {},
};

export default ReceivePackageButton;