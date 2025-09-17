import React, { useEffect, useState } from "react";
import "./styles/HeroSection.css";
import { useNavigate } from 'react-router-dom'

const HeroSection = () => {
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate()
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@splinetool/viewer@1.9.87/build/spline-viewer.js";
    script.type = "module";
    script.onload = () => setLoaded(true);
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handleGetStartedClick = () => {
    navigate('/dapp');
  };

  return (
    <section className="hero-section" id="home">
      {/* Spline 3D Background */}
      {loaded && (
        <div className="spline-background">
          <spline-viewer 
            url="https://prod.spline.design/jgLOSuz0gObyPIap/scene.splinecode"
            loading-anim
            style={{ width: '100%', height: '100%' }}
            events-target="global"
          ></spline-viewer>
        </div>
      )}

      {/* Content */}
      <div className="hero-content">
        {/* Left Content */}
        <div className="hero-left">
          <h1 className="hero-title">MEDICINE AUTHENTICATION</h1>
          <h2 className="hero-subtitle">Blockchain-Powered Pharmaceutical Security</h2>
        </div>

        {/* Right Content */}
        <div className="hero-right">
          <p className="hero-description">
            <span className="highlight">Eradicate counterfeit drugs</span> with<br />
            our <span className="highlight">tamper-proof verification</span> system<br />
            <span className="tagline">Trust in every tablet</span>
          </p>
          <div className="hero-buttons">
            <button className="primary-button" onClick={handleGetStartedClick}>
              <span className="button-icon">🛡️</span> Get Started
            </button>
            <button className="secondary-button">
              <span className="button-icon">💊</span> Verify Now
            </button>
          </div>
          <div className="built-with">Powered by Blockchain Technology</div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;