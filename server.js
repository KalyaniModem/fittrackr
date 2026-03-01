require('dotenv').config();

const express    = require('express');
const { google } = require('googleapis');
const axios      = require('axios');
const cors       = require('cors');
const mysql      = require('mysql');
const bcrypt     = require('bcrypt');

const app  = express();
const port = 3000;

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Database ────────────────────────────────────────────────
const db = mysql.createConnection({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect(err => {
  if (err) { console.error('❌ DB connection failed:', err.message); return; }
  console.log('✅ Connected to MySQL database');
  createTables();
});

function createTables() {
  const queries = [
    // Users table — stores login credentials
    `CREATE TABLE IF NOT EXISTS users (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(100) NOT NULL,
      email      VARCHAR(150) NOT NULL UNIQUE,
      password   VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Profiles table — stores personal info
    `CREATE TABLE IF NOT EXISTS profiles (
      username   VARCHAR(100) PRIMARY KEY,
      name       VARCHAR(100),
      age        INT,
      gender     VARCHAR(20),
      phone      VARCHAR(20),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // Water intake table — stores hydration data
    `CREATE TABLE IF NOT EXISTS water_intake (
      username   VARCHAR(100) PRIMARY KEY,
      totalWater INT DEFAULT 0,
      goal       INT DEFAULT 2000,
      history    TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // Workout plans table — stores generated workout plans
    `CREATE TABLE IF NOT EXISTS workout_plans (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      username   VARCHAR(100) NOT NULL,
      goal       VARCHAR(100),
      level      VARCHAR(50),
      days       INT,
      plan       LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  queries.forEach(q => {
    db.query(q, err => {
      if (err) console.error('Table creation error:', err.message);
    });
  });
}

// ── Google OAuth ────────────────────────────────────────────
const oAuth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.SECRET,
  'http://localhost:3000/oauth2callback'
);

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.location.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.body.read',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

app.get('/auth/google', (req, res) => {
  const redirectPage = req.query.state || 'dashboard.html';
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope:       GOOGLE_SCOPES,
    prompt:      'consent',
    state:       encodeURIComponent(redirectPage)
  });
  res.redirect(authUrl);
});

app.get('/oauth2callback', async (req, res) => {
  const code         = req.query.code;
  const redirectPage = decodeURIComponent(req.query.state || 'dashboard.html');
  const frontendUrl  = process.env.FRONTEND_URL || 'http://localhost:5500';
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    res.redirect(`${frontendUrl}/${redirectPage}?access_token=${tokens.access_token}`);
  } catch (err) {
    console.error('OAuth callback error:', err.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// ── Signup ──────────────────────────────────────────────────
app.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ message: 'All fields are required' });
  if (password.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters' });

  try {
    // Hash password — NEVER store plain text passwords
    const hash = await bcrypt.hash(password, 10);
    db.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hash],
      (err) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY')
            return res.status(409).json({ message: 'Email already registered' });
          console.error('Signup error:', err.message);
          return res.status(500).json({ message: 'Signup failed' });
        }
        res.status(201).json({ message: 'Signup successful!', name });
      }
    );
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Login ───────────────────────────────────────────────────
app.post('/login', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ message: 'All fields are required' });

  db.query(
    'SELECT * FROM users WHERE name = ? AND email = ?',
    [name, email],
    async (err, results) => {
      if (err)             return res.status(500).json({ message: 'Server error' });
      if (!results.length) return res.status(401).json({ message: 'Invalid credentials' });

      const user  = results[0];
      let   match = false;
      try {
        match = await bcrypt.compare(password, user.password);
      } catch {
        // Legacy fallback for plain-text passwords (old accounts)
        match = (password === user.password);
      }

      if (!match) return res.status(401).json({ message: 'Invalid credentials' });
      res.status(200).json({ message: 'Login successful', name: user.name });
    }
  );
});

// ── Profile ─────────────────────────────────────────────────
app.post('/save-profile', (req, res) => {
  const { username, name, age, gender, phone } = req.body;
  if (!username) return res.status(400).json({ success: false, message: 'Username required' });

  db.query(
    `INSERT INTO profiles (username, name, age, gender, phone)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name=VALUES(name), age=VALUES(age),
       gender=VALUES(gender), phone=VALUES(phone)`,
    [username, name, age, gender, phone],
    (err) => {
      if (err) {
        console.error('Profile save error:', err.message);
        return res.status(500).json({ success: false, message: 'Save failed' });
      }
      res.json({ success: true, message: 'Profile saved successfully!' });
    }
  );
});

