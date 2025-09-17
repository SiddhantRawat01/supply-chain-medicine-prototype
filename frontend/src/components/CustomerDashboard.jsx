// client/src/components/CustomerDashboard.jsx // Rename to .jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
// PropTypes removed - not used
import { useWeb3 } from '../contexts/Web3Context';
import ReceivePackageButton from './ReceivePackageButton';
import BatchDetails from './BatchDetails'; // Import BatchDetails component
// Only import formatters needed directly in THIS dashboard
import { formatAddress, formatHash } from './BatchDetails';
import { ethers } from 'ethers';
import { ROLES, getRoleName } from '../constants/roles';
import styles from '../styles/CustomerDashboard.module.css'; // Import CSS Module

// --- Constants ---
const VIEWS = { RECEIVE_MED: 'receiveMed', FINALIZE: 'finalize', VIEW_BATCH: 'view' };
const STATUS_TYPE = { IDLE: 'idle', INFO: 'info', ERROR: 'error', SUCCESS: 'success', LOADING: 'loading' };
const ADDRESS_REGEX_SOURCE = '^0x[a-fA-F0-9]{40}$';
const COORD_DECIMALS = 6;
const MEDICINE_TYPE_HASH = ethers.id("MEDICINE");

// --- Placeholder Icons ---
const CheckCircleIcon = () => <svg className={styles.statusIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>;
const ErrorIcon = () => <svg className={styles.statusIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>;
const InfoIcon = () => <svg className={styles.statusIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>;
// --- End Placeholder Icons ---
// --- Add the specific error selector constant ---
const INVALID_STATE_SELECTOR = "0x5acbda74"; // Corresponds to SCInvalidStateForAction


function CustomerDashboard() {
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
    const [isAuditing, setIsAuditing] = useState(false); // Loading for audit
    const [isFinalizing, setIsFinalizing] = useState(false); // Loading for finalize

    // --- Derived State & Memoization ---
    const isCustomer = useMemo(() => hasRole(ROLES.CUSTOMER_ROLE), [hasRole]);

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
    const handleReceivePackageError = useCallback((msg) => {  
        if (msg === null) {
                return; 
        } 
        setStatus({ message: `Intake Error: ${msg}`, 
                    type: STATUS_TYPE.ERROR 
        }); 
    }, []);

    const handleReceivePackageSuccess = useCallback((addr, txHash) => {  
        setStatus({ message: `Raw Material ${formatAddress(addr)} received. Tx: ${formatHash(txHash)}`, 
                    type: STATUS_TYPE.SUCCESS 
        }); 
        setBatchAddressInput(''); 
    }, []);

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
            // Customers primarily interact with Medicine
            if (typeHash !== MEDICINE_TYPE_HASH) throw new Error("Expected a Medicine batch.");

            const [rawDetailsResult, rawHistoryResult] = await Promise.all([
                executeRead(() => contract.getMedicineDetails(batchAddressInput)),
                executeRead(() => contract.getTransactionHistory(batchAddressInput))
            ]);

            // Store RAW data
            const rawDetailsObject = {
                type: 'Medicine', batchAddress: batchAddressInput, description: rawDetailsResult[0],
                quantity: rawDetailsResult[1], rawMaterialBatchIds: rawDetailsResult[2],
                manufacturer: rawDetailsResult[3], creationTime: rawDetailsResult[4],
                expiryDate: rawDetailsResult[5], statusValue: rawDetailsResult[6],
                currentOwner: rawDetailsResult[7], currentTransporter: rawDetailsResult[8],
                currentDestination: rawDetailsResult[9], lastUpdateTime: rawDetailsResult[10],
            };
            const rawHistoryLogs = rawHistoryResult;

            setBatchData({ details: rawDetailsObject, history: rawHistoryLogs });
            setStatus({ message: `Medicine batch data loaded.`, type: STATUS_TYPE.SUCCESS });

        } catch (err) {
            console.error("Fetch Batch Data Error:", err);
            const reason = getRevertReason(err);
            const errorMessage = `Fetch Failed: ${reason || err.message}`;
            setStatus({ message: errorMessage, type: STATUS_TYPE.ERROR });
            setBatchData({ details: null, history: [] });
        } finally {
            setIsAuditing(false);
        }
    }, [ contract, batchAddressInput, getRevertReason, clearStatusAndError, fetchWithLoading ]);

    // --- *** MODIFIED handleFinalize *** ---
    const handleFinalize = useCallback(async (batchToFinalize) => {
        clearStatusAndError();
        const currentLatitude = location.latitude; // Use state value
        const currentLongitude = location.longitude; // Use state value

        if (!contract || !account) { setStatus({ message: "Wallet/contract issue.", type: STATUS_TYPE.ERROR }); return; }
        if (!ethers.isAddress(batchToFinalize)) { setStatus({ message: "Invalid batch address provided.", type: STATUS_TYPE.ERROR }); return; }
        if (!currentLatitude || !currentLongitude || isNaN(Number(currentLatitude)) || isNaN(Number(currentLongitude))) {
            setStatus({ message: "Valid location coordinates are required to finalize.", type: STATUS_TYPE.ERROR });
            return;
        }

        setIsFinalizing(true);
        setStatus({ message: `Finalizing batch ${formatAddress(batchToFinalize)}...`, type: STATUS_TYPE.LOADING });

        try {
            const latScaled = ethers.parseUnits(currentLatitude, COORD_DECIMALS);
            const lonScaled = ethers.parseUnits(currentLongitude, COORD_DECIMALS);

            // Optional estimateGas
            try { await contract.finalizeMedicineBatch.estimateGas(batchToFinalize, latScaled, lonScaled); }
            catch (estimateError) { throw estimateError; }

            const tx = await contract.finalizeMedicineBatch(batchToFinalize, latScaled, lonScaled);
            // ... (wait for receipt, handle success) ...
            const receipt = await tx.wait(1);
            const finalTxHash = receipt.hash;

            if (receipt.status === 0) {
                 const reason = await getRevertReason(receipt.hash);
                 throw new Error(`Transaction reverted${reason ? ': ' + reason : ''} (Tx: ${formatHash(finalTxHash)})`);
             }
             setStatus({ message: `Batch ${formatAddress(batchToFinalize)} Finalized! Tx: ${formatHash(finalTxHash)}`, type: STATUS_TYPE.SUCCESS })


            // Refresh details IF the finalized batch is the one currently being viewed
             if (currentView === VIEWS.VIEW_BATCH && batchToFinalize === batchAddressInput) {
                 // Delay slightly before refetching to allow state update propagation if needed
                 setTimeout(fetchBatchData, 500);
             }
             // Clear input only IF in the finalize view and this batch was finalized
             if (currentView === VIEWS.FINALIZE && batchToFinalize === batchAddressInput) {
                setBatchAddressInput('');
             }

        } catch (err) {
            console.error("Finalize Batch Error (Raw):", err);
            let reason = getRevertReason(err);
            let userErrorMessage = '';
            const errorData = err.data || err?.error?.data;
            const txHashForError = err?.transactionHash; // Get tx hash if available in error

            // --- Updated Error Message Logic ---
            if (typeof errorData === 'string' && errorData.startsWith(INVALID_STATE_SELECTOR)) {
                 // Specific message for the identified custom error
                 userErrorMessage = "Finalize Failed: Batch must be in 'At Customer' state.";
                 console.log("[Finalize] Identified InvalidStateForAction error.");
            } else if (reason) {
                // Standard revert string or other known custom error string
                userErrorMessage = `Finalize Failed: ${reason}`;
                 if (reason.includes("UnauthorizedActor") || reason.includes("CallerIsNotCurrentOwner")) userErrorMessage = "Finalize Failed: You are not the current owner.";
                 else if (err.message?.includes("reverted")) userErrorMessage = `Finalize Failed: Transaction reverted. ${reason}`;
            } else if (err.message?.includes("reverted")) {
                 userErrorMessage = `Finalize Failed: Transaction reverted (check console for details).`;
            } else {
                 userErrorMessage = `Finalize Failed: ${err.message || 'An unknown error occurred.'}`;
            }

             // Append Tx Hash if available
            if (txHashForError) {
                 userErrorMessage += ` (Tx: ${formatHash(txHashForError)})`;
            }

            console.error("[Finalize] Setting Error Status:", userErrorMessage);
            setStatus({ message: userErrorMessage, type: STATUS_TYPE.ERROR });
            // setGlobalError(userErrorMessage); // Optional

        } finally {
            setIsFinalizing(false);
        }
    }, [ /* ... dependencies ... */
        contract, account, location, getRevertReason, clearStatusAndError,
        fetchBatchData, currentView, batchAddressInput
    ]);

    // --- Effects ---
    useEffect(() => { getLocation(); }, [getLocation]);

    useEffect(() => { // Reset state on view change
        setBatchAddressInput('');
        setBatchData({ details: null, history: [] });
        setIsAuditing(false); // Reset audit loading
        setIsFinalizing(false); // Reset finalize loading
        clearStatusAndError();
    }, [currentView, clearStatusAndError]);

    // --- Render Logic ---
    if (!account) return <p className={styles.infoMessage}>Please connect your wallet.</p>;
    // Role check might be optional depending on requirements
    if (!isCustomer) return <p className={styles.errorMessage}>Access Denied: Requires '{getRoleName(ROLES.CUSTOMER_ROLE)}' context.</p>;

    // Determine if finalize action is possible (basic checks)
    const canAttemptFinalize = ethers.isAddress(batchAddressInput) && !!location.latitude && !!location.longitude;

    return (
        <div className={styles.dashboardContainer}>
            <h2 className={styles.title}>Customer Dashboard</h2>
            <p className={styles.description}>Receive deliveries and manage your Medicine batches.</p>

            {/* Location Section */}
            <section className={styles.section}>
                 <h3 className={styles.sectionTitle}>Current Location</h3>
                 <div className={styles.locationInputs}>
                    {/* Latitude Input */}
                     <div className={styles.formGroup}>
                         <label htmlFor="cust-lat" className={styles.formLabel}>Latitude:</label>
                         <input id="cust-lat" className={styles.formInput} type="number" step="any" value={location.latitude} onChange={(e) => setLocation(p => ({ ...p, latitude: e.target.value }))} required placeholder="e.g., 40.7128" aria-label="Current Latitude" disabled={isFetchingLocation}/>
                     </div>
                     {/* Longitude Input */}
                    <div className={styles.formGroup}>
                        <label htmlFor="cust-lon" className={styles.formLabel}>Longitude:</label>
                        <input id="cust-lon" className={styles.formInput} type="number" step="any" value={location.longitude} onChange={(e) => setLocation(p => ({ ...p, longitude: e.target.value }))} required placeholder="e.g., -74.0060" aria-label="Current Longitude" disabled={isFetchingLocation}/>
                    </div>
                    {/* Get GPS Button */}
                    <button onClick={getLocation} className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={isFetchingLocation || isGlobalLoading} aria-label="Get current GPS location">
                        {isFetchingLocation ? <><span className={styles.spinner}></span>Getting...</> : 'Get GPS'}
                    </button>
                 </div>
                  {(!location.latitude || !location.longitude) && <p className={styles.locationWarning}>Valid location coordinates are required for receiving or finalizing.</p>}
            </section>

            {/* Navigation Tabs */}
            <nav className={styles.nav}>
                 {Object.entries({ // Define labels directly
                     [VIEWS.RECEIVE_MED]: 'Receive Medicine',
                     [VIEWS.FINALIZE]: 'Finalize (Consume/Sell)',
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
                        <div className={styles.statusContent}>{status.message || `Error: ${web3Error}`}</div>
                    </div>
                 )}
             </div>


            {/* Main Content Area */}
            <div className={styles.contentArea}>

                {/* View: Receive Medicine */}
                {currentView === VIEWS.RECEIVE_MED && (
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Receive Medicine Package</h3>
                        <p className={styles.sectionBody}>Enter the address of the Medicine batch delivered to you.</p>
                        <div className={styles.inputGroupInline}>
                             <label htmlFor="receive-med-addr-cust" className={styles.formLabelInline}>Batch Address:</label>
                            <input id="receive-med-addr-cust" className={styles.formInput} type="text" placeholder="Medicine Batch Address (0x...)" value={batchAddressInput} onChange={(e) => setBatchAddressInput(e.target.value)} required pattern={ADDRESS_REGEX_SOURCE} disabled={isGlobalLoading}/>
                        </div>
                        <ReceivePackageButton
                            batchAddress={batchAddressInput}
                            expectedReceiverRole={ROLES.CUSTOMER_ROLE} // Customer is the final receiver
                            latitude={location.latitude} // Pass current location state
                            longitude={location.longitude} // Pass current location state
                            onSuccess={handleReceivePackageSuccess} // Use stable callback
                            onError={handleReceivePackageError}     // Use stable callback
                        />
                    </section>
                )}

                {/* View: Finalize Batch */}
                {currentView === VIEWS.FINALIZE && (
                     <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>Finalize Medicine Batch</h3>
                        <p className={styles.sectionBody}>Mark a batch you possess as consumed or sold (requires 'At Customer' state).</p>
                        <div className={styles.inputGroupInline}>
                            <label htmlFor="finalize-batch-addr" className={styles.formLabelInline}>Batch Address:</label>
                             <input id="finalize-batch-addr" className={styles.formInput} type="text" placeholder="Medicine Batch Address (0x...)" value={batchAddressInput} onChange={(e) => setBatchAddressInput(e.target.value)} required pattern={ADDRESS_REGEX_SOURCE} disabled={isFinalizing || isGlobalLoading}/>
                        </div>
                         <button
                            onClick={() => handleFinalize(batchAddressInput)}
                            // Disable if finalizing, globally loading, address/location invalid
                            disabled={isFinalizing || isGlobalLoading || !canAttemptFinalize}
                            className={`${styles.button} ${styles.finalizeButton}`} // Specific style for finalize
                         >
                             {isFinalizing ? <><span className={styles.spinner}></span>Finalizing...</> : 'Mark Batch Finalized'}
                         </button>
                         {!location.latitude || !location.longitude ? <p className={styles.formHintWarning}>Requires current location coordinates.</p> : null}
                    </section>
                )}


                {/* View: View/Audit Batch */}
                {currentView === VIEWS.VIEW_BATCH && (
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>View Batch Details & History</h3>
                         <div className={styles.viewBatchControls}>
                            <div className={styles.formGroup}>
                                <label htmlFor="view-batch-addr-cust" className={styles.formLabel}>Batch Address:</label>
                                <input id="view-batch-addr-cust" className={styles.formInput} type="text" placeholder="Enter Medicine Batch Address (0x...)" value={batchAddressInput} onChange={(e) => setBatchAddressInput(e.target.value)} pattern={ADDRESS_REGEX_SOURCE} aria-label="Batch Address to View" disabled={isAuditing}/>
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
// CustomerDashboard.propTypes = {}; // No direct props

export default CustomerDashboard;