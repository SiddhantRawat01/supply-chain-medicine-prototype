// client/src/components/TransactionHistory.js
import React from 'react';
import PropTypes from 'prop-types';
import { ethers } from 'ethers';
import styles from '../styles/TransactionHistory.module.css'; // Import CSS Module
import HoverToReveal from './HoverToReveal';
// --- Constants ---
const COORDINATE_SCALE_FACTOR = 1e6;

// --- Event Code Map --- (Keep as is)
const EVENT_CODE_MAP = {
    [ethers.id("RawMaterial Created")]: "RM Created",
    [ethers.id("Medicine Created")]: "Med Created",
    [ethers.id("RawMaterial Transfer Initiated")]: "RM Transfer Init",
    [ethers.id("Medicine Transfer Initiated")]: "Med Transfer Init",
    [ethers.id("RawMaterial Received")]: "RM Received",
    [ethers.id("Medicine Received")]: "Med Received",
    [ethers.id("Medicine Consumed/Sold")]: "Med Finalized",
    [ethers.id("RawMaterial Destroyed")]: "RM Destroyed",
    [ethers.id("Medicine Destroyed")]: "Med Destroyed",
    // Add other event codes defined in your contract here
};


// --- Formatting Helper Functions --- (Keep as is)
const formatAddress = (addr) => { /* ... keep implementation ... */
    if (!addr || addr === ethers.ZeroAddress) return 'N/A';
    if (ethers.isAddress(addr)) { return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`; }
    console.warn("Invalid address format received for formatting:", addr); return 'Invalid Addr';
 };
const formatHash = (hash) => { /* ... keep implementation ... */
    if (!hash || hash === ethers.ZeroHash) return 'N/A';
    if (typeof hash === 'string' && hash.length === 66 && hash.startsWith('0x')) { return `${hash.substring(0, 8)}...${hash.substring(hash.length - 6)}`; }
     console.warn("Invalid hash format received for formatting:", hash); return 'Invalid Hash';
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
const formatCoordinates = (latValue, lonValue) => { /* ... keep implementation ... */
    if (latValue === undefined || latValue === null || lonValue === undefined || lonValue === null) { return 'N/A'; } try { const latNum = Number(latValue); const lonNum = Number(lonValue); if (isNaN(latNum) || isNaN(lonNum)) { console.warn("Invalid coordinate numbers after conversion:", { latValue, lonValue }); return "Invalid Coords"; } const lat = latNum / COORDINATE_SCALE_FACTOR; const lon = lonNum / COORDINATE_SCALE_FACTOR; return `Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)}`; } catch (e) { console.error("Coordinate formatting error:", e, "Lat:", latValue, "Lon:", lonValue); return "Coord Error"; }
 };
const decodeEventCode = (eventCodeHex) => { /* ... keep implementation ... */
    if (!eventCodeHex || eventCodeHex === ethers.ZeroHash) return 'N/A';
    return EVENT_CODE_MAP[eventCodeHex] || formatHash(eventCodeHex); // Fallback to formatted hash if unknown
 };

/**
 * TransactionHistory Component
 */
// *** ADD showFullHashes prop ***
function TransactionHistory({ history }) {

    if (!Array.isArray(history) || history.length === 0) {
        return;
    }

    return (
        <div className={styles.transactionHistory}>
            <h3>Transaction History</h3>
            <div className={styles.historyList}>
                {history.map((logEntry, index) => {
                    const key = logEntry?.index?.toString() ? `log-${logEntry.index.toString()}` : `log-fallback-${index}`;
                    if (!logEntry || typeof logEntry !== 'object') { /* ... error handling ... */ }

                    // Prepare values for HoverToReveal
                    const fullActor = logEntry.actor && logEntry.actor !== ethers.ZeroAddress ? logEntry.actor : 'N/A';
                    const shortActor = formatAddress(logEntry.actor);
                    const fullInvolvedParty = logEntry.involvedParty && logEntry.involvedParty !== ethers.ZeroAddress ? logEntry.involvedParty : 'N/A';
                    const shortInvolvedParty = formatAddress(logEntry.involvedParty);
                    const fullDataHash = logEntry.dataHash ?? 'N/A';
                    const shortDataHash = formatHash(logEntry.dataHash);
                    const fullPrevHash = logEntry.previousLogHash ?? 'N/A';
                    const shortPrevHash = formatHash(logEntry.previousLogHash);

                    return (
                        <div key={key} className={styles.logEntry}>
                            {/* Index, Timestamp, Event, Location don't need hover reveal */}
                            <div className={styles.logField}>
                                <span className={styles.logLabel}># Index:</span>
                                <span className={styles.logValue}>{logEntry.index?.toString() ?? '?'}</span>
                            </div>
                            <div className={styles.logField}>
                                <span className={styles.logLabel}>Timestamp:</span>
                                <span className={styles.logValue}>{formatTimestamp(logEntry.timestamp)}</span>
                            </div>
                            <div className={styles.logField}>
                                <span className={styles.logLabel}>Event:</span>
                                <span className={styles.logValue}>{decodeEventCode(logEntry.eventCode)}</span>
                            </div>
                            {/* Use HoverToReveal for Actor */}
                            <div className={styles.logField}>
                                <span className={styles.logLabel}>Actor:</span>
                                <span className={styles.logValue}>
                                    <HoverToReveal shortValue={shortActor} fullValue={fullActor} type="address" />
                                </span>
                            </div>
                             {/* Use HoverToReveal for Involved Party */}
                            <div className={styles.logField}>
                                <span className={styles.logLabel}>Involved Party:</span>
                                <span className={styles.logValue}>
                                     <HoverToReveal shortValue={shortInvolvedParty} fullValue={fullInvolvedParty} type="address" />
                                </span>
                            </div>
                            <div className={styles.logField}>
                                <span className={styles.logLabel}>Location:</span>
                                <span className={styles.logValue}>{formatCoordinates(logEntry.latitude, logEntry.longitude)}</span>
                            </div>
                            {/* Use HoverToReveal for Data Hash */}
                            <div className={styles.logField}>
                                <span className={styles.logLabel}>Data Hash:</span>
                                <span className={styles.logValue}>
                                    <HoverToReveal shortValue={shortDataHash} fullValue={fullDataHash} type="hash" />
                                </span>
                            </div>
                            {/* Use HoverToReveal for Prev. Log Hash */}
                            <div className={styles.logField}>
                                <span className={styles.logLabel}>Prev. Log Hash:</span>
                                <span className={styles.logValue}>
                                    <HoverToReveal shortValue={shortPrevHash} fullValue={fullPrevHash} type="hash" />
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// --- PropTypes Definition ---
// --- PropTypes Definition ---
TransactionHistory.propTypes = {
    history: PropTypes.arrayOf(
        PropTypes.shape({
            // ... (keep existing shape definition)
            index: PropTypes.oneOfType([PropTypes.object, PropTypes.number, PropTypes.string]),
            timestamp: PropTypes.oneOfType([PropTypes.object, PropTypes.number, PropTypes.string]),
            actor: PropTypes.string,
            involvedParty: PropTypes.string,
            eventCode: PropTypes.string,
            latitude: PropTypes.oneOfType([PropTypes.object, PropTypes.number, PropTypes.string]),
            longitude: PropTypes.oneOfType([PropTypes.object, PropTypes.number, PropTypes.string]),
            dataHash: PropTypes.string,
            previousLogHash: PropTypes.string,
        })
    ),
    // REMOVED showFullHashes prop type
};

// Default props
TransactionHistory.defaultProps = {
    history: [],
};

export default TransactionHistory;