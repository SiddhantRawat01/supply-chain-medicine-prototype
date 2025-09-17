import React from 'react';
import './styles/Loader.css';

const Loader = () => {
  return (
    <div className="loader-overlay">
      <div className="loader-content">
        <div className="loader-spinner"></div>
        <h2>CarePulse</h2>
        <p>Loading secure authentication system...</p>
      </div>
    </div>
  );
};

export default Loader;