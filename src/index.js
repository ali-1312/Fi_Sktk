require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db = require('./db');
const queries = require('./queries');

const app = express();
const port = process.env.PORT || 3000;

// Email Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Auth Middleware
const auth = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ error: 'No token, authorization denied.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid.' });
  }
};

// Routes
app.get('/', (req, res) => {
  res.send('Fi Sktk Backend is running!');
});

// Profile Route
app.get('/profile', auth, async (req, res) => {
  try {
    const userRes = await db.query(queries.getUserById, [req.user.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const ratingRes = await db.query(queries.getUserRating, [req.user.id]);
    res.json({ 
      ...userRes.rows[0], 
      rating: ratingRes.rows[0].average_rating || 0,
      total_ratings: ratingRes.rows[0].total_ratings || 0
    });
  } catch (error) {
    console.error('Fetch profile error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Submit Rating
app.post('/orders/:id/rate', auth, async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;
  console.log(`Rating attempt for order ${id} by user ${req.user.id}`);

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Valid rating (1-5) is required' });
  }

  try {
    // 1. Get the order
    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
    console.log(`Order query returned ${orderRes.rows.length} rows`);
    
    if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    
    const order = orderRes.rows[0];
    console.log(`Order status: ${order.status}, Client: ${order.client_id}, Lifter: ${order.lifter_id}`);

    if (order.status !== 'done') return res.status(400).json({ error: 'Can only rate completed orders' });

    let to_user_id;
    if (order.client_id === req.user.id) {
      to_user_id = order.lifter_id;
    } else if (order.lifter_id === req.user.id) {
      to_user_id = order.client_id;
    } else {
      console.log(`Unauthorized: req.user.id ${req.user.id} is not client or lifter`);
      return res.status(403).json({ error: 'Not authorized to rate this order' });
    }

    if (!to_user_id) {
      console.log('Error: to_user_id is null');
      return res.status(400).json({ error: 'No user to rate' });
    }

    // 2. Check if already rated
    const checkRes = await db.query(queries.checkRatingExists, [id, req.user.id]);
    if (checkRes.rows.length > 0) return res.status(400).json({ error: 'Already rated' });

    // 3. Submit
    console.log(`Inserting rating: from ${req.user.id} to ${to_user_id}, stars: ${rating}`);
    const result = await db.query(queries.submitRating, [id, req.user.id, to_user_id, rating, comment]);
    console.log('Rating inserted successfully');
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('CRITICAL RATE ERROR:', error.message, error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Update Username Route
app.put('/profile/username', auth, async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' });
  }

  try {
    const { rows } = await db.query(queries.updateUsername, [username, req.user.id]);
    res.json(rows[0]);
  } catch (error) {
    console.error('Update username error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Create Order Route
app.post('/orders', auth, async (req, res) => {
  const { details, payment_amount, phone_number, latitude, longitude } = req.body;

  if (!details || !payment_amount || !phone_number || !latitude || !longitude) {
    return res.status(400).json({ error: 'All order fields are required.' });
  }

  // Phone number validation (11 digits, starting with 01)
  const phoneRegex = /^01[0125][0-9]{8}$/;
  if (!phoneRegex.test(phone_number)) {
    return res.status(400).json({ error: 'Invalid phone number format.' });
  }

  try {
    const { rows } = await db.query(queries.createOrder, [
      req.user.id,
      details,
      payment_amount,
      phone_number,
      latitude,
      longitude,
    ]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get Pending Orders
app.get('/orders/pending', auth, async (req, res) => {
  try {
    const { rows } = await db.query(queries.getPendingOrders, [req.user.id]);
    res.json(rows);
  } catch (error) {
    console.error('Fetch pending orders error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get My Orders
app.get('/orders/mine', auth, async (req, res) => {
  try {
    const { rows } = await db.query(queries.getMyOrders, [req.user.id]);
    res.json(rows);
  } catch (error) {
    console.error('Fetch my orders error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Cancel Order
app.put('/orders/:id/cancel', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query(queries.cancelOrder, [id, req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found or cannot be cancelled.' });
    }
    res.json({ message: 'Order cancelled successfully.', order: rows[0] });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Accept Order
app.post('/orders/:id/accept', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query(queries.acceptOrder, [req.user.id, id]);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Order not found, already taken, or expired.' });
    }
    res.json({ message: 'Order accepted.', order: rows[0] });
  } catch (error) {
    console.error('Accept order error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Mark Order Done (Two-Sided)
app.put('/orders/:id/done', auth, async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Try to mark as client
    let result = await db.query(queries.markClientDone, [id, req.user.id]);
    
    // 2. If not client, try to mark as lifter
    if (result.rows.length === 0) {
      result = await db.query(queries.markLifterDone, [id, req.user.id]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found or you are not authorized.' });
    }

    // 3. Try to finalize if both sides are done
    const finalCheck = await db.query(queries.checkAndFinalizeOrder, [id]);
    
    res.json({ 
      message: 'Status updated.', 
      order: finalCheck.rows.length > 0 ? finalCheck.rows[0] : result.rows[0] 
    });
  } catch (error) {
    console.error('Mark as done error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Auto-cancel logic before fetching lists
const cleanupExpiredOrders = async () => {
  try {
    await db.query("UPDATE orders SET status = 'cancelled' WHERE status = 'pending' AND created_at < NOW() - INTERVAL '3 hours'");
  } catch (e) {
    console.error("Cleanup error:", e);
  }
};

// Get My Orders
app.get('/orders/mine', auth, async (req, res) => {
  await cleanupExpiredOrders();
  try {
    const { rows } = await db.query(queries.getMyOrders, [req.user.id]);
    res.json(rows);
  } catch (error) {
    console.error('Fetch my orders error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Sign Up
app.post('/signup', async (req, res) => {
  const { email, password, username } = req.body;

  if (!email || !password || !username) {
    return res.status(400).json({ error: 'Email, password, and username are required.' });
  }

  // Email Domain Validation (gmail or outlook only)
  const emailRegex = /^[a-zA-Z0-9._%+-]+@(gmail\.com|outlook\.com)$/;
  if (!emailRegex.test(email.toLowerCase())) {
    return res.status(400).json({ error: 'Only Gmail and Outlook emails are supported.' });
  }

  // Password Strength Validation (at least 8 chars, 1 letter, 1 number)
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters and contain both letters and numbers.' });
  }

  try {
    // Check if email already exists
    const emailCheck = await db.query(queries.getUserByEmail, [email]);
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Email already taken' });
    }

    // Check if username already exists
    const userCheck = await db.query(queries.getUserByUsername, [username]);
    if (userCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = await db.query(queries.createUser, [email, passwordHash, username]);

    res.status(201).json({
      message: 'User created successfully.',
      user: {
        id: newUser.rows[0].id,
        email: newUser.rows[0].email,
        username: newUser.rows[0].username,
        created_at: newUser.rows[0].created_at,
      },
    });
  } catch (error) {
    console.error('Sign up error details:', error.message, error.stack);
    res.status(500).json({ error: 'Internal server error.', details: error.message });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // Check if user exists
    const { rows } = await db.query(queries.getUserByEmail, [email]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User Not Found' });
    }

    const user = rows[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!isMatch) {
      return res.status(401).json({ error: 'Password Invalid' });
    }

    // Generate JWT
    const payload = {
      user: {
        id: user.id,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Forgot Password - Send OTP
app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    const { rows } = await db.query(queries.setOTP, [otp, expiry, email]);
    if (rows.length === 0) return res.status(404).json({ error: 'User Not Found' });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Password Reset OTP - في سكتك',
      text: `Your OTP for password reset is: ${otp}. It expires in 10 minutes. If you don't see it, please check your spam folder.`,
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify OTP
app.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  try {
    const { rows } = await db.query(queries.verifyOTP, [email, otp]);
    if (rows.length === 0) return res.status(400).json({ error: 'Invalid or expired OTP' });
    res.json({ message: 'OTP verified', userId: rows[0].id });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset Password
app.post('/reset-password', async (req, res) => {
  const { userId, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    await db.query(queries.resetPassword, [hash, userId]);
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

module.exports = app;
