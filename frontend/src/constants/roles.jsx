// client/src/constants/roles.js
import { ethers } from 'ethers'; // Use ethers v6 syntax

// Define role names exactly as in Solidity (used for hashing)
const roleNames = [
    "ADMIN_ROLE",
    "SUPPLIER_ROLE",
    "TRANSPORTER_ROLE",
    "MANUFACTURER_ROLE",
    "WHOLESALER_ROLE",
    "DISTRIBUTOR_ROLE",
    "CUSTOMER_ROLE"
];

// Calculate keccak256 hashes for each role name using ethers v6 'id'
export const ROLES = roleNames.reduce((acc, roleName) => {
    // ethers.id provides keccak256('string') directly in v6
    acc[roleName] = ethers.id(roleName); // e.g., ROLES.ADMIN_ROLE = '0xdf8b4c52...'
    return acc;
}, {});

// Map hashes back to user-friendly names for UI display
export const ROLE_NAMES_MAP = Object.entries(ROLES).reduce((acc, [name, hash]) => {
    acc[hash] = name.replace('_ROLE', ''); // e.g., ROLE_NAMES_MAP['0xdf8b4c52...'] = "ADMIN"
    return acc;
}, {});

// Define which roles a user can typically "log in" as or select in the UI
export const AVAILABLE_LOGIN_ROLES = [
    ROLES.ADMIN_ROLE,
    ROLES.SUPPLIER_ROLE,
    ROLES.MANUFACTURER_ROLE,
    ROLES.WHOLESALER_ROLE,
    ROLES.DISTRIBUTOR_ROLE,
    ROLES.CUSTOMER_ROLE,
    ROLES.TRANSPORTER_ROLE
];

// Helper to get role name from hash
export const getRoleName = (hash) => ROLE_NAMES_MAP[hash] || 'Unknown Role';

// Helper to get role hash from name (e.g., "ADMIN")
export const getRoleHash = (name) => ROLES[`${name.toUpperCase()}_ROLE`];

// For debugging: Log the generated hashes
console.log("Calculated Role Hashes (ethers v6):", ROLES);
console.log("Role Name Map:", ROLE_NAMES_MAP);