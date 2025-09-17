// client/src/components/BatchDetails.js
import React from 'react';
import PropTypes from 'prop-types';
import TransactionHistory from './TransactionHistory';
import { ethers } from 'ethers';
import styles from '../styles/BatchDetails.module.css';
import HoverToReveal from './HoverToReveal';

// --- Constants for Enum Mappings ---
export const RawMaterialStatus = {
    0: 'Created',
    1: 'In Transit',
    2: 'Received',
    3: 'Destroyed',
};

export const MedicineStatus = {
    0: 'Created',
    1: 'In Transit to Wholesaler',
    2: 'At Wholesaler',
    3: 'In Transit to Distributor',
    4: 'At Distributor',
    5: 'In Transit to Customer',
    6: 'At Customer',
    7: 'Consumed / Sold',
    8: 'Destroyed',
};

// --- Formatting Helper Functions ---
// (Keep all formatting functions as they are used internally)
export const formatAddress = (addr) => {
    if (!addr || addr === ethers.ZeroAddress) return 'N/A';
    if (ethers.isAddress(addr)) {
        return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
    }
    console.warn("Invalid address format:", addr);
    return 'Invalid Addr';
};

export const formatTimestamp = (timestamp) => {
    if (timestamp === undefined || timestamp === null) return 'N/A';
    try {
        // Directly attempt to convert the input (which might be BigInt, string, or number) to Number.
        // Number() can handle BigInt inputs up to Number.MAX_SAFE_INTEGER accurately.
        // Timestamps in seconds are well within this range.
        const tsNumber = Number(timestamp);

        // Check if the conversion resulted in a valid, positive number.
        // (0 is technically valid but unlikely for real blockchain timestamps)
        if (isNaN(tsNumber) || tsNumber <= 0) {
             console.warn("Invalid or non-positive timestamp value:", timestamp);
             return "Invalid Date";
        }

        // Optional: Check if the timestamp seems excessively large (e.g., beyond year 2100 in seconds)
        // Helps catch potential issues if the value wasn't actually a timestamp.
        const maxReasonableTimestamp = 4102444800; // Seconds approx to year 2100
        if (tsNumber > maxReasonableTimestamp) {
            console.warn("Timestamp value seems unreasonably large:", timestamp);
            // You might return a specific message or just proceed cautiously
            // return "Future Date?";
        }

        // Convert seconds to milliseconds for the Date constructor
        return new Date(tsNumber * 1000).toLocaleString();
    } catch (e) {
        // Catch potential errors during conversion or Date creation
        console.error("Timestamp formatting error:", e, "Input Value:", timestamp);
        return "Date Error";
    }
};
export const formatHash = (hash) => {
    if (!hash || hash === ethers.ZeroHash) return 'N/A';
    if (typeof hash === 'string' && hash.length === 66 && hash.startsWith('0x')) {
        return `${hash.substring(0, 8)}...${hash.substring(hash.length - 6)}`;
    }
     console.warn("Invalid hash format:", hash);
    return 'Invalid Hash';
};
export const formatBytes32 = (bytes32Hex) => {
    if (!bytes32Hex || bytes32Hex === ethers.ZeroHash) return 'N/A';
    try {
        // Trim trailing null bytes common in fixed-size strings
        return ethers.decodeBytes32String(bytes32Hex).replace(/\0/g, '');
    } catch (e) {
        // Handle cases where it might not be valid UTF-8
        console.warn("Bytes32 decoding error:", e, "Value:", bytes32Hex);
        return bytes32Hex?.startsWith('0x')
            ? `${bytes32Hex.substring(0, 10)}... (raw)`
            : "Invalid Bytes32";
    }
};

export const formatDisplayValue = (value) => {
    if (value === undefined || value === null) return 'N/A';
    try {
        // Handles BigInt safely
        return value.toString();
    } catch (e) {
        console.error("Value formatting error:", e, "Value:", value);
        return "Invalid Value";
    }
};

export const formatStatus = (statusValue, statusMapping) => {
    if (statusValue === undefined || statusValue === null) return 'N/A';
    try {
        const statusNumber = Number(statusValue); // Convert potential BigInt
        return statusMapping[statusNumber] ?? `Unknown (${statusNumber})`;
    } catch (e) {
        console.error("Status formatting error:", e, "Value:", statusValue);
        return `Invalid Status (${statusValue})`;
    }
};


