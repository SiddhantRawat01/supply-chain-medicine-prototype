// client/src/components/ConnectWallet.js
import React from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import '../styles/ConnectWallet.css'; // Import the CSS file


function ConnectWallet() {
    // Obtain connection function and relevant state from context
    const { connectWallet, isLoading, error, networkError } = useWeb3();

    // Determine the most relevant error to display
    // Prioritize network error if both exist, as it often blocks connection.
    const displayError = networkError || error;

    return (
        <div className="connect-wallet"> {/* Use a BEM-style class */}
            <button
                onClick={connectWallet}
                disabled={isLoading} // Disable button while connection is in progress
                className="connect-wallet__button"
                aria-busy={isLoading} // Indicate busy state for accessibility
            >
                {/* Change button text based on loading state */}
                {isLoading ? 'Connecting...' : 'Connect Wallet'}
            </button>

            {/* Display connection or network errors directly below the button */}
            {/* Show error only when not loading to avoid message flicker */}
            {displayError && !isLoading && (
                <p className="connect-wallet__error">
                    {displayError}
                </p>
            )}
        </div>
    );
}

// Define PropTypes even if empty for consistency
ConnectWallet.propTypes = {
    // No props are currently expected
};

export default ConnectWallet;