app.get('/get-profile', (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ success: false });

  db.query('SELECT * FROM profiles WHERE username = ?', [username], (err, results) => {
    if (err)             return res.status(500).json({ success: false });
    if (!results.length) return res.status(404).json({ success: false });
    res.json({ success: true, profile: results[0] });
  });
});

// ── Water Intake ────────────────────────────────────────────
app.post('/save-water-intake', (req, res) => {
  const { username, totalWater, goal, history } = req.body;
  if (!username) return res.status(400).json({ success: false });

  db.query(
    `INSERT INTO water_intake (username, totalWater, goal, history)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       totalWater=VALUES(totalWater),
       goal=VALUES(goal),
       history=VALUES(history)`,
    [username, totalWater, goal, JSON.stringify(history)],
    (err) => {
      if (err) { console.error('Water save error:', err.message); return res.status(500).json({ success: false }); }
      res.json({ success: true });
    }
  );
});

app.get('/get-water-intake', (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ success: false });

  db.query('SELECT * FROM water_intake WHERE username = ?', [username], (err, results) => {
    if (err)             return res.status(500).json({ success: false });
    if (!results.length) return res.status(404).json({ success: false });
    const r = results[0];
    res.json({
      success:     true,
      waterIntake: r.totalWater,
      goal:        r.goal,
      history:     JSON.parse(r.history || '[]')
    });
  });
});

// ── Workout Plans — Save & Fetch ────────────────────────────
// Saves a generated workout plan to the database
app.post('/save-workout-plan', (req, res) => {
  const { username, goal, level, days, plan } = req.body;
  if (!username || !plan)
    return res.status(400).json({ success: false, message: 'Missing fields' });

  db.query(
    'INSERT INTO workout_plans (username, goal, level, days, plan) VALUES (?, ?, ?, ?, ?)',
    [username, goal, level, days, plan],
    (err) => {
      if (err) { console.error('Plan save error:', err.message); return res.status(500).json({ success: false }); }
      res.json({ success: true, message: 'Plan saved!' });
    }
  );
});

// Fetches the last 5 saved plans for a user
app.get('/get-workout-plans', (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ success: false });

  db.query(
    'SELECT * FROM workout_plans WHERE username = ? ORDER BY created_at DESC LIMIT 5',
    [username],
    (err, results) => {
      if (err) return res.status(500).json({ success: false });
      res.json({ success: true, plans: results });
    }
  );
});

// DELETE /delete-workout-plan?id=xxx&username=xxx
// Deletes a saved workout plan by ID
app.delete('/delete-workout-plan', (req, res) => {
  const { id, username } = req.query;
  if (!id || !username) return res.status(400).json({ success: false });

  db.query(
    'DELETE FROM workout_plans WHERE id = ? AND username = ?',
    [id, username],
    (err, result) => {
      if (err) { console.error('Delete plan error:', err.message); return res.status(500).json({ success: false }); }
      res.json({ success: true, deleted: result.affectedRows > 0 });
    }
  );
});

// ── Google Fit — Steps ──────────────────────────────────────
app.get('/api/steps', async (req, res) => {
  const { access_token } = req.query;
  if (!access_token) return res.status(400).json({ error: 'Access token required' });

  const endTimeMillis   = Date.now();
  const startTimeMillis = endTimeMillis - 86400000; // last 24 hours

  try {
    const response = await axios.post(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        aggregateBy: [{
          dataTypeName: 'com.google.step_count.delta',
          dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps'
        }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis, endTimeMillis
      },
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const steps = response.data.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal || 0;
    res.json({ steps });
  } catch (err) {
    console.error('Steps API error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch steps' });
  }
});

// ── Google Fit — Calories ───────────────────────────────────
app.get('/api/calories', async (req, res) => {
  const { access_token } = req.query;
  if (!access_token) return res.status(400).json({ error: 'Access token required' });

  const endTimeMillis   = Date.now();
  const startTimeMillis = endTimeMillis - 86400000;

  try {
    const response = await axios.post(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        aggregateBy: [{ dataTypeName: 'com.google.calories.expended' }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis, endTimeMillis
      },
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const calories = response.data.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal || 0;
    res.json({ calories: Math.round(calories) });
  } catch (err) {
    console.error('Calories API error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch calories' });
  }
});

