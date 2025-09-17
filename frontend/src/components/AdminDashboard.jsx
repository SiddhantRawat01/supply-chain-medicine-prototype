// client/src/components/AdminDashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context'; // Import hook
import RoleManagementForms from './RoleManagementForms';
import { ethers } from 'ethers'; // Use ethers v6
import { ROLES } from '../constants/roles';

function AdminDashboard() {
    // Call hook ONCE at the top level to get context values
    const {
        account,
        contract,
        isLoading,
        setIsLoading,
        getRevertReason,
        setError, // Use setError from context
        hasRole,
        error: web3Error // Get potential errors from context
    } = useWeb3();

    // --- Component State ---
    const [view, setView] = useState('roles'); // Default view: Role Management
    const [statusMessage, setStatusMessage] = useState(''); // For local action feedback
    const [viewBatchAddr, setViewBatchAddr] = useState(''); // Used for viewing or destroying a specific batch
    const [batchDetails, setBatchDetails] = useState(null); // To store fetched batch details
    const [batchHistory, setBatchHistory] = useState([]); // To store fetched transaction history
    // Location state specifically for the destroy action
    const [destroyLatitude, setDestroyLatitude] = useState('');
    const [destroyLongitude, setDestroyLongitude] = useState('');

    // --- Role Check ---
    // Ensure the connected account has the ADMIN_ROLE
    const isAdmin = hasRole(ROLES.ADMIN_ROLE);

    // --- Helper Functions ---

    // Get device location (specifically for the destroy action)
    const getLocationForDestroy = useCallback(() => {
      setStatusMessage("Attempting to get location for destroy action...");
      setError(null); // Clear previous errors
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setDestroyLatitude(position.coords.latitude.toString());
            setDestroyLongitude(position.coords.longitude.toString());
            setStatusMessage("Location acquired for destroy action.");
            setTimeout(() => setStatusMessage(''), 3000); // Clear message
          },
          (error) => {
            console.error("Geolocation error:", error);
            setStatusMessage("Could not get location. Please enter manually for destroy action.");
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      } else {
        setStatusMessage("Geolocation not supported. Please enter location manually for destroy action.");
      }
    }, [setError]); // Dependency: setError

    // Fetch details for any batch (RM or Medicine)
    const fetchBatchData = useCallback(async () => {
        setStatusMessage(''); setError(null);
        if (!contract || !viewBatchAddr || !ethers.isAddress(viewBatchAddr)) { // v6 check
            setStatusMessage('Please enter a valid batch address.');
            return;
        }
        setIsLoading(true);
        setBatchDetails(null); setBatchHistory([]);
        setStatusMessage(`Fetching data for batch ${viewBatchAddr.substring(0,6)}...`);
        try {
            const type = await contract.batchType(viewBatchAddr);
            const rmTypeHash = ROLES.RAW_MATERIAL;
            const medTypeHash = ROLES.MEDICINE;

            if (type === ethers.ZeroHash) { // v6 check
                 throw new Error(`Batch address ${viewBatchAddr} not found.`);
            }

            let details;
            // Fetch details based on the detected type
            if (type === rmTypeHash) {
                details = await contract.getRawMaterialDetails(viewBatchAddr);
                details.type = 'RawMaterial';
            } else if (type === medTypeHash) {
                 details = await contract.getMedicineDetails(viewBatchAddr);
                 details.type = 'Medicine';
            } else {
                 console.warn(`Detected unknown batch type hash for admin view: ${type}`);
                 throw new Error(`Unknown or unsupported batch type found.`);
            }

            details.batchAddress = viewBatchAddr; // Add address for display consistency

            // Fetch transaction history regardless of type
            const history = await contract.getTransactionHistory(viewBatchAddr);

            setBatchDetails(details);
            setBatchHistory(history);
            setStatusMessage(`Details loaded for ${details.type} batch ${viewBatchAddr.substring(0,6)}...`);

        } catch (err) {
            console.error("Fetch Batch Data Error (Admin):", err);
            const reason = getRevertReason(err);
            setError(`Fetch Failed: ${reason}`);
            setStatusMessage(''); // Clear status on error
            setBatchDetails(null);
            setBatchHistory([]);
        } finally {
            setIsLoading(false);
        }
    }, [contract, viewBatchAddr, setIsLoading, setError, getRevertReason]); // Dependencies

    // Clear status message and global error
    const clearStatus = useCallback(() => {
        setStatusMessage('');
        setError(null);
    }, [setError]);

    // --- Effects ---

    // Reset view-specific states when the main view changes
    useEffect(() => {
        setViewBatchAddr(''); // Clear address input used in view/destroy
        setBatchDetails(null); // Clear fetched details
        setBatchHistory([]); // Clear history
        clearStatus(); // Clear messages/errors

        // If switching *to* the destroy view, attempt to get location
        if (view === 'destroy') {
            // Reset destroy location state initially
            setDestroyLatitude('');
            setDestroyLongitude('');
            // Then attempt to fetch it
            getLocationForDestroy();
        }
    }, [view, clearStatus, getLocationForDestroy]); // Dependencies

    // --- Render Logic ---

    // Early return if the connected account doesn't have the Admin role
    // This check happens AFTER hook calls, respecting Rules of Hooks
    if (!isAdmin) {
        return (
            <div className="dashboard">
                <p className="error-message">Access Denied. This area requires ADMIN_ROLE.</p>
            </div>
        );
    }

    // Main component JSX
    return (
        <div className="dashboard admin-dashboard">
            <h2>Admin Dashboard</h2>
            <p>Manage system roles & ownership, view any batch, and destroy batches if necessary.</p>

            {/* Navigation between Admin actions */}
            <nav className="dashboard-nav">
                <button onClick={() => setView('roles')} disabled={view === 'roles'}>Role Management</button>
            </nav>

            {/* Display Status/Error Messages */}
            {/* Show local status message or global error from context */}
            {statusMessage && !isLoading && <p className="info-message">{statusMessage}</p>}
            {web3Error && <p className="error-message">{web3Error}</p>}

            {/* Content Area based on selected view */}
            <div className="dashboard-content">
                {/* View: Role Management */}
                {view === 'roles' && (
                    <div className="dashboard-section">
                        {/* RoleManagementForms handles its own internal logic and layout */}
                        <RoleManagementForms />
                    </div>
                )}
            </div>
        </div>
    );
}

export default AdminDashboard;