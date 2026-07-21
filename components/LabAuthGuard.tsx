import React, { useEffect, useState } from 'react';

const CENTRAL_AUTH_URL = "https://labs.celnet.in/api/auth/authorize-lab";
const CENTRAL_LOGIN_URL = "https://labs.celnet.in/login";
const COOKIE_NAME = "__lab_auth_token";

export const LabAuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    const verifyAccess = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const tokenFromUrl = urlParams.get('auth_token');
        const tokenFromStorage = sessionStorage.getItem(COOKIE_NAME);
        
        const token = tokenFromUrl || tokenFromStorage;

        if (!token) {
          const callbackUrl = encodeURIComponent(window.location.href);
          window.location.href = `${CENTRAL_LOGIN_URL}?callbackUrl=${callbackUrl}`;
          return;
        }

        // If we already verified this session in this browser tab, skip backend check
        if (sessionStorage.getItem('__lab_verified') === 'true' && !tokenFromUrl) {
          setIsAuthorized(true);
          return;
        }

        const verifyRes = await fetch(CENTRAL_AUTH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            domainUrl: window.location.origin,
          }),
        });

        const verifyData = await verifyRes.json();

        if (!verifyRes.ok || !verifyData.authorized) {
          setIsAuthorized(false);
          setErrorMsg(verifyData.message || "You are not authorized to access this lab.");
          // Clear invalid token so they don't get stuck in a loop if they log out
          sessionStorage.removeItem(COOKIE_NAME);
          sessionStorage.removeItem('__lab_verified');
          
          // Auto-redirect back to dashboard after 3 seconds
          setTimeout(() => {
             window.location.href = CENTRAL_LOGIN_URL;
          }, 3000);
          return;
        }

        // Success! Save the token and mark as verified
        sessionStorage.setItem(COOKIE_NAME, token);
        sessionStorage.setItem('__lab_verified', 'true');
        
        if (tokenFromUrl) {
          const newUrl = window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        }
        
        setIsAuthorized(true);

      } catch (err) {
        console.error("Auth verification failed", err);
        setIsAuthorized(false);
        setErrorMsg("Internal Server Error: Unable to verify lab authorization securely.");
        setTimeout(() => {
           window.location.href = CENTRAL_LOGIN_URL;
        }, 3000);
      }
    };

    verifyAccess();
  }, []);

  if (isAuthorized === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0f172a', color: 'white', fontFamily: 'sans-serif' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Securing Session...</h2>
      </div>
    );
  }

  if (isAuthorized === false) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0f172a', color: 'white', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: '#1e293b', borderRadius: '1rem', border: '1px solid #334155', maxWidth: '400px' }}>
          <h1 style={{ marginBottom: '1rem', fontSize: '1.5rem', color: '#ef4444' }}>403 – Access Denied</h1>
          <p style={{ marginBottom: '1rem', color: '#cbd5e1' }}>{errorMsg}</p>
          <p style={{ marginBottom: '2rem', color: '#94a3b8', fontSize: '0.875rem' }}>Redirecting you back in 3 seconds...</p>
          <a href={CENTRAL_LOGIN_URL} style={{ padding: '0.75rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', textDecoration: 'none', borderRadius: '0.5rem', fontWeight: 'bold', display: 'inline-block' }}>
            Return to Dashboard Now
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
