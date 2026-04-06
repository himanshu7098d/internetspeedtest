import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Download, Upload, Play, History, LogIn, LogOut, User } from 'lucide-react';
import { Speedometer } from './components/Speedometer';
import { Insights } from './components/Insights';
import { HistoryChart } from './components/HistoryChart';
import { runPingTest, runDownloadTest, runUploadTest, calculateScores } from './lib/speedTest';

// Firebase
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, addDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';

type TestState = 'idle' | 'ping' | 'download' | 'upload' | 'done';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  const [testState, setTestState] = useState<TestState>('idle');
  const [ping, setPing] = useState(0);
  const [download, setDownload] = useState(0);
  const [upload, setUpload] = useState(0);
  const [scores, setScores] = useState({ gaming: 0, streaming: 0, videoCall: 0 });
  
  const [history, setHistory] = useState<any[]>([]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // History Listener
  useEffect(() => {
    if (!isAuthReady || !user) {
      setHistory([]);
      return;
    }

    const q = query(
      collection(db, 'speedTests'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const historyData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate().toISOString() || new Date().toISOString()
        };
      });
      setHistory(historyData);
    }, (error) => {
      console.error("Error fetching history:", error);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const startTest = async () => {
    setPing(0);
    setDownload(0);
    setUpload(0);
    setScores({ gaming: 0, streaming: 0, videoCall: 0 });
    
    // 1. Ping Test
    setTestState('ping');
    const pingResult = await runPingTest();
    setPing(pingResult);
    
    // 2. Download Test
    setTestState('download');
    const dlResult = await runDownloadTest((current) => setDownload(current));
    setDownload(dlResult);
    
    // 3. Upload Test
    setTestState('upload');
    const ulResult = await runUploadTest((current) => setUpload(current));
    setUpload(ulResult);
    
    // 4. Calculate Scores & Finish
    const finalScores = calculateScores(dlResult, ulResult, pingResult);
    setScores(finalScores);
    setTestState('done');

    // 5. Save to Firebase if logged in
    if (user) {
      try {
        await addDoc(collection(db, 'speedTests'), {
          userId: user.uid,
          pingMs: pingResult,
          downloadMbps: dlResult,
          uploadMbps: ulResult,
          gamingScore: finalScores.gaming,
          streamingScore: finalScores.streaming,
          videoCallScore: finalScores.videoCall,
          deviceType: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
          timestamp: serverTimestamp()
        });
      } catch (error) {
        console.error("Failed to save test result", error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-500">
            <Activity className="w-6 h-6" />
            <span className="text-xl font-bold tracking-tight text-white">SmartSpeed</span>
          </div>
          
          <div className="flex items-center gap-4">
            {isAuthReady && (
              user ? (
                <div className="flex items-center gap-4">
                  <div className="hidden sm:flex items-center gap-2 text-sm text-slate-400">
                    <img src={user.photoURL || ''} alt="Avatar" className="w-6 h-6 rounded-full" />
                    <span>{user.displayName}</span>
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="text-sm font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Sign Out</span>
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full transition-colors flex items-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In to Save History
                </button>
              )
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-12">
        {/* Main Test Area */}
        <section className="flex flex-col items-center justify-center py-12">
          
          <div className="flex flex-wrap justify-center gap-6 mb-12">
            <Speedometer 
              value={ping} 
              max={200} 
              label="Ping" 
              unit="ms" 
              isActive={testState === 'ping'} 
            />
            <Speedometer 
              value={download} 
              max={500} 
              label="Download" 
              unit="Mbps" 
              isActive={testState === 'download'} 
            />
            <Speedometer 
              value={upload} 
              max={100} 
              label="Upload" 
              unit="Mbps" 
              isActive={testState === 'upload'} 
            />
          </div>

          <AnimatePresence mode="wait">
            {testState === 'idle' || testState === 'done' ? (
              <motion.button
                key="start-btn"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={startTest}
                className="group relative flex items-center justify-center w-32 h-32 rounded-full bg-blue-600 text-white font-bold text-2xl shadow-[0_0_40px_rgba(37,99,235,0.4)] hover:shadow-[0_0_60px_rgba(37,99,235,0.6)] transition-all"
              >
                <div className="absolute inset-0 rounded-full border-2 border-blue-400/50 scale-110 group-hover:scale-125 transition-transform duration-500" />
                {testState === 'done' ? 'AGAIN' : 'GO'}
              </motion.button>
            ) : (
              <motion.div
                key="testing-indicator"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="flex flex-col items-center gap-4 text-blue-400"
              >
                <div className="w-16 h-16 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin" />
                <div className="font-medium uppercase tracking-widest text-sm animate-pulse">
                  Testing {testState}...
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Insights Section */}
        <AnimatePresence>
          {testState === 'done' && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Activity className="w-6 h-6 text-blue-500" />
                Connection Insights
              </h2>
              <Insights scores={scores} ping={ping} download={download} />
            </motion.section>
          )}
        </AnimatePresence>

        {/* History Section */}
        <section className="space-y-6 pt-8 border-t border-slate-800/50">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <History className="w-6 h-6 text-blue-500" />
              Test History
            </h2>
            {!user && (
              <span className="text-sm text-slate-500">Sign in to view history</span>
            )}
          </div>
          
          {user ? (
            <HistoryChart data={history} />
          ) : (
            <div className="h-48 flex flex-col items-center justify-center gap-4 text-slate-500 bg-slate-900/30 rounded-xl border border-slate-800 border-dashed">
              <History className="w-8 h-8 opacity-50" />
              <p>Your test history will appear here once you sign in.</p>
              <button 
                onClick={handleLogin}
                className="text-sm font-medium bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-full transition-colors"
              >
                Sign In
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
