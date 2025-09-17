// client/src/components/LandingPage.js
import React from 'react';
import ConnectWallet from './ConnectWallet'; // Component to handle wallet connection logic
import { useWeb3 } from '../contexts/Web3Context'; // Hook to access web3 state
import '../styles/LandingPage.css'; // Import the CSS styles

/**
 * LandingPage Component
 *
 * Serves as the initial entry point for users, displaying a welcome message
 * and prompting for wallet connection if necessary. It also reflects network errors.
 */
function LandingPage() {
    // Get relevant state from the Web3 context
    const { account, networkError, isLoading } = useWeb3();

    return (
        <div className="landing-page__container">
            <header className="landing-page__header">
                <h1 className="landing-page__title">
                    <span className="landing-page__title-accent">Care</span>Pulse
                </h1>
                <p className="landing-page__subtitle">
                    Blockchain-Powered Pharmaceutical Supply Chain Management
                </p>
            </header>

            <main className="landing-page__main">
                {networkError && (
                    <div className="landing-page__alert landing-page__alert--error">
                        <svg className="landing-page__alert-icon" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                        </svg>
                        <div>
                            <h3 className="landing-page__alert-title">Network Configuration Required</h3>
                            <p className="landing-page__alert-text">{networkError}</p>
                            <p className="landing-page__alert-hint">Please connect to the authorized blockchain network in your wallet</p>
                        </div>
                    </div>
                )}

                {isLoading && !networkError && (
                    <div className="landing-page__alert landing-page__alert--info">
                        <svg className="landing-page__alert-icon" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                        <div className="landing-page__loading">
                            <span className="landing-page__spinner"></span>
                            Initializing Secure Connection...
                        </div>
                    </div>
                )}

                {!account && !networkError && !isLoading && (
                    <div className="landing-page__connect-card">
                        <div className="landing-page__connect-header">
                            <svg className="landing-page__connect-icon" viewBox="0 0 24 24">
                                <path d="M12 1.5c-4.142 0-7.5 3.358-7.5 7.5 0 3.783 2.802 6.903 6.45 7.417V21h2.1v-4.583c3.648-.514 6.45-3.634 6.45-7.417 0-4.142-3.358-7.5-7.5-7.5zm0 12.75c-2.899 0-5.25-2.351-5.25-5.25S9.101 3.75 12 3.75s5.25 2.351 5.25 5.25-2.351 5.25-5.25 5.25z"/>
                            </svg>
                            <h2 className="landing-page__connect-title">Secure Wallet Access</h2>
                        </div>
                        <p className="landing-page__connect-text">
                            Authenticate with your Web3 wallet to access the pharmaceutical supply chain network
                        </p>
                        <ConnectWallet />
                    </div>
                )}

                {account && !networkError && (
                    <div className="landing-page__alert landing-page__alert--success">
                        <svg className="landing-page__alert-icon" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                        <div>
                            <h3 className="landing-page__alert-title">Authentication Successful</h3>
                            <p className="landing-page__alert-text">
                                Wallet address: <span className="landing-page__wallet-address">{account}</span>
                            </p>
                            <p className="landing-page__alert-hint">Navigate to your dashboard using the top menu</p>
                        </div>
                    </div>
                )}
            </main>

            <footer className="landing-page__footer">
                <p className="landing-page__footer-text">
                    Enterprise-Grade Pharmaceutical Tracking System
                    <span className="landing-page__footer-separator">|</span>
                    <span>HIPAA Compliant Infrastructure</span>
                </p>
            </footer>
        </div>
    );
}

export default LandingPage;