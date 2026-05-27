import './App.css';
import { useState, useEffect, Fragment } from 'react';
import { auth, db, logout, loginUser, registerUser } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { sendPasswordResetEmail } from 'firebase/auth';

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
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
  if (!beers.length) return '�';
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

// --- BADGES ---
const getBadge = (count) => {
  if (count >= 250) return { text: 'Master Brewer', color: '#FFD700' };
  if (count >= 100) return { text: 'Seasoned Taster', color: '#C0C0C0' };
  if (count >= 25) return { text: 'Committed Drinker', color: '#CD7F32' };
  if (count >= 10) return { text: 'Getting Crafty', color: '#f39c12' };
  if (count >= 3) return { text: 'Beer Curious', color: '#00F5A0' };
  return null;
};

const getNextGoal = (count) => {
  const goals = [
    { threshold: 3, name: 'Beer Curious' },
    { threshold: 10, name: 'Getting Crafty' },
    { threshold: 25, name: 'Committed Drinker' },
    { threshold: 100, name: 'Seasoned Taster' },
    { threshold: 250, name: 'Master Brewer' },
  ];
  const next = goals.find((g) => g.threshold > count);
  if (!next) return null;

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
          `https://secure.geonames.org/searchJSON?name_startsWith=${query}&maxRows=5&username=jamestilburn&countryBias=GB&featureClass=P&isNameRequired=true`
        );
        const data = await response.json();

        const names = data.geonames
          ? [...new Set(data.geonames.map((g) => g.name))]
          : [];
        setSuggestions(names);
      } catch (err) {
        console.error("City search failed:", err);
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
        <span className="score-num" style={{ fontSize: big ? 20 : 15 }}>8</span>
        <span className="score-slash" style={{ fontSize: big ? 20 : 15 }}>/</span>
        <span className="score-denom" style={{ fontSize: big ? 20 : 15 }}>{denom}</span>
        &nbsp;
        <span className="score-tag" style={{ color, fontSize: big ? 20 : 15 }}>{label}</span>
      </div>
    </div>
  );
};

