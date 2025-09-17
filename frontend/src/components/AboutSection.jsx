import React, { useState, forwardRef } from 'react';
import './styles/AboutSection.css';
import blockchainImg from './images/blockchain.jpg';
import verificationImg from './images/verification.jpg';
import globalImg from './images/global.jpg';
import analyticsImg from './images/analytics.jpg';
import fraudImg from './images/fraud.jpg';

const AboutSection = forwardRef((props, ref) => {
  const [activeTab, setActiveTab] = useState('mission');

  // Marquee images data with imported images
  const features = [
    { image: blockchainImg, title: 'Blockchain Security' },
    { image: verificationImg, title: 'Instant Verification' },
    { image: globalImg, title: 'Global Network' },
    { image: analyticsImg, title: 'Real-time Analytics' },
    { image: fraudImg, title: 'Fraud Prevention' },
  ];

  const duplicatedImages = [...features, ...features];

  return (
    <section className="about-section-marquee" id={props.id} ref={ref}>
      <div className="about-container-marquee">
        <div className="about-content-marquee">
          <h1 className="section-title-marquee">About CarePulse</h1>
          <p className="section-subtitle-marquee">
            Revolutionizing medication safety through blockchain technology
          </p>

          <div className="tab-buttons-marquee">
            <button
              className={`tab-btn-marquee ${activeTab === 'mission' ? 'active' : ''}`}
              onClick={() => setActiveTab('mission')}
            >
              Our Mission
            </button>
            <button
              className={`tab-btn-marquee ${activeTab === 'vision' ? 'active' : ''}`}
              onClick={() => setActiveTab('vision')}
            >
              Our Vision
            </button>
            <button
              className={`tab-btn-marquee ${activeTab === 'technology' ? 'active' : ''}`}
              onClick={() => setActiveTab('technology')}
            >
              Our Technology
            </button>
          </div>

          <div className="tab-content-marquee">
            {activeTab === 'mission' && (
              <div className="tab-panel">
                <p className='tab-text'>
                  We're dedicated to eliminating counterfeit medications through our 
                  blockchain-powered verification system that creates an immutable 
                  record of every drug's journey from manufacturer to patient.
                </p>
                <ul className="features-list-marquee">
                  <li className="checked-marquee">Secure pharmaceutical supply chains</li>
                  <li className="checked-marquee">Instant medication authentication</li>
                  <li className="checked-marquee">Global regulatory compliance</li>
                </ul>
              </div>
            )}

            {activeTab === 'vision' && (
              <div className="tab-panel">
                <p>
                  We envision a world where counterfeit drugs are eradicated through 
                  transparent verification, protecting 1 billion patients annually by 2030.
                </p>
                <ul className="features-list-marquee">
                  <li className="checked-marquee">Universal manufacturer adoption</li>
                  <li className="checked-marquee">Healthcare system integration</li>
                  <li className="checked-marquee">AI-powered monitoring</li>
                </ul>
              </div>
            )}

            {activeTab === 'technology' && (
              <div className="tab-panel">
                <p>
                  Our proprietary blockchain technology provides decentralized, 
                  tamper-proof verification that's faster and more secure than 
                  traditional methods.
                </p>
                <ul className="features-list-marquee">
                  <li className="checked-marquee">Distributed ledger architecture</li>
                  <li className="checked-marquee">Cryptographic identifiers</li>
                  <li className="checked-marquee">Real-time verification API</li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Vertical Marquee Slider */}
        <div className="marquee-container-marquee1">
          <div className="marquee-columns-marquee1">
            <div className="marquee-col-marquee1">
              <div className="marquee-track-marquee1" style={{ '--duration': '40s' }}>
                {duplicatedImages.map((item, index) => (
                  <div className="marquee-card-marquee1" key={`col1-${index}`}>
                    <img src={item.image} alt={item.title} />
                    <h3>{item.title}</h3>
                  </div>
                ))}
              </div>
            </div>
            <div className="marquee-col-marquee1">
              <div className="marquee-track-marquee1" style={{ '--duration': '40s', '--delay': '-20s' }}>
                {duplicatedImages.map((item, index) => (
                  <div className="marquee-card-marquee1" key={`col2-${index}`}>
                    <img src={item.image} alt={item.title} />
                    <h3>{item.title}</h3>
                  </div>
                ))}
              </div>
            </div>
            <div className="marquee-col-marquee1">
              <div className="marquee-track-marquee1" style={{ '--duration': '40s', '--delay': '-30s' }}>
                {duplicatedImages.map((item, index) => (
                  <div className="marquee-card-marquee1" key={`col3-${index}`}>
                    <img src={item.image} alt={item.title} />
                    <h3>{item.title}</h3>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

export default AboutSection;