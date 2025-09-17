// client/src/components/SupplierDashboard.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import CreateRawMaterialForm from './CreateRawMaterialForm'; // Assumes this form handles its own location inputs internally if needed
import TransferForm from './TransferForm';
import MarkDestroyedForm from './MarkDestroyedForm';
import BatchDetails from './BatchDetails';
import { formatAddress, formatHash } from './BatchDetails'; // Keep needed formatters
import { ethers } from 'ethers';
import { ROLES, getRoleName } from '../constants/roles';
import styles from '../styles/SupplierDashboard.module.css'; // Import CSS Module

// --- Constants ---
const VIEWS = { CREATE: 'create', TRANSFER: 'transfer', DESTROY: 'destroy', VIEW_BATCH: 'view' };
const STATUS_TYPE = { IDLE: 'idle', INFO: 'info', ERROR: 'error', SUCCESS: 'success', LOADING: 'loading' };
const ADDRESS_REGEX_SOURCE = '^0x[a-fA-F0-9]{40}$';
const COORD_DECIMALS = 6;
const RAW_MATERIAL_TYPE_HASH = ethers.id("RAW_MATERIAL");
const MEDICINE_TYPE_HASH = ethers.id("MEDICINE");

// --- Placeholder Icons ---
const CheckCircleIcon = () => <svg className={styles.statusIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>;
const ErrorIcon = () => <svg className={styles.statusIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>;
const InfoIcon = () => <svg className={styles.statusIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>;
// --- End Placeholder Icons ---


function SupplierDashboard() {
    // --- Hooks ---
    const {
        account, contract, isLoading: isGlobalLoading, setIsLoading: setGlobalLoading,
        getRevertReason, setError: setGlobalError, error: web3Error, hasRole, fetchWithLoading,
    } = useWeb3();

    // --- State ---
    const [currentView, setCurrentView] = useState(VIEWS.CREATE);
    const [status, setStatus] = useState({ message: '', type: STATUS_TYPE.IDLE });
    const [batchAddressInput, setBatchAddressInput] = useState('');
    const [batchData, setBatchData] = useState({ details: null, history: [] });
    // Add Location State
    const [location, setLocation] = useState({ latitude: '', longitude: '' });
    const [isFetchingLocation, setIsFetchingLocation] = useState(false);
    const [isAuditing, setIsAuditing] = useState(false);

    // --- Derived State & Memoization ---
    const isSupplier = useMemo(() => hasRole(ROLES.SUPPLIER_ROLE), [hasRole]);

    // --- Callbacks ---
    const clearStatusAndError = useCallback(() => {
        setStatus({ message: '', type: STATUS_TYPE.IDLE });
        setGlobalError(null);
    }, [setGlobalError]);

    // Add getLocation Callback (identical to other dashboards)
    const getLocation = useCallback(() => {
        clearStatusAndError();
        if (!navigator.geolocation) { setStatus({ message: "Geolocation is not supported.", type: STATUS_TYPE.ERROR }); return; }
        setIsFetchingLocation(true);
        setStatus({ message: "Attempting to get location...", type: STATUS_TYPE.INFO });
        navigator.geolocation.getCurrentPosition(
             (position) => {
                 const { latitude: lat, longitude: lon } = position.coords;
                 const latStr = lat.toFixed(COORD_DECIMALS); const lonStr = lon.toFixed(COORD_DECIMALS);
                 setLocation({ latitude: latStr, longitude: lonStr });
                 setStatus({ message: `Location acquired: Lat ${latStr}, Lon ${lonStr}`, type: STATUS_TYPE.SUCCESS });
                 setIsFetchingLocation(false);
             }, (error) => { /* ... error handling ... */ setStatus({ message: error.message || "Could not get location.", type: STATUS_TYPE.ERROR }); setIsFetchingLocation(false); },
             { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
         );
    }, [clearStatusAndError]);

    // fetchBatchData (stores raw data - remains the same logic as previous refactor)
    const fetchBatchData = useCallback(async () => {
        // ... (fetch logic storing raw data in batchData state remains the same) ...
        clearStatusAndError();
        if (!contract) { setStatus({ message: "Contract not loaded.", type: STATUS_TYPE.ERROR }); return; }
        if (!ethers.isAddress(batchAddressInput)) { setStatus({ message: 'Invalid Batch Address format.', type: STATUS_TYPE.ERROR }); return; }
        setIsAuditing(true);
        setBatchData({ details: null, history: [] });
        setStatus({ message: `Fetching data for ${formatAddress(batchAddressInput)}...`, type: STATUS_TYPE.LOADING });
        const executeRead = fetchWithLoading ?? ((func) => func());
        try {
            const typeHash = await executeRead(() => contract.batchType(batchAddressInput));
            if (typeHash === ethers.ZeroHash) throw new Error("Batch not found.");
            let detailsPromise; let batchDisplayType = '';
            if (typeHash === RAW_MATERIAL_TYPE_HASH) { batchDisplayType = 'RawMaterial'; detailsPromise = executeRead(() => contract.getRawMaterialDetails(batchAddressInput)); }
            else if (typeHash === MEDICINE_TYPE_HASH) { batchDisplayType = 'Medicine'; detailsPromise = executeRead(() => contract.getMedicineDetails(batchAddressInput)); }
            else { throw new Error("Unknown batch type found."); }
            const [rawDetailsResult, rawHistoryResult] = await Promise.all([ detailsPromise, executeRead(() => contract.getTransactionHistory(batchAddressInput)) ]);
            let rawDetailsObject = {};
            if (batchDisplayType === 'RawMaterial') { rawDetailsObject = { type: batchDisplayType, batchAddress: batchAddressInput, description: rawDetailsResult[0], quantity: rawDetailsResult[1], supplier: rawDetailsResult[2], intendedManufacturer: rawDetailsResult[3], creationTime: rawDetailsResult[4], statusValue: rawDetailsResult[5], currentTransporter: rawDetailsResult[6], lastUpdateTime: rawDetailsResult[7] }; }
            else if (batchDisplayType === 'Medicine') { rawDetailsObject = { type: batchDisplayType, batchAddress: batchAddressInput, description: rawDetailsResult[0], quantity: rawDetailsResult[1], rawMaterialBatchIds: rawDetailsResult[2], manufacturer: rawDetailsResult[3], creationTime: rawDetailsResult[4], expiryDate: rawDetailsResult[5], statusValue: rawDetailsResult[6], currentOwner: rawDetailsResult[7], currentTransporter: rawDetailsResult[8], currentDestination: rawDetailsResult[9], lastUpdateTime: rawDetailsResult[10] }; }
            const rawHistoryLogs = rawHistoryResult;
            setBatchData({ details: rawDetailsObject, history: rawHistoryLogs });
            setStatus({ message: `${batchDisplayType} batch data loaded.`, type: STATUS_TYPE.SUCCESS });
        } catch (err) { /* ... error handling ... */ setStatus({ message: `Fetch Failed: ${getRevertReason(err) || err.message}`, type: STATUS_TYPE.ERROR }); setBatchData({ details: null, history: [] }); }
        finally { setIsAuditing(false); }
    }, [ contract, batchAddressInput, getRevertReason, clearStatusAndError, fetchWithLoading ]);


    // --- Stable Callbacks for Child Forms ---
    const handleCreateSuccess = useCallback((txHash, newBatchAddress) => { setStatus({ message: `Raw Material Batch ${formatAddress(newBatchAddress)} created. Tx: ${formatHash(txHash)}`, type: STATUS_TYPE.SUCCESS }); }, []);
    const handleCreateError = useCallback((msg) => { if (msg === null) return; setStatus({ message: `Creation Failed: ${msg}`, type: STATUS_TYPE.ERROR }); }, []);
    const handleTransferSuccess = useCallback((txHash, batchAddr) => { setStatus({ message: `Transfer of ${formatAddress(batchAddr)} initiated! Tx: ${formatHash(txHash)}`, type: STATUS_TYPE.SUCCESS }); }, []);
    const handleTransferError = useCallback((msg) => { if (msg === null) return; setStatus({ message: `Transfer Error: ${msg}`, type: STATUS_TYPE.ERROR }); }, []);
    const handleDestroySuccess = useCallback((txHash, batchAddr) => { setStatus({ message: `Batch ${formatAddress(batchAddr)} marked destroyed! Tx: ${formatHash(txHash)}`, type: STATUS_TYPE.SUCCESS }); }, []);
    const handleDestroyError = useCallback((msg) => { if (msg === null) return; setStatus({ message: `Destruction Error: ${msg}`, type: STATUS_TYPE.ERROR }); }, []);

    // --- Effects ---
    useEffect(() => { getLocation(); }, [getLocation]);

    useEffect(() => { // Reset state on view change
        setBatchAddressInput('');
        setBatchData({ details: null, history: [] });
        setIsAuditing(false);
        clearStatusAndError();
    }, [currentView, clearStatusAndError]);

    // --- Render Logic ---
    if (!account) return <p className={styles.infoMessage}>Please connect your wallet.</p>;
    if (!isSupplier) return <p className={styles.errorMessage}>Access Denied: Requires '{getRoleName(ROLES.SUPPLIER_ROLE)}' role.</p>;

    const viewLabels = {
        [VIEWS.CREATE]: 'Create Material',
        [VIEWS.TRANSFER]: 'Transfer Material',
        [VIEWS.DESTROY]: 'Mark Destroyed',
        [VIEWS.VIEW_BATCH]: 'Audit Batch',
    };

    return (
        <div className={styles.dashboardContainer}>
            {/* Header */}
            <h2 className={styles.title}>Supplier Dashboard</h2>
            <p className={styles.description}>Manage raw material creation, transfers, and lifecycle.</p>

            {/* --- ADDED Location Section --- */}
            <section className={styles.section}>
                 <h3 className={styles.sectionTitle}>Current Location</h3>
                 <div className={styles.locationInputs}>
                     <div className={styles.formGroup}>
                         <label htmlFor="supp-lat" className={styles.formLabel}>Latitude:</label>
                         <input id="supp-lat" className={styles.formInput} type="number" step="any" value={location.latitude} onChange={(e) => setLocation(p => ({ ...p, latitude: e.target.value }))} placeholder="e.g., 40.712800" aria-label="Current Latitude" disabled={isFetchingLocation}/>
                     </div>
                     <div className={styles.formGroup}>
                         <label htmlFor="supp-lon" className={styles.formLabel}>Longitude:</label>
                         <input id="supp-lon" className={styles.formInput} type="number" step="any" value={location.longitude} onChange={(e) => setLocation(p => ({ ...p, longitude: e.target.value }))} placeholder="e.g., -74.006000" aria-label="Current Longitude" disabled={isFetchingLocation}/>
                     </div>
                     <button onClick={getLocation} className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={isFetchingLocation || isGlobalLoading} aria-label="Get current GPS location">
                         {isFetchingLocation ? <><span className={styles.spinner}></span>Getting...</> : 'Get GPS'}
                     </button>
                 </div>
                 {/* Optional warning if location is needed by some actions */}
                 {/* {!location.latitude || !location.longitude ? <p className={styles.locationWarning}>Location might be required for some actions.</p> : null} */}
             </section>

            {/* Navigation Tabs */}
            <nav className={styles.nav}>
                 {Object.entries(viewLabels).map(([key, label]) => (
                     <button key={key} className={`${styles.navButton} ${currentView === key ? styles.navButtonActive : ''}`}
                         onClick={() => setCurrentView(key)} aria-current={currentView === key ? 'page' : undefined}>
                         {label}
                     </button>
                 ))}
            </nav>

            {/* Status Feedback Area */}
            <div className={styles.statusArea}>
                 {(status.message || web3Error) && (
                    <div className={`${styles.statusMessage} ${styles[`statusMessage--${status.type || STATUS_TYPE.ERROR}`]}`}>
                         {status.type === STATUS_TYPE.SUCCESS && <CheckCircleIcon />}
                         {(status.type === STATUS_TYPE.ERROR || web3Error) && <ErrorIcon />}
                         {(status.type === STATUS_TYPE.INFO || status.type === STATUS_TYPE.LOADING) && <InfoIcon />}
                        <div className={styles.statusContent}>{status.message || `Error: ${web3Error}`}</div>
                    </div>
                 )}
             </div>

            {/* Main Content Area */}
            <div className={styles.contentArea}>

                {/* View: Create Raw Material */}
                {currentView === VIEWS.CREATE && (
                    <section className={styles.section}>
                     <CreateRawMaterialForm
                         // latitude={location.latitude} // Uncomment if needed
                         // longitude={location.longitude} // Uncomment if needed
                         onSuccess={handleCreateSuccess}
                         onError={handleCreateError}
                     />
                     </section>
                )}

                {/* View: Transfer Raw Material */}
                {currentView === VIEWS.TRANSFER && (
                    <section className={styles.section}>
                         <TransferForm
                            batchTypeContext="RAW_MATERIAL"
                            allowedSenderRole={ROLES.SUPPLIER_ROLE}
                            // Pass location props ONLY if TransferForm needs them for RM transfer
                             latitude={location.latitude} // Uncomment if needed
                             longitude={location.longitude} // Uncomment if needed
                            onSuccess={handleTransferSuccess}
                            onError={handleTransferError}
                        />
                    </section>
                )}

                {/* View: Destroy Batch */}
                 {currentView === VIEWS.DESTROY && (
                    <section className={styles.section}>
                         <MarkDestroyedForm
                            allowedDestroyerRoles={[ROLES.SUPPLIER_ROLE, ROLES.ADMIN_ROLE]}
                            batchTypeContext="RAW_MATERIAL"
                            // Pass location props ONLY if MarkDestroyedForm needs them
                            latitude={location.latitude} // Uncomment if needed
                            longitude={location.longitude} // Uncomment if needed
                            onSuccess={handleDestroySuccess}
                            onError={handleDestroyError}
                        />
                    </section>
                )}

                {/* View: View/Audit Batch */}
                {currentView === VIEWS.VIEW_BATCH && (
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Audit Batch</h3>
                        <p className={styles.sectionBody}>Fetch details and history for any Raw Material or Medicine batch.</p>
                         <div className={styles.viewBatchControls}>
                            <div className={styles.formGroup}>
                                <label htmlFor="audit-addr-supp" className={styles.formLabel}>Batch Address:</label>
                                <input id="audit-addr-supp" className={styles.formInput} type="text" placeholder="Enter Batch Address (0x...)" value={batchAddressInput} onChange={(e) => setBatchAddressInput(e.target.value)} pattern={ADDRESS_REGEX_SOURCE} aria-label="Batch Address to Audit" disabled={isAuditing}/>
                            </div>
                            <button onClick={fetchBatchData} className={`${styles.button} ${styles.buttonPrimary}`} disabled={isAuditing || isGlobalLoading || !ethers.isAddress(batchAddressInput)} aria-label="Fetch batch information">
                                {isAuditing ? <><span className={styles.spinner}></span>Auditing...</> : 'Audit Batch'}
                            </button>
                        </div>

                        {/* Display Audit Results */}
                        <div style={{ marginTop: '2rem' }}>
                            {isAuditing && (
                                <p className={styles.message + ' ' + styles.loadingMessage}><span className={styles.spinner}></span> Loading details...</p>
                            )}
                            {!isAuditing && batchData.details && (
                                // Wrap BatchDetails if extra styling is needed
                                // <div className={styles.batchDetailsDisplayArea}>
                                    <BatchDetails
                                        details={batchData.details} // Pass RAW data
                                        history={batchData.history} // Pass RAW data
                                    />
                                // </div>
                            )}
                            {/* Message for no data/error after search */}
                            {!isAuditing && !batchData.details && batchAddressInput && ethers.isAddress(batchAddressInput) && status.type !== STATUS_TYPE.LOADING && status.type !== STATUS_TYPE.IDLE && status.type !== STATUS_TYPE.INFO && (
                                <p className={`${styles.message} ${status.type === STATUS_TYPE.ERROR ? styles.errorMessage : styles.infoMessage}`}>
                                    {status.type === STATUS_TYPE.ERROR ? status.message : "No details found for this batch address."}
                                </p>
                             )}
                        </div>
                    </section>
                )}

            </div> {/* End Content Area */}
        </div> // End Dashboard Container
    );
}

export default SupplierDashboard;