const DenomInput = ({ value, onChange }) => {
  const [raw, setRaw] = useState(value !== undefined && value !== '' ? String(value) : '');

  useEffect(() => {
    setRaw(value !== undefined && value !== '' ? String(value) : '');
  }, [value]);

  const commit = (str) => {
    const n = parseInt(str, 10);
    if (!isNaN(n) && n >= 8) {
      onChange(n);
      setRaw(String(n));
    } else {
      onChange('');
      setRaw('');
    }
  };

  return (
    <div className="score-input-wrap">
      <div className="score-input-row-inline">
        <span className="score-inline-prefix">8 /</span>
        <input
          type="number"
          min={8}
          placeholder="--"
          value={raw}
          className="score-input-field-clean"
          onChange={(e) => {
            const val = e.target.value;
            setRaw(val);
            const n = parseInt(val, 10);
            if (!isNaN(n) && n >= 8) {
              onChange(n);
            } else {
              onChange('');
            }
          }}
          onBlur={(e) => commit(e.target.value)}
        />
      </div>
      <div className="score-meta">
        <span
          className="score-pct"
          style={{ color: raw ? getScoreColor(parseInt(raw)) : 'rgba(255,255,255,0.3)' }}
        >
          {raw ? `${(scoreRatio(parseInt(raw) || 8) * 100).toFixed(1)}%` : '� %'}
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
    <div className={`beer-card ${expanded ? 'expanded' : ''}`} onClick={() => setExpanded(!expanded)}>
      <div className="card-main">
        <div className="card-photo card-photo-placeholder"></div>
        <div className="card-body">
          <div className="card-top">
            <div className="card-info">
              <div className="card-meta">
                <span className="style-chip">{beer.style}</span>
              </div>
              <div className="card-name">{beer.name}</div>
              <div className="card-brewery">{beer.brewery}</div>
              {(beer.pub || beer.town) && (
                <div className="card-location">
                   {[beer.pub, beer.town].filter(Boolean).join(', ')}
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
            {beer.abv && <span className="card-detail-item"> {beer.abv}% ABV</span>}
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
    style: '',
    denom: '',
    notes: '',
    abv: '',
    pub: '',
    town: '',
  });

  const canSubmit = form.name.trim() !== '' && form.brewery.trim() !== '' && form.denom !== '';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canSubmit) {
      onAdd(form);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2 className="modal-header">
          <span className="modal-title">Logging a new beer</span>
        </h2>
        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="label">Beer Name</label>
            <span className="field-hint">For example Landlord</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="label">Brewery</label>
            <span className="field-hint">For example Timothy Taylor</span>
            <input
              className="input"
              value={form.brewery}
              onChange={(e) => setForm({ ...form, brewery: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="label">Your Score</label>
            <span className="field-hint">The lower the denominator, the better the score</span>
            <DenomInput value={form.denom} onChange={(v) => setForm({ ...form, denom: v })} />
          </div>

          <h3 className="modal-header">Optional details</h3>
          <div className="field-row">
            <div className="field">
              <label className="label">Style</label>
              <select
                className="select"
                value={form.style}
                onChange={(e) => setForm({ ...form, style: e.target.value })}
              >
                <option value="" disabled hidden>Select</option>
                {STYLES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">ABV</label>
              <div className="input-suffix-wrapper">
                <input
                  className="input"
                  type="number"
                  step="0.1"
                  placeholder="0.0"
                  value={form.abv}
                  onChange={(e) => setForm({ ...form, abv: e.target.value })}
                />
                <span className="input-suffix">%</span>
              </div>
            </div>
          </div>
          <div className="field">
            <label className="label">Town / City</label>
            <span className="field-hint">Where did you drink this?</span>
            <CityLookup value={form.town} onChange={(v) => setForm({ ...form, town: v })} />
          </div>
          <div className="modal-actions">
            <button type="submit" className={`fab-submit ${canSubmit ? 'active' : 'inactive'}`} disabled={!canSubmit}>
              Add to your bar tab
            </button>
            <button type="button" className="cancel-link" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- MAIN APP COMPONENT ---
export default function App() {
  // All States Grouped Correctly
  const [user, setUser] = useState(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameDisplay, setUsernameDisplay] = useState('');
  const [beers, setBeers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // All Functions and Hooks Kept inside the component scope
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
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          // Safe document reference wrapped in an authorization check
          const userDocRef = doc(db, 'users', u.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            setUsernameDisplay(userDoc.data().username);
          } else {
            setUsernameDisplay(u.email);
          }
        } catch (err) {
          console.error("Error fetching secure user profile:", err);
          setUsernameDisplay(u.email); // Safe fallback
        }
      } else {
        setUsernameDisplay('');
      }
      setLoading(false);
    });
  }, []);

useEffect(() => {
  if (!user) return;
  const q = query(collection(db, 'users', user.uid, 'beers'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    setBeers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}, [user]);

const handleAuth = async (e) => {
  e.preventDefault();
  setError('');
  try {
    if (isRegistering) {
      await registerUser(email, password, usernameInput);
    } else {
      await loginUser(email, password);
    }
  } catch (err) {
    setError(getFriendlyErrorMessage(err.code));
  }
};

const badge = getBadge(beers.length);
const nextGoal = getNextGoal(beers.length);

const formatLastDate = (beers) => {
  if (beers.length === 0) return 'No beers yet';
  const lastBeer = beers[0];
  const date = lastBeer.createdAt?.seconds ? new Date(lastBeer.createdAt.seconds * 1000) : new Date();
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
};

const addBeer = async (data) => {
  setIsSaving(true);
  setShowAdd(false);
  try {
    await addDoc(collection(db, 'users', user.uid, 'beers'), {
      ...data,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Error adding beer: ", err);
  } finally {
    setIsSaving(false);
  }
};

const deleteBeer = async (id) => {
  await deleteDoc(doc(db, 'users', user.uid, 'beers', id));
};

// Execution Conditionals and UI Returns
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
            {isRegistering && (
              <input
                className="input"
                type="text"
                placeholder="Username"
                required
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                style={{ marginBottom: '10px' }}
              />
            )}
            <input
              className="input"
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ marginBottom: '10px' }}
            />
            <input
              className="input"
              type="password"
              placeholder="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ marginBottom: '10px' }}
            />
            <button className="fab" type="submit" style={{ marginTop: '10px' }}>
              {isRegistering ? 'Join' : 'Login'}
            </button>
          </form>
          {error && <p className="error-msg">{error}</p>}
          {!isRegistering && (
            <p className="forgot-password-link" onClick={handleForgotPassword}>
              Forgot password?
            </p>
          )}
          <p className="toggle-auth" onClick={() => setIsRegistering(!isRegistering)}>
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
          <span className="username-tag">@{usernameDisplay}</span>
          <span onClick={logout} style={{ cursor: 'pointer' }}>Logout</span>
        </div>
        <h1 className="header-title"><span>8 out of...</span></h1>
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
            {badge ? <span style={{ color: badge.color }}>{badge.text}</span> : <span style={{ opacity: 0.3 }}>None</span>}
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
                Next level in <strong>{nextGoal.remaining}</strong> {nextGoal.remaining === 1 ? 'beer' : 'beers'}
              </div>
            </div>
          )}
        </div>
      </div>

      {!showAdd && (
        <Fragment>
          <button className="fab" onClick={() => setShowAdd(true)}>+ Log a New Beer</button>
          <h2 className="list-header">Your bar tab</h2>
          <div className="card-list">
            {beers.map((beer) => (
              <BeerCard key={beer.id} beer={beer} onDelete={deleteBeer} />
            ))}
          </div>
        </Fragment>
      )}

      {showAdd && <AddBeerModal onAdd={addBeer} onClose={() => setShowAdd(false)} />}

      {isSaving && (
        <div className="saving-overlay">
          <div className="saving-content">
            <span className="saving-icon"></span>
            <p className="saving-text">Adding...</p>
          </div>
        </div>
      )}
    </div>
  </div>
);
}