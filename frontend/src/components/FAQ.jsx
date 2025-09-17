import React, { useState } from "react";
import "./styles/FAQ.css";

const FAQSection = () => {
  const [activeIndex, setActiveIndex] = useState(null);

  const toggleFAQ = (index) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const faqs = [
    {
      question: "How does blockchain technology ensure drug authenticity?",
      answer: "Our system creates an immutable digital ledger of every drug's journey from manufacturer to patient. Each product is assigned a unique cryptographic identifier that's recorded on the blockchain, making counterfeiting virtually impossible."
    },
    {
        question: "Which pharmaceutical companies are using this system?",
        answer: "We partner with over 50 major pharmaceutical manufacturers globally. The list grows monthly as more companies adopt blockchain for drug authentication to combat counterfeiting."
      },
      {
        question: "Can I verify medications purchased internationally?",
        answer: "Yes, our system works globally. As long as the medication has been registered in our blockchain network, you can verify its authenticity regardless of where it was purchased."
      },
      {
        question: "How often is the blockchain updated with new medications?",
        answer: "Manufacturers update the blockchain in real-time as new batches are produced and shipped. There's typically no more than a 1-hour delay between physical production and blockchain registration."
      },
      {
        question: "What devices can I use to verify medications?",
        answer: "You can use our mobile app (iOS and Android) or access our web portal through any modern browser. Our system is optimized for both smartphones and desktop computers."
      }
    // ... (keep your existing FAQ items)
  ];

  return (
    <div className="faq-container" id="faq">
      <div className="faq-header">
        <h2>Frequently Asked Questions</h2>
        <p>Everything you need to know about blockchain-based drug authentication</p>
        <div className="floating-shapes">
          <div className="shape shape-1"></div>
          <div className="shape shape-2"></div>
          <div className="shape shape-3"></div>
        </div>
      </div>
      
      <div className="faq-accordion">
        {faqs.map((faq, index) => (
          <div 
            className={`faq-item ${activeIndex === index ? 'active' : ''}`} 
            key={index}
            style={{
              transform: activeIndex === index ? 
                'translateY(-5px)' : 'none',
              zIndex: activeIndex === index ? 2 : 1
            }}
          >
            <div 
              className="faq-question" 
              onClick={() => toggleFAQ(index)}
            >
              <div className="question-content">
                <div className="icon-circle">
                  <span className="q-icon">Q</span>
                </div>
                <h3>{faq.question}</h3>
              </div>
              <span className="faq-toggle">
                {activeIndex === index ? '−' : '+'}
              </span>
            </div>
            <div className="faq-answer">
              <div className="answer-content">
                <div className="icon-circle">
                  <span className="a-icon">A</span>
                </div>
                <p>{faq.answer}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FAQSection;