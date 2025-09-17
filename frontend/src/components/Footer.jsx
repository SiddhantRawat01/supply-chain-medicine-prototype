import React from "react";
import "./styles/Footer.css";

const Footer = () => {
  return (
    <footer className="site-footer" id="contact">
      <div className="footer-container">
        {/* Main Footer Content */}
        <div className="footer-grid">
          {/* Company Info */}
          <div className="footer-column">
            <h3 className="footer-logo">CarePulse</h3>
            <p className="footer-about">
              Blockchain-powered drug authentication system ensuring medication safety worldwide.
            </p>
          </div>

          {/* Quick Links */}
          <div className="footer-column">
            <h4 className="footer-title">Quick Links</h4>
            <ul className="footer-links">
              <li><a href="#">How It Works</a></li>
              <li><a href="#">For Patients</a></li>
              <li><a href="#">For Pharmacies</a></li>
              <li><a href="#">For Manufacturers</a></li>
              <li><a href="#">Case Studies</a></li>
            </ul>
          </div>

          {/* Resources */}
          <div className="footer-column">
            <h4 className="footer-title">Resources</h4>
            <ul className="footer-links">
              <li><a href="#">Documentation</a></li>
              <li><a href="#">API Access</a></li>
              <li><a href="#">White Papers</a></li>
              <li><a href="#">Compliance</a></li>
              <li><a href="#">Help Center</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div className="footer-column">
            <h4 className="footer-title">Contact Us</h4>
            <ul className="footer-contact">
              <li>
                <i className="fas fa-map-marker-alt"></i>
                123 Blockchain Ave, Tech City, TC 10001
              </li>
              <li>
                <i className="fas fa-phone-alt"></i>
                +1 (555) 123-4567
              </li>
              <li>
                <i className="fas fa-envelope"></i>
                info@carepulse.com
              </li>
            </ul>
            <div className="footer-apps">
            </div>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="footer-bottom">
          <div className="footer-copyright">
            &copy; {new Date().getFullYear()} CarePulse. All rights reserved.
          </div>
          <div className="footer-legal">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Cookie Policy</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;