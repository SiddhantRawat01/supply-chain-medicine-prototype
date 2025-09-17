// client/src/components/ManufacturerDashboard.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import CreateMedicineForm from './CreateMedicineForm';
import TransferForm from './TransferForm';
import MarkDestroyedForm from './MarkDestroyedForm';
import ReceivePackageButton from './ReceivePackageButton';
import BatchDetails, {
    formatHash,
    formatAddress,
} from './BatchDetails'; // Ensure BatchDetails utils handle potential BigInts gracefully
import { ethers } from 'ethers';
import { ROLES, getRoleName } from '../constants/roles';
import styles from '../styles/ManufacturerDashboard.module.css'; // Import CSS Module

// --- Constants ---
const VIEWS = { CREATE_MED: 'createMed', RECEIVE_RM: 'receiveRM', TRANSFER_MED: 'transferMed', DESTROY: 'destroy', VIEW_BATCH: 'view' };
const STATUS_TYPE = { INFO: 'info', ERROR: 'error', SUCCESS: 'success', LOADING: 'loading' };
const VIEW_LABELS = {
  [VIEWS.CREATE_MED]: 'Create Medicine',
  [VIEWS.RECEIVE_RM]: 'Receive Materials',
  [VIEWS.TRANSFER_MED]: 'Transfer Products',
  [VIEWS.DESTROY]: 'Quality Control',
  [VIEWS.VIEW_BATCH]: 'Batch Audit'
};

