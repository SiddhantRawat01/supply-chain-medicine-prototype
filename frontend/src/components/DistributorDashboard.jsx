// client/src/components/DistributorDashboard.jsx // Rename to .jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
// PropTypes removed as not used directly for props
import { useWeb3 } from '../contexts/Web3Context';
import ReceivePackageButton from './ReceivePackageButton';
import TransferForm from './TransferForm';
import MarkDestroyedForm from './MarkDestroyedForm';
import BatchDetails from './BatchDetails'; // Import BatchDetails component
// Only import formatters needed directly in THIS dashboard
import { formatAddress, formatHash } from './BatchDetails';
import { ethers } from 'ethers';
import { ROLES, getRoleName } from '../constants/roles';
import styles from '../styles/DistributorDashboard.module.css'; // Import CSS Module

// --- Constants ---
const VIEWS = { RECEIVE_MED: 'receiveMed', TRANSFER_MED: 'transferMed', DESTROY: 'destroy', VIEW_BATCH: 'view' };
const STATUS_TYPE = { IDLE: 'idle', INFO: 'info', ERROR: 'error', SUCCESS: 'success', LOADING: 'loading' };
const ADDRESS_REGEX_SOURCE = '^0x[a-fA-F0-9]{40}$';
const COORD_DECIMALS = 6;
const MEDICINE_TYPE_HASH = ethers.id("MEDICINE");

