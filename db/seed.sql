-- Optional seed data for quick local testing.
-- Default password for all inserted users: Passw0rd

WITH admin_user AS (
  INSERT INTO users (full_name, email, password_hash, role, active)
  VALUES (
    'System Admin',
    'admin@corp.com',
    crypt('Passw0rd', gen_salt('bf')),
    'admin',
    TRUE
  )
  ON CONFLICT (email) DO NOTHING
  RETURNING id
),
manager_user AS (
  INSERT INTO users (full_name, email, password_hash, role, department_id, active)
  VALUES (
    'Aarav Manager',
    'manager@corp.com',
    crypt('Passw0rd', gen_salt('bf')),
    'manager',
    (SELECT id FROM departments WHERE name = 'Finance'),
    TRUE
  )
  ON CONFLICT (email) DO NOTHING
  RETURNING id
)
INSERT INTO users (full_name, email, password_hash, role, department_id, manager_id, active)
VALUES (
  'Employee Demo',
  'employee@corp.com',
  crypt('Passw0rd', gen_salt('bf')),
  'employee',
  (SELECT id FROM departments WHERE name = 'Finance'),
  (
    SELECT id FROM users WHERE email = 'manager@corp.com'
  ),
  TRUE
)
ON CONFLICT (email) DO NOTHING;