// --- Placeholder Icons (Replace with actual imports or components) ---
const CheckCircleIcon = () => <svg className={styles.statusIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>;
const ErrorIcon = () => <svg className={styles.statusIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>;
const InfoIcon = () => <svg className={styles.statusIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>;
// --- End Placeholder Icons ---

const COORD_DECIMALS = 6;
const ADDRESS_REGEX_SOURCE = '^0x[a-fA-F0-9]{40}$';

// Type Hashes
const RAW_MATERIAL_TYPE_HASH = ethers.id("RAW_MATERIAL");
const MEDICINE_TYPE_HASH = ethers.id("MEDICINE");


// --- Component ---
function ManufacturerDashboard() {
    // --- Hooks & Context ---
    const {
        account, contract, isLoading: isGlobalLoading, setIsLoading: setGlobalLoading,
        getRevertReason, setError: setGlobalError, error: web3Error, hasRole, fetchWithLoading,
    } = useWeb3();

    // --- State ---
    const [currentView, setCurrentView] = useState(VIEWS.CREATE_MED);
    const [status, setStatus] = useState({ message: '', type: STATUS_TYPE.INFO });
    const [batchAddressInput, setBatchAddressInput] = useState('');
    const [batchData, setBatchData] = useState({ details: null, history: [] });
    // Store location as { latitude: string, longitude: string }
    const [location, setLocation] = useState({ latitude: '', longitude: '' });
    const [isFetchingLocation, setIsFetchingLocation] = useState(false);
    // Add state specific to the audit section loading
    const [isAuditing, setIsAuditing] = useState(false);

    // --- ADD History & Details State ---
    const [createdBatchHistory, setCreatedBatchHistory] = useState([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [selectedHistoryBatchAddress, setSelectedHistoryBatchAddress] = useState(null); // Separate selection for history
    const [selectedBatchDetails, setSelectedBatchDetails] = useState(null); // Re-use for details pane
    const [isDetailsLoading, setIsDetailsLoading] = useState(false);
    const [detailsError, setDetailsError] = useState('');
    // --- Memoized Values ---
    const isManufacturer = useMemo(() => hasRole(ROLES.MANUFACTURER_ROLE), [hasRole]);
    const medicineTypeHash = useMemo(() => ethers.id("MEDICINE"), []);
    
    
    // --- Create Event Filter for MEDICINE batches created by THIS account ---
    const batchCreatedEventFilter = useMemo(() => {
        if (!contract || !account || !medicineTypeHash || medicineTypeHash === ethers.ZeroHash) return null;
        // Filter for BatchCreated events where:
        // topic[1] (batchType) is MEDICINE_TYPE_HASH
        // topic[3] (creator) is the current account
        return contract.filters.BatchCreated(medicineTypeHash, null, account);
    }, [contract, account, medicineTypeHash]);
    // --- Callbacks ---
    const clearStatusAndError = useCallback(() => {
        setStatus({ message: '', type: STATUS_TYPE.INFO });
        setGlobalError(null);
    }, [setGlobalError]);

    // --- Location Handling ---
    const getLocation = useCallback(() => {
        clearStatusAndError(); // Clear other messages when trying to get location
        if (!navigator.geolocation) {
            setStatus({ message: "Geolocation is not supported.", type: STATUS_TYPE.ERROR });
            return;
        }
        setIsFetchingLocation(true);
        setStatus({ message: "Attempting to get location...", type: STATUS_TYPE.INFO });

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude: lat, longitude: lon } = position.coords;
                const latStr = lat.toFixed(COORD_DECIMALS); // Format immediately
                const lonStr = lon.toFixed(COORD_DECIMALS); // Format immediately
                setLocation({ latitude: latStr, longitude: lonStr });
                setStatus({ message: `Location acquired: Lat ${latStr}, Lon ${lonStr}`, type: STATUS_TYPE.SUCCESS });
                setIsFetchingLocation(false);
            },
            (error) => {
                console.error("Geolocation error:", error);
                let message = "Could not get location. Please enter manually or check permissions.";
                // ... (specific error messages as before) ...
                 if (error.code === error.PERMISSION_DENIED) message = "Geolocation permission denied. Please enable location services or enter manually.";
                 else if (error.code === error.POSITION_UNAVAILABLE) message = "Location information is currently unavailable.";
                 else if (error.code === error.TIMEOUT) message = "Geolocation request timed out.";
                setStatus({ message, type: STATUS_TYPE.ERROR });
                setIsFetchingLocation(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    }, [clearStatusAndError]); // Dependency

    // Fetch location on mount
    useEffect(() => {
        getLocation();
    }, [getLocation]);
    // --- ADD fetchHistory Callback ---
    const fetchHistory = useCallback(async () => {
        if (!batchCreatedEventFilter || !account || !contract) {
            console.log("[History] Prerequisites not met for fetch.");
            return;
        }
        setIsHistoryLoading(true);
        setHistoryError('');
        console.log("[History] Fetching created Medicine batches...");
        try {
            const events = await contract.queryFilter(batchCreatedEventFilter);
            console.log("[History] Events received:", events.length);
            const history = events.map(event => {
                try {
                    const batchAddr = event?.args?.batchAddress;
                    if (!ethers.isAddress(batchAddr)) {
                         console.warn("[History] Invalid batch address in event:", event);
                         return null;
                    }
                     return { txHash: event.transactionHash, batchAddress: ethers.getAddress(batchAddr) };
                 } catch (parseError) {
                    console.error("[History] Error parsing event args:", parseError, event);
                    return null;
                }
            }).filter(item => item !== null).reverse(); // Newest first
            setCreatedBatchHistory(history);
        } catch (err) {
            console.error("[History] Error fetching:", err);
            const reason = getRevertReason(err);
            setHistoryError(`Failed to fetch batch history${reason ? ': ' + reason : '.'}`);
        } finally {
            setIsHistoryLoading(false);
        }
    }, [contract, account, batchCreatedEventFilter, getRevertReason]); // Dependencies

    // --- ADD useEffect to fetch history ---
    useEffect(() => {
        // Fetch only if connected and manufacturer role confirmed
        if (contract && account && isManufacturer) {
            fetchHistory();
        }
    }, [fetchHistory, contract, account, isManufacturer]); // Re-fetch if these change


    // --- ADD handleViewDetails Callback (for history section) ---
    const handleViewDetails = useCallback(async (batchAddress) => {
        if (!contract || !batchAddress) return;

        // Toggle selection off if clicking the same button
        if (selectedHistoryBatchAddress === batchAddress) {
            setSelectedHistoryBatchAddress(null);
            setSelectedBatchDetails(null);
            setDetailsError('');
            return;
        }

        console.log("[Details] Fetching for batch from history:", batchAddress);
        setSelectedHistoryBatchAddress(batchAddress); // Select row in history table
        setSelectedBatchDetails(null); // Clear previous details
        setIsDetailsLoading(true);
        setDetailsError('');

        try {
            // Since history is for created Medicine batches, call getMedicineDetails
            const rawDetailsArray = await contract.getMedicineDetails(batchAddress);
            console.log("[Details] Raw details array received:", rawDetailsArray);

             if (!rawDetailsArray || rawDetailsArray.length < 11) { // Medicine details length check
                 throw new Error(`Unexpected data structure for Medicine details.`);
             }

             // Map RAW data to object
             const rawDetailsObject = {
                 type: 'Medicine', // Set type hint
                 batchAddress: batchAddress,
                 description: rawDetailsArray[0], quantity: rawDetailsArray[1], rawMaterialBatchIds: rawDetailsArray[2],
                 manufacturer: rawDetailsArray[3], creationTime: rawDetailsArray[4], expiryDate: rawDetailsArray[5],
                 statusValue: rawDetailsArray[6], currentOwner: rawDetailsArray[7], currentTransporter: rawDetailsArray[8],
                 currentDestination: rawDetailsArray[9], lastUpdateTime: rawDetailsArray[10],
             };

            console.log("[Details] Parsed raw details object:", rawDetailsObject);
            setSelectedBatchDetails(rawDetailsObject); // Store RAW object

        } catch (err) {
            console.error("[Details] Error fetching:", err);
            const reason = getRevertReason(err);
            setDetailsError(`Failed to fetch batch details${reason ? ': ' + reason : '.'}`);
            setSelectedHistoryBatchAddress(null); // Clear selection on error
            setSelectedBatchDetails(null);
        } finally {
            setIsDetailsLoading(false);
        }
    }, [contract, getRevertReason, selectedHistoryBatchAddress]); // Dependencies

    // --- Batch Data Fetching (Refactored for Readability) ---
    const fetchBatchData = useCallback(async () => {
        clearStatusAndError();
        if (!contract) { setStatus({ message: "Contract not loaded.", type: STATUS_TYPE.ERROR }); return; }
        if (!ethers.isAddress(batchAddressInput)) { setStatus({ message: 'Invalid Batch Address format.', type: STATUS_TYPE.ERROR }); return; }

        setGlobalLoading(true); // Use global loading for this fetch
        setBatchData({ details: null, history: [] });
        setStatus({ message: `Fetching data for ${formatAddress(batchAddressInput)}...`, type: STATUS_TYPE.LOADING });

        const executeRead = fetchWithLoading ?? ((func) => func());

        try {
            const typeHash = await executeRead(() => contract.batchType(batchAddressInput));
            if (typeHash === ethers.ZeroHash) throw new Error("Batch not found.");

            let detailsPromise;
            let batchDisplayType = ''; // Will store 'RawMaterial' or 'Medicine' string

            // Determine which details function to call based on type
            if (typeHash === RAW_MATERIAL_TYPE_HASH) {
                batchDisplayType = 'RawMaterial';
                detailsPromise = executeRead(() => contract.getRawMaterialDetails(batchAddressInput));
            } else if (typeHash === MEDICINE_TYPE_HASH) {
                batchDisplayType = 'Medicine';
                detailsPromise = executeRead(() => contract.getMedicineDetails(batchAddressInput));
            } else {
                throw new Error("Unknown batch type found.");
            }

            // Fetch details and history concurrently
            const [rawDetailsResult, rawHistoryResult] = await Promise.all([
                detailsPromise,
                executeRead(() => contract.getTransactionHistory(batchAddressInput))
            ]);

            // --- Store RAW data directly in state ---
            let rawDetailsObject = {};


            if (batchDisplayType === 'RawMaterial') {
                // Map array indices to named properties, keeping raw values (BigInts, hex strings, etc.)
                 rawDetailsObject = {
                     type: batchDisplayType, // Add type hint for BatchDetails
                     batchAddress: batchAddressInput,
                     description: rawDetailsResult[0],        // bytes32 hex
                     quantity: rawDetailsResult[1],           // BigInt
                     supplier: rawDetailsResult[2],           // address string
                     intendedManufacturer: rawDetailsResult[3], // address string
                     creationTime: rawDetailsResult[4],       // BigInt timestamp
                     statusValue: rawDetailsResult[5],        // BigInt enum number
                     currentTransporter: rawDetailsResult[6],   // address string
                     lastUpdateTime: rawDetailsResult[7],       // BigInt timestamp
                 };
            } else if (batchDisplayType === 'Medicine') {
                 rawDetailsObject = {
                     type: batchDisplayType, // Add type hint
                     batchAddress: batchAddressInput,
                     description: rawDetailsResult[0],         // bytes32 hex
                     quantity: rawDetailsResult[1],            // BigInt
                     rawMaterialBatchIds: rawDetailsResult[2], // string[] addresses
                     manufacturer: rawDetailsResult[3],        // address string
                     creationTime: rawDetailsResult[4],        // BigInt timestamp
                     expiryDate: rawDetailsResult[5],          // BigInt timestamp
                     statusValue: rawDetailsResult[6],         // BigInt enum number
                     currentOwner: rawDetailsResult[7],        // address string
                     currentTransporter: rawDetailsResult[8],  // address string
                     currentDestination: rawDetailsResult[9],  // address string
                     lastUpdateTime: rawDetailsResult[10],       // BigInt timestamp
                 };
            }

            // Formatting history remains similar, ensure formatters handle potential BigInts


            const rawHistoryLogs = rawHistoryResult;

            console.log("[Audit] Raw Details:", rawDetailsObject); // Debugging
            console.log("[Audit] Raw History:", rawHistoryLogs); // Debugging

            // Update state with the raw, structured data
            setBatchData({ details: rawDetailsObject, history: rawHistoryLogs });
            setStatus({ message: `${batchDisplayType} batch data loaded.`, type: STATUS_TYPE.SUCCESS });

        } catch (err) {
            console.error("Fetch Batch Data Error:", err);
            const reason = getRevertReason(err);
            const errorMessage = `Fetch Failed: ${reason || err.message}`;
            setGlobalError(errorMessage); // Set global error
            setStatus({ message: errorMessage, type: STATUS_TYPE.ERROR });
            setBatchData({ details: null, history: [] });
        } finally {
            setGlobalLoading(false);
            setIsAuditing(false);
        }
    }, [ contract, batchAddressInput, setGlobalLoading, setGlobalError, getRevertReason, clearStatusAndError, fetchWithLoading ]); // Dependencies


    // --- STABLE CALLBACKS for Child Components ---
    // (Keep the useCallback wrappers around handlers as before, they seem correct)
    const handleCreateMedicineError = useCallback((msg) => { /* ... */ setStatus({ message: `Creation Failed: ${msg}`, type: STATUS_TYPE.ERROR }); }, []);
    const handleCreateMedicineSuccess = useCallback((txHash, newBatchAddress) => { /* ... */ setStatus({ message: `Medicine Batch ${formatAddress(newBatchAddress)} created. Tx: ${formatHash(txHash)}`, type: STATUS_TYPE.SUCCESS }); fetchHistory(); }, []);
    const handleReceivePackageError = useCallback((msg) => {  if (msg === null) {
            return; } setStatus({ message: `Intake Error: ${msg}`, type: STATUS_TYPE.ERROR }); }, []);
    const handleReceivePackageSuccess = useCallback((addr, txHash) => { /* ... */ setStatus({ message: `Raw Material ${formatAddress(addr)} received. Tx: ${formatHash(txHash)}`, type: STATUS_TYPE.SUCCESS }); setBatchAddressInput(''); }, []);
    const handleTransferError = useCallback((msg) => { if (msg === null) return; setStatus({ message: `Distribution Error: ${msg}`, type: STATUS_TYPE.ERROR }); }, []);
    const handleTransferSuccess = useCallback((txHash, batchAddr /* , receiver */) => { /* ... */ setStatus({ message: `Transfer of ${formatAddress(batchAddr)} initiated. Tx: ${formatHash(txHash)}`, type: STATUS_TYPE.SUCCESS }); }, []);
    const handleDestroyError = useCallback((msg) => { if (msg === null) return; setStatus({ message: `QC Action Failed: ${msg}`, type: STATUS_TYPE.ERROR }); }, []);
    const handleDestroySuccess = useCallback((txHash, batchAddr /* , reason */) => { /* ... */ setStatus({ message: `Batch ${formatAddress(batchAddr)} marked destroyed. Tx: ${formatHash(txHash)}`, type: STATUS_TYPE.SUCCESS }); }, []);


    // Reset state when view changes
    useEffect(() => {
        setBatchAddressInput('');
        setBatchData({ details: null, history: [] });
        clearStatusAndError();
    }, [currentView, clearStatusAndError]);

    // --- Render Logic ---
    if (!account) return <p className={styles.infoMessage}>Please connect your wallet.</p>;
    if (!isManufacturer) return <p className={styles.errorMessage}>Access Denied: Requires '{getRoleName(ROLES.MANUFACTURER_ROLE)}' role.</p>;

    return (
        <div className={styles.dashboardContainer}>
            {/* Header */}
            <div className={styles.headerGrid}>
                <h1 className={styles.headline}>Manufacturer Control Panel</h1>
                <p className={styles.subHeadline}>
                    Manage production using account <span className={styles.highlight}>{formatAddress(account)}</span>.
                </p>
            </div>

           {/* Location Section */}
            <section className={styles.section}> {/* Use standard section class */}
                 <h3 className={styles.sectionTitle}>Current Location </h3> {/* Use standard title class */}
                 {/* Apply the grid layout class */}
                 <div className={styles.locationInputs}>
                     {/* Latitude Input */}
                     <div className={styles.formGroup}> {/* Use standard form group */}
                         <label htmlFor="dash-lat" className={styles.formLabel}>Latitude:</label> {/* Use standard label class */}
                         <input id="dash-lat" className={styles.formInput} type="number" step="any"
                            value={location.latitude}
                            onChange={e => setLocation(p => ({ ...p, latitude: e.target.value }))}
                            placeholder="e.g., 40.712800"
                            aria-label="Current Latitude"
                            disabled={isFetchingLocation}
                            required
                         />
                     </div>
                     {/* Longitude Input */}
                    <div className={styles.formGroup}> {/* Use standard form group */}
                        <label htmlFor="dash-lon" className={styles.formLabel}>Longitude:</label> {/* Use standard label class */}
                        <input id="dash-lon" className={styles.formInput} type="number" step="any"
                            value={location.longitude}
                            onChange={e => setLocation(p => ({ ...p, longitude: e.target.value }))}
                            placeholder="e.g., -74.006000"
                            aria-label="Current Longitude"
                            disabled={isFetchingLocation}
                            required
                         />
                    </div>
                    {/* Get GPS Button */}
                    <button
                        onClick={getLocation}
                        // Use standard button classes
                        className={`${styles.button} ${styles.buttonSecondary}`}
                        type="button"
                        disabled={isFetchingLocation || isGlobalLoading}
                        aria-label="Get current GPS location">
                        {isFetchingLocation ? <><span className={styles.spinner}></span>Getting...</> : 'Get GPS'}
                    </button>
                 </div>
                  {/* Warning message */}
                  {(!location.latitude || !location.longitude) && <p className={styles.locationWarning}>Valid location coordinates are recommended for logging actions.</p>}
            </section>
            {/* --- End Location Section --- */}

            {/* Navigation Tabs */}
            <nav className={styles.nav}>
                {Object.entries(VIEW_LABELS).map(([key, label]) => (
                    <button key={key} className={`${styles.navButton} ${currentView === key ? styles.navButtonActive : ''}`}
                        onClick={() => setCurrentView(key)} aria-current={currentView === key ? 'page' : undefined}>
                        {label}
                    </button>
                ))}
            </nav>

            {/* Status Feedback Area */}
            {(status.message || web3Error) && (
                <div className={`${styles.statusMessage} ${styles[`statusMessage--${status.type || STATUS_TYPE.ERROR}`]}`}>
                    {/* Choose appropriate icon */}
                    {status.type === STATUS_TYPE.SUCCESS && <CheckCircleIcon />}
                    {status.type === STATUS_TYPE.ERROR && <ErrorIcon />}
                    {(status.type === STATUS_TYPE.INFO || status.type === STATUS_TYPE.LOADING) && <InfoIcon />}
                    {web3Error && !status.message && <ErrorIcon />} {/* Icon for global error */}
                    <div className={styles.statusContent}>
                        {status.message || `Error: ${web3Error}` /* Display local or global error */}
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <div className={styles.contentArea}>

                {/* View: Create Medicine */}
                {currentView === VIEWS.CREATE_MED && (
                    <div className={styles.card}>
                        <CreateMedicineForm
                            // CreateMedicineForm has its own inputs for coords,
                            // pass initial values if desired, otherwise defaults work.
                            // latitude={location.latitude}
                            // longitude={location.longitude}
                            onSuccess={handleCreateMedicineSuccess}
                            onError={handleCreateMedicineError}
                        />
                        {/* --- ADD Medicine Batch History Section (Always visible or tied to a specific view?) --- */}
                        {/* Let's make it always visible below the main content area for now */}
                        {/* Or wrap this in: {currentView === RELEVANT_VIEW && (...)} */}
                        <section className={`${styles.section} ${styles.historySection}`}>
                        <h3 className={styles.sectionTitle}>My Created Medicine Batch History</h3>

                        {/* History Loading/Error Feedback */}
                        {isHistoryLoading && <p className={styles.loadingMessage}><span className={styles.spinner}></span> Fetching history...</p>}
                        {historyError && !isHistoryLoading && <p className={`${styles.formStatusError}`}>{historyError}</p>}

                        {/* History Table */}
                        {!isHistoryLoading && !historyError && createdBatchHistory.length > 0 && (
                            <div className={styles.historyTableContainer}>
                                <table className={styles.historyTable}>
                                    <thead>
                                        <tr>
                                            <th>Batch Address</th>
                                            <th>Creation Tx Hash</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {createdBatchHistory.map((batch) => (
                                            <React.Fragment key={batch.batchAddress}>
                                                <tr className={styles.historyRow}>
                                                    {/* Batch Address Cell - Display FULL address */}
                                                    <td>
                                                        <div className={styles.addressCell} title={batch.batchAddress}>
                                                            <span className={styles.fullAddress}>{batch.batchAddress || 'N/A'}</span>
                                                            
                                                        </div>
                                                    </td>
                                                    {/* Transaction Hash Cell - Display FULL hash */}
                                                    <td>
                                                        <div className={styles.txHashCell} title={batch.txHash}>
                                                            <span className={styles.fullAddress}>{batch.txHash || 'N/A'}</span>
                                                            
                                                        </div>
                                                    </td>
                                                    {/* Actions Cell */}
                                                    <td>
                                                        <button onClick={() => handleViewDetails(batch.batchAddress)} className={`${styles.button} ${styles.buttonSecondary}`}
                                                            disabled={isDetailsLoading && selectedHistoryBatchAddress === batch.batchAddress} // Use specific loading/selection state
                                                            aria-expanded={selectedHistoryBatchAddress === batch.batchAddress}>
                                                            {isDetailsLoading && selectedHistoryBatchAddress === batch.batchAddress ? <><span className={styles.spinner}></span> Loading...</> :
                                                            selectedHistoryBatchAddress === batch.batchAddress ? 'Hide Details' :
                                                            'View Details'}
                                                        </button>
                                                    </td>
                                                </tr>
                                                {/* Details Row */}
                                                {selectedHistoryBatchAddress === batch.batchAddress && (
                                                    <tr className={styles.detailsRow}>
                                                        <td colSpan="3">
                                                            <div className={styles.detailsContainer}>
                                                                {isDetailsLoading && <p className={styles.loadingMessage}><span className={styles.spinner}></span> Loading batch details...</p>}
                                                                {detailsError && !isDetailsLoading && <p className={`${styles.formStatusError}`}>{detailsError}</p>}
                                                                {selectedBatchDetails && !isDetailsLoading && !detailsError && (
                                                                    <BatchDetails
                                                                        details={selectedBatchDetails} // Pass RAW details
                                                                        history={[]} // History fetched separately if needed for BatchDetails
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
                        )}

                        {/* No History Message */}
                        {!isHistoryLoading && !historyError && createdBatchHistory.length === 0 && (
                            <p className={styles.noHistoryMessage}>No Medicine batches created by your account found.</p>
                        )}
                        </section> {/* End History Section */}
                    </div>
                )}

                


                {/* View: Receive Raw Material */}
                {currentView === VIEWS.RECEIVE_RM && (
                    <div className={styles.card}>
                        <h2 className={styles.cardTitle}>Raw Material Intake</h2>
                        <p className={styles.cardBody}>Confirm receipt of incoming raw materials.</p>
                        <div className={styles.formGrid}>
                            <div className={`${styles.formControl} ${styles.gridItemFull}`}>
                                <label htmlFor="receive-rm-addr" className={styles.formLabel}>Material Batch Address</label>
                                <input id="receive-rm-addr" className={styles.formInput} value={batchAddressInput}
                                    onChange={e => setBatchAddressInput(e.target.value)}
                                    placeholder="0x... (Address of batch being received)" pattern={ADDRESS_REGEX_SOURCE}
                                />
                            </div>
                            <div className={styles.gridItemFull}>
                                {/* *** Pass CURRENT location state *** */}
                                <ReceivePackageButton
                                    batchAddress={batchAddressInput}
                                    expectedReceiverRole={ROLES.MANUFACTURER_ROLE}
                                    latitude={location.latitude}  // Pass current state value
                                    longitude={location.longitude} // Pass current state value
                                    onSuccess={handleReceivePackageSuccess}
                                    onError={handleReceivePackageError}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* View: Transfer Medicine */}
                {currentView === VIEWS.TRANSFER_MED && (
                    <div className={styles.card}>
                        {/* TransferForm takes lat/lon props for the *current* location of transfer */}
                        <TransferForm
                            batchTypeContext="MEDICINE"
                            allowedSenderRole={ROLES.MANUFACTURER_ROLE}
                            latitude={location.latitude} // Pass current state value
                            longitude={location.longitude} // Pass current state value
                            onSuccess={handleTransferSuccess}
                            onError={handleTransferError}
                        />
                    </div>
                )}

                {/* View: Destroy Batch */}
                 {currentView === VIEWS.DESTROY && (
                    <div className={styles.card}>
                        {/* MarkDestroyedForm takes lat/lon props for *current* location */}
                        <MarkDestroyedForm
                            allowedDestroyerRoles={[ROLES.MANUFACTURER_ROLE, ROLES.ADMIN_ROLE]}
                            batchTypeContext="ANY" // Manufacturer can destroy RM or Med they own
                            latitude={location.latitude} // Pass current state value
                            longitude={location.longitude} // Pass current state value
                            onSuccess={handleDestroySuccess}
                            onError={handleDestroyError}
                        />
                    </div>
                 )}

                {/* --- *** MODIFIED View: View/Audit Batch *** --- */}
                {currentView === VIEWS.VIEW_BATCH && (
                    <div className={styles.card}>
                        <h2 className={styles.cardTitle}>Batch Audit</h2>
                        <p className={styles.cardBody}>Fetch details and history for a specific batch.</p>
                         {/* Input Group for Audit */}
                         <div className={styles.viewBatchControls}>
                            <div className={styles.formGroup}>
                                <label htmlFor="audit-addr" className={styles.formLabel}>Batch Address</label>
                                <input id="audit-addr" className={styles.formInput} value={batchAddressInput}
                                    onChange={e => setBatchAddressInput(e.target.value)}
                                    placeholder="Enter batch contract address (0x...)" pattern={ADDRESS_REGEX_SOURCE}
                                    disabled={isAuditing} // Disable input while fetching
                                />
                            </div>
                            <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={fetchBatchData}
                                // Disable if auditing, global loading, or address invalid
                                disabled={isAuditing || isGlobalLoading || !ethers.isAddress(batchAddressInput)}>
                                {isAuditing ? <><span className={styles.spinner}></span>Retrieving...</> : 'Audit Batch'}
                            </button>
                        </div>

                        {/* Display Area for Audit Results */}
                        <div style={{ marginTop: '2rem' }}>
                            {/* Show Loading State */}
                            {isAuditing && (
                                <p className={styles.infoMessage}>Loading batch data...</p>
                            )}

                            {/* Show Batch Details if loaded and not auditing */}
                            {!isAuditing && batchData.details && (
                                <BatchDetails
                                    details={batchData.details} // Pass RAW, structured details
                                    history={batchData.history} // Pass RAW history logs
                                />
                            )}

                            {/* Show "Not Found" or "No Data" message */}
                            {!isAuditing && !batchData.details && batchAddressInput && ethers.isAddress(batchAddressInput) && (status.type === STATUS_TYPE.SUCCESS || status.type === STATUS_TYPE.ERROR) && !status.message.includes("Fetching") && (
                                // Show only if not loading, details are null, a valid address was searched, and status isn't the initial fetch message
                                <p className={styles.infoMessage}>
                                    {status.type === STATUS_TYPE.ERROR
                                        ? `Could not load data. ${status.message.includes("Fetch Failed:") ? '' : status.message}` // Show error if fetch failed
                                        : "No data found for this batch address." // Otherwise assume valid search but no data
                                    }
                                </p>
                            )}
                         </div> {/* End Display Area */}
                    </div> // End Card
                )} {/* End Audit View */}
                
            </div> {/* End Content Area */}
        </div> // End Dashboard Container
    );
}

export default ManufacturerDashboard;