// --- Placeholder Icons ---
const CheckCircleIcon = () => <svg className={styles.statusIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>;
const ErrorIcon = () => <svg className={styles.statusIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>;
const InfoIcon = () => <svg className={styles.statusIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>;
// --- End Placeholder Icons ---

function DistributorDashboard() {
    // --- Hooks ---
    const {
        account, contract, isLoading: isGlobalLoading, setIsLoading: setGlobalLoading,
        getRevertReason, setError: setGlobalError, error: web3Error, hasRole, fetchWithLoading,
    } = useWeb3();

    // --- State ---
    const [currentView, setCurrentView] = useState(VIEWS.RECEIVE_MED);
    const [status, setStatus] = useState({ message: '', type: STATUS_TYPE.IDLE });
    const [batchAddressInput, setBatchAddressInput] = useState('');
    // Store RAW data
    const [batchData, setBatchData] = useState({ details: null, history: [] });
    const [location, setLocation] = useState({ latitude: '', longitude: '' });
    const [isFetchingLocation, setIsFetchingLocation] = useState(false);
    const [isAuditing, setIsAuditing] = useState(false);

    // --- Derived State & Memoization ---
    const isDistributor = useMemo(() => hasRole(ROLES.DISTRIBUTOR_ROLE), [hasRole]);

    // --- Callbacks ---
    const clearStatusAndError = useCallback(() => {
        setStatus({ message: '', type: STATUS_TYPE.IDLE });
        setGlobalError(null);
    }, [setGlobalError]);

    const getLocation = useCallback(() => {
        // (Keep getLocation logic as before, using setStatus/setIsFetchingLocation)
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

    // --- *** MODIFIED fetchBatchData to store RAW data *** ---
    const fetchBatchData = useCallback(async () => {
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
            if (typeHash !== MEDICINE_TYPE_HASH) throw new Error("Batch is not a Medicine type."); // Distributors expect Medicine

            // Fetch details and history concurrently
            const [rawDetailsResult, rawHistoryResult] = await Promise.all([
                executeRead(() => contract.getMedicineDetails(batchAddressInput)),
                executeRead(() => contract.getTransactionHistory(batchAddressInput))
            ]);

            // --- Store RAW data ---
            const rawDetailsObject = {
                type: 'Medicine', // Add type hint for BatchDetails
                batchAddress: batchAddressInput, // Store original address
                description: rawDetailsResult[0],
                quantity: rawDetailsResult[1],
                rawMaterialBatchIds: rawDetailsResult[2],
                manufacturer: rawDetailsResult[3],
                creationTime: rawDetailsResult[4],
                expiryDate: rawDetailsResult[5],
                statusValue: rawDetailsResult[6], // Raw status number
                currentOwner: rawDetailsResult[7],
                currentTransporter: rawDetailsResult[8],
                currentDestination: rawDetailsResult[9],
                lastUpdateTime: rawDetailsResult[10],
            };
            const rawHistoryLogs = rawHistoryResult;

            setBatchData({ details: rawDetailsObject, history: rawHistoryLogs });
            setStatus({ message: `Medicine batch data loaded.`, type: STATUS_TYPE.SUCCESS });

        } catch (err) {
            console.error("Fetch Batch Data Error:", err);
            const reason = getRevertReason(err);
            const errorMessage = `Fetch Failed: ${reason || err.message}`;
            // setGlobalError(errorMessage); // Optional
            setStatus({ message: errorMessage, type: STATUS_TYPE.ERROR });
            setBatchData({ details: null, history: [] });
        } finally {
            setIsAuditing(false);
        }
    }, [ contract, batchAddressInput, /*setGlobalError,*/ getRevertReason, clearStatusAndError, fetchWithLoading ]);

    // --- Effects ---
    useEffect(() => { getLocation(); }, [getLocation]);

    useEffect(() => { // Reset state on view change
        setBatchAddressInput('');
        setBatchData({ details: null, history: [] });
        setIsAuditing(false);
        clearStatusAndError();
    }, [currentView, clearStatusAndError]);

    // --- Stable Callbacks for Child Components ---
    const handleReceivePackageSuccess = useCallback((addr, txHash) => {
        setStatus({ message: `Package ${formatAddress(addr)} received! Tx: ${formatHash(txHash)}`, type: STATUS_TYPE.SUCCESS });
        setBatchAddressInput('');
    }, []);
    const handleReceivePackageError = useCallback((msg) => { if (msg === null) return; setStatus({ message: `Intake Error: ${msg}`, type: STATUS_TYPE.ERROR }); }, []);
    const handleTransferSuccess = useCallback((txHash, batchAddr) => {
        setStatus({ message: `Transfer to Customer initiated! Tx: ${formatHash(txHash)}`, type: STATUS_TYPE.SUCCESS });
    }, []);
    const handleTransferError = useCallback((msg) => { if (msg === null) return; setStatus({ message: `Distribution Error: ${msg}`, type: STATUS_TYPE.ERROR }); }, []);
    const handleDestroySuccess = useCallback((txHash, batchAddr) => {
        setStatus({ message: `Batch ${formatAddress(batchAddr)} marked destroyed! Tx: ${formatHash(txHash)}`, type: STATUS_TYPE.SUCCESS });
    }, []);
    const handleDestroyError = useCallback((msg) => { if (msg === null) return; setStatus({ message: `QC Action Failed: ${msg}`, type: STATUS_TYPE.ERROR }); }, []);

    // --- Render Logic ---
    if (!account) return <p className={styles.infoMessage}>Please connect your wallet.</p>;
    if (!isDistributor) return <p className={styles.errorMessage}>Access Denied: Requires '{getRoleName(ROLES.DISTRIBUTOR_ROLE)}' role.</p>;

    return (
        <div className={styles.dashboardContainer}>
            <h2 className={styles.title}>Distributor Dashboard</h2>
            <p className={styles.description}>Receive Medicine batches and manage transfers to Customers.</p>

            {/* Location Section */}
            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Current Location </h3>
                <div className={styles.locationInputs}>
                    <div className={styles.formGroup}>
                        <label htmlFor="dist-lat" className={styles.formLabel}>Latitude:</label>
                        <input id="dist-lat" className={styles.formInput} type="number" step="any" value={location.latitude} onChange={(e) => setLocation(p => ({ ...p, latitude: e.target.value }))} required placeholder="e.g., 40.7128" aria-label="Current Latitude" disabled={isFetchingLocation}/>
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="dist-lon" className={styles.formLabel}>Longitude:</label>
                        <input id="dist-lon" className={styles.formInput} type="number" step="any" value={location.longitude} onChange={(e) => setLocation(p => ({ ...p, longitude: e.target.value }))} required placeholder="e.g., -74.0060" aria-label="Current Longitude" disabled={isFetchingLocation}/>
                    </div>
                    <button onClick={getLocation} className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={isFetchingLocation || isGlobalLoading} aria-label="Get current GPS location">
                        {isFetchingLocation ? <><span className={styles.spinner}></span>Getting...</> : 'Get GPS'}
                    </button>
                </div>
                 {!location.latitude || !location.longitude ? <p className={styles.locationWarning}>Valid location coordinates are required for most actions.</p> : null}
            </section>

            {/* Navigation Tabs */}
            <nav className={styles.nav}>
                 {Object.entries({ // Define labels directly
                     [VIEWS.RECEIVE_MED]: 'Receive Medicine',
                     [VIEWS.TRANSFER_MED]: 'Transfer to Customer',
                     [VIEWS.DESTROY]: 'Mark Destroyed',
                     [VIEWS.VIEW_BATCH]: 'View Batch Info',
                 }).map(([key, label]) => (
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
                        <div className={styles.statusContent}>
                            {status.message || `Error: ${web3Error}`}
                        </div>
                    </div>
                 )}
             </div>

            {/* Main Content Area */}
            <div className={styles.contentArea}>
                {/* View: Receive Medicine */}
                {currentView === VIEWS.RECEIVE_MED && (
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Receive Medicine Package</h3>
                        <p className={styles.sectionBody}>Enter the address of the Medicine batch sent by a Wholesaler.</p>
                        <div className={styles.inputGroupInline}>
                             <label htmlFor="receive-med-addr-dist" className={styles.formLabelInline}>Batch Address:</label>
                            <input id="receive-med-addr-dist" className={styles.formInput} type="text" placeholder="Medicine Batch Address (0x...)" value={batchAddressInput} onChange={(e) => setBatchAddressInput(e.target.value)} required pattern={ADDRESS_REGEX_SOURCE} disabled={isGlobalLoading}/>
                        </div>
                        <ReceivePackageButton
                            batchAddress={batchAddressInput}
                            expectedReceiverRole={ROLES.DISTRIBUTOR_ROLE} // Role required to receive at this stage
                            latitude={location.latitude} // Pass current location
                            longitude={location.longitude} // Pass current location
                            onSuccess={handleReceivePackageSuccess}
                            onError={handleReceivePackageError}
                        />
                    </section>
                )}

                {/* View: Transfer Medicine */}
                {currentView === VIEWS.TRANSFER_MED && (
                    <section className={styles.section}>
                        <TransferForm
                            batchTypeContext="MEDICINE"
                            allowedSenderRole={ROLES.DISTRIBUTOR_ROLE} // Distributor initiates transfer to Customer
                            latitude={location.latitude} // Pass current location
                            longitude={location.longitude} // Pass current location
                            onSuccess={handleTransferSuccess}
                            onError={handleTransferError}
                        />
                    </section>
                 )}

                 {/* View: Destroy Batch */}
                 {currentView === VIEWS.DESTROY && (
                    <section className={styles.section}>
                         <MarkDestroyedForm
                            allowedDestroyerRoles={[ROLES.DISTRIBUTOR_ROLE, ROLES.ADMIN_ROLE]} // Distributor can destroy owned batches
                            batchTypeContext="MEDICINE"
                            latitude={location.latitude} // Pass current location
                            longitude={location.longitude} // Pass current location
                            onSuccess={handleDestroySuccess}
                            onError={handleDestroyError}
                        />
                    </section>
                )}

                {/* View: View/Audit Batch */}
                {currentView === VIEWS.VIEW_BATCH && (
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>View Batch Details & History</h3>
                         <div className={styles.viewBatchControls}>
                            <div className={styles.formGroup}>
                                <label htmlFor="view-batch-addr-dist" className={styles.formLabel}>Batch Address:</label>
                                <input id="view-batch-addr-dist" className={styles.formInput} type="text" placeholder="Enter Medicine Batch Address (0x...)" value={batchAddressInput} onChange={(e) => setBatchAddressInput(e.target.value)} pattern={ADDRESS_REGEX_SOURCE} aria-label="Batch Address to View" disabled={isAuditing}/>
                            </div>
                            <button onClick={fetchBatchData} className={`${styles.button} ${styles.buttonPrimary}`} disabled={isAuditing || isGlobalLoading || !ethers.isAddress(batchAddressInput)} aria-label="Fetch batch information">
                                {isAuditing ? <><span className={styles.spinner}></span>Fetching...</> : 'Fetch Info'}
                            </button>
                        </div>

                        {/* Display Audit Results */}
                        <div style={{ marginTop: '2rem' }}>
                            {isAuditing && (
                                <p className={styles.message + ' ' + styles.loadingMessage}><span className={styles.spinner}></span> Loading details...</p>
                            )}
                            {!isAuditing && batchData.details && (
                                <BatchDetails
                                    details={batchData.details} // Pass RAW structured data
                                    history={batchData.history} // Pass RAW history logs
                                />
                            )}
                            {/* Message for no data/error after search */}
                             {!isAuditing && !batchData.details && batchAddressInput && ethers.isAddress(batchAddressInput) && status.type !== STATUS_TYPE.LOADING && status.type !== STATUS_TYPE.IDLE && status.type !== STATUS_TYPE.INFO && (
                                <p className={`${styles.message} ${status.type === STATUS_TYPE.ERROR ? styles.errorMessage : styles.infoMessage}`}>
                                    {status.type === STATUS_TYPE.ERROR ? status.message : "No details found for this Medicine batch address."}
                                </p>
                            )}
                        </div>
                    </section>
                )}
            </div> {/* End Content Area */}
        </div> // End Dashboard Container
    );
}

// --- PropTypes (basic) ---
// DistributorDashboard.propTypes = {}; // No direct props

export default DistributorDashboard;