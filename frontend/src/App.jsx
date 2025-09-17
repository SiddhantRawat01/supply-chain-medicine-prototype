import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import HeroSection from './components/HeroSection'
import Service13 from './components/Service13'
import AboutSection from './components/AboutSection'
import FAQSection from './components/FAQ'
import Footer from './components/Footer'
import Loader from './components/Loader'
import DappLanding from './DappLanding'

function App() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return <Loader />
  }

  return (
    <Routes>
      {/* Landing Page Route */}
      <Route
        path="/"
        element={
          <>
            <Navbar />
            <HeroSection id="home" />
            <Service13 id="services" />
            <AboutSection id="about" />
            <FAQSection id="faq" />
            <Footer id="contact" />
          </>
        }
      />
      
      {/* DApp Route */}
      <Route
        path="/dapp"
        element={
          <>
            <DappLanding />
          </>
        }
      />
    </Routes>
  )
}

export default App