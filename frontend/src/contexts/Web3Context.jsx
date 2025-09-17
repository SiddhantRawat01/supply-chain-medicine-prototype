// client/src/contexts/Web3Context.js
import React, {
    useState,
    useEffect,
    createContext,
    useContext,
    useCallback
} from 'react';
import { ethers } from 'ethers'; // Use ethers v6

import SupplyChainLogicABI from '../abis/SupplyChainLogic.json'; // ABI for contract interaction logic
import { ROLES } from '../constants/roles'; // Role hashes

// --- Configuration Loading and Validation ---
// Read environment variables defined in client/.env (prefixed with REACT_APP_)
const CONTRACT_ADDRESS = import.meta.env.VITE_APP_CONTRACT_ADDRESS;
const TARGET_NETWORK_ID_STRING = import.meta.env.VITE_APP_NETWORK_ID || "11155111"; // Default to Sepolia ID
const TARGET_NETWORK_NAME = import.meta.env.VITE_APP_NETWORK_NAME || "Sepolia"; // Default to Sepolia Name

// Initial console log to indicate context initialization
console.log("📦 [Web3Context] Initializing Context & Validating Configuration...");
console.log(`   -> Contract Address: ${CONTRACT_ADDRESS}`);
console.log(`   -> Target Network ID: ${TARGET_NETWORK_ID_STRING}`);
console.log(`   -> Target Network Name: ${TARGET_NETWORK_NAME}`);

let configIsValid = true; // Flag to track overall configuration validity
let targetChainIdHex = ''; // Will hold the 0x-prefixed hex chain ID

// 1. Validate Contract Address
// Check if it exists, isn't the placeholder, and is a valid address format
if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "YOUR_DEPLOYED_SUPPLY_CHAIN_PROXY_ADDRESS_HERE") {
    console.error("🔴 CONFIG ERROR: REACT_APP_CONTRACT_ADDRESS is missing or using placeholder in client/.env.");
    configIsValid = false;
} else if (!ethers.isAddress(CONTRACT_ADDRESS)) { // Use ethers v6 isAddress check
    console.error(`🔴 CONFIG ERROR: REACT_APP_CONTRACT_ADDRESS "${CONTRACT_ADDRESS}" is not a valid Ethereum address.`);
    configIsValid = false;
} else {
    console.log("✅ Config: Contract Address appears valid.");
}

// 2. Validate Network ID and generate Hex Chain ID
try {
    const parsedId = parseInt(TARGET_NETWORK_ID_STRING, 10); // Use base 10
    if (isNaN(parsedId) || parsedId <= 0) {
        // Ensure it's a positive whole number
        throw new Error("Network ID must be a positive integer.");
    }
    targetChainIdHex = `0x${parsedId.toString(16)}`; // Convert valid number to hex string (e.g., "0xaa36a7")
    console.log(`✅ Config: Target Network ID ${TARGET_NETWORK_ID_STRING} (Hex: ${targetChainIdHex}) is valid.`);
} catch (e) {
    console.error(`🔴 CONFIG ERROR: Invalid REACT_APP_NETWORK_ID "${TARGET_NETWORK_ID_STRING}". ${e.message}`);
    configIsValid = false;
}

// 3. Validate ABI presence and basic structure
if (!SupplyChainLogicABI?.abi || !Array.isArray(SupplyChainLogicABI.abi) || SupplyChainLogicABI.abi.length === 0) {
     console.error("🔴 CONFIG ERROR: SupplyChainLogic ABI (from client/src/abis/SupplyChainLogic.json) is missing or invalid. Did you run 'truffle compile'?");
     configIsValid = false; // Critical for contract interaction
} else {
    console.log("✅ Config: Contract ABI appears valid.");
}

// --- React Context Definition ---
const Web3Context = createContext();

