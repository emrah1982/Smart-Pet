-- Demo kullanıcı için şifre: demo123
-- bcrypt hash: $2b$10$rZ8qH3vX9YxN.kK5zJ2zQeO8wF3xJ9YxN.kK5zJ2zQeO8wF3xJ9YxN (örnek, gerçek hash aşağıda)
UPDATE users 
SET password_hash = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
WHERE email = 'demo@example.com';
