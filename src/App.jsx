import './App.css';
import { useState, useEffect, useRef } from 'react';
import { auth, db, logout, loginUser, registerUser } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { sendPasswordResetEmail } from 'firebase/auth';

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
// --- CONSTANTS ---
const STYLES = [
  'Bitter',
  'Best Bitter',
  'IPA',
  'Pale Ale',
  'Stout',
  'Porter',
  'Mild',
  'Brown Ale',
  'Lager',
  'Pilsner',
  'Wheat Beer',
  'Hefeweizen',
  'Sour',
  'Saison',
  'Barleywine',
  'Golden Ale',
  'Red Ale',
  'Amber Ale',
  'Milk Stout',
  'Oatmeal Stout',
  'Belgian Tripel',
  'Radler',
  'Other',
];

// --- UI HELPERS ---
const scoreRatio = (denom) => 8 / denom;

const formatAvgScore = (beers) => {
  if (!beers.length) return '—';
  const avg = beers.reduce((s, b) => s + scoreRatio(b.denom), 0) / beers.length;
  const avgDenom = 8 / avg;
  const rounded = Math.round(avgDenom * 10) / 10;
  return `8/${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}`;
};

const getScoreColor = (denom) => {
  const ratio = scoreRatio(denom);
  if (ratio >= 0.9) return '#00F5A0';
  if (ratio >= 0.7) return '#FFD60A';
  if (ratio >= 0.5) return '#FF9500';
  return '#FF453A';
};

const getScoreLabel = (denom) => {
  const ratio = scoreRatio(denom);
  if (ratio >= 0.95) return 'LEGENDARY';
  if (ratio >= 0.85) return 'DAMN FINE';
  if (ratio >= 0.7) return 'AN ACCEPTABLE ALE';
  if (ratio >= 0.55) return 'HAD BETTER';
  if (ratio >= 0.4) return 'AN ABOMINATION';
  return 'AVOID';
};

const getFriendlyErrorMessage = (code) => {
  switch (code) {
    case 'auth/invalid-email':
      return "That doesn't look like a valid email.";
    case 'auth/wrong-password':
      return 'Incorrect password.';
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/email-already-in-use':
      return 'You already have an account.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    default:
      return 'Authentication failed. Please try again.';
  }
};


// --- BADGE

const getBadge = (count) => {
  if (count >= 250) return { text: 'Master Brewer', color: '#FFD700' }; // Gold
  if (count >= 100) return { text: 'Seasoned Taster', color: '#C0C0C0' }; // Silver
  if (count >= 25) return { text: 'Committed Drinker', color: '#CD7F32' }; // Bronze
  if (count >= 10) return { text: 'Getting Crafty', color: '#f39c12' };
  if (count >= 3) return { text: 'Beer Curious', color: '#00F5A0' };
  return null; // No badge yet
};

const getNextGoal = (count) => {
  const goals = [
    { threshold: 3, name: 'Beer Curious' },
    { threshold: 10, name: 'Getting Crafty' },
    { threshold: 25, name: 'Committed Drinker' },
    { threshold: 100, name: 'Seasoned Taster' },
    { threshold: 250, name: 'Master Brewer' },
  ];

  // Find the first goal that is higher than our current count
  const next = goals.find((g) => g.threshold > count);

  if (!next) return null; // Already a Master Brewer!

  return {
    remaining: next.threshold - count,
    targetName: next.name,
    percent: (count / next.threshold) * 100,
  };
};

// --- SHARED COMPONENTS ---

