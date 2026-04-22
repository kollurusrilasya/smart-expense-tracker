/* ============================================================
   FINIA — backend/routes/auth.js   (fixed)
   Fixes:
   1. JWT_SECRET reads from env consistently
   2. Better error messages
   3. bcrypt salt cost consistent
   ============================================================ */

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { runQuery, runWrite, serializeNode } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'finia_super_secret_key_change_in_production';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

/* ════════════════════════════════
   POST /api/auth/register
   ════════════════════════════════ */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, age, gender, country } = req.body;

    if (!name || !email || !password || !age || !gender || !country) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const ageNum = parseInt(age);
    if (isNaN(ageNum) || ageNum < 13 || ageNum > 120) {
      return res.status(400).json({ message: 'Age must be between 13 and 120.' });
    }

    /* Check duplicate email */
    const existing = await runQuery(
      'MATCH (u:User {email: $email}) RETURN u LIMIT 1',
      { email: email.toLowerCase().trim() }
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userId    = `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const createdAt = new Date().toISOString();

    await runWrite(`
      CREATE (u:User {
        id:        $id,
        name:      $name,
        email:     $email,
        password:  $password,
        age:       $age,
        gender:    $gender,
        country:   $country,
        createdAt: $createdAt
      })
    `, {
      id: userId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      age: ageNum,
      gender,
      country,
      createdAt,
    });

    const user  = { id: userId, name: name.trim(), email: email.toLowerCase().trim(), gender, country, age: ageNum };
    const token = generateToken(user);

    return res.status(201).json({ message: 'Account created!', token, user });

  } catch (err) {
    console.error('Register error:', err.message);
    return res.status(500).json({ message: 'Registration failed: ' + err.message });
  }
});

/* ════════════════════════════════
   POST /api/auth/login
   ════════════════════════════════ */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const records = await runQuery(
      'MATCH (u:User {email: $email}) RETURN u LIMIT 1',
      { email: email.toLowerCase().trim() }
    );

    if (!records.length) {
      return res.status(401).json({ message: 'No account found with this email.' });
    }

    const userProps = serializeNode(records[0].get('u'));
    const valid     = await bcrypt.compare(password, userProps.password);

    if (!valid) {
      return res.status(401).json({ message: 'Incorrect password.' });
    }

    const { password: _, ...user } = userProps;
    const token = generateToken(user);

    return res.json({ message: 'Login successful!', token, user });

  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ message: 'Login failed: ' + err.message });
  }
});

module.exports = router;