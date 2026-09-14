-- Allow users to read their own app_users row (needed for AuthProvider bootstrap)
DROP POLICY IF EXISTS "read own profile" ON app_users;
CREATE POLICY "read own profile" ON app_users
  FOR SELECT USING (user_id = auth.uid());
