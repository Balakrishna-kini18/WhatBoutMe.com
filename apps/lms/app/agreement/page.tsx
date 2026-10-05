"use client";

import styles from "../login/auth.module.css";
import Link from "next/link";
import { useEffect } from "react";

export default function LearnerAgreement() {
  useEffect(() => {
    document.body.classList.add("auth-page-active");
    return () => document.body.classList.remove("auth-page-active");
  }, []);

  return (
    <div className={styles.authContainer}>
      <div className={styles.authCard} style={{ maxWidth: '600px' }}>
        <h1 className={styles.logo}>WhatBoutMe</h1>
        <h2>Program Agreement</h2>
        <p>Please review and sign the terms before beginning your journey.</p>
        
        <div style={{
          background: 'var(--bg-soft)',
          border: '1px solid var(--border-light)',
          padding: '1.5rem',
          borderRadius: '12px',
          maxHeight: '200px',
          overflowY: 'auto',
          textAlign: 'left',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          marginBottom: '1.5rem'
        }}>
          <p style={{marginBottom: '1rem'}}><strong>1. COMMITMENT</strong><br/>
          By enrolling in the 11 Steps to U program, you commit to completing all modules and participating respectfully in live sessions.</p>
          <p style={{marginBottom: '1rem'}}><strong>2. CONFIDENTIALITY</strong><br/>
          What is shared in live group sessions stays in live group sessions to maintain a safe space for all learners.</p>
          <p><strong>3. REFUNDS</strong><br/>
          Due to the digital nature of the content, refunds are only available within the first 14 days if Step 2 has not been completed.</p>
        </div>

        <form className={styles.form}>
          <div className={styles.inputGroup} style={{ flexDirection: 'row', alignItems: 'center', gap: '1rem' }}>
            <input type="checkbox" id="agreeCheck" style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
            <label htmlFor="agreeCheck" style={{ cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              I have read and agree to the Terms of Service
            </label>
          </div>
          
          <div className={styles.inputGroup}>
            <label>Digital Signature (Type your full name)</label>
            <input type="text" placeholder="e.g. John Doe" />
          </div>
          
          <Link href="/" className={styles.submitBtn} style={{display: 'block', textAlign: 'center', textDecoration: 'none'}}>
            Sign & Enter Dashboard
          </Link>
        </form>
      </div>
    </div>
  );
}
