// client/src/DappLanding.js
import React from 'react';
import { Web3Provider, useWeb3 } from './contexts/Web3Context'; // Correct import
import Header from './components/Header';
import LandingPage from './components/LandingPage';
import AdminDashboard from './components/AdminDashboard';
import SupplierDashboard from './components/SupplierDashboard';
import ManufacturerDashboard from './components/ManufacturerDashboard';
import WholesalerDashboard from './components/WholesalerDashboard';
import DistributorDashboard from './components/DistributorDashboard';
import CustomerDashboard from './components/CustomerDashboard';
import TransporterDashboard from './components/TransporterDashboard';
import { ROLES, getRoleName } from './constants/roles';
// DappLanding.css has been consolidated into the main styles

// This component consumes the context
function AppContent() {
    // Call useWeb3() ONCE at the top level
    const { account, selectedRole, isLoading, error, networkError, hasRole, userRoles } = useWeb3();

    // This function uses the variables from the hook, it does NOT call the hook itself.
    const renderDashboard = () => {
        // Checks are performed using the variables from the hook called above
        if (isLoading) { /* Handle loading */ }
        if (networkError) { return <div className="error-message">{networkError}</div>; }
        if (error) { return <div className="error-message">Error: {error}</div>; }
        if (!account) { return <LandingPage />; }

        if (!selectedRole) {
             return (
                <div className="container info-message">
                    <h2>Welcome, {account.substring(0, 6)}...{account.substring(account.length - 4)}!</h2>
                    <p>Please select a role from the header menu.</p>
                     <p>Your roles: {Object.entries(userRoles) // Use userRoles from hook
                        .filter(([, has]) => has)
                        .map(([hash]) => getRoleName(hash))
                        .join(', ') || 'None'}
                    </p>
                    <p>
                    </p>
                 </div>
             );
        }
        if (!hasRole(selectedRole)) { // Use hasRole from hook
            return (
                <div className="container error-message">
                    <h2>Access Denied</h2>
                    <p>Account {account.substring(0, 6)}... lacks role ({getRoleName(selectedRole)}).</p>
                </div>
            );
        }

        switch (selectedRole) {
            case ROLES.ADMIN_ROLE: return <AdminDashboard />;
            case ROLES.SUPPLIER_ROLE: return <SupplierDashboard />;
            case ROLES.MANUFACTURER_ROLE: return <ManufacturerDashboard />;
            case ROLES.WHOLESALER_ROLE: return <WholesalerDashboard />;
            case ROLES.DISTRIBUTOR_ROLE: return <DistributorDashboard />;
            case ROLES.CUSTOMER_ROLE: return <CustomerDashboard />;
            case ROLES.TRANSPORTER_ROLE: return <TransporterDashboard />;
            default: return <div className="container error-message">Invalid role selected.</div>;
        }
    };

    // The main return of AppContent
    return (
        <div className="App">
            {isLoading && <div className="loading-overlay">Loading...</div>}
            <Header />
            <main className="main-content">
                {renderDashboard()} {/* Call the render function */}
            </main>
            <footer className="app-footer">
                <p>Network: {import.meta.env.VITE_APP_NETWORK_NAME || 'Unknown'} (ID: {import.meta.env.VITE_APP_NETWORK_ID || 'N/A'})</p>
                <p>Contract Address: {import.meta.env.VITE_APP_CONTRACT_ADDRESS || "NOT SET"}</p>
            </footer>
        </div>
    );
}

// Main DappLanding component provides the context
function DappLanding() {
    return (
        <Web3Provider>
            <AppContent />
        </Web3Provider>
    );
}

export default DappLanding;