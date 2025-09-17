import React, { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLink,
  faShieldAlt,
  faQrcode,
  faDatabase,
  faChartLine,
  faFingerprint
} from "@fortawesome/free-solid-svg-icons";
import { motion, useAnimation, useInView } from "framer-motion";
import "./styles/Service13.css";
import serviceImage from "./images/service.jpg";

const serviceList = [
  {
    color: "#3b82f6", // blue
    icon: faLink,
    title: "Blockchain Integration",
    description: "Secure pharmaceutical data with immutable blockchain technology.",
  },
  {
    color: "#10b981", // emerald
    icon: faShieldAlt,
    title: "Drug Authentication",
    description: "Verify medicine authenticity with tamper-proof blockchain records.",
  },
  {
    color: "#8b5cf6", // violet
    icon: faQrcode,
    title: "QR Code Tracking",
    description: "Real-time QR tracking from manufacturer to consumer(Adds immediacy/time sensitivity)",
  },
  {
    color: "#ef4444", // red
    icon: faDatabase,
    title: "Supply Chain Visibility",
    description: "Real-time monitoring of pharmaceutical supply chains with Compliance",
  },
  {
    color: "#f59e0b", // amber
    icon: faChartLine,
    title: "Data Analytics",
    description: "Predictive insights from your supply chain data(Adds future-focused capability)",
  },
  {
    color: "#ec4899", // pink
    icon: faFingerprint,
    title: "Smart Contracts",
    description: "Automate trustless transactions via smart contracts(Blockchain terminology for credibility)",
  },
];

const ServiceItem = ({ service, index }) => {
  const controls = useAnimation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  useEffect(() => {
    if (isInView) {
      controls.start({
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, delay: index * 0.1 }
      });
    }
  }, [isInView, controls, index]);

  return (
    <motion.div
      ref={ref}
      className="service-item"
      initial={{ opacity: 0, y: 20 }}
      animate={controls}
      whileHover={{
        scale: 1.03,
        boxShadow: "0 10px 25px rgba(59, 130, 246, 0.2)",
        transition: { duration: 0.3 }
      }}
    >
      <motion.div 
        className="icon-wrapper" 
        style={{ backgroundColor: service.color }}
        whileHover={{ scale: 1.1 }}
      >
        <FontAwesomeIcon icon={service.icon} />
      </motion.div>
      <div className="text-content">
        <h4>{service.title}</h4>
        <p>{service.description}</p>
      </div>
    </motion.div>
  );
};

const Service13 = () => {
  const imageControls = useAnimation();
  const imageRef = useRef(null);
  const isImageInView = useInView(imageRef, { once: true, amount: 0.3 });

  useEffect(() => {
    if (isImageInView) {
      imageControls.start({
        opacity: 1,
        x: 0,
        scale: 1,
        transition: { 
          type: "spring",
          stiffness: 100,
          damping: 10,
          duration: 0.8 
        }
      });
    }
  }, [isImageInView, imageControls]);

  return (
    <section className="service13-section" id="services">
      <div className="container">
        <motion.div 
          className="header"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true, amount: 0.5 }}
        >
          <h2>Our Services</h2>
          <p>
            Leveraging distributed ledger technology to revolutionize pharmaceutical security and transparency.
          </p>
        </motion.div>

        <div className="service13-grid">
          <motion.div
            ref={imageRef}
            className="image-column"
            initial={{ opacity: 0, x: -50, scale: 0.9 }}
            animate={imageControls}
          >
            <img 
              src={serviceImage} 
              alt="Our Services" 
              className="service-image" 
            />
          </motion.div>

          <div className="service-column">
            {serviceList.slice(0, 3).map((service, index) => (
              <ServiceItem key={`left-${index}`} service={service} index={index} />
            ))}
          </div>
          <div className="service-column">
            {serviceList.slice(3, 6).map((service, index) => (
              <ServiceItem key={`right-${index}`} service={service} index={index + 3} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Service13;