// ── Google Fit — Heart Rate ─────────────────────────────────
app.get('/api/heart_rate', async (req, res) => {
  const { access_token } = req.query;
  if (!access_token) return res.status(401).json({ error: 'Access token required' });

  const endTimeMillis   = Date.now();
  const startTimeMillis = endTimeMillis - 86400000;

  try {
    const response = await axios.post(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        aggregateBy: [{ dataTypeName: 'com.google.heart_rate.bpm' }],
        bucketByTime: { durationMillis: 3600000 }, // 1-hour buckets
        startTimeMillis, endTimeMillis
      },
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    const heartRates = [];
    for (const bucket of (response.data.bucket || [])) {
      const points = bucket.dataset?.[0]?.point || [];
      if (points.length) {
        const avg  = points.reduce((s, p) => s + p.value[0].fpVal, 0) / points.length;
        const time = new Date(parseInt(bucket.startTimeMillis))
                       .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        heartRates.push({ time, bpm: parseFloat(avg.toFixed(1)) });
      }
    }
    res.json({ heartRates });
  } catch (err) {
    console.error('Heart rate API error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch heart rate' });
  }
});


// ── Nutrition API ─────────────────────────────────────────
// Proxies USDA FoodData Central — keeps API key hidden from browser
// GET /api/nutrition?query=banana
app.get('/api/nutrition', async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ success: false, error: 'Query required' });

  const USDA_KEY = process.env.USDA_API_KEY;

  try {
    // ── Source 1: USDA FoodData Central (380,000+ foods) ──
    const usdaRes = await axios.get(
      `https://api.nal.usda.gov/fdc/v1/foods/search`,
      {
        params: {
          query,
          pageSize:  5,
          dataType:  'Foundation,SR Legacy,Survey (FNDDS)',
          api_key:   USDA_KEY
        }
      }
    );

    const items = usdaRes.data.foods || [];
    const q     = query.toLowerCase();

    // Pick best match — prefer description that closely matches query
    const best = items.find(f => f.description.toLowerCase().includes(q))
              || items.find(f => q.includes(f.description.toLowerCase().split(',')[0]))
              || items[0];

    if (best) {
      const nutrients = best.foodNutrients || [];
      const get = (name) => {
        const n = nutrients.find(n => n.nutrientName &&
          n.nutrientName.toLowerCase().includes(name.toLowerCase()));
        return n ? parseFloat((n.value || 0).toFixed(1)) : 0;
      };

      const cal = Math.round(get('energy'));
      if (cal > 0) {
        return res.json({
          success:   true,
          source:    'USDA FoodData',
          food: {
            name:      best.description,
            calories:  cal,
            protein:   get('protein'),
            carbs:     get('carbohydrate'),
            fat:       get('total lipid'),
            fiber:     get('fiber'),
            sugar:     get('sugars'),
            sodium:    parseFloat((get('sodium') / 1000).toFixed(3)),
            saturated: get('saturated'),
          }
        });
      }
    }

    // ── Source 2: Open Food Facts (3M+ packaged/global products) ──
    const offRes = await axios.get(
      `https://world.openfoodfacts.org/cgi/search.pl`,
      {
        params: {
          search_terms: query,
          search_simple: 1,
          action:        'process',
          json:          1,
          page_size:     5,
          fields:        'product_name,nutriments'
        }
      }
    );

    const products = (offRes.data.products || []).filter(p =>
      p.nutriments && (p.nutriments['energy-kcal_100g'] > 0 || p.nutriments['energy_100g'] > 0)
    );

    if (products.length) {
      const p   = products[0];
      const n   = p.nutriments;
      const cal = Math.round(n['energy-kcal_100g'] || (n['energy_100g'] || 0) / 4.184);
      if (cal > 0) {
        return res.json({
          success: true,
          source:  'Open Food Facts',
          food: {
            name:      p.product_name || query,
            calories:  cal,
            protein:   parseFloat((n['proteins_100g']       || 0).toFixed(1)),
            carbs:     parseFloat((n['carbohydrates_100g']  || 0).toFixed(1)),
            fat:       parseFloat((n['fat_100g']            || 0).toFixed(1)),
            fiber:     parseFloat((n['fiber_100g']          || 0).toFixed(1)),
            sugar:     parseFloat((n['sugars_100g']         || 0).toFixed(1)),
            sodium:    parseFloat((n['sodium_100g']         || 0).toFixed(3)),
            saturated: parseFloat((n['saturated-fat_100g'] || 0).toFixed(1)),
          }
        });
      }
    }

    // Nothing found in either API
    res.status(404).json({ success: false, error: `"${query}" not found. Try a simpler name.` });

  } catch (err) {
    console.error('Nutrition API error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch nutrition data' });
  }
});

// ── Start Server ────────────────────────────────────────────
app.listen(port, () => {
  console.log(`🚀 FitTrackr server running → http://localhost:${port}`);
});