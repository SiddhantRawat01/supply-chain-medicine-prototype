// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Errors} from "../libraries/Errors.sol";

/**
 * @title AccessControlWithOwner 
 * @dev Strict role-based access with owner-as-admin enforcement
 */
contract AccessControlWithOwner {
    address public owner;
    mapping(bytes32 => mapping(address => bool)) internal _roles;
    mapping(bytes32 => bytes32) internal _roleAdmin;
    bool private _initialized;  // Simplified initialization guard

    // Roles (kept original names)
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant SUPPLIER_ROLE = keccak256("SUPPLIER_ROLE");
    bytes32 public constant TRANSPORTER_ROLE = keccak256("TRANSPORTER_ROLE");
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant WHOLESALER_ROLE = keccak256("WHOLESALER_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant CUSTOMER_ROLE = keccak256("CUSTOMER_ROLE");

    // Events (same structure)
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole);
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);

    modifier initializer() {
        if (_initialized) revert Errors.InitializationRejected();
        _initialized = true;
        _;
    }

    // INITIALIZATION
    function _initializeOwner(address initialOwner) internal virtual initializer {
        if(initialOwner == address(0)) revert Errors.AccessControlZeroAddress();
        owner = initialOwner;
        _initializeRoleAdminsInternal();
        emit OwnershipTransferred(address(0), initialOwner);
    }

    // CORE FUNCTIONS (preserved names with security fixes)
    function _grantRole(bytes32 role, address account, address sender) internal virtual {
        if( role == CUSTOMER_ROLE ) 
            revert Errors.AccessControlCannotManageCustomerRole();
        
        if(account == address(0)) revert Errors.AccessControlZeroAddress();
        
        // Authorization check

        if ( role == ADMIN_ROLE && sender != owner ){
            revert Errors.AccessControlOwnerOnly();
        }
        if(!_hasRole(_getRoleAdmin(role), sender)) 
                revert Errors.AccessControlInvalidAdminRole(sender, _getRoleAdmin(role));

        if(!_roles[role][account]) {
            _roles[role][account] = true;
            emit RoleGranted(role, account, sender);
        }
    }

    function _revokeRole(bytes32 role, address account, address sender) internal virtual {
        if(role == ADMIN_ROLE || role == CUSTOMER_ROLE) 
            revert Errors.AccessControlImmutableRole();
            
        if(account == address(0)) revert Errors.AccessControlZeroAddress();

        // Mirror _grantRole authorization checks

        if ( role == ADMIN_ROLE && sender != owner ){
            revert Errors.AccessControlOwnerOnly();
        }

        if(!_hasRole(_getRoleAdmin(role), sender)) {
            revert Errors.AccessControlInvalidAdminRole(sender, _getRoleAdmin(role));
        }

        if(_roles[role][account]) {
            _roles[role][account] = false;
            emit RoleRevoked(role, account, sender);
        }
    }

    // ADMIN MANAGEMENT (owner-only enforcement)
    function _setRoleAdmin(bytes32 role, bytes32 newAdminRole, address sender) internal virtual {
        if(role == ADMIN_ROLE) revert Errors.AccessControlImmutableRole();
        if(sender != owner) revert Errors.AccessControlOwnerOnly();
        bytes32 previousAdmin = _roleAdmin[role];
        if ( previousAdmin != newAdminRole || newAdminRole != CUSTOMER_ROLE ){
            _roleAdmin[role] = newAdminRole;
            emit RoleAdminChanged(role, previousAdmin, newAdminRole);
        } else{
            revert Errors.AccessControlInvalidAdminRole(sender, _getRoleAdmin(role));
        }
    }

    // OWNERSHIP TRANSFER
    function _transferOwnership(address newOwner, address sender) internal virtual {
        if(sender != owner) revert Errors.AccessControlOwnerOnly();
        if(newOwner == address(0)) revert Errors.AccessControlZeroAddress();
        owner = newOwner;
        emit OwnershipTransferred(sender, newOwner);
    }

    // INTERNAL HELPERS (optimized)
    function _initializeRoleAdminsInternal() internal {
        _roleAdmin[SUPPLIER_ROLE] = ADMIN_ROLE;
        _roleAdmin[TRANSPORTER_ROLE] = ADMIN_ROLE;
        _roleAdmin[MANUFACTURER_ROLE] = ADMIN_ROLE;
        _roleAdmin[WHOLESALER_ROLE] = ADMIN_ROLE;
        _roleAdmin[DISTRIBUTOR_ROLE] = ADMIN_ROLE;
    }

    function _hasRole(bytes32 role, address account) internal view returns(bool) {
        if(account == address(0)) return false;
        if(role == CUSTOMER_ROLE) return true;
        if(role == ADMIN_ROLE && account == owner) return true;
        return _roles[role][account];
    }

    function _getRoleAdmin(bytes32 role) internal view returns(bytes32) {
        if(role == ADMIN_ROLE) return ADMIN_ROLE;
        bytes32 admin = _roleAdmin[role];
        return admin == bytes32(0) ? ADMIN_ROLE : admin;
    }

    // CHECKS (preserved names)
    function _checkRole(bytes32 role, address account) internal view {
        if(!_hasRole(role, account)) 
            revert Errors.AccessControlMissingRole(account, role);
    }

    function _checkSenderRole(bytes32 role) internal view {
        if(!_hasRole(role, msg.sender)) 
            revert Errors.AccessControlMissingRole(msg.sender, role);
    }
}