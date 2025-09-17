// client/src/components/Header.js
import React, { useState, useEffect, useRef, useCallback } from 'react';

import { useWeb3 } from '../contexts/Web3Context';
// *** Imports are necessary because the component uses these values ***
import { AVAILABLE_LOGIN_ROLES, getRoleName } from '../constants/roles';
import ConnectWallet from './ConnectWallet';
import '../styles/Header.css'; // Import the CSS file

/**
 * Header Component
 *
 * Displays the application title, wallet connection status, and role selection mechanism.
 * Relies on Web3Context for account state, role information, and connection actions.
 */
function Header() {
    // --- Hooks ---
    const {
        account,          // Current connected account address
        selectedRole,     // Currently selected operational role hash
        setSelectedRole,  // Function to update the selected role in context
        hasRole,          // Function from context to check if account has a specific role
        disconnectWallet  // Function from context to disconnect wallet
    } = useWeb3();

    const [showRolesDropdown, setShowRolesDropdown] = useState(false);
    const dropdownRef = useRef(null); // Ref for detecting clicks outside dropdown

    // --- Event Handlers ---

    /** Toggles the visibility of the role selection dropdown */
    const toggleRolesDropdown = useCallback(() => {
        setShowRolesDropdown(prev => !prev);
    }, []);

    /** Handles selecting a role from the dropdown */
    const handleRoleSelect = useCallback((roleHash) => {
        setSelectedRole(roleHash); // Update context state
        setShowRolesDropdown(false); // Close dropdown
    }, [setSelectedRole]);

    /** Handles clearing the current role selection */
    const handleClearSelection = useCallback(() => {
        setSelectedRole(null); // Update context state
        setShowRolesDropdown(false); // Close dropdown
    }, [setSelectedRole]);

    /** Handles disconnecting the wallet */
    const handleDisconnect = useCallback(() => {
        disconnectWallet(); // Call context disconnect function
        setShowRolesDropdown(false); // Close dropdown
    }, [disconnectWallet]);

    /** Close dropdown if a click occurs outside of its referenced element */
    const handleClickOutside = useCallback((event) => {
        // Check if the click target is outside the dropdown menu
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
            setShowRolesDropdown(false);
        }
    }, []); // No dependencies needed other than the ref

    // --- Effects ---

    /** Effect to add/remove 'mousedown' event listener for closing the dropdown */
    useEffect(() => {
        if (showRolesDropdown) {
            // Add listener when dropdown is open
            document.addEventListener('mousedown', handleClickOutside);
        } else {
            // Remove listener when dropdown is closed
            document.removeEventListener('mousedown', handleClickOutside);
        }
        // Cleanup function to remove listener on component unmount or before re-running effect
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showRolesDropdown, handleClickOutside]); // Re-run effect if dropdown visibility or handler changes

    // --- Render Logic ---

    // Format account address for concise display
    const formattedAccount = account
        ? `${account.substring(0, 6)}...${account.substring(account.length - 4)}`
        : '';

    // Determine the display name for the currently selected role
    const selectedRoleName = selectedRole ? getRoleName(selectedRole) : "Select Role";

    return (
        <header className="header-component">
            <div className="header-component__container">
                <h1 className="header-component__brand">
                    <span className="header-component__brand-accent">Care</span>Pulse
                    <sup className="header-component__beta">BETA</sup>
                </h1>

                <div className="header-component__controls">
                    {account ? (
                        <div className="header-component__account-info" ref={dropdownRef}>
                            <div className="header-component__wallet-status">
                                <svg className="header-component__wallet-icon" viewBox="0 0 24 24">
                                    <path d="M12 1.5c-4.142 0-7.5 3.358-7.5 7.5 0 3.783 2.802 6.903 6.45 7.417V21h2.1v-4.583c3.648-.514 6.45-3.634 6.45-7.417 0-4.142-3.358-7.5-7.5-7.5zm0 12.75c-2.899 0-5.25-2.351-5.25-5.25S9.101 3.75 12 3.75s5.25 2.351 5.25 5.25-2.351 5.25-5.25 5.25z"/>
                                </svg>
                                <span className="header-component__wallet-address" title={account}>
                                    {formattedAccount}
                                </span>
                            </div>

                            <div className="header-component__role-selector">
                                <button
                                    onClick={toggleRolesDropdown}
                                    className="header-component__role-trigger"
                                    aria-haspopup="true"
                                    aria-expanded={showRolesDropdown}
                                >
                                    {selectedRoleName}
                                    <span className={`header-component__dropdown-indicator ${showRolesDropdown ? 'header-component__dropdown-indicator--active' : ''}`}>
                                        ▼
                                    </span>
                                </button>

                                {showRolesDropdown && (
                                    <div className="header-component__role-menu">
                                        <div className="header-component__role-menu-header">
                                            <h4>Available Roles</h4>
                                            <span className="header-component__role-hint">
                                                {formattedAccount}
                                            </span>
                                        </div>
                                        
                                        <div className="header-component__role-list">
                                            {AVAILABLE_LOGIN_ROLES.map(roleHash => {
                                                const userHasRole = hasRole(roleHash);
                                                if (!hasRole(roleHash)) return null;
                                                return (
                                                    <button
                                                        key={roleHash}
                                                        onClick={() => handleRoleSelect(roleHash)}
                                                        disabled={!userHasRole}
                                                        className={`header-component__role-item ${!userHasRole ? 'header-component__role-item--disabled' : ''}`}
                                                    >
                                                        {getRoleName(roleHash)}
                                                        {!userHasRole && (
                                                            <span className="header-component__role-permission">
                                                                <svg viewBox="0 0 24 24">
                                                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15H9v-2h2v2zm0-4H9V7h2v6z"/>
                                                                </svg>
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="header-component__role-actions">
                                            <button
                                                onClick={handleClearSelection}
                                                className="header-component__action-button header-component__action-button--secondary"
                                                disabled={!selectedRole}
                                            >
                                                Clear Role
                                            </button>
                                            <button
                                                onClick={handleDisconnect}
                                                className="header-component__action-button header-component__action-button--danger"
                                            >
                                                Disconnect
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <ConnectWallet />
                    )}
                </div>
            </div>
        </header>
    );
}



export default Header;