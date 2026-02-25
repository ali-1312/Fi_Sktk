const createUser = 'INSERT INTO users (email, password_hash, username) VALUES ($1, $2, $3) RETURNING id, email, username, created_at';
const getUserByEmail = 'SELECT * FROM users WHERE LOWER(email) = LOWER($1)';
const getUserByUsername = 'SELECT * FROM users WHERE LOWER(username) = LOWER($1)';
const getUserById = 'SELECT id, email, username, created_at FROM users WHERE id = $1';
const updateUsername = 'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, email, username, created_at';

const createOrder = 'INSERT INTO orders (client_id, details, payment_amount, phone_number, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *';

const getPendingOrders = `
  SELECT o.*, u.username as client_name 
  FROM orders o 
  JOIN users u ON o.client_id = u.id 
  WHERE o.status = 'pending' 
  AND o.client_id != $1 
  AND o.created_at > NOW() - INTERVAL '3 hours'
`;

const getMyOrders = `
  SELECT o.*, u.username as client_name, l.username as lifter_name
  FROM orders o 
  LEFT JOIN users u ON o.client_id = u.id
  LEFT JOIN users l ON o.lifter_id = l.id
  WHERE (o.client_id = $1 OR o.lifter_id = $1)
  ORDER BY o.created_at DESC
`;

const acceptOrder = `
  UPDATE orders 
  SET lifter_id = $1, status = 'accepted' 
  WHERE id = $2 AND client_id != $1 AND status = 'pending' AND created_at > NOW() - INTERVAL '3 hours'
  RETURNING *
`;

const cancelOrder = 'UPDATE orders SET status = \'cancelled\' WHERE id = $1 AND client_id = $2 AND status IN (\'pending\', \'accepted\') RETURNING *';

const markClientDone = 'UPDATE orders SET client_done = TRUE WHERE id = $1 AND client_id = $2 RETURNING *';
const markLifterDone = 'UPDATE orders SET lifter_done = TRUE WHERE id = $1 AND lifter_id = $2 RETURNING *';
const checkAndFinalizeOrder = 'UPDATE orders SET status = \'done\' WHERE id = $1 AND client_done = TRUE AND lifter_done = TRUE RETURNING *';

const setOTP = 'UPDATE users SET otp_code = $1, otp_expiry = $2 WHERE LOWER(email) = LOWER($3) RETURNING id';
const verifyOTP = 'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND otp_code = $2 AND otp_expiry > NOW()';
const resetPassword = 'UPDATE users SET password_hash = $1, otp_code = NULL, otp_expiry = NULL WHERE id = $2';

module.exports = {
  createUser,
  getUserByEmail,
  getUserByUsername,
  getUserById,
  updateUsername,
  createOrder,
  getPendingOrders,
  getMyOrders,
  acceptOrder,
  cancelOrder,
  markClientDone,
  markLifterDone,
  checkAndFinalizeOrder,
  setOTP,
  verifyOTP,
  resetPassword,
};
