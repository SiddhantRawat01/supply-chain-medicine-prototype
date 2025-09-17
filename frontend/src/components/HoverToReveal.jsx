// src/components/HoverToReveal.jsx
import React from 'react';
import PropTypes from 'prop-types';
import styles from '../styles/HoverToReveal.module.css'; // We'll create this CSS file

function HoverToReveal({ shortValue, fullValue, type = 'text' }) {
    // If fullValue is missing or same as short, no need for reveal
    if (!fullValue || fullValue === shortValue || fullValue === 'N/A') {
        return <span className={styles.noReveal}>{shortValue}</span>;
    }

    // Add specific class for hash/address styling if needed
    const typeClass = type === 'hash' ? styles.hashType : styles.addressType;

    return (
        <span className={styles.container}>
            {/* Short version - visible by default */}
            <span className={`${styles.shortVersion} ${typeClass}`}>
                {shortValue}
            </span>
            {/* Full version - hidden by default, revealed on hover */}
            <span className={`${styles.fullVersion} ${typeClass}`}>
                {fullValue}
            </span>
        </span>
    );
}

HoverToReveal.propTypes = {
    shortValue: PropTypes.string.isRequired,
    fullValue: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['text', 'address', 'hash']), // Optional type for styling
};

export default HoverToReveal;