// --- Provider Component Implementation ---
export const Web3Provider = ({ children }) => {
    // --- State Variables ---
    const [provider, setProvider] = useState(null);           // Ethers provider instance (e.g., BrowserProvider)
    const [signer, setSigner] = useState(null);               // Ethers signer instance (for sending transactions)
    const [account, setAccount] = useState(null);             // Connected wallet address (string)
    const [contract, setContract] = useState(null);           // Ethers contract instance (connected to signer)
    const [isLoading, setIsLoading] = useState(false);        // General loading state (e.g., during connection)
    const [isFetchingRoles, setIsFetchingRoles] = useState(false); // Specific loading state for role fetching
    const [error, setError] = useState(null);                 // Stores general connection or transaction errors (string)
    const [networkError, setNetworkError] = useState(null);   // Stores specific network mismatch errors (string)
    const [selectedRole, setSelectedRole] = useState(null);   // User's selected role for UI display (role hash string)
    const [userRoles, setUserRoles] = useState({});           // Map { roleHash: boolean } of user's actual on-chain roles

    // --- Core Functions ---

    /**
     * Resets all connection-related state to initial values.
     * Useful on disconnect, errors, or before reconnecting.
     */
    const resetConnectionState = useCallback(() => {
        console.log("🔌 [State] Resetting connection state...");
        setProvider(null);
        setSigner(null);
        setAccount(null);
        setContract(null);
        setSelectedRole(null); // Also reset selected UI role
        setUserRoles({});     // Clear fetched roles
        setError(null);       // Clear general errors
        setNetworkError(null);// Clear network errors
        // Note: isLoading and isFetchingRoles are managed by the actions themselves
    }, []); // No dependencies, this function is pure based on setters

    /**
     * Initiates the wallet connection process:
     * 1. Checks prerequisites (MetaMask, config).
     * 2. Initializes the Ethers provider.
     * 3. Checks the network and prompts for switch if necessary.
     * 4. Requests account access.
     * 5. Gets the signer.
     * 6. Instantiates the contract instance.
     * 7. Fetches the user's roles.
     */
    const fetchUserRoles = useCallback(async (contractInstance, userAccount) => {
        // Prevent execution if contract or account is invalid
        if (!contractInstance?.target || !userAccount || !ethers.isAddress(userAccount)) {
            console.warn(`🟡 [fetchUserRoles] Skipping role fetch: Invalid contract instance (${contractInstance?.target}) or account (${userAccount}).`);
            setUserRoles({}); // Ensure roles are cleared if prerequisites missing
            return;
        }
        console.log(`⏳ [fetchUserRoles] Fetching roles for account: ${userAccount} on contract: ${contractInstance.target}`);
        setIsFetchingRoles(true); // Set specific loading indicator
        setError(null); // Clear previous errors before fetching

        let fetchedRolesMap = {}; // Initialize as empty object

        try {
            const roleHashesToCheck = Object.values(ROLES); // Get all defined role hashes
            const adminRoleHash = ROLES.ADMIN_ROLE; // Cache admin hash for specific logging

            console.log(`   [fetchUserRoles] Querying ${roleHashesToCheck.length} roles...`);

            // Use Promise.allSettled to handle potential failures for individual role checks
            const results = await Promise.allSettled(
                roleHashesToCheck.map(roleHash =>
                    contractInstance.hasRole(roleHash, userAccount)
                        .then(hasRoleResult => ({ roleHash, has: hasRoleResult, status: 'fulfilled' }))
                        // Let allSettled catch the rejection
                )
            );

            console.log("   [fetchUserRoles] Raw results from Promise.allSettled(hasRole):", results);

            // Process the results from allSettled
            fetchedRolesMap = results.reduce((acc, result, index) => {
                const roleHash = roleHashesToCheck[index]; // Get the hash corresponding to this result
                if (result.status === 'fulfilled') {
                    acc[roleHash] = result.value.has; // Store the boolean result
                    // Detailed log specifically for ADMIN_ROLE to help debug ownership issues
                    if (roleHash === adminRoleHash) {
                        console.log(`      ✅ [fetchUserRoles] Specific check - ADMIN_ROLE (${adminRoleHash}) result: ${result.value.has}`);
                    }
                } else {
                    // Log the error if a specific hasRole call failed
                    console.error(`🔴 [fetchUserRoles] Error checking role ${roleHash}: ${result.reason?.message || result.reason}`);
                    acc[roleHash] = false; // Assume the user does not have the role if the check failed
                }
                return acc;
            }, {});

            console.log("✅ [fetchUserRoles] Processed roles map:", fetchedRolesMap);
            setUserRoles(fetchedRolesMap); // Update the component state

        } catch (err) {
            // This catch block handles errors in the overall fetchUserRoles logic (less likely now)
            console.error("🔴 [fetchUserRoles] Unexpected major error during role fetching process:", err);
            setError("Failed to fetch all user roles due to an unexpected error. Please try reconnecting.");
            setUserRoles({}); // Reset roles entirely on major failure
        } finally {
            setIsFetchingRoles(false); // Turn off role-specific loading indicator
            console.log("🏁 [fetchUserRoles] Role fetch complete.");
        }
    }, [setError]); // Dependency: only setError callback


    const connectWallet = useCallback(async () => {
        console.log("🚀 [connectWallet] Attempting wallet connection...");
        setIsLoading(true); // Indicate connection process started
        resetConnectionState(); // Start with a clean state

        // --- Prerequisite Checks ---
        if (!configIsValid) {
            console.error("🔴 [connectWallet] Aborting: Invalid configuration.");
            setError("Application configuration error. Check console for details.");
            setIsLoading(false);
            return;
        }
        if (typeof window.ethereum === 'undefined') {
            console.error("🔴 [connectWallet] Aborting: MetaMask (window.ethereum) not detected.");
            setError("MetaMask is not installed. Please install the browser extension.");
            setIsLoading(false);
            return;
        }

        try {
            // --- Initialize Provider ---
            console.log("   [connectWallet] Initializing Ethers provider (BrowserProvider)...");
            // Ethers v6: Use BrowserProvider to connect to browser wallets like MetaMask
            const web3Provider = new ethers.BrowserProvider(window.ethereum, "any"); // "any" allows network change detection
            setProvider(web3Provider); // Set provider state

            // --- Network Check ---
            console.log("   [connectWallet] Checking network connection...");
            const network = await web3Provider.getNetwork(); // Get network info
            const currentChainId = network.chainId.toString(); // Get current chain ID as string
            console.log(`   [connectWallet] Connected to Network: ${network.name} (ID: ${currentChainId})`);

            // --- Network Switch Logic ---
            if (currentChainId !== TARGET_NETWORK_ID_STRING) {
                const networkMsg = `Incorrect Network: Please switch to ${TARGET_NETWORK_NAME} (ID: ${TARGET_NETWORK_ID_STRING}). You are currently on ${network.name}.`;
                console.warn(`🟡 [connectWallet] ${networkMsg}`);
                setNetworkError(networkMsg); // Set UI error message

                try {
                    // Attempt to prompt user to switch network in MetaMask
                    console.log(`   [connectWallet] Requesting network switch to target Chain ID (Hex): ${targetChainIdHex}...`);
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: targetChainIdHex }], // Use pre-validated & formatted hex ID
                    });
                    // If the switch is successful, the 'chainChanged' listener (setup in useEffect)
                    // will trigger a page reload. We don't need to continue the connection logic here.
                    console.log("   [connectWallet] Network switch request sent. Waiting for user confirmation or page reload...");
                    // Keep isLoading true as we wait for the outcome of the switch request or reload
                    // Do NOT set isLoading false here if switch was requested.
                    return; // Exit connectWallet early

                } catch (switchError) {
                    // Handle errors during the switch request
                    console.error("🔴 [connectWallet] Network switch failed:", switchError);
                    let switchErrMsg = `Failed to switch to ${TARGET_NETWORK_NAME}. Please switch manually in MetaMask.`;
                    // Provide more specific feedback based on error code
                    if (switchError.code === 4001) switchErrMsg = "Network switch request rejected by user.";
                    if (switchError.code === 4902) switchErrMsg = `${TARGET_NETWORK_NAME} network is not added to your MetaMask. Please add it manually.`;
                    setError(switchErrMsg); // Set specific error message
                    setIsLoading(false); // Stop loading as the connection attempt failed here
                    return; // Abort connection process
                }
            }
            // Network is correct, clear any previous network error
            console.log("✅ [connectWallet] Network check passed.");
            setNetworkError(null);

            // --- Request Accounts ---
            console.log("   [connectWallet] Requesting accounts from MetaMask...");
            // This prompts the user to connect if not already connected to the site
            const accounts = await web3Provider.send("eth_requestAccounts", []);
            if (!accounts || accounts.length === 0) {
                // Should not happen if eth_requestAccounts resolves, but good practice check
                throw new Error("No accounts were authorized by the user.");
            }
            // Normalize address format (checksummed) using ethers v6 utility
            const currentAccount = ethers.getAddress(accounts[0]);
            setAccount(currentAccount); // Update account state
            console.log(`✅ [connectWallet] Account connected: ${currentAccount}`);

            // --- Get Signer ---
            console.log("   [connectWallet] Getting signer instance...");
            // The signer is needed to send transactions
            const web3Signer = await web3Provider.getSigner();
            setSigner(web3Signer); // Update signer state
            const signerAddress = await web3Signer.getAddress();
            console.log(`✅ [connectWallet] Signer obtained for address: ${signerAddress}`);
            // Sanity check: signer address should match connected account
            if (signerAddress.toLowerCase() !== currentAccount.toLowerCase()) {
                 console.warn("🟡 [connectWallet] Signer address mismatch with connected account!", { signerAddress, currentAccount });
                 // This shouldn't typically happen with MetaMask but is a useful check
            }

            // --- Instantiate Contract ---
            console.log(`   [connectWallet] Instantiating contract instance for address ${CONTRACT_ADDRESS}...`);
            // Create contract instance connected to the signer for transaction capabilities
            const supplyChainContract = new ethers.Contract(
                CONTRACT_ADDRESS, // The DEPLOYED PROXY address
                SupplyChainLogicABI.abi, // The ABI of the LOGIC contract (defines the functions)
                web3Signer // The signer to send transactions with
            );
            setContract(supplyChainContract); // Update contract state
            console.log("✅ [connectWallet] Contract instance created. Target address:", supplyChainContract.target); // v6 uses 'target' for address

            // --- Fetch Roles ---
            // Important to fetch roles immediately after connection is established
            await fetchUserRoles(supplyChainContract, currentAccount);

            console.log("✅ [connectWallet] Wallet connection process completed successfully.");

        } catch (err) {
            // Catch any errors during the connection process
            console.error("🔴 [connectWallet] Overall connection process failed:", err);
            let errorMsg = `Connection Failed: ${err.message || 'Unknown error'}`;
             // Provide specific feedback for common MetaMask rejections
            if (err.code === 4001 || err.message?.includes("rejected")) {
                 errorMsg = "Connection request rejected by user.";
            } else if (err.message?.includes("No accounts authorized")) {
                 errorMsg = "No accounts authorized. Please allow connection in MetaMask.";
            }
            setError(errorMsg);
            resetConnectionState(); // Ensure clean state after any failure
        } finally {
            // Always ensure loading state is turned off once the process finishes or fails
            setIsLoading(false);
            console.log("🏁 [connectWallet] Connect wallet attempt finished.");
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetConnectionState, fetchUserRoles]); // Dependencies: callbacks defined outside


    /** Disconnects the wallet by resetting the relevant state variables. */
    const disconnectWallet = useCallback(() => {
        console.log("🚪 [disconnectWallet] User initiated disconnect. Resetting state...");
        resetConnectionState();
    }, [resetConnectionState]);


    /**
     * Fetches the on-chain roles for the specified account using the provided contract instance.
     * Updates the userRoles state. Uses Promise.allSettled for resilience.
     * @param {ethers.Contract} contractInstance - The instantiated ethers Contract object.
     * @param {string} userAccount - The Ethereum address to check roles for.
     */
    

    /**
     * Checks the local userRoles state to see if the connected user has a specific role.
     * @param {string} roleHash - The bytes32 hash of the role to check.
     * @returns {boolean} True if the user has the role according to the last fetch, false otherwise.
     */
    const hasRole = useCallback((roleHash) => {
        const userHasRole = !!userRoles[roleHash]; // Check if hash exists and is true
        // console.log(`   [hasRole] Check for ${roleHash}: ${userHasRole}`); // Uncomment for verbose checks
        return userHasRole;
    }, [userRoles]); // Dependency: userRoles state


    /**
     * Parses common error structures from Ethers v6 to extract a human-readable revert reason.
     * @param {Error | any} error - The error object caught from a transaction or call.
     * @returns {string} A processed error message string.
     */
    const getRevertReason = useCallback((error) => {
        console.log("🔍 [getRevertReason] Parsing error object:", error);
        let reason = "Transaction failed or rejected."; // Sensible default

        // Prioritize ethers v6 specific revert data
        if (error?.revert) {
            reason = `Reverted: ${error.revert.name}`;
            // Include arguments if available
            if (error.revert.args && error.revert.args.length > 0) {
                const argsString = error.revert.args.map(arg => arg?.toString() ?? '?').join(', ');
                reason += ` (${argsString})`;
            }
        } else if (error?.reason) { // General reason string provided by Ethers/RPC
            reason = error.reason;
        } else if (error?.data?.message) { // Check potentially nested data (less common)
             reason = error.data.message;
        } else if (error?.message) { // Fallback to the standard JS error message
             reason = error.message;
        } else if (typeof error === 'string') { // Handle cases where only a string is thrown
            reason = error;
        }

        // Clean up common prefixes added by ethers or nodes
        const prefixesToRemove = ["execution reverted: ", "Error: ", "reason string "];
        for (const prefix of prefixesToRemove) {
            if (reason.includes(prefix)) {
                reason = reason.substring(reason.indexOf(prefix) + prefix.length).replace(/["']/g, ""); // Remove quotes too
                break; // Assume only one relevant prefix
            }
        }
        // Specific MetaMask user rejection code
        if (error?.code === 4001 || reason.includes('User denied transaction signature')) {
             reason = "Transaction rejected by user in MetaMask.";
        }

        // Limit length for better UI display
        const maxLength = 180;
        const finalReason = reason.length > maxLength ? reason.substring(0, maxLength) + "..." : reason;
        console.log(`   [getRevertReason] Parsed reason: ${finalReason}`);
        return finalReason;
    }, []); // No dependencies needed


    // --- Effect for Setting Up and Tearing Down Event Listeners ---
    useEffect(() => {
        // Ensure window.ethereum exists (MetaMask is installed)
        if (!window.ethereum) {
            console.log("🎧 [EventListeners] No window.ethereum provider found. Skipping listener setup.");
            return;
        }

        // Handler for account changes
        const handleAccountsChanged = (accounts) => {
            console.log(`👤 [Event] accountsChanged detected:`, accounts);
            const currentAccountLower = account?.toLowerCase(); // Get current account from state
            const newAccountLower = accounts[0]?.toLowerCase(); // Get new account (if any)

            // If no accounts are connected OR the connected account changed
            if (accounts.length === 0 || (newAccountLower && newAccountLower !== currentAccountLower)) {
                console.log("   -> Account changed or disconnected. Resetting connection state...");
                disconnectWallet(); // Reset the application state fully
                // Optional: Automatically attempt to reconnect? Could be annoying.
                // setTimeout(connectWallet, 300); // Maybe add a small delay
            } else if (accounts.length > 0 && newAccountLower === currentAccountLower) {
                console.log("   -> Account unchanged, no state reset needed.");
                // Usually no action needed, but could potentially re-fetch roles if desired
                // if(contract && account) fetchUserRoles(contract, account);
            }
        };

        // Handler for network/chain changes
        const handleChainChanged = (chainId) => {
            console.log(`🌍 [Event] chainChanged detected: ${chainId}. Forcing page reload for fresh state.`);
            // The most reliable way to handle network changes is often a full page reload
            // to ensure the provider, signer, and contract instances use the new network context.
            window.location.reload();
        };

        // Add listeners
        console.log("🎧 [EventListeners] Adding 'accountsChanged' and 'chainChanged' listeners...");
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);

        // Cleanup function: Remove listeners when the component unmounts or dependencies change
        return () => {
            console.log("🎧 [EventListeners] Removing listeners...");
            // Ensure removeListener exists before calling (good practice)
            if (window.ethereum.removeListener) {
                window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
                window.ethereum.removeListener('chainChanged', handleChainChanged);
            }
        };
    // Dependencies: Re-run this effect if the connected account or disconnect function changes.
    // Including account ensures the comparison inside handleAccountsChanged uses the latest value.
    }, [account, disconnectWallet]);


    // --- Effect for Fetching Roles when Dependencies Change ---
    useEffect(() => {
        // Fetch roles only when we have a valid contract instance AND a connected account address
        if (contract && account && ethers.isAddress(account)) {
            console.log(`🔄 [Effect] Dependencies (contract/account) changed, triggering role fetch for ${account}.`);
            fetchUserRoles(contract, account);
        } else {
            // If prerequisites aren't met (e.g., user disconnected), clear the roles state
            // Only clear if userRoles isn't already empty to avoid unnecessary updates
            if (Object.keys(userRoles).length > 0) {
                console.log("🔄 [Effect] Clearing user roles (no contract/account).");
                setUserRoles({});
            }
        }
    // Dependencies: Run this effect if the contract instance or account address changes.
    // fetchUserRoles is wrapped in useCallback, so it's stable unless its own dependencies change (which they shouldn't often).
    }, [account, contract, fetchUserRoles]);


    // --- Provide Context Value to Children ---
    // The value object contains all state and functions consumers might need
    return (
        <Web3Context.Provider value={{
            // State Variables
            provider,           // Ethers provider
            signer,             // Ethers signer
            account,            // Connected account address
            contract,           // Ethers contract instance
            isLoading: isLoading || isFetchingRoles, // Combined loading state
            isConnecting: isLoading, // Specific connection loading
            isFetchingRoles,    // Specific role fetching loading
            error,              // General errors
            networkError,       // Network mismatch errors
            selectedRole,       // Currently selected UI role (hash)
            userRoles,          // Map of actual user roles {hash: boolean}

            // Action Functions & Helpers
            connectWallet,      // Function to initiate connection
            disconnectWallet,   // Function to clear connection state
            setSelectedRole,    // Function to set the selected UI role
            hasRole,            // Helper to check if user has a role (based on userRoles state)
            getRevertReason,    // Helper to parse transaction errors
            setError,           // Function to allow children to set general errors
            setIsLoading,       // Function to allow children to control general loading state (use with care)
            fetchUserRoles      // Expose function to manually trigger role refresh if needed
        }}>
            {/* Render the rest of the application */}
            {children}
        </Web3Context.Provider>
    );
};

// --- Custom Hook for Easy Context Consumption ---
// Provides a convenient way for components to access the Web3 context value
export const useWeb3 = () => useContext(Web3Context);