// --- Main Component ---
function BatchDetails({ details, history }) { // Removed showFullHashes from props here, pass directly below
    if (!details) {
        // Keep the initial message or return null/loading indicator
        return <p className={styles.infoMessage}>No batch details available.</p>;
    }

    // Helper to render address fields consistently
    const renderAddressField = (label, addr) => {
        const fullAddress = addr && addr !== ethers.ZeroAddress ? addr : 'N/A';
        const shortAddress = formatAddress(addr); // Get formatted version
        return (
            <p>
                <strong>{label}:</strong>{' '}
                {/* Use HoverToReveal component */}
                <HoverToReveal
                    shortValue={shortAddress}
                    fullValue={fullAddress}
                    type="address"
                />
            </p>
        );
    }

    // Process details ONCE for internal use (mainly converting BigInts for status lookup if needed)
    // No longer converting timestamps/quantities here - helpers handle BigInts
    const processedDetails = details ? {
        ...details,
        // Status needs conversion to Number for map lookup
        statusValue: details.statusValue !== undefined ? Number(details.statusValue) : null,
        // Other values remain in their raw format (BigInt, string, etc.)
    } : null;


    // --- Render Functions for Specific Types ---

    const renderRawMaterialDetails = (data) => (
        // Use specific class for styling raw material section
        <div className={`${styles.batchSpecificDetails} ${styles.rawMaterialDetails}`}>
            <h3>Raw Material Details</h3>
            {renderAddressField('Batch Address', data.batchAddress)}
            <p><strong>Description:</strong> {formatBytes32(data.description)}</p>
            <p><strong>Quantity:</strong> {formatDisplayValue(data.quantity)}</p>
            {renderAddressField('Supplier', data.supplier)}
            {renderAddressField('Intended Manufacturer', data.intendedManufacturer)}
            <p><strong>Status:</strong> {formatStatus(data.statusValue, RawMaterialStatus)}</p> {/* Use processed statusValue */}
            {renderAddressField('Current Transporter', data.currentTransporter)}
            <p><strong>Creation Time:</strong> {formatTimestamp(data.creationTime)}</p>
            <p><strong>Last Updated:</strong> {formatTimestamp(data.lastUpdateTime)}</p>
        </div>
    );

    const renderMedicineDetails = (data) => (
        // Use specific class for styling medicine section
        <div className={`${styles.batchSpecificDetails} ${styles.medicineDetails}`}>
            <h3>Medicine Details</h3>
            {renderAddressField('Batch Address', data.batchAddress)}
            <p><strong>Description:</strong> {formatBytes32(data.description)}</p>
            <p><strong>Quantity:</strong> {formatDisplayValue(data.quantity)}</p>
            {renderAddressField('Manufacturer', data.manufacturer)}
            <p><strong>Status:</strong> {formatStatus(data.statusValue, MedicineStatus)}</p> {/* Use processed statusValue */}
            {renderAddressField('Current Owner', data.currentOwner)}
            {renderAddressField('Current Transporter', data.currentTransporter)}
            {renderAddressField('Destination', data.currentDestination)}
            <p><strong>Expiry Date:</strong> {formatTimestamp(data.expiryDate)}</p>
            <p><strong>Creation Time:</strong> {formatTimestamp(data.creationTime)}</p>
            <p><strong>Last Updated:</strong> {formatTimestamp(data.lastUpdateTime)}</p>
            <p><strong>Raw Materials Used:</strong></p>
            {Array.isArray(data.rawMaterialBatchIds) && data.rawMaterialBatchIds.length > 0 ? (
                <ul className={styles.batchDetailsList}>
                    {data.rawMaterialBatchIds.map((rmId, index) => {
                        const fullRmId = rmId && rmId !== ethers.ZeroAddress ? rmId : 'N/A';
                        const shortRmId = formatAddress(rmId);
                        return (
                            // *** Use HoverToReveal in LI element ***
                            <li key={`${rmId}-${index}`}>
                                <HoverToReveal
                                    shortValue={shortRmId}
                                    fullValue={fullRmId}
                                    type="address"
                                />
                            </li>
                        );;
                    })}
                </ul>
            ) : <p><em>None listed</em></p>}
        </div>
    );

    // *** REMOVED detailsToRender variable ***

   return (
         <div className={`${styles.batchDetails} ${styles.panel}`}>

            {/* --- Conditional Rendering Based on Type --- */}
            {processedDetails?.type === 'RawMaterial' && renderRawMaterialDetails(processedDetails)}
            {processedDetails?.type === 'Medicine' && renderMedicineDetails(processedDetails)}
            {!processedDetails || !(['RawMaterial', 'Medicine'].includes(processedDetails.type)) && (
                 <p className={styles.errorMessage}>Invalid or unknown batch type.</p>
            )}

            {/* --- Separator --- */}
            {processedDetails && history && history.length > 0 && (
                 <hr className={styles.batchDetailsSeparator} />
             )}

            {/* --- Transaction History --- */}
            {/* Pass history, remove showFullHashes prop as it's handled by tooltips now */}
            {processedDetails && (
                <TransactionHistory history={history ?? []} />
             )}
        </div>
    );
}

// --- PropTypes ---
BatchDetails.propTypes = {
    // Details object structure expected (raw values)
    details: PropTypes.shape({
        type: PropTypes.oneOf(['RawMaterial', 'Medicine']).isRequired,
        batchAddress: PropTypes.string, // address string
        description: PropTypes.string, // bytes32 hex string
        quantity: PropTypes.oneOfType([PropTypes.object, PropTypes.string, PropTypes.number]), // BigInt source
        supplier: PropTypes.string, // address string
        intendedManufacturer: PropTypes.string, // address string
        manufacturer: PropTypes.string, // address string
        statusValue: PropTypes.oneOfType([PropTypes.object, PropTypes.string, PropTypes.number]), // BigInt source (enum number)
        currentOwner: PropTypes.string, // address string
        currentTransporter: PropTypes.string, // address string
        currentDestination: PropTypes.string, // address string
        creationTime: PropTypes.oneOfType([PropTypes.object, PropTypes.string, PropTypes.number]), // BigInt source (timestamp)
        expiryDate: PropTypes.oneOfType([PropTypes.object, PropTypes.string, PropTypes.number]), // BigInt source (timestamp)
        lastUpdateTime: PropTypes.oneOfType([PropTypes.object, PropTypes.string, PropTypes.number]), // BigInt source (timestamp)
        rawMaterialBatchIds: PropTypes.arrayOf(PropTypes.string), // Array of address strings
    }), // Can be null/undefined
    history: PropTypes.arrayOf(PropTypes.object), // Array of TxnLog structs
    // showFullHashes: PropTypes.bool // This prop is no longer needed here
};

// Default Props
BatchDetails.defaultProps = {
    details: null,
    history: [],
    // showFullHashes: true // Default set inside the component now
};


export default BatchDetails;