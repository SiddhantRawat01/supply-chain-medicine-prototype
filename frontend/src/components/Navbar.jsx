import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { motion } from 'framer-motion';
import { Link } from 'react-scroll';
import './styles/Navbar.css';

gsap.registerPlugin(ScrollTrigger);

const Navbar = () => {
  const navbarRef = useRef(null);

  useEffect(() => {
    gsap.set(navbarRef.current, { y: 0, opacity: 1 });

    ScrollTrigger.create({
      trigger: "body",
      start: "top top",
      onUpdate: (self) => {
        if (self.scroll() > 50) {
          gsap.to(navbarRef.current, {
            backgroundColor: "rgba(65, 60, 221, 0.95)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 4px 30px rgba(65, 60, 221, 0.95)",
            duration: 0.3
          });
        } else {
          gsap.to(navbarRef.current, {
            backgroundColor: "rgba(65, 60, 221, 0.95)",
            backdropFilter: "none",
            boxShadow: "none",
            duration: 0.3
          });
        }
      }
    });

    return () => ScrollTrigger.getAll().forEach(t => t.kill());
  }, []);

  return (
    <nav className="navbar" ref={navbarRef} data-scroll data-scroll-sticky data-scroll-target="[data-scroll-container]">
      <div className="navbar-container">
        <motion.a
          href="#"
          className="logo"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          data-scroll
          data-scroll-repeat
          data-scroll-delay="0.05"
        >
          CarePulse
        </motion.a>

        <div className="nav-links">
          <Link to="home" smooth={true} duration={500} offset={-70} className="nav-link" data-scroll>Home</Link>
          <Link to="services" smooth={true} duration={500} offset={-70} className="nav-link" data-scroll>Services</Link>
          <Link to="about" smooth={true} duration={500} offset={-70} className="nav-link" data-scroll>About</Link>
          <Link to="faq" smooth={true} duration={500} offset={-70} className="nav-link" data-scroll>FAQ</Link>
          <Link to="contact" smooth={true} duration={500} offset={-70} className="nav-link" data-scroll>Contact</Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;