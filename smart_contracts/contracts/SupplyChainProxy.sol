// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Errors} from "./libraries/Errors.sol";
import {RawMaterial} from "./batches/RawMaterial.sol";
import {Medicine} from "./batches/Medicine.sol";
import {SupplyChainLogic} from "./logic/SupplyChainLogic.sol";

contract SupplyChainProxy {
    address public owner;
    address public logicContractAddress;

    event ProxyInitialized(
        address indexed logicAddress,
        address indexed initialOwner
    );

    constructor(address logicAddress_) {
        require(logicAddress_ != address(0), "Proxy: Logic address is zero");
        logicContractAddress = logicAddress_;

        address deployer = msg.sender;
        (bool success, bytes memory returnData) = logicContractAddress
            .delegatecall(
                abi.encodeWithSelector(
                    SupplyChainLogic.initialize.selector,
                    deployer
                )
            );

        if (!success) {
            _forwardRevertData(
                returnData,
                abi.encodePacked("Proxy: Initialize reverted")
            );
        }
        require(returnData.length == 0, "Proxy: Initialize returned data");

        require(owner == deployer, "Proxy: Owner mismatch post-init");
        bytes32 adminRoleHash = _fetchAdminRoleHash();
        _verifyDeployerIsAdmin(adminRoleHash, deployer);

        emit ProxyInitialized(logicContractAddress, deployer);
    }

    function _fetchAdminRoleHash() internal view returns (bytes32) {
        (bool success, bytes memory returnData) = logicContractAddress
            .staticcall(
                abi.encodeWithSelector(bytes4(keccak256("ADMIN_ROLE()")))
            );
        _checkStaticCallSuccess(success, returnData, keccak256("ADMIN_ROLE()"));
        require(
            returnData.length == 32,
            "Proxy: ADMIN_ROLE fetch length invalid"
        );
        return abi.decode(returnData, (bytes32));
    }

    function _verifyDeployerIsAdmin(
        bytes32 adminRoleHash,
        address deployer_
    ) internal {
        bytes memory callData = abi.encodeWithSelector(
            SupplyChainLogic.hasRole.selector,
            adminRoleHash,
            deployer_
        );
        (bool success, bytes memory returnData) = logicContractAddress
            .delegatecall(callData);
        _checkStaticCallSuccess(
            success,
            returnData,
            keccak256("hasRole(bytes32,address)")
        );
        require(
            returnData.length == 32,
            "Proxy: hasRole return length invalid"
        );
        bool isAdmin = abi.decode(returnData, (bool));
        require(isAdmin, "Proxy: Deployer lacks implicit ADMIN_ROLE");
    }

    fallback() external payable {
        _delegate(logicContractAddress);
    }
    receive() external payable {
        _delegate(logicContractAddress);
    }


    // Internal Helpers
    function _delegate(address implementation_) internal {
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(
                gas(),
                implementation_,
                0,
                calldatasize(),
                0,
                0
            )
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    function _delegateWithValue(
        address implementation_,
        bytes memory callData_
    ) internal returns (bytes memory) {
        (bool success, bytes memory _returnData) = implementation_.delegatecall(
            callData_
        );
        if (!success)
            _forwardRevertData(
                _returnData,
                abi.encodePacked("Proxy: Delegatecall failed")
            );
        return _returnData;
    }

    function _delegateWithoutValue(
        address implementation_,
        bytes memory callData_
    ) internal {
        (bool success, bytes memory returnData) = implementation_.delegatecall(
            callData_
        );
        if (!success)
            _forwardRevertData(
                returnData,
                abi.encodePacked("Proxy: Delegatecall failed")
            );
        require(returnData.length == 0, "Proxy: Delegatecall void return");
    }

    function _checkStaticCallSuccess(
        bool success_,
        bytes memory returnData_,
        bytes32 context_
    ) internal pure {
        if (!success_)
            _forwardRevertData(
                returnData_,
                abi.encodePacked("Proxy: Staticcall failed:", uint256(context_))
            );
    }

    function _forwardRevertData(
        bytes memory returnData_,
        bytes memory defaultData_
    ) internal pure {
        if (returnData_.length > 0) {
            assembly {
                revert(add(returnData_, 0x20), mload(returnData_))
            }
        } else {
            assembly {
                revert(add(defaultData_, 0x20), mload(defaultData_))
            }
        }
    }
}
