SELECT email, SUBSTRING(password_hash, 1, 20) as hash_preview, LENGTH(password_hash) as hash_length 
FROM users 
WHERE email = 'demo@example.com';
