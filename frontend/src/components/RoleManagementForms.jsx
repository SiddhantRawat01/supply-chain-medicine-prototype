import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { ROLES, getRoleName } from '../constants/roles';
import { ethers } from 'ethers';
import '../styles/RoleManagementForms.css'; // Ensure this path is correct

// Constants for form IDs and names for accessibility and testing
const FORM_IDS = {
    GRANT_ROLE: 'grant-role-form',
    REVOKE_ROLE: 'revoke-role-form',
    SET_ADMIN: 'set-role-admin-form',
    TRANSFER_OWNERSHIP: 'transfer-ownership-form',
    GRANT_SELECT: 'grant-role-select',
    GRANT_TARGET: 'grant-role-target',
    REVOKE_SELECT: 'revoke-role-select',
    REVOKE_TARGET: 'revoke-role-target',
    MODIFY_SELECT: 'modify-role-select',
    NEW_ADMIN_SELECT: 'new-admin-select',
    NEW_OWNER_INPUT: 'new-owner-addr',
    OWNERSHIP_CONFIRM: 'ownership-confirm-checkbox',
};

function RoleManagementForms() {
    const {
        contract,
        account,
        isLoading,
        setIsLoading,
        getRevertReason,
        setError,
        hasRole,
        error: web3Error // Renamed for clarity to avoid conflict
    } = useWeb3();

    // --- State ---
    const [grantRole, setGrantRole] = useState('');
    const [grantTarget, setGrantTarget] = useState('');
    const [revokeRole, setRevokeRole] = useState('');
    const [revokeTarget, setRevokeTarget] = useState('');
    const [modifyRole, setModifyRole] = useState('');
    const [newAdminRole, setNewAdminRole] = useState('');
    const [newOwner, setNewOwner] = useState('');
    const [isOwner, setIsOwner] = useState(false);
    const [formStatus, setFormStatus] = useState(''); // General status/feedback message
    const [formError, setFormError] = useState(''); // Specific form error message
    const [ownershipConfirmed, setOwnershipConfirmed] = useState(false); // State for transfer ownership confirmation

    // --- Derived State ---
    const isAdmin = hasRole(ROLES.ADMIN_ROLE);
    const isOwnerOrAdmin = isOwner || isAdmin;
    const canGrantSelectedRole = grantRole === ROLES.ADMIN_ROLE ? isOwner : isAdmin;
    const canRevokeSelectedRole = revokeRole === ROLES.ADMIN_ROLE ? isOwner : isAdmin;

    // --- Effects ---
    const fetchOwner = useCallback(async () => {
        if (contract && account) {
            try {
                // No need to set loading here if context handles global loading
                const ownerAddress = await contract.owner();
                setIsOwner(ownerAddress.toLowerCase() === account.toLowerCase());
            } catch (err) {
                console.error("Failed to fetch owner:", err);
                setIsOwner(false);
                // Use the context error setter for consistency
                setError("Could not verify contract ownership status.");
            }
        } else {
            setIsOwner(false);
        }
    }, [contract, account, setError]); // Removed setIsLoading if context handles it

    useEffect(() => {
        fetchOwner();
    }, [fetchOwner]);

    // Clear specific form states + general status/error
    const clearFormStates = () => {
        setGrantRole(''); setGrantTarget('');
        setRevokeRole(''); setRevokeTarget('');
        setModifyRole(''); setNewAdminRole('');
        setNewOwner('');
        setFormStatus('');
        setFormError('');
        setError(null); // Clear global context error too
        setOwnershipConfirmed(false); // Reset confirmation checkbox
    };

    // --- Helper Functions ---
    const handleFormSubmit = async (action, successMessage, ...args) => {
        setFormStatus(''); // Clear previous status
        setFormError(''); // Clear previous form error
        setError(null);   // Clear global error
        setIsLoading(true);

        try {
            const tx = await action(...args);
            setFormStatus(`Transaction sent: ${tx.hash}. Waiting for confirmation...`);
            await tx.wait();
            setFormStatus(successMessage);
            clearFormStates(); // Reset forms on success
        } catch (err) {
            const reason = getRevertReason(err);
            console.error("Transaction failed:", reason, err);
            setFormError(`Error: ${reason}`); // Set specific form error
            setFormStatus(''); // Clear general status on error
        } finally {
            setIsLoading(false);
        }
    };

    // --- Event Handlers ---
    const handleGrantRole = async (e) => {
        e.preventDefault();
        if (!contract || !grantRole || !ethers.isAddress(grantTarget)) {
            setFormError("Invalid input. Please select a role and enter a valid address.");
            return;
        }
        if (!canGrantSelectedRole) {
            setFormError("You do not have permission to grant this role.");
            return;
        }

        setFormStatus(`Granting ${getRoleName(grantRole)} role...`);
        await handleFormSubmit(
            contract.grantRole,
            `Success! ${getRoleName(grantRole)} role granted to ${grantTarget}.`,
            grantRole,
            grantTarget
        );
    };

    const handleRevokeRole = async (e) => {
        e.preventDefault();
        if (!contract || !revokeRole || !ethers.isAddress(revokeTarget)) {
            setFormError("Invalid input. Please select a role and enter a valid address.");
            return;
        }
         if (!canRevokeSelectedRole) {
            setFormError("You do not have permission to revoke this role.");
            return;
        }

        setFormStatus(`Revoking ${getRoleName(revokeRole)} role...`);
        await handleFormSubmit(
            contract.revokeRole,
            `Success! ${getRoleName(revokeRole)} role revoked from ${revokeTarget}.`,
            revokeRole,
            revokeTarget
        );
    };

    const handleSetRoleAdmin = async (e) => {
        e.preventDefault();
        if (!contract || !modifyRole || !newAdminRole) {
            setFormError("Invalid input. Please select both the role to modify and the new admin role.");
            return;
        }
         if (!isOwner) {
             setFormError("Permission denied. Only the owner can set role admins.");
             return;
         }

        setFormStatus(`Setting admin for ${getRoleName(modifyRole)} role...`);
        await handleFormSubmit(
            contract.setRoleAdmin,
            `Success! Admin for ${getRoleName(modifyRole)} role updated to ${getRoleName(newAdminRole)}.`,
            modifyRole,
            newAdminRole
        );
    };

    const handleTransferOwnership = async (e) => {
        e.preventDefault();
        if (!contract || !ethers.isAddress(newOwner)) {
            setFormError("Invalid input. Please enter a valid new owner address.");
            return;
        }
        if (!isOwner) {
            setFormError("Permission denied. Only the current owner can transfer ownership.");
            return;
        }
        if (!ownershipConfirmed) {
            setFormError("Please confirm that you understand this action is irreversible.");
            return;
        }

        setFormStatus("Initiating ownership transfer...");
        await handleFormSubmit(
            contract.transferOwnership,
            "Ownership transfer initiated successfully! The new owner must accept.",
            newOwner
        );
        // Refresh owner status optimistically, although it won't change until accepted
        // Or better, rely on UI cues that transfer is pending.
        fetchOwner();
    };

    // --- Role Options Filtering ---
    // Filter out the Admin role unless the user is the Owner
    const availableGrantRevokeRoles = Object.entries(ROLES).filter(
        ([_, hash]) => hash !== ROLES.ADMIN_ROLE || isOwner
    );

    // Filter out roles that cannot have their admin changed (e.g., DEFAULT_ADMIN_ROLE itself)
    const availableModifyRoles = Object.entries(ROLES).filter(
        ([_, hash]) => hash !== ROLES.ADMIN_ROLE // Often ADMIN_ROLE cannot have its admin changed
    );

    // All roles can potentially be an admin role
    const availableAdminRoles = Object.entries(ROLES);


    // --- Render ---
    return (
        <div className="role-management-container">
            <h2>Role Management</h2>

            {/* Status and Error Display Area */}
            {formStatus && <div className="status-message info">{formStatus}</div>}
            {formError && <div className="status-message error">{formError}</div>}
            {web3Error && <div className="status-message error">{web3Error}</div>} {/* Display global context error */}


            <div className="forms-grid">
                {/* --- Grant Role Form --- */}
                <form onSubmit={handleGrantRole} id={FORM_IDS.GRANT_ROLE} className="form-card">
                    <h3 className="form-title">Grant Role</h3>
                    <div className="form-group">
                        <label htmlFor={FORM_IDS.GRANT_SELECT}>Role to Grant:</label>
                        <select
                            id={FORM_IDS.GRANT_SELECT}
                            value={grantRole}
                            onChange={e => setGrantRole(e.target.value)}
                            required
                            disabled={!isOwnerOrAdmin || isLoading}
                        >
                            <option value="">-- Select Role --</option>
                            {availableGrantRevokeRoles.map(([name, hash]) => (
                                <option key={hash} value={hash}>
                                    {getRoleName(hash)} {hash === ROLES.ADMIN_ROLE ? "(Owner Only)" : ""}
                                </option>
                            ))}
                        </select>
                        {!isOwner && grantRole === ROLES.ADMIN_ROLE && (
                             <p className="permission-notice error">Only Owner can grant ADMIN role.</p>
                        )}
                    </div>

                    <div className="form-group">
                        <label htmlFor={FORM_IDS.GRANT_TARGET}>Target Address:</label>
                        <input
                            id={FORM_IDS.GRANT_TARGET}
                            type="text"
                            value={grantTarget}
                            onChange={e => setGrantTarget(e.target.value)}
                            placeholder="0x..."
                            required
                            pattern="^0x[a-fA-F0-9]{40}$"
                            title="Enter a valid Ethereum address (0x...)"
                            disabled={!isOwnerOrAdmin || isLoading}
                        />
                    </div>

                    <button
                        type="submit"
                        className="button-primary"
                        disabled={isLoading || !isOwnerOrAdmin || !canGrantSelectedRole}
                    >
                        {isLoading ? 'Processing...' : 'Grant Role'}
                    </button>
                </form>

                {/* --- Revoke Role Form --- */}
                <form onSubmit={handleRevokeRole} id={FORM_IDS.REVOKE_ROLE} className="form-card">
                    <h3 className="form-title">Revoke Role</h3>
                    <div className="form-group">
                        <label htmlFor={FORM_IDS.REVOKE_SELECT}>Role to Revoke:</label>
                        <select
                            id={FORM_IDS.REVOKE_SELECT}
                            value={revokeRole}
                            onChange={e => setRevokeRole(e.target.value)}
                            required
                            disabled={!isOwnerOrAdmin || isLoading}
                        >
                            <option value="">-- Select Role --</option>
                            {availableGrantRevokeRoles.map(([name, hash]) => (
                                <option key={hash} value={hash}>
                                    {getRoleName(hash)} {hash === ROLES.ADMIN_ROLE ? "(Owner Only)" : ""}
                                </option>
                            ))}
                        </select>
                         {!isOwner && revokeRole === ROLES.ADMIN_ROLE && (
                             <p className="permission-notice error">Only Owner can revoke ADMIN role.</p>
                        )}
                    </div>

                    <div className="form-group">
                        <label htmlFor={FORM_IDS.REVOKE_TARGET}>Target Address:</label>
                        <input
                            id={FORM_IDS.REVOKE_TARGET}
                            type="text"
                            value={revokeTarget}
                            onChange={e => setRevokeTarget(e.target.value)}
                            placeholder="0x..."
                            required
                            pattern="^0x[a-fA-F0-9]{40}$"
                            title="Enter a valid Ethereum address (0x...)"
                            disabled={!isOwnerOrAdmin || isLoading}
                        />
                    </div>

                    <button
                        type="submit"
                        className="button-danger" // Use danger style for revoke
                        disabled={isLoading || !isOwnerOrAdmin || !canRevokeSelectedRole}
                    >
                        {isLoading ? 'Processing...' : 'Revoke Role'}
                    </button>
                </form>
            </div>

            {/* --- Owner-Only Section --- */}
            <div className="owner-section">
                 <h3 className="section-title">Owner Controls</h3>
                {isOwner ? (
                    <div className="forms-grid">
                        {/* --- Set Role Admin Form --- */}
                        <form onSubmit={handleSetRoleAdmin} id={FORM_IDS.SET_ADMIN} className="form-card owner-form">
                            <h4 className="form-title">🛠️ Set Role Admin</h4>
                            <div className="form-group">
                                <label htmlFor={FORM_IDS.MODIFY_SELECT}>Role to Modify:</label>
                                <select
                                    id={FORM_IDS.MODIFY_SELECT}
                                    value={modifyRole}
                                    onChange={e => setModifyRole(e.target.value)}
                                    required
                                    disabled={isLoading}
                                >
                                    <option value="">-- Select Role --</option>
                                    {availableModifyRoles.map(([name, hash]) => (
                                        <option key={hash} value={hash}>
                                            {getRoleName(hash)} ({name})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label htmlFor={FORM_IDS.NEW_ADMIN_SELECT}>New Admin Role:</label>
                                <select
                                    id={FORM_IDS.NEW_ADMIN_SELECT}
                                    value={newAdminRole}
                                    onChange={e => setNewAdminRole(e.target.value)}
                                    required
                                    disabled={isLoading}
                                >
                                    <option value="">-- Select Admin Role --</option>
                                    {availableAdminRoles.map(([name, hash]) => (
                                        <option key={hash} value={hash}>
                                            {getRoleName(hash)} ({name})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button
                                type="submit"
                                className="button-primary"
                                disabled={isLoading}
                            >
                                {isLoading ? 'Updating...' : 'Set Role Admin'}
                            </button>
                        </form>

                        {/* --- Transfer Ownership Form --- */}
                        <form onSubmit={handleTransferOwnership} id={FORM_IDS.TRANSFER_OWNERSHIP} className="form-card owner-form danger-zone">
                            <h4 className="form-title">⚠️ Transfer Ownership</h4>
                            <div className="form-group">
                                <label htmlFor={FORM_IDS.NEW_OWNER_INPUT}>New Owner Address:</label>
                                <input
                                    id={FORM_IDS.NEW_OWNER_INPUT}
                                    type="text"
                                    value={newOwner}
                                    onChange={e => setNewOwner(e.target.value)}
                                    required
                                    pattern="^0x[a-fA-F0-9]{40}$"
                                    title="Enter a valid Ethereum address (0x...)"
                                    disabled={isLoading}
                                    placeholder="0x..."
                                    className="danger-input" // Specific styling if needed
                                />
                            </div>

                            <div className="ownership-warning">
                                <p><strong>🚨 Critical Action Verification 🚨</strong></p>
                                <ul>
                                    <li>This action is irreversible once accepted by the new owner.</li>
                                    <li>You will lose all owner privileges.</li>
                                    <li>The new owner must explicitly accept the ownership transfer.</li>
                                </ul>
                            </div>

                            <div className="form-group confirmation-check">
                                <label htmlFor={FORM_IDS.OWNERSHIP_CONFIRM}>
                                    <input
                                        id={FORM_IDS.OWNERSHIP_CONFIRM}
                                        type="checkbox"
                                        checked={ownershipConfirmed}
                                        onChange={(e) => setOwnershipConfirmed(e.target.checked)}
                                        required
                                        disabled={isLoading}
                                    />
                                    I understand this action is critical and irreversible.
                                </label>
                            </div>

                            <button
                                type="submit"
                                className="button-danger"
                                disabled={isLoading || !ownershipConfirmed}
                            >
                                {isLoading ? 'Transferring...' : 'Confirm Ownership Transfer'}
                            </button>
                        </form>
                    </div>
                ) : (
                    <div className="owner-locked-message">
                        <p>🔒 These controls are available only to the contract owner.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default RoleManagementForms;