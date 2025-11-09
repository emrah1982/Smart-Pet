# Test database connection and user
docker exec feeder-mysql mysql -ufeeder -pfeeder_pass feeder_db -e "SELECT id, email, password_hash FROM users LIMIT 1;"