const CityLookup = ({ value, onChange }) => {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `https://secure.geonames.org/searchJSON?q=${query}&maxRows=5&username=demo&countryBias=GB&featureClass=P`
        );
        const data = await response.json();
        const names = data.geonames
          ? [...new Set(data.geonames.map((g) => g.name))]
          : [];
        setSuggestions(names);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="town-wrap">
      <input
        className="input"
        value={query}
        placeholder="Search UK town/city..."
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && (suggestions.length > 0 || isLoading) && (
        <div className="town-dropdown">
          {isLoading ? (
            <div className="town-option">Searching...</div>
          ) : (
            suggestions.map((name) => (
              <div
                key={name}
                className="town-option"
                onMouseDown={() => {
                  setQuery(name);
                  onChange(name);
                }}
              >
                {name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const ScoreDisplay = ({ denom, size = 'md' }) => {
  const color = getScoreColor(denom);
  const label = getScoreLabel(denom);
  const big = size === 'lg';
  return (
    <div className="score-display">
      <div className="score-fraction">
        <span className="score-num" style={{ fontSize: big ? 20 : 15 }}>
          8
        </span>
        <span className="score-slash" style={{ fontSize: big ? 20 : 15 }}>
          /
        </span>
        <span className="score-denom" style={{ fontSize: big ? 20 : 15 }}>
          {denom}
        </span>{' '}
        &nbsp;
        <span className="score-tag" style={{ color, fontSize: big ? 20 : 15 }}>
          {label}
        </span>
      </div>
    </div>
  );
};
const DenomInput = ({ value, onChange }) => {
  const [raw, setRaw] = useState(String(value));
  const commit = (str) => {
    const n = parseInt(str, 10);
    if (!isNaN(n) && n >= 8) {
      onChange(n);
      setRaw(String(n));
    } else {
      onChange(8);
      setRaw('8');
    }
  };
  return (
    <div className="score-input-wrap">
      <div className="score-input-row">
        <span className="score-eight">8 /</span>
        <input
          type="number"
          min={8}
          value={raw}
          className="score-input-field"
          onChange={(e) => setRaw(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
        />
      </div>
      <div className="score-meta">
        <span className="score-hint">
          Vary the denominator. The lower, the better the score.
        </span>
        <span
          className="score-pct"
          style={{ color: getScoreColor(parseInt(raw)) }}
        >
          {(scoreRatio(parseInt(raw) || 8) * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
};
const BeerCard = ({ beer, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const dateStr = beer.createdAt?.seconds
    ? new Date(beer.createdAt.seconds * 1000).toLocaleDateString('en-GB')
    : new Date().toLocaleDateString('en-GB');

  return (
    <div
      className={`beer-card ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="card-main">
        <div className="card-photo card-photo-placeholder">🍺</div>
        <div className="card-body">
          <div className="card-top">
            <div className="card-info">
              <div className="card-meta">
                <span className="style-chip">{beer.style}</span>{' '}
              </div>
              <div className="card-name">{beer.name}</div>
              <div className="card-brewery">{beer.brewery}</div>
              {(beer.pub || beer.town) && (
                <div className="card-location">
                  📍 {[beer.pub, beer.town].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
            <div className="card-score-col">
              <ScoreDisplay denom={beer.denom} />
              <div className="card-date">{dateStr}</div>

              <button
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(beer.id);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="card-expand">
          {beer.notes && <p className="card-notes">"{beer.notes}"</p>}
          <div className="card-details">
            {beer.abv && (
              <span className="card-detail-item">🍺 {beer.abv}% ABV</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const AddBeerModal = ({ onAdd, onClose }) => {
  const [form, setForm] = useState({
    name: '',
    brewery: '',
    style: 'Bitter',
    denom: 8,
    notes: '',
    abv: '',
    pub: '',
    town: '',
  });
  const canSubmit = form.name.trim() && form.brewery.trim();

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Log a beer</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="form">
          <div className="field">
            <label className="label">Beer Name</label>
            <input
              className="input"
              placeholder="e.g. Doom Bar"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="label">Brewery</label>
            <input
              className="input"
              placeholder="e.g. Sharp's"
              onChange={(e) => setForm({ ...form, brewery: e.target.value })}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label className="label">Style (optional)</label>
              <select
                className="select"
                value={form.style}
                onChange={(e) => setForm({ ...form, style: e.target.value })}
              >
                {STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">ABV % (optional)</label>
              <input
                className="input"
                type="number"
                step="0.1"
                onChange={(e) => setForm({ ...form, abv: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label className="label">Town / City (optiomal)</label>
            <CityLookup
              value={form.town}
              onChange={(v) => setForm({ ...form, town: v })}
            />
          </div>
          <div className="field">
            <label className="label">Your Score</label>
            <DenomInput
              value={form.denom}
              onChange={(v) => setForm({ ...form, denom: v })}
            />
          </div>
          <button
            className={`submit-btn ${canSubmit ? 'active' : 'inactive'}`}
            disabled={!canSubmit}
            onClick={() => onAdd(form)}
          >
            Add to your bar tab
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP ---

export default function App() {
  const [user, setUser] = useState(null);
  const [beers, setBeers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');

  const handleForgotPassword = async () => {
        if (!email) {
              setError('Enter an email address first.');
                    return;
                        }
                            try {
                                  await sendPasswordResetEmail(auth, email);
                                        setError('Check your inbox for a reset link.');
                                            } catch (err) {
                                                  setError(getFriendlyErrorMessage(err.code));
                                                      }
                                                        };
  

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'users', user.uid, 'beers'),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      setBeers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegistering) await registerUser(email, password);
      else await loginUser(email, password);
    } catch (err) {
      setError(getFriendlyErrorMessage(err.code));
    }
  };

  
  

  const badge = getBadge(beers.length);
  const nextGoal = getNextGoal(beers.length);
  const formatLastDate = (beers) => {
    if (beers.length === 0) return 'No beers yet';

    // Since our Firestore query is 'orderBy("createdAt", "desc")',
    // the first item in the array is always the most recent.
    const lastBeer = beers[0];
    const date = lastBeer.createdAt?.seconds
      ? new Date(lastBeer.createdAt.seconds * 1000)
      : new Date();

    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
    });
  };

  const addBeer = async (data) => {
    await addDoc(collection(db, 'users', user.uid, 'beers'), {
      ...data,
      createdAt: serverTimestamp(),
    });
    setShowAdd(false);
  };

  const deleteBeer = async (id) => {
    await deleteDoc(doc(db, 'users', user.uid, 'beers', id));
  };

  if (loading) return <div className="loading">Pulling it through...</div>;

  if (!user) {
    return (
      <div className="app">
        <div className="orb orb-1" />
        <div className="content">
          <header className="header">
            <div className="release-type">BETA</div>
            <h1 className="header-title">8 out of...</h1>
            <p className="header-sub">Beer scoring but not boring</p>
          </header>
          <div className="modal" style={{ margin: 'auto' }}>
            <form onSubmit={handleAuth} className="form">
              <input
                className="input"
                type="email"
                placeholder="Email"
                onChange={(e) => setEmail(e.target.value)}
              />
              <br />
              <input
                className="input"
                type="password"
                placeholder="Password"
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                className="fab"
                type="submit"
                style={{ marginTop: '10px' }}
              >
                {isRegistering ? 'Join' : 'Login'}
              </button>
            </form>
            {error && <p className="error-msg">{error}</p>}
            {!isRegistering && (
              <p
                className="forgot-password-link"
                onClick={handleForgotPassword}
              >
                Forgot password?
              </p>
            )}
            <p
              className="toggle-auth"
              onClick={() => setIsRegistering(!isRegistering)}
            >
              {isRegistering ? 'Have an account?' : 'Need an account?'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="content">
        <header className="header">
          <div className="header-eyebrow">
            {user.email}
            <span onClick={logout} style={{ cursor: 'pointer' }}>
              Logout
            </span>
          </div>
          <h1 className="header-title">
            <span>8 out of...</span>
          </h1>
          <p className="header-sub">Beer scoring but not boring</p>
        </header>

        <div className="stats-bar">
          <div className="stat-card">
            <div className="stat-label">Logged</div>

            <div className="stat-value-lg">{beers.length}</div>
            <br />
            <div className="next-level-text">
              Your last beer was logged on {formatLastDate(beers)}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avg Score</div>

            <div className="stat-value-lg">{formatAvgScore(beers)}</div>
          </div>
          <div className="stat-card badge-card">
            <div className="stat-label">Ranking</div>

            <div className="stat-value">
              {badge ? (
                <span style={{ color: badge.color }}>{badge.text}</span>
              ) : (
                <span style={{ opacity: 0.3 }}>None</span>
              )}
            </div>

            {nextGoal && (
              <div className="progress-container">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${nextGoal.percent}%`,
                      background: badge ? badge.color : '#00F5A0',
                    }}
                  />
                </div>
                <div className="next-level-text">
                  Next level in <strong>{nextGoal.remaining}</strong>{' '}
                  {nextGoal.remaining === 1 ? 'beer' : 'beers'}
                </div>
              </div>
            )}
          </div>
        </div>

        <button className="fab" onClick={() => setShowAdd(true)}>
          + Log a New Beer
        </button>

        <div className="card-list">
          {beers.map((beer) => (
            <BeerCard key={beer.id} beer={beer} onDelete={deleteBeer} />
          ))}
        </div>
      </div>
      {showAdd && (
        <AddBeerModal onAdd={addBeer} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
      }